import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { UserRole } from '@common/enums/UserRole';
import { SessionService } from '@common/auth/session.service';
import { DeliveryType, PaymentStatus, PaymentType } from '@common/enums/Order';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  ADMINS_ROOM,
  AdminOrderEvent,
  AdminOrdersGateway,
} from './admin-orders.gateway';

const SECRET = 'test-secret';
const jwtService = new JwtService({ secret: SECRET });

function tokenFor(role: UserRole, expiresIn = 3600) {
  return jwtService.sign({ id: 'u-1', email: 'a@b.c', role }, { expiresIn });
}

function mockSocket(handshake: Partial<Socket['handshake']> = {}) {
  return {
    id: 'socket-1',
    data: {},
    handshake: { auth: {}, headers: {}, ...handshake },
    emit: jest.fn(),
    join: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket & {
    emit: jest.Mock;
    join: jest.Mock;
    disconnect: jest.Mock;
  };
}

function build(resolveSession?: jest.Mock) {
  // Default: the session is live and the role in the database matches the token.
  const sessionService = {
    resolveSession:
      resolveSession ??
      jest.fn(async ({ id, email, role }) => ({ id, email, role })),
  } as unknown as SessionService;
  const gateway = new AdminOrdersGateway(jwtService, sessionService);
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  gateway.server = { to } as any;
  return { gateway, to, emit };
}

describe('AdminOrdersGateway', () => {
  afterEach(() => jest.useRealTimers());

  it('refuses a handshake without a token', async () => {
    const { gateway } = build();
    expect(await gateway.authenticate(mockSocket())).toBe('Unauthorized');
  });

  it('refuses a token signed with another secret', async () => {
    const { gateway } = build();
    const forged = new JwtService({ secret: 'other' }).sign({ role: UserRole.Admin });
    expect(await gateway.authenticate(mockSocket({ auth: { token: forged } }))).toBe('Unauthorized');
  });

  it.each([UserRole.User, UserRole.Courier, UserRole.Guest])(
    'refuses a %s token',
    async (role) => {
      const { gateway } = build();
      const client = mockSocket({ auth: { token: tokenFor(role) } });

      expect(await gateway.authenticate(client)).toBe('Forbidden');
      expect(client.data.user).toBeUndefined();
    },
  );

  it('refuses an admin token whose session was revoked or blocked', async () => {
    const { gateway } = build(jest.fn().mockResolvedValue(null));
    const client = mockSocket({ auth: { token: tokenFor(UserRole.Admin) } });

    expect(await gateway.authenticate(client)).toBe('Unauthorized');
    expect(client.data.user).toBeUndefined();
  });

  it('refuses an admin token once the account is no longer an admin', async () => {
    const { gateway } = build(
      jest.fn().mockResolvedValue({ id: 'u-1', email: 'a@b.c', role: UserRole.User }),
    );
    const client = mockSocket({ auth: { token: tokenFor(UserRole.Admin) } });

    expect(await gateway.authenticate(client)).toBe('Forbidden');
  });

  it('wires authentication into the namespace middleware', async () => {
    const { gateway } = build();
    let middleware: (client: Socket, next: (err?: Error) => void) => void;
    gateway.afterInit({ use: (fn: typeof middleware) => (middleware = fn) } as any);

    const next = jest.fn();
    middleware(mockSocket({ auth: { token: tokenFor(UserRole.User) } }), next);
    await new Promise(setImmediate);
    expect(next).toHaveBeenCalledWith(new Error('Forbidden'));

    next.mockClear();
    middleware(mockSocket({ auth: { token: tokenFor(UserRole.Admin) } }), next);
    await new Promise(setImmediate);
    expect(next).toHaveBeenCalledWith(undefined);
  });

  it('admits an admin via auth.token and joins the admins room', async () => {
    const { gateway } = build();
    const client = mockSocket({ auth: { token: tokenFor(UserRole.Admin) } });

    expect(await gateway.authenticate(client)).toBeNull();
    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(ADMINS_ROOM);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toMatchObject({ id: 'u-1', email: 'a@b.c', role: UserRole.Admin });
    gateway.handleDisconnect(client);
  });

  it('admits an admin via the Authorization header', async () => {
    const { gateway } = build();
    const client = mockSocket({
      headers: { authorization: `Bearer ${tokenFor(UserRole.Admin)}` },
    });

    expect(await gateway.authenticate(client)).toBeNull();
  });

  it('drops a connection that skipped authentication', () => {
    const { gateway } = build();
    const client = mockSocket();

    gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects the admin once the token expires', async () => {
    const { gateway } = build();
    const client = mockSocket({ auth: { token: tokenFor(UserRole.Admin, 60) } });

    await gateway.authenticate(client);
    jest.useFakeTimers();
    gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(61_000);

    expect(client.emit).toHaveBeenCalledWith('error', { message: 'Token expired' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('broadcasts a trimmed order payload without user secrets', () => {
    const { gateway, to, emit } = build();
    const order = {
      id: 'o-1',
      number: '42',
      status: '0',
      total: '345.00',
      paymentType: PaymentType.Online,
      paymentStatus: PaymentStatus.Created,
      deliveryType: DeliveryType.Courier,
      createdAt: new Date('2026-10-17T10:00:00Z'),
      phone: '+380000000000',
      items: [{ quantity: 2 }, { quantity: 1 }],
      user: { firstName: 'Ann', lastName: 'Lee', password: 'hash', email: 'x@y.z' },
    } as unknown as OrderEntity;

    gateway.notifyNewOrder(order);

    expect(to).toHaveBeenCalledWith(ADMINS_ROOM);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe(AdminOrderEvent.New);
    expect(payload).toMatchObject({
      id: 'o-1',
      status: 0,
      total: 345,
      itemsCount: 3,
      customer: { firstName: 'Ann', lastName: 'Lee', phone: '+380000000000' },
    });
    expect(JSON.stringify(payload)).not.toContain('hash');
  });

  it('never throws when broadcasting fails', () => {
    const { gateway } = build();
    gateway.server = {
      to: () => {
        throw new Error('boom');
      },
    } as any;

    expect(() => gateway.notifyOrderPaid({ id: 'o-1' } as OrderEntity)).not.toThrow();
  });
});
