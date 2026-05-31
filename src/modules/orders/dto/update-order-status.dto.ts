import { OrderStatus } from '@common/enums/Order';
import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDTO {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

