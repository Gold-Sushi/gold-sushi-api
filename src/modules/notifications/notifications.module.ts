import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@common/auth/auth.module';
import { AdminOrdersGateway } from './admin-orders.gateway';

@Global()
@Module({
  imports: [
    AuthModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AdminOrdersGateway],
  exports: [AdminOrdersGateway],
})
export class NotificationsModule {}
