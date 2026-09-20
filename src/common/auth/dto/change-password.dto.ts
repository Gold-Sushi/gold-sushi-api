import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password.constants';

/**
 * Change the password of the currently authenticated user. Requires the
 * current password, so a stolen access token alone is not enough.
 */
export class ChangePasswordDto {
  /** The password currently in use. */
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  /** New password, 8–72 characters. */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}
