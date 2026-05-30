import { UserRole } from '@common/enums/UserRole';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class OrderOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orderId = request.params.id;

    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'user'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Guest orders are publicly accessible by id (UUID is unguessable)
    if (order.user && !order.user.registered) {
      request.order = order;
      return true;
    }

    if (user?.role !== UserRole.Admin && order.user?.id !== user?.id) {
      throw new ForbiddenException('Access denied');
    }

    request.order = order;
    return true;
  }
}
