import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { PaymentsController } from './payments.controller';
import { MonoPayController } from './monopay.controller';
import { PaymentsService } from './payments.service';
import { MonobankService } from './monobank/monobank.service';
import { MonoPayService } from './monopay/monopay.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  controllers: [PaymentsController, MonoPayController],
  providers: [PaymentsService, MonobankService, MonoPayService, OrderOwnerGuard],
  exports: [PaymentsService, MonobankService, MonoPayService],
})
export class PaymentsModule {}

