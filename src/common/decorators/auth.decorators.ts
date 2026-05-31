import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@common/auth/optional-jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { RolesGuard } from '@common/guards/roles.guard';

const UNAUTHORIZED_DESCRIPTION = 'Missing or invalid access token.';
const FORBIDDEN_ROLE_DESCRIPTION = 'Authenticated user does not have the ADMIN role.';

/**
 * Protects a route so that only authenticated users with the ADMIN role can
 * access it, and documents the corresponding 401/403 Swagger responses.
 */
export function AdminOnly() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(UserRole.Admin),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: UNAUTHORIZED_DESCRIPTION }),
    ApiForbiddenResponse({ description: FORBIDDEN_ROLE_DESCRIPTION }),
  );
}

/**
 * Protects a route so that only authenticated users can access it, and
 * documents the corresponding 401 Swagger response.
 */
export function Authenticated() {
  return applyDecorators(
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: UNAUTHORIZED_DESCRIPTION }),
  );
}

/**
 * Allows optional authentication: a Bearer JWT is used when present but is not
 * required. Optionally attaches additional guards (e.g. ownership checks).
 */
export function OptionalAuth(...guards: Parameters<typeof UseGuards>) {
  return applyDecorators(
    UseGuards(OptionalJwtAuthGuard, ...guards),
    ApiBearerAuth('access-token'),
  );
}

