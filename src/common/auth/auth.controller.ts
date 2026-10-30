import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Authenticated } from '@common/decorators/auth.decorators';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LocalAuthGuard } from './local-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({
    summary: 'Log in with email and password',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(@Body() body: LoginDto, @Req() req) {
    return this.authService.login(req.user);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Log out the current session',
  })
  async logout() {
    return 'logout success';
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh the access token',
  })
  async refreshToken() {
    return 'token refresh success';
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request a password reset link',
  })
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Set a new password using a reset token',
  })
  @ApiBadRequestResponse({ description: 'Reset token is invalid or expired.' })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('change-password')
  @Authenticated()
  @ApiOperation({
    summary: 'Change the password of the current user',
  })
  @ApiBadRequestResponse({
    description: 'New password matches the current one.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
