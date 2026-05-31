import {
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreatePromotionDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  image: any;

  /**
   * Discount percentage applied to the linked products (0-100).
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discount?: number;

  @IsDateString()
  startDate: Date;

  @IsDateString()
  endDate: Date;

  /**
   * Ids of the products this promotion applies to. Accepts a JSON/array body or
   * a comma-separated string (handy for multipart/form-data requests).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsString()
  @IsOptional()
  category?: string;
}
