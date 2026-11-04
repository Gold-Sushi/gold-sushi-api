import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ResponseUserDto {
  @Expose()
  id: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  email: string;

  @Expose()
  phone: string | null;

  @Expose()
  dateOfBirth: string | null;

  @Expose()
  role: string;

  @Expose()
  status: string;

  @Expose()
  registered: boolean;

  @Expose()
  emailVerifiedAt: Date | null;

  @Expose()
  phoneVerifiedAt: Date | null;

  @Expose()
  lastLoginAt: Date | null;

  @Expose()
  blockedAt: Date | null;

  @Expose()
  blockedReason: string | null;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
