import { createVerify } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  CancelInvoiceRequest,
  CancelInvoiceResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  InvoiceStatusResponse,
  MerchantDetailsResponse,
  MerchantPubKeyResponse,
  MONOBANK_CCY_UAH,
  MonobankErrorResponse,
} from './monobank.types';

/**
 * Thin, well-typed client around the Monobank Acquiring REST API.
 *
 * It is intentionally free of any order/business logic so it can be reused
 * and unit-tested in isolation. Authentication is done via the `X-Token`
 * header carrying the merchant token.
 *
 * @see https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create
 */
@Injectable()
export class MonobankService {
  private readonly logger = new Logger(MonobankService.name);
  private readonly http: AxiosInstance;
  private readonly token: string;

  /** Cached public key (base64) used to verify webhook signatures. */
  private cachedPublicKey: string | null = null;
  /** In-flight public key request, so concurrent webhooks fetch it once. */
  private publicKeyRequest: Promise<string> | null = null;
  /** Epoch ms of the last forced key refresh, used to rate-limit refetches. */
  private lastPublicKeyRefresh = 0;

  /** Shortest interval between two forced public key refreshes. */
  private static readonly PUBKEY_REFRESH_COOLDOWN_MS = 60_000;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('MONOBANK_TOKEN') ?? '';
    const baseURL =
      this.configService.get<string>('MONOBANK_API_URL') ??
      'https://api.monobank.ua';

