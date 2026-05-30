/**
 * Central place for brand-related values that templates need.
 *
 * Email clients (Gmail / Outlook) cannot resolve relative URLs, so every
 * asset/link must be an ABSOLUTE url. Values can be overridden via env vars
 * and otherwise fall back to sensible defaults.
 */
export interface SocialLink {
  /** Accessible label / alt text (e.g. "Instagram"). */
  name: string;
  /** Absolute link to the profile. */
  url: string;
  /** Absolute URL of the icon image (PNG — renders everywhere incl. Outlook). */
  icon: string;
}

export interface BrandContext {
  name: string;
  /** Public site / menu URL used in the header banner link. */
  menuUrl: string;
  /** Absolute URL of the hero banner image shown in the header. */
  bannerUrl: string;
  supportPhone: string;
  supportEmail: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  /** Social links rendered (with icons) in the footer. */
  socials: SocialLink[];
  /** Primary accent color used for buttons / highlights. */
  primaryColor: string;
  /** Current year, handy for the footer copyright. */
  year: number;
}

export const buildBrandContext = (
  get: (key: string) => string | undefined,
): BrandContext => {
  const assetsBase =
    get('MAIL_ASSETS_URL')?.replace(/\/$/, '') ?? 'https://www.goldsushi.com';

  // White, square PNG icons — look crisp on the dark footer and render in
  // every client (including Outlook, which ignores SVG). Override the base via
  // MAIL_ICONS_URL to serve your own `facebook.png` / `tiktok.png` / `instagram.png`.
  const iconBase = get('MAIL_ICONS_URL')?.replace(/\/$/, '');
  const icon = (name: string, fallback: string) =>
    iconBase ? `${iconBase}/${name}.png` : fallback;

  const instagramUrl = get('MAIL_INSTAGRAM_URL') ?? 'https://www.instagram.com/goldsushidostavka/';
  const facebookUrl = get('MAIL_FACEBOOK_URL') ?? 'https://www.facebook.com/profile.php?id=61556516378389';
  const tiktokUrl = get('MAIL_TIKTOK_URL') ?? 'https://www.tiktok.com/@gold.sushi';

  return {
    name: get('MAIL_BRAND_NAME') ?? 'Gold Sushi',
    menuUrl: get('MAIL_MENU_URL') ?? 'https://www.goldsushi.com/menu',
    bannerUrl: get('MAIL_BANNER_URL') ?? `${assetsBase}/emailTemplates/img/banner.png`,
    supportPhone: get('MAIL_SUPPORT_PHONE') ?? '+38 (098) 408 61 90',
    supportEmail: get('MAIL_SUPPORT_EMAIL') ?? 'goldsushi23@gmail.com',
    instagramUrl,
    facebookUrl,
    tiktokUrl,
    socials: [
      { name: 'Instagram', url: instagramUrl, icon: icon('instagram', 'https://img.icons8.com/ios-filled/100/ffffff/instagram-new.png') },
      { name: 'Facebook', url: facebookUrl, icon: icon('facebook', 'https://img.icons8.com/ios-filled/100/ffffff/facebook-new.png') },
      { name: 'TikTok', url: tiktokUrl, icon: icon('tiktok', 'https://img.icons8.com/ios-filled/100/ffffff/tiktok.png') },
    ],
    primaryColor: get('MAIL_PRIMARY_COLOR') ?? '#ff714b',
    year: new Date().getFullYear(),
  };
};

