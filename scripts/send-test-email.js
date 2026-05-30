/* eslint-disable */
/**
 * Sends the rendered templates through a throwaway Ethereal inbox and prints
 * a preview URL for each — great for checking real email-client rendering
 * without touching production SMTP.
 *
 *   node scripts/send-test-email.js
 *
 * To send through a real provider instead, set SMTP_HOST/SMTP_PORT/SMTP_USER/
 * SMTP_PASS and TEST_TO env vars (e.g. a Mailtrap or Gmail App Password inbox).
 */
const nodemailer = require('nodemailer');
const pug = require('pug');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'src', 'mail', 'template');

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

const messages = [
  {
    template: 'registration',
    subject: 'Ласкаво просимо до Gold Sushi',
    context: { firstName: 'Іван', preheader: 'Ваш обліковий запис створено.' },
  },
  {
    template: 'order-confirmation',
    subject: 'Замовлення №1024 підтверджено',
    context: {
      firstName: 'Іван',
      preheader: 'Ваше замовлення прийнято в роботу.',
      order: {
        number: '1024', currency: 'грн',
        items: [
          { name: 'Філадельфія з лососем', image: 'https://placehold.co/96x96/ffb59a/ffffff/png?text=Sushi', quantity: 2, price: '189.00', lineTotal: '378.00' },
          { name: 'Каліфорнія', image: 'https://placehold.co/96x96/ffd0a0/ffffff/png?text=Roll', quantity: 1, price: '159.00', lineTotal: '159.00' },
        ],
        total: '537.00',
        deliveryLabel: 'Доставка кур’єром',
        address: 'Київ, вул. Хрещатик, 1',
        phone: '+38 (098) 408 61 90',
      },
    },
  },
];

(async () => {
  let transporter;
  let from = '"Gold Sushi" <no-reply@goldsushi.test>';
  const to = process.env.TEST_TO || 'preview@example.com';

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    from = process.env.SMTP_FROM || from;
  } else {
    const account = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
    console.log('Using Ethereal test inbox:', account.user);
  }

  for (const msg of messages) {
    const html = pug.renderFile(path.join(TEMPLATES_DIR, `${msg.template}.pug`), {
      brand,
      subject: msg.subject,
      ...msg.context,
    });
    const info = await transporter.sendMail({ from, to, subject: msg.subject, html });
    const preview = nodemailer.getTestMessageUrl(info);
    console.log(`\nSent "${msg.template}"  ->  ${to}`);
    if (preview) console.log(`Preview: ${preview}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

