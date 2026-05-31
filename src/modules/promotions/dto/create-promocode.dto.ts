import { IsString, IsNumber, IsBoolean, IsDateString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer'

export class CreatePromoCodeDto {
  @IsString()
  code: string;

  @Type(() => Number)
  @IsNumber()
  discount: number;

  @Type(() => Boolean)
  @IsBoolean()
  applyToCart: boolean;

  /**
   * Maximum number of times the code can be used. Omit (or send `null`) for
   * unlimited usage; use `1` for a single-use code.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsDateString()
  expiryDate: Date;
}
