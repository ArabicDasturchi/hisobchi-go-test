/**
 * Email tasdiqlash havolasi va auth xatolari — sof funksiyalar (testlanadi).
 *
 * Supabase tasdiqlash havolasi ilovaga quyidagi ko'rinishlardan birida qaytadi:
 *   PKCE (asosiy):   hisobchigo://auth/callback?code=...
 *   token_hash:      hisobchigo://auth/callback?token_hash=...&type=signup   (maxsus email shabloni bo'lsa)
 *   implicit (eski): hisobchigo://auth/callback#access_token=...&refresh_token=...
 *   xato:            hisobchigo://auth/callback?error=access_denied&error_code=otp_expired&error_description=...
 *                    (ba'zan xato parametrlari # dan keyin keladi)
 */
import { CloudError } from './cloud';

export const AUTH_CALLBACK_PATH = 'auth/callback';

export type EmailOtpType = 'signup' | 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change';

export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string; type: EmailOtpType }
  | { kind: 'error'; code: string; description: string }
  | { kind: 'none' };

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/** URL'dagi query (?...) va fragment (#...) parametrlarini birlashtiradi; fragment ustun */
function collectParams(url: string): Map<string, string> {
  const out = new Map<string, string>();
  const hashIdx = url.indexOf('#');
  const beforeHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const qIdx = beforeHash.indexOf('?');
  const query = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : '';
  for (const part of [query, hash]) {
    if (!part) continue;
    for (const [k, v] of new URLSearchParams(part)) out.set(k, v);
  }
  return out;
}

export function parseAuthCallback(url: string | null | undefined): AuthCallback {
  if (!url) return { kind: 'none' };
  const p = collectParams(url);
  const errCode = p.get('error_code') ?? p.get('error');
  if (errCode) {
    return { kind: 'error', code: errCode, description: p.get('error_description') ?? '' };
  }
  const code = p.get('code');
  if (code) return { kind: 'code', code };
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  const tokenHash = p.get('token_hash');
  const type = p.get('type') as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.includes(type)) return { kind: 'token_hash', tokenHash, type };
  return { kind: 'none' };
}

/**
 * Supabase Auth xatosini (kod yoki xabar) foydalanuvchiga tushunarli o'zbekcha xabarga aylantiradi.
 * kind: 'network' — qayta urinish mumkin; 'auth' — foydalanuvchi harakati kerak; 'validation' — kiritish xato.
 */
export function authError(err: unknown): CloudError {
  if (err instanceof CloudError) return err;
  const o = (err && typeof err === 'object' ? err : { message: String(err) }) as { code?: string; message?: string; status?: number; name?: string };
  const code = (o.code ?? '').toLowerCase();
  const msg = (o.message ?? '').toLowerCase();
  const raw = `${o.code ?? ''} ${o.message ?? ''}`.trim();
  const has = (...keys: string[]) => keys.some((k) => code === k || msg.includes(k));

  if (has('network request failed', 'failed to fetch', 'fetch failed', 'authretryablefetcherror') || o.name === 'AuthRetryableFetchError') {
    return new CloudError('network', "Internet aloqasi yo'q yoki server javob bermadi. Ulanishni tekshirib, qayta urinib ko'ring.", raw);
  }
  if (has('otp_expired', 'expired', 'access_denied')) {
    return new CloudError('auth', "Tasdiqlash havolasi eskirgan yoki allaqachon ishlatilgan. Xatni qayta yuboring.", raw);
  }
  if (has('flow_state_not_found', 'flow_state_expired', 'bad_code_verifier', 'code verifier', 'invalid flow state')) {
    return new CloudError(
      'auth',
      "Havola ro'yxatdan o'tilgan telefondan boshqa joyda ochilgan yoki muddati o'tgan. Email tasdiqlangan bo'lishi mumkin — parol bilan kirib ko'ring.",
      raw,
    );
  }
  if (has('email_not_confirmed', 'email not confirmed')) {
    return new CloudError('auth', "Email hali tasdiqlanmagan. Pochtangizdagi havolani shu telefonda oching yoki xatni qayta yuboring.", raw);
  }
  if (has('invalid_credentials', 'invalid login credentials')) {
    return new CloudError('validation', "Email yoki parol noto'g'ri.", raw);
  }
  if (has('user_already_exists', 'email_exists', 'already registered')) {
    return new CloudError('validation', "Bu email bilan hisob allaqachon mavjud. «Kirish» tugmasidan foydalaning.", raw);
  }
  if (has('weak_password', 'password should')) {
    return new CloudError('validation', "Parol juda oddiy. Kamida 8 ta belgi, harf va raqam aralash bo'lsin.", raw);
  }
  if (has('over_email_send_rate_limit', 'over_request_rate_limit', 'rate limit', 'too many')) {
    return new CloudError('auth', "Juda ko'p urinish. Bir necha daqiqadan keyin qayta urinib ko'ring.", raw);
  }
  if (has('signup_disabled', 'signups not allowed')) {
    return new CloudError('auth', "Ro'yxatdan o'tish serverda o'chirilgan. Administratorga murojaat qiling.", raw);
  }
  if (has('email_address_invalid', 'invalid email', 'unable to validate email')) {
    return new CloudError('validation', "Email manzili noto'g'ri.", raw);
  }
  return new CloudError('unknown', `Kirishda xato: ${o.message ?? raw}`, raw);
}
