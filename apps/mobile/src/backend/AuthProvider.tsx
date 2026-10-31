/**
 * Autentifikatsiya holati (Supabase Auth, email + parol, PKCE).
 *
 * status:
 *   'disabled'   — bulut sozlanmagan (.env yo'q): ilova faqat lokal rejimda, to'liq ishlaydi
 *   'loading'    — saqlangan sessiya tiklanmoqda
 *   'signed-out' — sozlangan, lekin kirilmagan
 *   'signed-in'  — kirilgan; shopId — foydalanuvchi a'zo bo'lgan do'kon (bo'lmasa null)
 *
 * Sessiya AsyncStorage'da saqlanadi (Supabase'ning Expo uchun tavsiyasi) va ilova qayta ochilganda tiklanadi.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authError, parseAuthCallback } from './authLinks';
import { CloudError, toCloudError, unwrap } from './cloud';
import { authRedirectUrl, cloudConfigured, getSupabase, toCloudClient } from './supabase';

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';
export type SignUpResult = 'signed-in' | 'confirm-email' | 'already-exists' | 'error';
export type CallbackResult = { ok: true } | { ok: false; error: CloudError };

interface AuthApi {
  status: AuthStatus;
  email: string | null;
  shopId: string | null;
  shopName: string | null;
  /** Do'kon ma'lumoti yuklanmoqda (kirgandan keyin) */
  shopLoading: boolean;
  error: CloudError | null;
  clearError(): void;
  signIn(email: string, password: string): Promise<boolean>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  resendConfirmation(email: string): Promise<boolean>;
  /** Email tasdiqlash havolasini qayta ishlaydi (auth/callback ekrani) */
  completeFromUrl(url: string): Promise<CallbackResult>;
  signOut(): Promise<void>;
  createShop(name: string): Promise<boolean>;
  refreshShop(): Promise<void>;
}

const DISABLED: AuthApi = {
  status: 'disabled',
  email: null,
  shopId: null,
  shopName: null,
  shopLoading: false,
  error: null,
  clearError: () => {},
  signIn: async () => false,
  signUp: async () => 'error',
  resendConfirmation: async () => false,
  completeFromUrl: async () => ({ ok: false, error: new CloudError('auth', 'Bulut sozlanmagan') }),
  signOut: async () => {},
  createShop: async () => false,
  refreshShop: async () => {},
};

