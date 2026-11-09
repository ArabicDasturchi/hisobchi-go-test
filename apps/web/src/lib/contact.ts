// Landing aloqa havolalari: faqat env dan (repoga haqiqiy havola/raqam yozilmaydi).
// Next.js faqat to'g'ridan-to'g'ri yozilgan process.env.NEXT_PUBLIC_* ni bundle'ga joylaydi.
const RAW_TELEGRAM = process.env.NEXT_PUBLIC_CONTACT_TELEGRAM;
const RAW_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE;

/** "@nom", "nom" yoki "https://t.me/nom" → "https://t.me/nom". Noto'g'ri qiymat — bo'sh */
export function telegramUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  const m = /^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z][A-Za-z0-9_]{4,31})\/?$/.exec(v);
  return m ? `https://t.me/${m[1]}` : '';
}

/** "+998 90 123 45 67" → "tel:+998901234567". Raqam bo'lmasa — bo'sh */
export function phoneUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!/^\+?[\d\s()-]{7,20}$/.test(v)) return '';
  const digits = v.replace(/[^\d]/g, '');
  return digits.length >= 7 ? `tel:${v.startsWith('+') ? '+' : ''}${digits}` : '';
}

export interface ContactLinks {
  telegram: string;
  phone: string;
  /** Telegram yoki telefon: kamida bittasi bor */
  any: boolean;
}

export function contactLinks(telegram = RAW_TELEGRAM, phone = RAW_PHONE): ContactLinks {
  const t = telegramUrl(telegram);
  const p = phoneUrl(phone);
  return { telegram: t, phone: p, any: Boolean(t || p) };
}
