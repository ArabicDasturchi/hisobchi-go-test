/**
 * Ochiq bosh sahifa (landing) marshrutlari.
 * `/` kirmagan foydalanuvchiga landing ko'rsatadi, kirganni `/dashboard` ga yo'naltiradi.
 */

/** Kirishsiz ochiq, landing bilan birga keladigan yo'llar (himoyalangan sahifalarga tegmaydi) */
const LANDING_PATHS = ['/', '/maxfiylik', '/robots.txt', '/sitemap.xml', '/opengraph-image'];

export function isLandingPath(path: string): boolean {
  return LANDING_PATHS.includes(path);
}

export type LandingDecision = 'pass' | 'dashboard';

/**
 * Landing yo'li uchun qaror. Landing yo'li bo'lmasa `null` (boshqa qoidalar ishlaydi).
 * - Demo rejimida sessiya doim "kirgan": `/` → dashboard (avvalgi xatti-harakat).
 * - Supabase sozlanmagan bo'lsa landing ochiq (`/setup` ga yo'naltirilmaydi).
 * - Kirgan foydalanuvchi `/` da dashboard'ga o'tadi, kirmagan landing'ni ko'radi.
 */
export function decideLanding(
  path: string,
  opts: { demo: boolean; configured: boolean; signedIn: boolean },
): LandingDecision | null {
  if (!isLandingPath(path)) return null;
  if (path !== '/') return 'pass';
  if (opts.demo) return 'dashboard';
  if (!opts.configured) return 'pass';
  return opts.signedIn ? 'dashboard' : 'pass';
}
