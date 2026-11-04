import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@common/auth/password.constants';
import { normalizeEmail } from '../../../utils/email/normalize-email';
/**
 * Payload used by an admin to create a dedicated courier account.
 * The created user is always assigned the COURIER role.
 */
export class CreateCourierDto {
  @IsString()
  @MaxLength(100)
  firstName: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  @MaxLength(255)
  email: string;
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
  @IsPhoneNumber('UA')
  phone: string;
}
