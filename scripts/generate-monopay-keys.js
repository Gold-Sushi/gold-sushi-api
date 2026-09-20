/* eslint-disable */
/**
 * Key management for the monopay button.
 *
 * The button submits the order data through the customer's browser, so
 * Monobank only accepts it when it carries an ECDSA P-256 signature made with
 * a private key whose public half was imported into the merchant profile.
 * This script generates that pair, and can import the public half for you.
 *
 *   # generate a pair and print what goes where
 *   npm run monopay:keys
 *
 *   # generate, import the public key and show the resulting key list
 *   npm run monopay:keys -- --import --name "goldsushi prod"
 *
 *   # just show the keys already registered for the token in .env
 *   npm run monopay:keys -- --list
 *
 * The private key is printed once and never stored — put it in .env as
 * MONOPAY_PRIVATE_KEY (the one-line form below) and keep it out of git. It
 * must never reach the frontend: anyone holding it can sign orders.
 *
 * `.env` is loaded by node itself (--env-file-if-exists, see package.json).
 *
 * Env:
 *   MONOBANK_TOKEN    merchant token, required for --import / --list
 *   MONOBANK_API_URL  API base (default https://api.monobank.ua)
 */

const { generateKeyPairSync } = require('crypto');

const BASE_URL = process.env.MONOBANK_API_URL || 'https://api.monobank.ua';
const TOKEN = process.env.MONOBANK_TOKEN;

const args = process.argv.slice(2);
const shouldImport = args.includes('--import');
const listOnly = args.includes('--list');
const keyName = args[args.indexOf('--name') + 1] || undefined;

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

function requireToken(what) {
  if (!TOKEN) {
    console.error(
      `MONOBANK_TOKEN is not set — it is needed to ${what}. Get a test token at https://api.monobank.ua/ and add it to .env.`,
    );
    process.exit(1);
  }
}

(async () => {
  if (listOnly) {
    requireToken('list the signing keys');
    const keys = await monobank('/api/merchant/monopay/pubkey-list');
    console.log(JSON.stringify(keys, null, 2));
    console.log(
      '\nPut the id of the key matching MONOPAY_PRIVATE_KEY in MONOPAY_KEY_ID.',
    );
    return;
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  // Monobank takes the public key base64-encoded, the same way it hands out
  // the webhook verification key.
  const keyValue = Buffer.from(publicKey).toString('base64');

  console.log('=== PRIVATE KEY — backend only, never send it anywhere ===\n');
  console.log(privateKey);
  console.log('Add this line to .env:\n');
  console.log(`MONOPAY_PRIVATE_KEY="${privateKey.trim().replace(/\n/g, '\\n')}"\n`);
  console.log('=== PUBLIC KEY — import it into Monobank ===\n');
  console.log(publicKey);
  console.log(`keyValue (base64): ${keyValue}\n`);

  if (!shouldImport) {
    console.log(
      'Import it with `npm run monopay:keys -- --import`, or POST it yourself to\n' +
        `${BASE_URL}/api/merchant/monopay/pubkey-import with {"keyValue": "<base64>"}.`,
    );
    return;
  }

  requireToken('import the public key');

  await monobank('/api/merchant/monopay/pubkey-import', {
    method: 'POST',
    body: { keyValue, ...(keyName ? { keyName } : {}) },
  });
  console.log('Public key imported.\n');

  const keys = await monobank('/api/merchant/monopay/pubkey-list');
  console.log('Registered signing keys:');
  console.log(JSON.stringify(keys, null, 2));
  console.log(
    '\nIf more than one key is listed, set MONOPAY_KEY_ID to the id of the one you just imported.',
  );
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
