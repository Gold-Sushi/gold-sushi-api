/**
 * Typed contracts for the Monobank Acquiring (Internet Acquiring) API.
 * @see https://monobank.ua/api-docs/acquiring/methods/ia
 */

/** ISO 4217 numeric code for Ukrainian Hryvnia. */
export const MONOBANK_CCY_UAH = 980;

/** A single line item displayed on the Monobank payment page. */
export interface MonobankBasketItem {
  /** Human readable product name. */
  name: string;
  /** Quantity ordered. */
  qty: number;
  /** Price for a single unit, in the smallest currency unit (kopecks). */
  sum: number;
  /** Total price for the line (qty * sum), in kopecks. */
  total?: number;
  /** Internal product code / SKU. */
  code?: string;
  /** Unit of measure, e.g. "шт.". */
  unit?: string;
  /** Optional product image URL. */
  icon?: string;
}

export interface MonobankMerchantPaymInfo {
  /** Our internal reference (the order id). */
  reference?: string;
  /** Short purpose of payment shown to the customer. */
  destination?: string;
  comment?: string;
  basketOrder?: MonobankBasketItem[];
}

export interface CreateInvoiceRequest {
  /** Total amount in the smallest currency unit (kopecks). */
  amount: number;
  /** Currency code (ISO 4217 numeric). Defaults to UAH on the server. */
  ccy?: number;
  merchantPaymInfo?: MonobankMerchantPaymInfo;
  /** Where the customer is redirected after paying. */
  redirectUrl?: string;
  /** Where Monobank sends payment status updates. */
  webHookUrl?: string;
  /** Invoice validity in seconds. */
  validity?: number;
  /** "debit" (default) or "hold" for two-step payments. */
  paymentType?: 'debit' | 'hold';
}

export interface CreateInvoiceResponse {
  invoiceId: string;
  pageUrl: string;
}

/** Raw status strings returned by Monobank. */
export type MonobankInvoiceStatus =
  | 'created'
  | 'processing'
  | 'hold'
  | 'success'
  | 'failure'
  | 'reversed'
  | 'expired';

export interface InvoiceStatusResponse {
  invoiceId: string;
  status: MonobankInvoiceStatus;
  /** Present when the payment failed. */
  failureReason?: string;
  amount: number;
  ccy: number;
  /** Our reference (order id) echoed back. */
  reference?: string;
  /** ISO date string of the last modification. */
  modifiedDate?: string;
}

/** Payload Monobank delivers to the configured webHookUrl. */
export type WebhookPayload = InvoiceStatusResponse;

