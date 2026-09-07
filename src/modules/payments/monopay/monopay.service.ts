import { createPrivateKey, KeyObject, randomUUID, sign } from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MonobankService } from '../monobank/monobank.service';
import { MonoPayWidgetInit } from './monopay.types';

/** Cached widget data, kept only while its `requestId` is still accepted. */
interface CachedWidgetInit {
  init: MonoPayWidgetInit;
  /** The exact JSON string the cached signature was made over. */
  payloadJson: string;
  expiresAtMs: number;
}

/**
 * Signs order data for the monopay payment button.
 *
 * The widget runs in the customer's browser, so the order data it submits is
 * only trustworthy because it is signed here: monobank verifies the ECDSA
 * P-256 signature against the public key imported into the merchant cabinet
 * before it creates the invoice. The private key therefore never leaves this
 * service — it is read from `MONOPAY_PRIVATE_KEY` and never returned.
 *
 * What gets signed is `JSON.stringify(payload) + requestId`, hashed with
 * SHA-256 and signed into a DER signature that is then base64-encoded.
 * `payloadBase64` must carry that exact same JSON string, so the payload is
 * serialised once by the caller and both outputs are derived from it.
 *
 * @see https://monobank.ua/api-docs/acquiring/methods/monopay/docs--signature-example
 */
@Injectable()
export class MonoPayService {
  private readonly logger = new Logger(MonoPayService.name);

  /** Parsed `MONOPAY_PRIVATE_KEY`, or null when it is missing/unusable. */
  private readonly privateKey: KeyObject | null;
  /** Why the key could not be loaded, surfaced on every signing attempt. */
  private readonly privateKeyError: string | null;

  /** Signing key id from the gateway, cached to avoid a call per checkout. */
  private cachedKeyId: string | null = null;
  private cachedKeyIdExpiresAt = 0;
  /** In-flight key list request, so concurrent checkouts fetch it once. */
  private keyIdRequest: Promise<string> | null = null;

  /** Widget data per order, so a remount gets the same signed set back. */
  private readonly widgetCache = new Map<string, CachedWidgetInit>();

