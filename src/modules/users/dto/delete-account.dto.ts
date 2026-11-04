import { IsOptional, IsString } from 'class-validator';

/**
 * Confirms self-deletion. The current password is required for accounts that
 * have one, so a stolen access token alone cannot erase the account.
 */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  password?: string;
}
