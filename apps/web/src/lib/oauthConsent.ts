/**
 * Supabase OAuth 2.1 server uchun rozilik (consent) sahifasi yordamchilari.
 * Tashqi AI klient (Claude/ChatGPT MCP orqali) savdogar nomidan ma'lumotni faqat shu sahifada berilgan ruxsat bilan ko'radi.
 */

/** Rozilik sahifasi yo'li. Supabase Dashboard > Authentication > OAuth Server > Authorization Path bilan bir xil bo'lishi shart. */
export const CONSENT_PATH = '/oauth/consent';

/**
 * authorization_id Supabase tomonidan beriladi. Aniq formati hujjatda ko'rsatilmagan ("topilmadi"),
 * shuning uchun faqat xavfsiz belgilar va oqilona uzunlik tekshiriladi.
 */
export function parseAuthorizationId(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  return /^[A-Za-z0-9._~-]{8,256}$/.test(v) ? v : null;
}

/**
 * Ruxsatdan keyin brauzer OAuth klientga qaytariladi. Faqat https (yoki lokal klient uchun http://localhost)
 * qabul qilinadi; javascript:, data: va boshqa sxemalar rad etiladi.
 */
export function safeClientRedirect(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return u.toString();
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.toString();
    return null;
  } catch {
    return null;
  }
}

/** Foydalanuvchiga ko'rsatiladigan qaytish manzili (host). Noto'g'ri URL bo'lsa — null. */
export function redirectHost(uri: string | null | undefined): string | null {
  try {
    return uri ? new URL(uri).host : null;
  } catch {
    return null;
  }
}

/**
 * Kirmagan foydalanuvchi /login ga yo'naltirilganda `next` ga nima yoziladi.
 * Rozilik sahifasida `?authorization_id=...` yo'qolmasligi shart, boshqa sahifalarda esa faqat yo'l (avvalgi xatti-harakat).
 */
export function loginNextFor(pathname: string, search: string): string {
  return pathname === CONSENT_PATH ? `${pathname}${search}` : pathname;
}

export const CONSENT_COPY = {
  can: ["Mijozlar ro'yxati va ularning qarzini ko'rish", "Savdolar va kunlik hisobotni ko'rish", "Savdo va to'lov QORALAMASINI yaratish"],
  cannot: [
    'Savdoni tasdiqlash yoki bekor qilish: bu faqat sizning qo\'lingizda, Hisobchi Go ilovasida',
    "To'lovni yozish yoki bekor qilish",
    "Mijoz telefon raqami va izohlarini ko'rish",
    "Mijoz, mahsulot yoki do'kon ma'lumotini o'zgartirish",
  ],
} as const;
