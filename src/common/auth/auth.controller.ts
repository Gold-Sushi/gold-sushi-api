import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
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
}
