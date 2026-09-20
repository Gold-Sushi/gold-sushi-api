import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Check a reset token before rendering the "new password" form, so an expired
 * or already-used link can be reported up front.
 */
export class ValidateResetTokenDto {
  /** Token taken from the `?token=` query param of the emailed link. */
  @IsString()
  @IsNotEmpty()
  token: string;
}
