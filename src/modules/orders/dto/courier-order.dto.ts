import { CourierOrderItemDto } from './courier-order-item.dto';

/**
 * Trimmed view of an order exposed to the assigned courier.
 *
 * Includes only the information a courier needs to fulfil a delivery:
 * order identity, delivery address, customer contact details, scheduling
 * and the line items - deliberately excluding payment internals and any
 * sensitive account data.
 */
export class CourierOrderDto {
  id: string;
  number: string;
  status: number;
  deliveryType: number;
  address1: string | null;
  address2: string | null;
  city: string | null;
  phone: string;
  deliveryScheduleTime?: Date | null;
  deliveryTime?: Date | null;
  createdAt: Date;
  total: number;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  } | null;
  items: CourierOrderItemDto[];

  static fromEntity(order: any): CourierOrderDto {
    const dto = new CourierOrderDto();
    dto.id = order.id;
    dto.number = order.number;
    dto.status = Number(order.status);
    dto.deliveryType = order.deliveryType;
    dto.address1 = order.address1 ?? null;
    dto.address2 = order.address2 ?? null;
    dto.city = order.city ?? null;
    dto.phone = order.phone;
    dto.deliveryScheduleTime = order.deliveryScheduleTime ?? null;
    dto.deliveryTime = order.deliveryTime ?? null;
    dto.createdAt = order.createdAt;
    dto.total = Number(order.total);
    dto.customer = order.user
      ? {
          firstName: order.user.firstName,
          lastName: order.user.lastName,
          phone: order.user.phone,
          email: order.user.email,
        }
      : null;
    dto.items = (order.items ?? []).map((item: any) => {
      const itemDto = new CourierOrderItemDto();
      itemDto.title = item.product?.title ?? null;
      itemDto.quantity = item.quantity;
      itemDto.price = Number(item.price);
      return itemDto;
    });
    return dto;
  }
}

