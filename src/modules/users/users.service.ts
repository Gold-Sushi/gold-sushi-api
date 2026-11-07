import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BcryptService } from '../../utils/bcrypt/bcrypt.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserEntity } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ResponseUserDto } from './dto/response-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderStatus } from '@common/enums/Order';
import { UserRole } from '@common/enums/UserRole';
import { UserStatus } from '@common/enums/UserStatus';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { MailService } from '../../mail/mail.service';
import { normalizePhone } from '../../utils/phone/normalize-phone';
import { normalizeEmail } from '../../utils/email/normalize-email';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private userRepository: Repository<UserEntity>,
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    private bcryptService: BcryptService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register an account. A guest who already checked out with this email is
   * upgraded in place, so they keep their order history.
   */
  async create(user: CreateUserDto) {
    const email = normalizeEmail(user.email);
    const existingUser = await this.userRepository.findOne({ where: { email } });
    const isGuest = existingUser && !existingUser.registered && existingUser.status === UserStatus.Active;

    if (existingUser && !isGuest) {
      throw new BadRequestException('email already exists');
    }

    const phone = normalizePhone(user.phone);
    await this.assertPhoneAvailable(phone, existingUser?.id);

    const hashedPassword = await this.bcryptService.hashPassword(user.password, SALT_ROUNDS);
    const fields: Partial<UserEntity> = {
      email,
      firstName: user.firstName,
      lastName: user.lastName ?? '',
      phone,
      dateOfBirth: user.dateOfBirth ?? existingUser?.dateOfBirth ?? null,
      password: hashedPassword,
      passwordChangedAt: new Date(),
      registered: true,
    };
    const newUser = isGuest ? Object.assign(existingUser, fields) : new UserEntity(fields);

    try {
      await this.userRepository.save(newUser);
    } catch (e) {
      throw new BadRequestException('user was not created');
    }

    // Fire-and-forget welcome email (never blocks/breaks registration).
    void this.mailService.sendRegistrationEmail({
      email: newUser.email,
      firstName: newUser.firstName,
    });

    return newUser;
  }

  async findAll(): Promise<ResponseUserDto[]> {
    const users = await this.userRepository.find({
      where: { status: Not(UserStatus.Deleted) },
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(ResponseUserDto, users);
  }

  /**
   * Admin user search by first name, last name, email or phone.
   *
   * The query is split into words and every word must match at least one of
   * those fields, so "Ivan Petrenko" finds a user by first + last name.
   * Words containing digits are also matched against the phone with
   * formatting stripped, so "067 123 45" finds "+380671234567".
   */
  async search({ q, limit = 20 }: SearchUsersDto): Promise<ResponseUserDto[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.status != :deleted', { deleted: UserStatus.Deleted })
      .orderBy('user.createdAt', 'DESC')
      .take(limit);

    q.split(/\s+/)
      .filter(Boolean)
      .forEach((word, i) => {
        const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
        const digits = word.replace(/\D/g, '');

        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where(`user.firstName ILIKE :like${i}`)
              .orWhere(`user.lastName ILIKE :like${i}`)
              .orWhere(`user.email ILIKE :like${i}`)
              .orWhere(`user.phone ILIKE :like${i}`);

            if (digits) {
              sub.orWhere(`regexp_replace(user.phone, '\\D', '', 'g') LIKE :digits${i}`);
            }
          }),
          { [`like${i}`]: like, [`digits${i}`]: `%${digits}%` },
        );
      });

    return plainToInstance(ResponseUserDto, await qb.getMany());
  }

  /**
   * Create a dedicated courier account (admin only).
   *
   * Always forces the COURIER role regardless of the payload and stores a
   * hashed password. Couriers are registered accounts whose contacts the
   * admin vouches for, so they start out verified.
   */
  async createCourier(courier: CreateCourierDto): Promise<ResponseUserDto> {
    const email = normalizeEmail(courier.email);
    const existingUser = await this.userRepository.findOne({ where: { email } });

    if (existingUser) {
      throw new BadRequestException('email already exists');
    }

    const phone = normalizePhone(courier.phone);
    await this.assertPhoneAvailable(phone);

    const hashedPassword = await this.bcryptService.hashPassword(courier.password, SALT_ROUNDS);
    const now = new Date();

    const newCourier = new UserEntity({
      firstName: courier.firstName,
      lastName: courier.lastName ?? '',
      email,
      phone,
      password: hashedPassword,
      passwordChangedAt: now,
      role: UserRole.Courier,
      registered: true,
      emailVerifiedAt: now,
      phoneVerifiedAt: now,
    });

    try {
      const saved = await this.userRepository.save(newCourier);
      return plainToInstance(ResponseUserDto, saved);
    } catch (e) {
      throw new BadRequestException('courier was not created');
    }
  }

  /**
   * List active courier accounts for admin UI dropdowns.
   */
  async getCouriers(): Promise<ResponseUserDto[]> {
    const couriers = await this.userRepository.find({
      where: { role: UserRole.Courier, status: UserStatus.Active },
      order: { firstName: 'ASC' },
    });
    return plainToInstance(ResponseUserDto, couriers);
  }

  async findOne(id: string): Promise<ResponseUserDto> {
    return plainToInstance(ResponseUserDto, await this.getUserOrFail(id));
  }

  /**
   * Throws if the phone is already used by another account.
   * Pass `exceptUserId` when updating so a user can keep their own phone.
   */
  private async assertPhoneAvailable(phone: string, exceptUserId?: string): Promise<void> {
    const existing = await this.userRepository.findOne({ where: { phone } });

    if (existing && existing.id !== exceptUserId) {
      throw new BadRequestException('phone already exists');
    }
  }

  /** Loads a user that has not been deleted, or throws 404. */
  private async getUserOrFail(id: string, relations: string[] = []): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id }, relations });

    if (!user || user.status === UserStatus.Deleted) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Favourites related methods
  async getFavourites(userId: string): Promise<ProductEntity[]> {
    const user = await this.getUserOrFail(userId, ['favourites']);
    return user.favourites || [];
  }

  async addFavourites(userId: string, productIds: string[]): Promise<ProductEntity[]> {
    const user = await this.getUserOrFail(userId, ['favourites']);

    // Load products and validate existence
    const products = await this.productRepo.findBy({ id: In(productIds) });
    const foundIds = new Set(products.map((p) => p.id));
    const missing = productIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Products not found: ${missing.join(',')}`);
    }

    // Merge unique existing favourites with new ones
    const existingMap = new Map((user.favourites || []).map((p) => [p.id, p]));
    for (const p of products) {
      existingMap.set(p.id, p);
    }

    user.favourites = Array.from(existingMap.values());

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new BadRequestException('Could not add favourites');
    }

    return user.favourites;
  }

  async removeFavourite(userId: string, productId: string): Promise<ProductEntity[]> {
    const user = await this.getUserOrFail(userId, ['favourites']);

    user.favourites = (user.favourites || []).filter((p) => p.id !== productId);

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new BadRequestException('Could not remove favourite');
    }

    return user.favourites;
  }

  async update(id: string, updateProfileDto: UpdateProfileDto): Promise<string> {
    const user = await this.getUserOrFail(id);
    // Picked explicitly rather than spread, so nothing but profile fields can
    // reach the entity even if validation whitelisting is ever turned off.
    const { firstName, lastName, phone, dateOfBirth } = updateProfileDto;
    const allowedUpdates: Partial<UserEntity> = Object.fromEntries(
      Object.entries({ firstName, lastName, phone }).filter(([, v]) => v !== undefined),
    );

    if (allowedUpdates.phone) {
      allowedUpdates.phone = normalizePhone(allowedUpdates.phone);

      if (allowedUpdates.phone !== user.phone) {
        await this.assertPhoneAvailable(allowedUpdates.phone, id);
        // A new number has not been verified yet.
        user.phoneVerifiedAt = null;
      }
    }

    // Date of birth drives birthday promos, so it can only be set once.
    if (dateOfBirth && !user.dateOfBirth) {
      Object.assign(user, { dateOfBirth, ...allowedUpdates });
    } else {
      Object.assign(user, allowedUpdates);
    }

    try {
      await this.userRepository.save(user);
      return `user ${id} was updated successfully`;
    } catch (e) {
      throw new BadRequestException('user was not updated');
    }
  }

  /**
   * Block or unblock an account (admin only). Blocking revokes every token
   * the user holds. Admin accounts cannot be blocked from the API, which also
   * keeps an admin from locking themselves out.
   */
  async setStatus(id: string, { status, reason }: UpdateUserStatusDto): Promise<ResponseUserDto> {
    const user = await this.getUserOrFail(id);

    if (user.role === UserRole.Admin) {
      throw new BadRequestException('admin accounts cannot be blocked');
    }

    if (user.status !== status) {
      user.status = status;

      if (status === UserStatus.Blocked) {
        user.blockedAt = new Date();
        user.blockedReason = reason ?? null;
        user.tokenVersion += 1;
      } else {
        user.blockedAt = null;
        user.blockedReason = null;
      }

      await this.userRepository.save(user);
    }

    return plainToInstance(ResponseUserDto, user);
  }

  /**
   * Self-service account deletion. Accounts with a password must confirm it,
   * so a stolen access token alone cannot erase the account.
   */
  async deleteOwnAccount(userId: string, password?: string): Promise<string> {
    const user = await this.getUserOrFail(userId, ['favourites']);

    if (user.password) {
      const isValid = password && (await this.bcryptService.verifyPassword(password, user.password));
      if (!isValid) throw new UnauthorizedException('invalid password');
    }

    return this.anonymize(user);
  }

  async remove(id: string): Promise<string> {
    const user = await this.getUserOrFail(id, ['favourites']);

    if (user.role === UserRole.Admin) {
      throw new BadRequestException('admin accounts cannot be deleted');
    }

    return this.anonymize(user);
  }

  /**
   * "Deletes" an account by wiping its personal data. The row itself stays,
   * because orders reference it and must keep showing up in reports.
   * Expects `favourites` to be loaded so the join rows get removed.
   */
  private async anonymize(user: UserEntity): Promise<string> {
    Object.assign(user, {
      status: UserStatus.Deleted,
      deletedAt: new Date(),
      email: `deleted-${user.id}@deleted.invalid`,
      firstName: 'Deleted',
      lastName: 'User',
      phone: null,
      password: null,
      dateOfBirth: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      favourites: [],
      tokenVersion: user.tokenVersion + 1,
    });

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new BadRequestException('user was not deleted');
    }

    return `user ${user.id} was deleted successfully`;
  }

  async getOrderHistory(userId: string, status?: OrderStatus) {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.id = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    const user = await queryBuilder.getOne();

    return user?.orders || [];
  }

  /**
   * Every order of a user with its lines, newest first (admin view). Deleted
   * accounts still resolve: they are anonymized but keep their orders.
   */
  async getUserOrders(userId: string) {
    const exists = await this.userRepository.exists({ where: { id: userId } });

    if (!exists) {
      throw new NotFoundException('User not found');
    }

    return this.ordersRepo.find({
      where: { user: { id: userId } },
      relations: ['items', 'items.product', 'assignedCourier'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrderHistoryItem(userId: string, orderId: string) {
    const order = await this.ordersRepo.findOne({
      where: {
        id: orderId,
        user: { id: userId },
      },
      relations: ['items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