    if (!this.token) {
      this.logger.warn(
        'MONOBANK_TOKEN is not set — online payments will fail until it is configured.',
      );
    }

    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      headers: { 'X-Token': this.token },
    });
  }

  /** True when a merchant token is configured. */
  get isConfigured(): boolean {
    return Boolean(this.token);
  }

  /** Creates a payment invoice and returns the hosted payment page URL. */
  async createInvoice(
    payload: CreateInvoiceRequest,
  ): Promise<CreateInvoiceResponse> {
    try {
      const { data } = await this.http.post<CreateInvoiceResponse>(
        '/api/merchant/invoice/create',
        prune({ ccy: MONOBANK_CCY_UAH, ...payload }),
      );
      return data;
    } catch (error) {
      throw this.toHttpException(error, 'Failed to create Monobank invoice');
    }
  }

  /** Fetches the current status of an invoice from Monobank. */
  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatusResponse> {
    try {
      const { data } = await this.http.get<InvoiceStatusResponse>(
        '/api/merchant/invoice/status',
        { params: { invoiceId } },
      );
      return data;
    } catch (error) {
      throw this.toHttpException(
        error,
        'Failed to fetch Monobank invoice status',
      );
    }
  }

  /**
   * Invalidates an invoice that has not been paid yet, so an abandoned
   * payment page cannot be completed after we issued a replacement.
   */
  async removeInvoice(invoiceId: string): Promise<void> {
    try {
      await this.http.post('/api/merchant/invoice/remove', { invoiceId });
    } catch (error) {
      throw this.toHttpException(error, 'Failed to invalidate Monobank invoice');
    }
  }

  /** Refunds a successful payment, fully or partially. */
  async cancelInvoice(
    payload: CancelInvoiceRequest,
  ): Promise<CancelInvoiceResponse> {
    try {
      const { data } = await this.http.post<CancelInvoiceResponse>(
        '/api/merchant/invoice/cancel',
        prune(payload),
      );
      return data;
    } catch (error) {
      throw this.toHttpException(error, 'Failed to cancel Monobank payment');
    }
  }

  /** Returns merchant data — the cheapest way to validate the token. */
  async getMerchantDetails(): Promise<MerchantDetailsResponse> {
    try {
      const { data } = await this.http.get<MerchantDetailsResponse>(
        '/api/merchant/details',
      );
      return data;
    } catch (error) {
      throw this.toHttpException(error, 'Failed to fetch Monobank merchant details');
    }
  }

  /**
   * Verifies that a webhook request genuinely originates from Monobank.
   *
   * Monobank signs the raw request body with its private key and sends the
   * base64-encoded ECDSA-SHA256 signature in the `X-Sign` header. We verify it
   * against the merchant public key obtained from `/api/merchant/pubkey`.
   *
   * The key is cached; when verification fails with a cached key it may simply
   * have been rotated, so we refetch it once and retry before rejecting the
   * request — as the API documentation prescribes.
   *
   * @param rawBody The exact, unparsed request body bytes.
   * @param xSign   Value of the `X-Sign` header (base64).
   */
  async verifyWebhookSignature(
    rawBody: Buffer,
    xSign: string,
  ): Promise<boolean> {
    if (!xSign || !rawBody?.length) {
      return false;
    }

    try {
      const usedCachedKey = this.cachedPublicKey !== null;

      if (this.verifyWith(await this.getPublicKey(), rawBody, xSign)) {
        return true;
      }

      // Only a key that was already cached is worth refetching, and only once
      // per cooldown — otherwise forged signatures could drive an unbounded
      // number of calls to the gateway.
      if (!usedCachedKey || !this.mayRefreshPublicKey()) {
        return false;
      }

      this.logger.warn(
        'Webhook signature did not match the cached public key — refetching it.',
      );
      this.lastPublicKeyRefresh = Date.now();
      return this.verifyWith(await this.getPublicKey(true), rawBody, xSign);
    } catch (error) {
      this.logger.error(
        'Webhook signature verification failed',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /** Runs the ECDSA-SHA256 check of `rawBody` against a base64 public key. */
  private verifyWith(
    publicKeyBase64: string,
    rawBody: Buffer,
    xSign: string,
  ): boolean {
    try {
      const publicKeyPem = Buffer.from(publicKeyBase64, 'base64').toString(
        'utf-8',
      );
      const signature = Buffer.from(xSign, 'base64');

      const verifier = createVerify('SHA256');
      verifier.update(rawBody);
      verifier.end();

      return verifier.verify(publicKeyPem, signature);
    } catch (error) {
      this.logger.error(
        `Could not check the webhook signature: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** Guards how often a failed verification may force a key refresh. */
  private mayRefreshPublicKey(): boolean {
    return (
      Date.now() - this.lastPublicKeyRefresh >=
      MonobankService.PUBKEY_REFRESH_COOLDOWN_MS
    );
  }

  /**
   * Retrieves (and caches) the merchant public key used for signatures.
   * The key must not be requested on every webhook — only on a cache miss or
   * after a failed verification (`forceRefresh`).
   */
  private async getPublicKey(forceRefresh = false): Promise<string> {
    if (forceRefresh) {
      this.cachedPublicKey = null;
      this.publicKeyRequest = null;
    }

    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    if (!this.publicKeyRequest) {
      this.publicKeyRequest = this.http
        .get<MerchantPubKeyResponse>('/api/merchant/pubkey')
        .then(({ data }) => {
          this.cachedPublicKey = data.key;
          return data.key;
        })
        .catch((error) => {
          throw this.toHttpException(
            error,
            'Failed to fetch the Monobank public key',
          );
        })
        .finally(() => {
          this.publicKeyRequest = null;
        });
    }

    return this.publicKeyRequest;
  }

  /**
   * Normalises an axios error into a Nest HTTP exception, keeping Monobank's
   * own `errCode`/`errText` so failures are diagnosable from the logs and the
   * API response instead of collapsing into an opaque 500.
   */
  private toHttpException(error: unknown, message: string): HttpException {
    if (!axios.isAxiosError(error)) {
      this.logger.error(
        message,
        error instanceof Error ? error.stack : String(error),
      );
      return new BadGatewayException(message);
    }

    const axiosError = error as AxiosError<MonobankErrorResponse>;
    const status = axiosError.response?.status;
    const { errCode, errText } = axiosError.response?.data ?? {};
    const detail = [errCode, errText].filter(Boolean).join(': ') ||
      axiosError.message;

    this.logger.error(`${message}: [${status ?? 'no response'}] ${detail}`);

    // 400/404 mean the request we built was wrong — surface the reason.
    if (status === 400 || status === 404) {
      return new BadRequestException(`${message}: ${detail}`);
    }
    // 403 means the merchant token is missing/invalid — a server-side problem.
    if (status === 403) {
      return new BadGatewayException(`${message}: gateway rejected the token`);
    }
    if (status === 429) {
      return new ServiceUnavailableException(
        `${message}: gateway rate limit reached, retry later`,
      );
    }
    return new BadGatewayException(message);
  }
}

/** Drops `undefined` keys so we never send empty fields to the gateway. */
function prune<T extends Record<string, any>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}
