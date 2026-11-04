import { IsDateString, IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

/**
 * Fields a user (or an admin on their behalf) may edit on a profile.
 * Email and password are deliberately absent — they have their own flows.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsPhoneNumber('UA')
  phone?: string;

  /** Can only be set once; later changes are ignored. */
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
