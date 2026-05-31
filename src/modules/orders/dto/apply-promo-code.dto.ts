import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Payload to preview the effect of a promo code on a given subtotal without
 * creating an order. Used by the checkout UI to show the discount before the
 * customer confirms the order.
 */
export class ApplyPromoCodeDTO {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;
}

