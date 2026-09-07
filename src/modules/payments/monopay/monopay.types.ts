/**
 * Contracts for the monopay payment button (the JS widget embedded on the
 * storefront).
 *
 * Unlike the hosted-page flow, the invoice is created by monobank itself when
 * the customer clicks the button — from order data that travels through the
 * browser. That data is only trustworthy because we sign it here with the
 * merchant private key, so the widget can neither change the amount nor the
 * basket it submits.
 *
 * @see https://monobank.ua/api-docs/acquiring/methods/monopay/docs--js-widget
 */
import { CreateInvoiceRequest } from '../monobank/monobank.types';

/**
 * Order data the widget submits. It is the very same body as the one
 * `POST /api/merchant/invoice/create` accepts — monobank creates the invoice
 * from it once the signature checks out — plus the two outcome-specific
 * return URLs the widget understands on top of `redirectUrl`.
 */
export type MonoPayWidgetPayload = CreateInvoiceRequest & {
  /** Where the customer lands after a successful payment. */
  successUrl?: string;
  /** Where the customer lands after a failed one. */
  failUrl?: string;
};

/** Everything the frontend needs to mount the monopay button. */
export interface MonoPayWidgetInit {
  /** Id of the signing key, from `/api/merchant/monopay/pubkey-list`. */
  keyId: string;
  /** Base64 DER ECDSA-SHA256 signature of `payloadJson + requestId`. */
  signature: string;
  /** Idempotency key of the click. Accepted for 10 minutes. */
  requestId: string;
  /** Base64 of the exact JSON string that was signed. */
  payloadBase64: string;
  /** ISO date at which `requestId` (and therefore this set) expires. */
  expiresAt: string;
}

/**
 * One entry of `GET /api/merchant/monopay/pubkey-list`.
 *
 * The response sample is not published in the API docs, so every plausible
 * spelling of the identifier is accepted here and normalised by the client.
 */
export interface MonoPaySigningKey {
  keyId?: string;
  id?: string;
  /** Client-defined name given at import time. */
  keyName?: string;
  name?: string;
  dateTime?: string;
  createdAt?: string;
  expiresAt?: string;
}

/** Raw body of `GET /api/merchant/monopay/pubkey-list`. */
export type MonoPayPubKeyListResponse =
  | MonoPaySigningKey[]
  | string[]
  | {
      list?: MonoPaySigningKey[] | string[];
      keys?: MonoPaySigningKey[] | string[];
      data?: MonoPaySigningKey[] | string[];
    };
