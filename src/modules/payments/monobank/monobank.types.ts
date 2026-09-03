/**
 * Typed contracts for the Monobank Acquiring (Internet Acquiring) API.
 *
 * Amounts are always expressed in minor currency units (kopecks for UAH) and
 * currency codes follow ISO 4217.
 *
 * @see https://monobank.ua/api-docs/acquiring/methods/ia
 */

/** ISO 4217 numeric code for Ukrainian Hryvnia. */
export const MONOBANK_CCY_UAH = 980;

/** Cart-level or item-level discount / surcharge used for fiscalisation. */
export interface MonobankDiscountItem {
  type: 'DISCOUNT' | 'EXTRA_CHARGE';
  mode: 'PERCENT' | 'VALUE';
  /** Percentage when `mode` is PERCENT, minor currency units when VALUE. */
  value: number;
}

/** A single line item displayed on the Monobank payment page. */
export interface MonobankBasketItem {
  /** Human readable product name. */
  name: string;
  /** Quantity ordered. */
  qty: number;
  /** Price for a single unit, in the smallest currency unit (kopecks). */
  sum: number;
  /** Product code / SKU. Required by the API (and by fiscalisation). */
  code: string;
  /** Total price for the line (qty * sum), in kopecks. */
  total?: number;
  /** Unit of measure, e.g. "шт.". */
  unit?: string;
  /** Optional product image URL. */
  icon?: string;
  barcode?: string;
  header?: string;
  footer?: string;
  /** Tax rates configured in the Checkbox portal. */
  tax?: number[];
  uktzed?: string;
  discounts?: MonobankDiscountItem[];
}

export interface MonobankMerchantPaymInfo {
  /** Our internal reference (the order id). */
  reference?: string;
  /** Short purpose of payment shown to the customer. */
  destination?: string;
  comment?: string;
  /** Emails the fiscal receipt is delivered to. */
  customerEmails?: string[];
  /** Order lines. Required when fiscalisation is enabled for the merchant. */
  basketOrder?: MonobankBasketItem[];
  /** Cart-level discounts / surcharges. */
  discounts?: MonobankDiscountItem[];
}

export interface CreateInvoiceRequest {
  /** Total amount in the smallest currency unit (kopecks). */
  amount: number;
  /** Currency code (ISO 4217 numeric). Defaults to UAH on the server. */
  ccy?: number;
  merchantPaymInfo?: MonobankMerchantPaymInfo;
  /** Where the customer is redirected (GET) after paying. */
  redirectUrl?: string;
  /** Where Monobank POSTs payment status updates. Never fires for `expired`. */
  webHookUrl?: string;
  /** Invoice validity in seconds. Monobank defaults to 24h. */
  validity?: number;
  /** "debit" (default) or "hold" for two-step payments. */
  paymentType?: 'debit' | 'hold';
  /** QR cashier id, when the amount is set on an existing QR. */
  qrId?: string;
  /** Submerchant terminal code (limited access). */
  code?: string;
  saveCardData?: { saveCard: boolean; walletId?: string };
  tipsEmployeeId?: string;
  agentFeePercent?: number;
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

/**
 * Statuses from which an invoice can no longer move on its own.
 * Note that `expired` is never delivered by webhook — it is only observable
 * by polling the status endpoint.
 */
export const MONOBANK_TERMINAL_STATUSES: ReadonlySet<MonobankInvoiceStatus> =
  new Set(['success', 'failure', 'reversed', 'expired']);

/** Payment details, present once an actual card operation took place. */
export interface MonobankPaymentInfo {
  maskedPan: string;
  approvalCode?: string;
  rrn?: string;
  tranId?: string;
  terminal: string;
  bank?: string;
  paymentSystem: 'visa' | 'mastercard';
  paymentMethod: 'pan' | 'apple' | 'google' | 'monobank' | 'wallet' | 'direct';
  country?: string;
  /** Acquiring fee in minor units. */
  fee?: number;
  agentFee?: number;
}

export interface MonobankCancelListItem {
  status: 'processing' | 'success' | 'failure';
  createdDate: string;
  modifiedDate: string;
  amount?: number;
  ccy?: number;
  approvalCode?: string;
  rrn?: string;
  extRef?: string;
}

export interface InvoiceStatusResponse {
  invoiceId: string;
  status: MonobankInvoiceStatus;
  amount: number;
  ccy: number;
  /** Amount left after any refunds. */
  finalAmount?: number;
  createdDate?: string;
  /** ISO date string of the last modification. */
  modifiedDate?: string;
  /** Our reference (order id) echoed back. */
  reference?: string;
  destination?: string;
  /** Error code, present when the payment failed. */
  errCode?: string;
  /** Human readable failure description. */
  failureReason?: string;
  paymentInfo?: MonobankPaymentInfo;
  cancelList?: MonobankCancelListItem[];
  tipsInfo?: { employeeId: string; amount?: number };
  walletData?: {
    cardToken: string;
    walletId: string;
    status: 'new' | 'created' | 'failed';
  };
}

/** Payload Monobank delivers to the configured webHookUrl. */
export type WebhookPayload = InvoiceStatusResponse;

/** Invalidation of an invoice that has not been paid yet. */
export interface RemoveInvoiceRequest {
  invoiceId: string;
}

/** Full or partial refund of a successful payment. */
export interface CancelInvoiceRequest {
  invoiceId: string;
  /** Amount in minor units — omit for a full refund. */
  amount?: number;
  /** Our own cancellation reference. */
  extRef?: string;
  items?: MonobankBasketItem[];
}

export interface CancelInvoiceResponse {
  status: 'processing' | 'success' | 'failure';
  createdDate: string;
  modifiedDate: string;
}

/** Response of `GET /api/merchant/details` — handy as a token sanity check. */
export interface MerchantDetailsResponse {
  merchantId: string;
  merchantName: string;
  edrpou: string;
}

/** Response of `GET /api/merchant/pubkey`. */
export interface MerchantPubKeyResponse {
  /** Base64-encoded x.509 ECDSA public key. */
  key: string;
}

/** Error body returned by every Monobank endpoint. */
export interface MonobankErrorResponse {
  errCode?: string;
  errText?: string;
}
