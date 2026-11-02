'use client';
/**
 * Do'kon a'zoligi va do'kon ma'lumotlari (mijozlar, mahsulotlar, savdolar, to'lovlar) — bitta manba.
 * Barcha sahifalar shu yerdan o'qiydi; har bir server amalidan keyin `reload()` haqiqiy holatni qayta oladi.
 * Ma'lumot faqat serverdan keladi (soxta/kesh statistika yo'q).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listAgentDrafts, listCustomers, listPayments, listProducts, listReversals, listSales, getMembership } from '@/lib/data/api';
import { customerBalances, type CustomerBalance } from '@/lib/data/ledger';
import type { AgentDraft, Customer, Membership, Payment, Product, Reversal, SaleDoc } from '@/lib/data/types';
import { errorMessage } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from './AuthProvider';

export interface ShopData {
  customers: Customer[];
  products: Product[];
  sales: SaleDoc[];
  payments: Payment[];
  reversals: Reversal[];
  /** Tasdiqlanmagan agent qoralamalari. null — yuklab bo'lmadi (masalan 004 migratsiya qo'llanmagan): boshqa sahifalar ishlayveradi */
  drafts: AgentDraft[] | null;
  draftsError: string | null;
}

interface Ctx {
  membership: Membership;
  shopId: string;
  data: ShopData | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: Date | null;
  reload: () => Promise<void>;
  balances: Map<string, CustomerBalance>;
  /** Menyudagi belgi uchun: tasdiqlanmagan qoralamalar soni */
  pendingDrafts: number;
  customerById: Map<string, Customer>;
  setMembership: (m: Membership) => void;
}

const ShopCtx = createContext<Ctx | null>(null);

type MembershipState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'none' } | { status: 'ok'; membership: Membership };

/** A'zolikni aniqlash: do'kon yo'q bo'lsa — onboarding */
export function useMembershipLoader(): [MembershipState, () => void] {
  const { user } = useAuth();
  const [state, setState] = useState<MembershipState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    getMembership(getSupabase(), user.id)
      .then((m) => active && setState(m ? { status: 'ok', membership: m } : { status: 'none' }))
      .catch((e: unknown) => active && setState({ status: 'error', message: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [user, attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return [state, retry];
}

export function ShopDataProvider({ membership: initial, children }: { membership: Membership; children: ReactNode }) {
  const [membership, setMembership] = useState(initial);
  const shopId = membership.shop.id;
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const reload = useCallback(async () => {
    // Bir vaqtda faqat bitta yuklash (tez-tez bosilgan "yangilash" so'rovlarni ko'paytirmaydi)
    if (inflight.current) return inflight.current;
    const sb = getSupabase();
    const p = (async () => {
      setLoading(true);
      try {
        const [customers, products, sales, payments, reversals, draftsRes] = await Promise.all([
          listCustomers(sb, shopId),
          listProducts(sb, shopId),
          listSales(sb, shopId),
          listPayments(sb, shopId),
          listReversals(sb, shopId),
          // Qoralamalar ixtiyoriy: xato bo'lsa butun ilova yiqilmaydi
          listAgentDrafts(sb, shopId, { status: 'draft' }).then(
            (drafts) => ({ drafts, draftsError: null as string | null }),
            (e: unknown) => ({ drafts: null as AgentDraft[] | null, draftsError: errorMessage(e) }),
          ),
        ]);
        setData({ customers, products, sales, payments, reversals, drafts: draftsRes.drafts, draftsError: draftsRes.draftsError });
        setError(null);
        setLastLoadedAt(new Date());
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, [shopId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Oyna qayta faollashganda (boshqa qurilmada kiritilgan yozuvlar) yangilash
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && lastLoadedAt && Date.now() - lastLoadedAt.getTime() > 60_000) void reload();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload, lastLoadedAt]);

  // Internet qaytganda ma'lumotlar avtomatik qayta yuklanadi (holat "Sinxronlangan" ga qaytadi)
  useEffect(() => {
    const onOnline = () => void reload();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reload]);

  const balances = useMemo(() => (data ? customerBalances(data.sales, data.payments) : new Map<string, CustomerBalance>()), [data]);
  const customerById = useMemo(() => new Map((data?.customers ?? []).map((c) => [c.id, c])), [data]);

  const pendingDrafts = data?.drafts?.length ?? 0;

  const value = useMemo<Ctx>(
    () => ({ membership, shopId, data, loading, error, lastLoadedAt, reload, balances, pendingDrafts, customerById, setMembership }),
    [membership, shopId, data, loading, error, lastLoadedAt, reload, balances, pendingDrafts, customerById],
  );
  return <ShopCtx.Provider value={value}>{children}</ShopCtx.Provider>;
}

export function useShop(): Ctx {
  const ctx = useContext(ShopCtx);
  if (!ctx) throw new Error('useShop ShopDataProvider ichida ishlatilishi kerak');
  return ctx;
}
