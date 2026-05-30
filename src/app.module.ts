import { CartModule } from '@modules/cart/cart.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';

import { AuthModule } from '@common/auth/auth.module';
import { HealthModule } from '@common/health/health.module';
import { ProductsModule } from '@modules/products/products.module';
import { CategoryModule } from '@modules/category/category.module';
import { UsersModule } from '@modules/users/users.module';
import { CloudinaryModule } from '@common/cloudinary/cloudinary.module';

import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
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
    PaymentsModule,
    MailModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
