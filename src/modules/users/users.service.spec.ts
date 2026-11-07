import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '@common/enums/UserRole';
import { UserStatus } from '@common/enums/UserStatus';
import { BcryptService } from '../../utils/bcrypt/bcrypt.service';
import { MailService } from '../../mail/mail.service';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

function userRow(overrides: Partial<UserEntity> = {}): UserEntity {
  return new UserEntity({
    id: 'u-1',
    firstName: 'Ivan',
    lastName: 'Petrenko',
    email: 'ivan@example.com',
    phone: '+380671234567',
    password: 'hash',
    role: UserRole.User,
    status: UserStatus.Active,
    registered: true,
    tokenVersion: 0,
    dateOfBirth: null,
    favourites: [],
    ...overrides,
  });
}

/**
 * `rows` is what findOne returns, keyed by the field it is queried by
 * (`email`, `phone` or `id`).
 */
function build(rows: { email?: UserEntity; phone?: UserEntity; id?: UserEntity } = {}) {
  const userRepository = {
    findOne: jest.fn(async ({ where }) => {
      if (where.email) return rows.email ?? null;
      if (where.phone) return rows.phone ?? null;
      if (where.id) return rows.id ?? null;
      return null;
    }),
    exists: jest.fn(async ({ where }) => !!rows.id && rows.id.id === where.id),
    save: jest.fn(async (u) => u),
  };
  const ordersRepo = { find: jest.fn(async () => [{ id: 'o-1' }]) };
  const bcryptService = {
    hashPassword: jest.fn(async (p: string) => `hashed:${p}`),
    verifyPassword: jest.fn(async (p: string, h: string) => h === `hashed:${p}`),
  };
  const mailService = { sendRegistrationEmail: jest.fn().mockResolvedValue(undefined) };

  const service = new UsersService(
    userRepository as unknown as Repository<UserEntity>,
    ordersRepo as any,
    {} as any,
    bcryptService as unknown as BcryptService,
    mailService as unknown as MailService,
  );

  return { service, userRepository, ordersRepo };
}

const registration = {
  firstName: 'Ivan',
  lastName: 'Petrenko',
  email: 'ivan@example.com',
  password: 'secret123',
  phone: '067 123 45 67',
  dateOfBirth: undefined,
};

