import { Repository } from 'typeorm';
import { UserRole } from '@common/enums/UserRole';
import { UserStatus } from '@common/enums/UserStatus';
import { UserEntity } from '@modules/users/entities/user.entity';
import { JwtPayload, SessionService } from './session.service';

const EXP = Math.floor(Date.now() / 1000) + 3600;

function build(user: Partial<UserEntity> | null) {
  const findOne = jest.fn().mockResolvedValue(user);
  const repo = { findOne } as unknown as Repository<UserEntity>;
  return { service: new SessionService(repo), findOne };
}

const payload = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  id: 'u-1',
  email: 'a@b.c',
  role: UserRole.User,
  tv: 0,
  exp: EXP,
  ...overrides,
});

const activeUser = {
  id: 'u-1',
  email: 'a@b.c',
  role: UserRole.User,
  status: UserStatus.Active,
  tokenVersion: 0,
};

describe('SessionService', () => {
  it('returns the user for a live session', async () => {
    const { service } = build(activeUser);
    expect(await service.resolveSession(payload())).toEqual({
      id: 'u-1',
      email: 'a@b.c',
      role: UserRole.User,
    });
  });

  it('takes the role from the database, not the token', async () => {
    const { service } = build({ ...activeUser, role: UserRole.User });
    const session = await service.resolveSession(payload({ role: UserRole.Admin }));
    expect(session?.role).toBe(UserRole.User);
  });

  it('treats a token without `tv` as version 0', async () => {
    const { service } = build(activeUser);
    expect(await service.resolveSession(payload({ tv: undefined }))).not.toBeNull();
  });

  it.each([
    ['the token has no exp (legacy, never expires)', payload({ exp: undefined }), activeUser],
    ['the user no longer exists', payload(), null],
    ['the user is blocked', payload(), { ...activeUser, status: UserStatus.Blocked }],
    ['the user was deleted', payload(), { ...activeUser, status: UserStatus.Deleted }],
    ['the token version was bumped', payload({ tv: 0 }), { ...activeUser, tokenVersion: 1 }],
  ])('rejects when %s', async (_case, token, user) => {
    const { service } = build(user);
    expect(await service.resolveSession(token)).toBeNull();
  });

  it('skips the database for tokens without exp', async () => {
    const { service, findOne } = build(activeUser);
    await service.resolveSession(payload({ exp: undefined }));
    expect(findOne).not.toHaveBeenCalled();
  });
});
