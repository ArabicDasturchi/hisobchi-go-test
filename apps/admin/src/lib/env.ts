// Next.js faqat to'g'ridan-to'g'ri yozilgan process.env.NEXT_PUBLIC_* ni brauzer bundle'iga joylaydi
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * Demo rejimi (`npm run demo:admin`): xotiradagi soxta ma'lumot, Supabase va kalit kerak emas.
 * Faqat dev serverda: `next build` / production (NODE_ENV=production) da NEXT_PUBLIC_ADMIN_DEMO e'tiborga olinmaydi,
 * shuning uchun production'da demo orqali kirib bo'lmaydi.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_ADMIN_DEMO === '1' && process.env.NODE_ENV !== 'production';

export const supabaseConfigured = DEMO_MODE || (SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20);