  /** TTL monobank grants a `requestId` — 10 minutes. */
  private static readonly REQUEST_TTL_MS = 10 * 60_000;
  /** How long a key id may be reused before it is fetched again. */
  private static readonly KEY_ID_TTL_MS = 60 * 60_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly monobankService: MonobankService,
  ) {
    const { key, error } = this.loadPrivateKey();
    this.privateKey = key;
    this.privateKeyError = error;

    if (error) {
      this.logger.warn(`monopay button is disabled: ${error}`);
    }
  }

  /** True when a usable signing key is configured. */
  get isConfigured(): boolean {
    return this.privateKey !== null;
  }

  /**
   * Returns the still-valid widget data previously issued for this order, or
   * null when there is none, it expired, or the order changed in the
   * meantime. The widget must not be re-initialised with different data for
   * the same checkout, so an unexpired set is handed out again as is.
   */
  peekWidgetPayment(
    orderId: string,
    payloadJson: string,
  ): MonoPayWidgetInit | null {
    const cached = this.widgetCache.get(orderId);

    if (!cached) {
      return null;
    }

    if (
      cached.expiresAtMs <= Date.now() ||
      cached.payloadJson !== payloadJson
    ) {
      this.widgetCache.delete(orderId);
      return null;
    }

    return cached.init;
  }

  /**
   * Issues a fresh `requestId`, signature and payload for an order. The
   * `payloadJson` must be the exact string that will be handed to the widget
   * — it is what the signature is made over.
   */
  async createWidgetPayment(
    orderId: string,
    payloadJson: string,
  ): Promise<MonoPayWidgetInit> {
    const keyId = await this.getKeyId();
    const requestId = randomUUID();
    const expiresAtMs = Date.now() + MonoPayService.REQUEST_TTL_MS;

    const init: MonoPayWidgetInit = {
      keyId,
      requestId,
      payloadBase64: Buffer.from(payloadJson, 'utf-8').toString('base64'),
      signature: this.signPayload(payloadJson, requestId),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };

    this.remember(orderId, { init, payloadJson, expiresAtMs });

    return init;
  }

  /**
   * Signs `payloadJson + requestId` with the merchant private key and returns
   * the base64-encoded DER signature monobank expects.
   */
  signPayload(payloadJson: string, requestId: string): string {
    const data = Buffer.from(payloadJson + requestId, 'utf-8');

    return sign('sha256', data, {
      key: this.requirePrivateKey(),
      dsaEncoding: 'der',
    }).toString('base64');
  }

  /** Drops the cached widget data of an order (e.g. once it is paid). */
  forget(orderId: string): void {
    this.widgetCache.delete(orderId);
  }

  private remember(orderId: string, entry: CachedWidgetInit): void {
    const now = Date.now();
    for (const [id, cached] of this.widgetCache) {
      if (cached.expiresAtMs <= now) {
        this.widgetCache.delete(id);
      }
    }
    this.widgetCache.set(orderId, entry);
  }

  /**
   * Resolves the id of the key our signatures must be verified with.
   *
   * `MONOPAY_KEY_ID` pins it explicitly; otherwise the first key registered
   * for the merchant is used, which is only unambiguous while a single key is
   * imported.
   */
  private async getKeyId(): Promise<string> {
    const pinned = this.configService.get<string>('MONOPAY_KEY_ID');
    if (pinned) {
      return pinned;
    }

    if (this.cachedKeyId && this.cachedKeyIdExpiresAt > Date.now()) {
      return this.cachedKeyId;
    }

    if (!this.keyIdRequest) {
      this.keyIdRequest = this.monobankService
        .getMonoPayKeyIds()
        .then((keyIds) => {
          const [keyId] = keyIds;

          if (!keyId) {
            throw new ServiceUnavailableException(
              'No monopay signing key is registered for this merchant — import the public key with POST /api/merchant/monopay/pubkey-import first.',
            );
          }

          if (keyIds.length > 1) {
            this.logger.warn(
              `The merchant has ${keyIds.length} monopay signing keys — using "${keyId}". Set MONOPAY_KEY_ID to pin the one matching MONOPAY_PRIVATE_KEY.`,
            );
          }

          this.cachedKeyId = keyId;
          this.cachedKeyIdExpiresAt =
            Date.now() + MonoPayService.KEY_ID_TTL_MS;

          return keyId;
        })
        .finally(() => {
          this.keyIdRequest = null;
        });
    }

    return this.keyIdRequest;
  }

  private requirePrivateKey(): KeyObject {
    if (!this.privateKey) {
      throw new ServiceUnavailableException(
        `monopay payments are unavailable: ${this.privateKeyError}`,
      );
    }
    return this.privateKey;
  }

  /**
   * Reads the signing key from configuration. It is accepted either as a
   * PKCS#8 PEM (newlines may be escaped as `\n` to fit one .env line) or as
   * that PEM base64-encoded.
   *
   * A missing or malformed key disables the button instead of taking the API
   * down at boot — every other payment method keeps working.
   */
  private loadPrivateKey(): { key: KeyObject | null; error: string | null } {
    const raw = this.configService.get<string>('MONOPAY_PRIVATE_KEY')?.trim();

    if (!raw) {
      return { key: null, error: 'MONOPAY_PRIVATE_KEY is not set' };
    }

    try {
      const pem = raw.includes('-----BEGIN')
        ? raw.replace(/\\n/g, '\n')
        : Buffer.from(raw, 'base64').toString('utf-8');

      const key = createPrivateKey(pem);

      if (key.asymmetricKeyType !== 'ec') {
        return {
          key: null,
          error: `MONOPAY_PRIVATE_KEY must be an EC key, got "${key.asymmetricKeyType}"`,
        };
      }

      const curve = key.asymmetricKeyDetails?.namedCurve;
      if (curve && curve !== 'prime256v1') {
        return {
          key: null,
          error: `MONOPAY_PRIVATE_KEY must be on the P-256 curve, got "${curve}"`,
        };
      }

      return { key, error: null };
    } catch (error) {
      return {
        key: null,
        error: `MONOPAY_PRIVATE_KEY could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
