import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Ensures the authenticated courier is the one assigned to the requested
 * order. Loads the order with the relations a courier needs and attaches it
 * to the request as `request.order` for downstream handlers.
 */
@Injectable()
export class CourierAssignedGuard implements CanActivate {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orderId = request.params.id;

    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'user', 'assignedCourier'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!order.assignedCourier || order.assignedCourier.id !== user?.id) {
      throw new ForbiddenException('Order is not assigned to you');
    }

    request.order = order;
    return true;
  }
}

