import { UserEntity } from '@modules/users/entities/user.entity';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { BcryptService } from '../../utils/bcrypt/bcrypt.service';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { SessionService } from './session.service';

/** Used when JWT_EXPIRES_IN is not set. There are no refresh tokens yet. */
const DEFAULT_JWT_EXPIRES_IN = '30d';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') ?? DEFAULT_JWT_EXPIRES_IN,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, BcryptService, JwtStrategy, SessionService],
  exports: [SessionService],
})
export class AuthModule {}
