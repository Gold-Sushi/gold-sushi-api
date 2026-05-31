import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderDetailEntity } from '@modules/orders/entities/order-detail.entity';

import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderDetailEntity])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
