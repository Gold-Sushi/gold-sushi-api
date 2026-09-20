/**
 * The public domain the brand runs on.
 *
 * Everything that needs an absolute, customer-facing URL derives from this one
 * value: the email From address, the asset/menu links inside emails, the
 * password reset link and the CORS allow-list. Override it with SITE_DOMAIN.
 */
export const DEFAULT_SITE_DOMAIN = 'goldsushi.store';

/**
 * Normalises SITE_DOMAIN to a bare hostname. A value copied straight out of a
 * browser (`https://goldsushi.store/`) is cleaned up rather than rejected,
 * because a stray scheme here would corrupt every URL built from it.
 */
export const resolveSiteDomain = (
  get: (key: string) => string | undefined,
): string => {
  const raw = get('SITE_DOMAIN')?.trim();
  if (!raw) return DEFAULT_SITE_DOMAIN;

  const host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return host || DEFAULT_SITE_DOMAIN;
};

/** Canonical public origin, e.g. `https://www.goldsushi.store`. */
export const siteUrl = (domain: string): string => `https://www.${domain}`;
