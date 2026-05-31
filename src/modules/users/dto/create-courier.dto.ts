import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';
/**
 * Payload used by an admin to create a dedicated courier account.
 * The created user is always assigned the COURIER role.
 */
export class CreateCourierDto {
  @IsString()
  firstName: string;
  @IsOptional()
  @IsString()
  lastName?: string;
  @IsEmail()
  email: string;
  @IsString()
  password: string;
  @IsPhoneNumber('UA')
  phone: string;
}
