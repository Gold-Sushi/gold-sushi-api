/* eslint-disable */
/**
 * Renders every email template with mock data into ./preview/*.html
 * so you can open them in a browser (and Outlook/Gmail dev tools).
 *
 *   node scripts/preview-emails.js          # render
 *   node scripts/preview-emails.js --open    # render + open in browser
 *
 * No build step required — uses the `pug` dependency that ships with the mailer.
 */
const pug = require('pug');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const TEMPLATES_DIR = path.join(__dirname, '..', 'src', 'mail', 'template');
const OUT_DIR = path.join(__dirname, '..', 'preview');

// Mirrors the BrandContext built at runtime (mail.constants.ts).
const brand = {
  name: 'Gold Sushi',
  menuUrl: 'https://www.goldsushi.com/menu',
  bannerUrl: 'https://placehold.co/600x240/ff714b/ffffff/png?text=Gold+Sushi',
  supportPhone: '+38 (098) 408 61 90',
  supportEmail: 'goldsushi23@gmail.com',
  instagramUrl: 'https://www.instagram.com/goldsushidostavka/',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61556516378389',
  tiktokUrl: 'https://www.tiktok.com/@gold.sushi',
  socials: [
    { name: 'Instagram', url: 'https://www.instagram.com/goldsushidostavka/', icon: 'https://img.icons8.com/ios-filled/100/ffffff/instagram-new.png' },
    { name: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61556516378389', icon: 'https://img.icons8.com/ios-filled/100/ffffff/facebook-new.png' },
    { name: 'TikTok', url: 'https://www.tiktok.com/@gold.sushi', icon: 'https://img.icons8.com/ios-filled/100/ffffff/tiktok.png' },
  ],
  primaryColor: '#ff714b',
  year: new Date().getFullYear(),
};

// One entry per template: file name + the context it expects.
const fixtures = {
  registration: {
    subject: 'Ласкаво просимо до Gold Sushi',
    preheader: 'Ваш обліковий запис створено.',
    firstName: 'Іван',
  },
  'order-confirmation': {
    subject: 'Замовлення №1024 підтверджено',
    preheader: 'Ваше замовлення прийнято в роботу.',
    firstName: 'Іван',
    order: {
      number: '1024',
      currency: 'грн',
      items: [
        { name: 'Філадельфія з лососем', image: 'https://placehold.co/96x96/ffb59a/ffffff/png?text=Sushi', quantity: 2, price: '189.00', lineTotal: '378.00' },
        { name: 'Каліфорнія', image: 'https://placehold.co/96x96/ffd0a0/ffffff/png?text=Roll', quantity: 1, price: '159.00', lineTotal: '159.00' },
        { name: 'Місо суп', image: 'https://placehold.co/96x96/c9b08a/ffffff/png?text=Soup', quantity: 3, price: '79.00', lineTotal: '237.00' },
      ],
      total: '774.00',
      deliveryLabel: 'Доставка кур’єром',
      address: 'Київ, вул. Хрещатик, 1, кв. 5',
      phone: '+38 (098) 408 61 90',
    },
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const [name, context] of Object.entries(fixtures)) {
  const html = pug.renderFile(path.join(TEMPLATES_DIR, `${name}.pug`), {
    brand,
    ...context,
  });
  const outFile = path.join(OUT_DIR, `${name}.html`);
  fs.writeFileSync(outFile, html, 'utf8');
  written.push(outFile);
  console.log(`OK  ${name.padEnd(20)} -> ${path.relative(process.cwd(), outFile)}`);
}

if (process.argv.includes('--open') && written.length) {
  const opener =
    process.platform === 'win32' ? 'start ""' :
    process.platform === 'darwin' ? 'open' : 'xdg-open';
  written.forEach((f) => exec(`${opener} "${f}"`));
}

