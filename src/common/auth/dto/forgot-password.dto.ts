import { IsEmail } from 'class-validator';

/**
 * Request a password reset link. The response is always the same whether or
 * not an account exists for this address, so it cannot be used to probe for
 * registered emails.
 */
export class ForgotPasswordDto {
  /** Email address the account was registered with. */
  @IsEmail()
  email: string;
}
