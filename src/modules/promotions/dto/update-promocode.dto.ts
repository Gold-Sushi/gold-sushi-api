import {
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer'

export class UpdatePromocodeDto {
  @IsString()
  @IsOptional()
  code: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  discount: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  applyToCart: boolean;

  /**
   * Maximum number of times the code can be used. Send `null` to make it
   * unlimited again.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsDateString()
  @IsOptional()
  expiryDate: Date;
}
