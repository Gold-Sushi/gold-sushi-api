import { IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Optional overrides when starting a payment for an order.
 * Sensible defaults are taken from configuration when these are omitted.
 */
export class CreatePaymentDTO {
  /**
   * Where the customer should be redirected after completing the payment.
   * Falls back to `PAYMENT_REDIRECT_URL` / `FRONTEND_URL` when not provided.
   */
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  redirectUrl?: string;
}

