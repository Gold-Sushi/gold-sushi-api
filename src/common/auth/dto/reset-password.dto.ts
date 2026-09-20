import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password.constants';

/**
 * Set a new password using the token from the reset email. The token is
 * single-use: it is cleared as soon as the password is changed.
 */
export class ResetPasswordDto {
  /** Token taken from the `?token=` query param of the emailed link. */
  @IsString()
  @IsNotEmpty()
  token: string;

  /** New password, 8–72 characters. */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
