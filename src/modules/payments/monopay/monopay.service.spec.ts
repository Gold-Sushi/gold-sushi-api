import { createVerify, generateKeyPairSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MonobankService } from '../monobank/monobank.service';
import { MonoPayService } from './monopay.service';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const PAYLOAD = JSON.stringify({
  amount: 34500,
  ccy: 980,
  merchantPaymInfo: { reference: 'order-1', destination: 'Оплата' },
});

/** Checks a signature the way Monobank does before creating the invoice. */
function verify(payloadJson: string, requestId: string, signature: string) {
  const verifier = createVerify('SHA256');
  verifier.update(Buffer.from(payloadJson + requestId, 'utf-8'));
  verifier.end();
  return verifier.verify(publicKey, Buffer.from(signature, 'base64'));
}

function build(env: Record<string, string>, keyIds: string[] = ['key-1']) {
  const configService = {
    get: (name: string) => env[name],
  } as unknown as ConfigService;
  const monobankService = {
    getMonoPayKeyIds: jest.fn().mockResolvedValue(keyIds),
  } as unknown as MonobankService;

  return {
    service: new MonoPayService(configService, monobankService),
    monobankService,
  };
}

describe('MonoPayService', () => {
  it('signs the payload and request id so Monobank can verify it', async () => {
    const { service } = build({ MONOPAY_PRIVATE_KEY: privateKey });

    const init = await service.createWidgetPayment('order-1', PAYLOAD);

    expect(verify(PAYLOAD, init.requestId, init.signature)).toBe(true);
    // The widget forwards `payloadBase64` verbatim, so it has to decode back
    // to the exact bytes the signature was made over.
    expect(Buffer.from(init.payloadBase64, 'base64').toString('utf-8')).toBe(
      PAYLOAD,
    );
    expect(verify(PAYLOAD, 'other-request-id', init.signature)).toBe(false);
  });

  it('accepts a base64-encoded and an escaped one-line PEM', async () => {
    const encoded = build({
      MONOPAY_PRIVATE_KEY: Buffer.from(privateKey).toString('base64'),
    });
    const escaped = build({
      MONOPAY_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    });

    for (const { service } of [encoded, escaped]) {
      const init = await service.createWidgetPayment('order-1', PAYLOAD);
      expect(verify(PAYLOAD, init.requestId, init.signature)).toBe(true);
    }
  });

  it('hands the same data back while the order has not changed', async () => {
    const { service } = build({ MONOPAY_PRIVATE_KEY: privateKey });

    const init = await service.createWidgetPayment('order-1', PAYLOAD);

    expect(service.peekWidgetPayment('order-1', PAYLOAD)).toEqual(init);
    // A changed basket invalidates it — the old signature no longer describes
    // what the customer is about to pay.
    expect(service.peekWidgetPayment('order-1', '{"amount":1}')).toBeNull();
    expect(service.peekWidgetPayment('order-2', PAYLOAD)).toBeNull();
  });

  it('caches the key id and lets configuration pin it', async () => {
    const listed = build({ MONOPAY_PRIVATE_KEY: privateKey });
    const first = await listed.service.createWidgetPayment('order-1', PAYLOAD);
    const second = await listed.service.createWidgetPayment('order-2', PAYLOAD);

    expect([first.keyId, second.keyId]).toEqual(['key-1', 'key-1']);
    expect(listed.monobankService.getMonoPayKeyIds).toHaveBeenCalledTimes(1);

    const pinned = build({
      MONOPAY_PRIVATE_KEY: privateKey,
      MONOPAY_KEY_ID: 'key-2',
    });
    const init = await pinned.service.createWidgetPayment('order-1', PAYLOAD);

    expect(init.keyId).toBe('key-2');
    expect(pinned.monobankService.getMonoPayKeyIds).not.toHaveBeenCalled();
  });

  it('refuses to sign when no usable key is configured', async () => {
    const missing = build({});
    const wrongCurve = build({
      MONOPAY_PRIVATE_KEY: generateKeyPairSync('ec', {
        namedCurve: 'secp384r1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      }).privateKey,
    });

    for (const { service } of [missing, wrongCurve]) {
      expect(service.isConfigured).toBe(false);
      await expect(
        service.createWidgetPayment('order-1', PAYLOAD),
      ).rejects.toThrow(/monopay payments are unavailable/);
    }
  });
});
