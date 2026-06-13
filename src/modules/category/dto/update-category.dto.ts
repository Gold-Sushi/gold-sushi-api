import { Expose } from 'class-transformer';
import { IsOptional, IsString, IsArray } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
 title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  category_id?: string;

  @IsOptional()
  @IsArray()
  productIds?: string[]; // Array of product IDs to associate with the category

  @IsOptional()
  @Expose()
  thumbnail?: any;
}
