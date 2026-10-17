import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { UserRole } from '@common/enums/UserRole';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { AdminOrderNotificationDto } from './dto/admin-order-notification.dto';

export const ADMINS_ROOM = 'admins';

export enum AdminOrderEvent {
  New = 'order:new',
  Paid = 'order:paid',
}

/**
 * Push-only channel that streams order events to connected admins.
 *
 * Clients connect to the `/admin` namespace on path `/api/socket.io` and pass
 * their access token as `auth.token` (or an `Authorization: Bearer` header).
 * Anyone without a valid ADMIN token is refused in the namespace middleware,
 * so they never connect and receive a `connect_error` instead.
 */
@WebSocketGateway({ namespace: '/admin', path: '/api/socket.io' })
export class AdminOrdersGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AdminOrdersGateway.name);

  // Disconnect timers so a socket cannot outlive its access token.
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server: Namespace;

  constructor(private readonly jwtService: JwtService) {}

  afterInit(namespace: Namespace) {
    namespace.use((client, next) => {
      const error = this.authenticate(client);
      next(error ? new Error(error) : undefined);
    });
  }

  /**
   * Verifies the handshake token and stores the admin on `client.data.user`.
   * Returns the rejection reason, or null when the client is an admin.
   */
  authenticate(client: Socket): string | null {
    const token = this.extractToken(client);
    if (!token) {
      return 'Unauthorized';
    }

    let payload: { id: string; email: string; role: UserRole; exp?: number };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      return 'Unauthorized';
    }

    if (payload.role !== UserRole.Admin) {
      return 'Forbidden';
    }

    client.data.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      exp: payload.exp,
    };
    return null;
  }

  handleConnection(client: Socket) {
    // The middleware already refused non-admins; this is a safety net.
    if (client.data.user?.role !== UserRole.Admin) {
      client.disconnect(true);
      return;
    }

    client.join(ADMINS_ROOM);

    const exp: number | undefined = client.data.user?.exp;
    if (exp) {
      const msLeft = exp * 1000 - Date.now();
      this.expiryTimers.set(
        client.id,
        setTimeout(() => {
          client.emit('error', { message: 'Token expired' });
          client.disconnect(true);
        }, Math.max(msLeft, 0)),
      );
    }
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiryTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(client.id);
    }
  }

  /** Broadcast a freshly created order. Never throws. */
  notifyNewOrder(order: OrderEntity) {
    this.broadcast(AdminOrderEvent.New, order);
  }

  /** Broadcast an order whose online payment has been confirmed. Never throws. */
  notifyOrderPaid(order: OrderEntity) {
    this.broadcast(AdminOrderEvent.Paid, order);
  }

  private broadcast(event: AdminOrderEvent, order: OrderEntity) {
    try {
      this.server
        ?.to(ADMINS_ROOM)
        .emit(event, AdminOrderNotificationDto.fromEntity(order));
    } catch (error) {
      this.logger.warn(`Failed to emit ${event} for order ${order?.id}: ${error}`);
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth) {
      return fromAuth.replace(/^Bearer\s+/i, '');
    }

    const header = client.handshake.headers?.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
    return match ? match[1] : null;
  }

}
