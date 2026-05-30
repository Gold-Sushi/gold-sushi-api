import { createVerify } from 'crypto';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  InvoiceStatusResponse,
  MONOBANK_CCY_UAH,
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

  /** Creates a payment invoice and returns the hosted payment page URL. */
  async createInvoice(
    payload: CreateInvoiceRequest,
  ): Promise<CreateInvoiceResponse> {
    try {
      const { data } = await this.http.post<CreateInvoiceResponse>(
        '/api/merchant/invoice/create',
        { ccy: MONOBANK_CCY_UAH, ...payload },
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
      throw this.toHttpException(error, 'Failed to fetch Monobank invoice status');
    }
  }

  /**
   * Verifies that a webhook request genuinely originates from Monobank.
   *
   * Monobank signs the raw request body with its private key and sends the
   * base64-encoded ECDSA-SHA256 signature in the `X-Sign` header. We verify it
   * against the merchant public key obtained from `/api/merchant/pubkey`.
   *
   * @param rawBody The exact, unparsed request body bytes.
   * @param xSign   Value of the `X-Sign` header (base64).
   */
  async verifyWebhookSignature(
    rawBody: Buffer | string,
    xSign: string,
  ): Promise<boolean> {
    if (!xSign) {
      return false;
    }

    try {
      const publicKeyBase64 = await this.getPublicKey();
      const publicKey = Buffer.from(publicKeyBase64, 'base64').toString('utf-8');

      const verifier = createVerify('SHA256');
      verifier.write(rawBody);
      verifier.end();

      return verifier.verify(publicKey, xSign, 'base64');
    } catch (error) {
      this.logger.error(
        'Webhook signature verification failed',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /** Retrieves (and caches) the merchant public key used for signatures. */
  private async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    const { data } = await this.http.get<{ key: string }>(
      '/api/merchant/pubkey',
    );
    this.cachedPublicKey = data.key;
    return this.cachedPublicKey;
  }

  /** Normalises an axios error into a Nest HTTP exception with useful context. */
  private toHttpException(error: unknown, message: string): HttpException {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ errText?: string }>;
      const status = axiosError.response?.status;
      const detail = axiosError.response?.data?.errText ?? axiosError.message;
      this.logger.error(`${message}: [${status}] ${detail}`);
    } else {
      this.logger.error(
        message,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return new InternalServerErrorException(message);
  }
}

