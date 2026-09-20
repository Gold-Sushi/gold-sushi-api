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
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
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
    description:
      'Public endpoint. Validates the provided credentials and returns a JWT access token used as a Bearer token on protected endpoints.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(@Body() body: LoginDto, @Req() req) {
    return this.authService.login(req.user);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Log out the current session',
    description: 'Public endpoint. Clears the authentication/refresh state for the current session.',
  })
  async logout() {
    return 'logout success';
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh the access token',
    description: 'Public endpoint. Issues a new access token from a valid refresh token.',
  })
  async refreshToken() {
    return 'token refresh success';
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Public endpoint. Emails a single-use reset link valid for 30 minutes. Always returns the same message whether or not the address belongs to an account, so it cannot be used to discover registered emails.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password/validate')
  @ApiOperation({
    summary: 'Check whether a reset token is still usable',
    description:
      'Public endpoint. Lets the reset page report an expired or already-used link before asking for a new password.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async validateResetToken(@Body() dto: ValidateResetTokenDto) {
    return this.authService.validateResetToken(dto.token);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description:
      'Public endpoint. Consumes the token from the reset email and stores the new password. The token cannot be reused afterwards.',
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
    description:
      'Requires a Bearer JWT and the current password, so a stolen access token alone cannot take over the account.',
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
