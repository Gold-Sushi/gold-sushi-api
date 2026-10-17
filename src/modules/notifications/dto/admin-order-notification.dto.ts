import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  PaymentType,
} from '@common/enums/Order';

/**
 * Slim order view pushed to admins over the WebSocket. Deliberately built
 * field-by-field so no sensitive `UserEntity` data (password hash, tokens)
 * can leak through the socket.
 */
export class AdminOrderNotificationDto {
  id: string;
  number: string;
  status: OrderStatus;
  total: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  deliveryScheduleTime: Date | null;
  createdAt: Date;
  itemsCount: number;
  customer: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };

  static fromEntity(order: OrderEntity): AdminOrderNotificationDto {
    return {
      id: order.id,
      number: order.number,
      status: Number(order.status) as OrderStatus,
      total: Number(order.total),
      paymentType: order.paymentType,
      paymentStatus: order.paymentStatus,
      deliveryType: order.deliveryType,
      deliveryScheduleTime: order.deliveryScheduleTime ?? null,
      createdAt: order.createdAt,
      itemsCount: (order.items ?? []).reduce(
        (sum, item) => sum + (item.quantity || 0),
        0,
      ),
      customer: {
        firstName: order.user?.firstName ?? null,
        lastName: order.user?.lastName ?? null,
        phone: order.phone ?? order.user?.phone ?? null,
      },
    };
  }
}