const AuthContext = createContext<AuthApi>(DISABLED);

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = getSupabase();
  const [status, setStatus] = useState<AuthStatus>(cloudConfigured ? 'loading' : 'disabled');
  const [email, setEmail] = useState<string | null>(null);
  const [shop, setShop] = useState<{ id: string; name: string } | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [error, setError] = useState<CloudError | null>(null);
  // Bir xil havola ikki marta qayta ishlanmasin (code bir martalik)
  const handledUrls = useRef(new Set<string>());

  const loadShop = useCallback(async () => {
    if (!sb) return;
    setShopLoading(true);
    try {
      // RLS: foydalanuvchi faqat o'z a'zoligini ko'radi
      const rows = await unwrap(
        sb.from('shop_members').select('shop_id, shops(name)').limit(1) as unknown as Promise<{
          data: { shop_id: string; shops: { name: string } | null }[] | null;
          error: { message: string; code?: string } | null;
        }>,
      );
      const first = rows?.[0];
      setShop(first ? { id: first.shop_id, name: first.shops?.name ?? '' } : null);
    } catch (e) {
      setError(toCloudError(e));
    } finally {
      setShopLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    let active = true;
    sb.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setEmail(data.session?.user.email ?? null);
        setStatus(data.session ? 'signed-in' : 'signed-out');
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(authError(e));
        setStatus('signed-out');
      });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user.email ?? null);
      setStatus(session ? 'signed-in' : 'signed-out');
      if (!session) setShop(null);
      // Kirish, havola orqali tasdiqlash yoki sessiya tiklanganda — do'konni yuklash.
      // (Callback ichida Supabase so'rovini kutish deadlock beradi — shuning uchun setTimeout.)
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setTimeout(() => void loadShop(), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [sb, loadShop]);

  const api = useMemo<AuthApi>(() => {
    if (!sb) return DISABLED;
    return {
      status,
      email,
      shopId: shop?.id ?? null,
      shopName: shop?.name ?? null,
      shopLoading,
      error,
      clearError: () => setError(null),

      async signIn(e, p) {
        setError(null);
        try {
          const { error: err } = await sb.auth.signInWithPassword({ email: e.trim(), password: p });
          if (err) {
            setError(authError(err));
            return false;
          }
          return true;
        } catch (ex) {
          setError(authError(ex));
          return false;
        }
      },

      async signUp(e, p) {
        setError(null);
        try {
          const { data, error: err } = await sb.auth.signUp({
            email: e.trim(),
            password: p,
            options: { emailRedirectTo: authRedirectUrl() },
          });
          if (err) {
            const mapped = authError(err);
            setError(mapped);
            return /allaqachon/.test(mapped.message) ? 'already-exists' : 'error';
          }
          // Supabase mavjud tasdiqlangan email uchun xato qaytarmaydi, lekin identities bo'sh bo'ladi
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            setError(authError({ code: 'user_already_exists' }));
            return 'already-exists';
          }
          return data.session ? 'signed-in' : 'confirm-email';
        } catch (ex) {
          setError(authError(ex));
          return 'error';
        }
      },

      async resendConfirmation(e) {
        setError(null);
        try {
          const { error: err } = await sb.auth.resend({
            type: 'signup',
            email: e.trim(),
            options: { emailRedirectTo: authRedirectUrl() },
          });
          if (err) {
            setError(authError(err));
            return false;
          }
          return true;
        } catch (ex) {
          setError(authError(ex));
          return false;
        }
      },

      async completeFromUrl(url) {
        if (handledUrls.current.has(url)) return { ok: true };
        handledUrls.current.add(url);
        const cb = parseAuthCallback(url);
        try {
          if (cb.kind === 'error') return { ok: false, error: authError({ code: cb.code, message: cb.description }) };
          if (cb.kind === 'code') {
            const { error: err } = await sb.auth.exchangeCodeForSession(cb.code);
            if (err) return { ok: false, error: authError(err) };
            return { ok: true };
          }
          if (cb.kind === 'tokens') {
            const { error: err } = await sb.auth.setSession({ access_token: cb.accessToken, refresh_token: cb.refreshToken });
            if (err) return { ok: false, error: authError(err) };
            return { ok: true };
          }
          if (cb.kind === 'token_hash') {
            const { error: err } = await sb.auth.verifyOtp({ token_hash: cb.tokenHash, type: cb.type });
            if (err) return { ok: false, error: authError(err) };
            return { ok: true };
          }
          return { ok: false, error: new CloudError('auth', "Havolada tasdiqlash ma'lumoti yo'q. Pochtadagi havolani to'liq oching.") };
        } catch (ex) {
          handledUrls.current.delete(url); // tarmoq xatosida qayta urinish mumkin
          return { ok: false, error: authError(ex) };
        }
      },

      async signOut() {
        try {
          // Faqat shu qurilma sessiyasi: standart 'global' barcha qurilmalardagi (web ham) sessiyalarni yopar edi
          await sb.auth.signOut({ scope: 'local' });
        } finally {
          setShop(null);
        }
      },

      async createShop(name) {
        setError(null);
        try {
          await unwrap(toCloudClient(sb).rpc<string>('create_shop', { p_name: name }));
          await loadShop();
          return true;
        } catch (e) {
          setError(toCloudError(e));
          return false;
        }
      },
      refreshShop: loadShop,
    };
  }, [sb, status, email, shop, shopLoading, error, loadShop]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

/** Provayder bo'lmasa (diagnostika rejimlari) — xavfsiz 'disabled' holat */
export function useAuth(): AuthApi {
  return useContext(AuthContext);
}
