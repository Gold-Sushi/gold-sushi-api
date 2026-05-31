import { OrdersController } from '@modules/orders/orders.controller';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderDetailEntity } from '@modules/orders/entities/order-detail.entity';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { CourierAssignedGuard } from '@modules/orders/guards/courier-assigned.guard';
import { Promocode } from '@modules/promotions/entities/promocode.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, OrderDetailEntity, ProductEntity, UserEntity, Promocode]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderOwnerGuard, CourierAssignedGuard]
})
export class OrdersModule {
}
