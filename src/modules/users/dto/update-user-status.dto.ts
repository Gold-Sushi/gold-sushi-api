import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@common/enums/UserStatus';

/** DELETED is reached only through account deletion, never set directly. */
const SETTABLE_STATUSES = [UserStatus.Active, UserStatus.Blocked] as const;

export class UpdateUserStatusDto {
  @ApiProperty({ enum: SETTABLE_STATUSES })
  @IsIn(SETTABLE_STATUSES)
  status: UserStatus.Active | UserStatus.Blocked;

  @ApiPropertyOptional({ description: 'Shown to admins; stored when blocking.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
