import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MonobankService } from './monobank/monobank.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  controllers: [PaymentsController],
  providers: [PaymentsService, MonobankService, OrderOwnerGuard],
  exports: [PaymentsService, MonobankService],
})
export class PaymentsModule {}

