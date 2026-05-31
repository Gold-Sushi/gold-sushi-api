import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class PromotionProductsDto {
  /**
   * Ids of the products to attach to / detach from the promotion.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  productIds: string[];
}

