import { CartModule } from '@modules/cart/cart.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TestingModule } from '@nestjs/testing';
import { memoryStorage } from 'multer';

import { AuthModule } from '@common/auth/auth.module';
import { HealthModule } from '@common/health/health.module';
import { ProductsModule } from '@modules/products/products.module';
import { CategoryModule } from '@modules/category/category.module';
import { UsersModule } from '@modules/users/users.module';
import { CloudinaryModule } from '@common/cloudinary/cloudinary.module';

import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    DatabaseModule,
    HealthModule,
    UsersModule,
    CartModule,
    AuthModule,
    CategoryModule,
    ProductsModule,
    CloudinaryModule,
    PromotionsModule,
    OrdersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