describe('UsersService', () => {
  describe('create', () => {
    it('stores a registered account with a normalized email and phone', async () => {
      const { service, userRepository } = build();

      await service.create({ ...registration, email: '  Ivan@Example.com ' });

      const saved = userRepository.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        email: 'ivan@example.com',
        phone: '+380671234567',
        password: 'hashed:secret123',
        registered: true,
      });
    });

    it('upgrades a guest account in place, keeping its id and order history', async () => {
      const guest = userRow({ id: 'guest-1', registered: false, password: null });
      const { service, userRepository } = build({ email: guest });

      await service.create(registration);

      const saved = userRepository.save.mock.calls[0][0];
      expect(saved).toBe(guest);
      expect(saved).toMatchObject({ id: 'guest-1', registered: true, password: 'hashed:secret123' });
    });

    it('refuses an email that belongs to a registered account', async () => {
      const { service } = build({ email: userRow() });
      await expect(service.create(registration)).rejects.toThrow(BadRequestException);
    });

    it('lets a guest keep their own phone when upgrading', async () => {
      const guest = userRow({ id: 'guest-1', registered: false, password: null });
      const { service } = build({ email: guest, phone: guest });
      await expect(service.create(registration)).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('never touches email, password or role', async () => {
      const user = userRow();
      const { service } = build({ id: user });

      await service.update('u-1', {
        firstName: 'Petro',
        email: 'evil@example.com',
        password: 'plaintext',
        role: UserRole.Admin,
      } as any);

      expect(user.firstName).toBe('Petro');
      expect(user.email).toBe('ivan@example.com');
      expect(user.password).toBe('hash');
      expect(user.role).toBe(UserRole.User);
    });

    it('sets the date of birth only once', async () => {
      const user = userRow({ dateOfBirth: '1990-01-01' });
      const { service } = build({ id: user });

      await service.update('u-1', { dateOfBirth: '2000-01-01' });

      expect(user.dateOfBirth).toBe('1990-01-01');
    });

    it('clears phone verification when the phone changes', async () => {
      const user = userRow({ phoneVerifiedAt: new Date() });
      const { service } = build({ id: user });

      await service.update('u-1', { phone: '0501112233' });

      expect(user.phone).toBe('+380501112233');
      expect(user.phoneVerifiedAt).toBeNull();
    });

    it('404s for a deleted account', async () => {
      const { service } = build({ id: userRow({ status: UserStatus.Deleted }) });
      await expect(service.update('u-1', { firstName: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('setStatus', () => {
    it('blocking records the reason and revokes tokens', async () => {
      const user = userRow();
      const { service } = build({ id: user });

      await service.setStatus('u-1', { status: UserStatus.Blocked, reason: 'fraud' });

      expect(user).toMatchObject({ status: UserStatus.Blocked, blockedReason: 'fraud', tokenVersion: 1 });
      expect(user.blockedAt).toBeInstanceOf(Date);
    });

    it('unblocking clears the block fields', async () => {
      const user = userRow({ status: UserStatus.Blocked, blockedAt: new Date(), blockedReason: 'x' });
      const { service } = build({ id: user });

      await service.setStatus('u-1', { status: UserStatus.Active });

      expect(user).toMatchObject({ status: UserStatus.Active, blockedAt: null, blockedReason: null });
    });

    it('refuses to block an admin', async () => {
      const { service } = build({ id: userRow({ role: UserRole.Admin }) });
      await expect(
        service.setStatus('u-1', { status: UserStatus.Blocked }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deletion', () => {
    it('anonymizes personal data, keeps the row and revokes tokens', async () => {
      const user = userRow({ favourites: [{ id: 'p-1' } as any] });
      const { service, userRepository } = build({ id: user });

      await service.remove('u-1');

      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(user).toMatchObject({
        id: 'u-1',
        status: UserStatus.Deleted,
        email: 'deleted-u-1@deleted.invalid',
        firstName: 'Deleted',
        lastName: 'User',
        phone: null,
        password: null,
        dateOfBirth: null,
        favourites: [],
        tokenVersion: 1,
      });
      expect(user.deletedAt).toBeInstanceOf(Date);
    });

    it('self-deletion requires the current password', async () => {
      const { service } = build({ id: userRow({ password: 'hashed:right' }) });

      await expect(service.deleteOwnAccount('u-1', 'wrong')).rejects.toThrow(UnauthorizedException);
      await expect(service.deleteOwnAccount('u-1')).rejects.toThrow(UnauthorizedException);
      await expect(service.deleteOwnAccount('u-1', 'right')).resolves.toContain('deleted');
    });

    it('admins cannot be deleted through the admin route', async () => {
      const { service } = build({ id: userRow({ role: UserRole.Admin }) });
      await expect(service.remove('u-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserOrders', () => {
    it('returns the orders of that user with their lines, newest first', async () => {
      const { service, ordersRepo } = build({ id: userRow() });

      await expect(service.getUserOrders('u-1')).resolves.toEqual([{ id: 'o-1' }]);
      expect(ordersRepo.find).toHaveBeenCalledWith({
        where: { user: { id: 'u-1' } },
        relations: ['items', 'items.product', 'assignedCourier'],
        order: { createdAt: 'DESC' },
      });
    });

    it('still returns the orders of a deleted account', async () => {
      const { service } = build({ id: userRow({ status: UserStatus.Deleted }) });

      await expect(service.getUserOrders('u-1')).resolves.toEqual([{ id: 'o-1' }]);
    });

    it('404s for an unknown user instead of returning an empty list', async () => {
      const { service, ordersRepo } = build();

      await expect(service.getUserOrders('missing')).rejects.toThrow(NotFoundException);
      expect(ordersRepo.find).not.toHaveBeenCalled();
    });
  });
});
