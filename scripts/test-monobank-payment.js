/* eslint-disable */
/**
 * End-to-end sanity check for the Monobank acquiring integration against the
 * SANDBOX (test token). It talks to the Monobank API directly — no DB or app
 * boot required — so you can confirm your token, invoice creation, the hosted
 * payment page, and the status polling loop all work.
 *
 *   # 1. Put a TEST token in .env:  MONOBANK_TOKEN=...
 *   # 2. Run:
 *   node scripts/test-monobank-payment.js
 *
 * Optional env:
 *   MONOBANK_API_URL   API base (default https://api.monobank.ua)
 *   PAY_AMOUNT         amount in UAH (default 1 -> 100 kopecks)
 *   PAYMENT_REDIRECT_URL / FRONTEND_URL   redirect after payment
 *   MONOBANK_WEBHOOK_URL / PUBLIC_API_URL webhook to receive status updates
 *
 * The script creates an invoice, prints the payment page URL (open it and
 * complete the sandbox payment), then polls the invoice status until it
 * reaches a terminal state or times out.
 */
require('dotenv').config();

const BASE_URL = process.env.MONOBANK_API_URL || 'https://api.monobank.ua';
const TOKEN = process.env.MONOBANK_TOKEN;
const AMOUNT_UAH = Number(process.env.PAY_AMOUNT || 1);

const TERMINAL = new Set(['success', 'failure', 'reversed', 'expired']);

function webhookUrl() {
  if (process.env.MONOBANK_WEBHOOK_URL) return process.env.MONOBANK_WEBHOOK_URL;
  const base = process.env.PUBLIC_API_URL;
  return base
    ? `${base.replace(/\/$/, '')}/api/payments/monobank/webhook`
    : undefined;
}

async function monobank(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-Token': TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Monobank ${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!TOKEN) {
    console.error(
      'MONOBANK_TOKEN is not set. Add a TEST token to your .env first.',
    );
    process.exit(1);
  }

  const reference = `test-${Date.now()}`;
  const amount = Math.round(AMOUNT_UAH * 100); // kopecks

  console.log(`Creating invoice for ${AMOUNT_UAH} UAH (ref ${reference})...`);

  const invoice = await monobank('/api/merchant/invoice/create', {
    method: 'POST',
    body: {
      amount,
      ccy: 980,
      merchantPaymInfo: {
        reference,
        destination: 'Test payment (sandbox)',
        basketOrder: [
          {
            name: 'Тестова позиція',
            qty: 1,
            sum: amount,
            total: amount,
            unit: 'шт.',
            code: 'test-sku',
          },
        ],
      },
      redirectUrl:
        process.env.PAYMENT_REDIRECT_URL || process.env.FRONTEND_URL,
      webHookUrl: webhookUrl(),
      validity: 3600,
    },
  });

  console.log('\nInvoice created:');
  console.log('  invoiceId:', invoice.invoiceId);
  console.log('  pageUrl  :', invoice.pageUrl);
  console.log('\n=> Open the pageUrl above and complete the sandbox payment.\n');

  // Poll status until terminal or timeout (~2 min).
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const status = await monobank(
      `/api/merchant/invoice/status?invoiceId=${invoice.invoiceId}`,
    );
    console.log(`  [${new Date().toLocaleTimeString()}] status: ${status.status}`);
    if (TERMINAL.has(status.status)) {
      console.log('\nFinal status:', status.status);
      if (status.failureReason) console.log('Reason:', status.failureReason);
      process.exit(status.status === 'success' ? 0 : 2);
    }
  }

  console.log('\nTimed out waiting for a terminal status.');
  process.exit(3);
})().catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});

