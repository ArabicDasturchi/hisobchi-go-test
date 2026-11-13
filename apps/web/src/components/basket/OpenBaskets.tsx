'use client';
/**
 * F2 «Savat» bo'limi: yarim qolgan (tasdiqlanmagan) savdo va kirimlar. Bosilsa panelda o'sha savat ochiladi va
 * tahrirlab tasdiqlanadi yoki to'lov qabul qilinadi. Savat pul yozuvi emas: daftarda ko'rinmaydi.
 */
import Link from 'next/link';
import { ShoppingBasket, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { parsePurchaseLines, parseSaleLines } from '@/lib/basketLines';
import { createLocalStore, resolveBasketStore, type BasketStore, type StoredBasket } from '@/lib/basketStore';
import { lineTotal, parseMoneyInput, parseQtyInput } from '@/lib/money';
import { Money } from '@/components/shared';
import { errorMessage } from '@/lib/errors';
import { panelHref } from '@/lib/panelState';
import { getSupabase } from '@/lib/supabase/client';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; store: BasketStore; list: StoredBasket[] };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Savatdagi to'liq qatorlar jami (ko'rsatish uchun, mavjud lineTotal → core); to'liq bo'lmaganlari sanaladi */
export function basketPreview(b: StoredBasket): { total: bigint; incomplete: number; count: number } {
  const rows = b.kind === 'sale' ? parseSaleLines(b.lines).map((l) => ({ q: l.qty, p: l.price, r: l.reviews })) : parsePurchaseLines(b.lines).map((l) => ({ q: l.qty, p: l.unitCost, r: l.reviews }));
  let total = 0n;
  let incomplete = 0;
  for (const r of rows) {
    const q = parseQtyInput(r.q);
    const p = parseMoneyInput(r.p, { allowZero: true });
    if (!q.ok || !p.ok || (r.r && r.r.length > 0)) incomplete++;
    else total += lineTotal({ qtyMilli: q.value, unitPrice: p.value });
  }
  return { total, incomplete, count: rows.length };
}

/** Panelda savatni ochish havolasi: /dashboard?amal=..&kimga=..&savat=<id> */
export function basketHref(b: Pick<StoredBasket, 'id' | 'kind' | 'partnerId'>): string {
  const base = panelHref({ action: b.kind === 'sale' ? 'savdo' : 'kirim', who: b.partnerId ?? '' });
  return `${base}${base.includes('?') ? '&' : '?'}savat=${encodeURIComponent(b.id)}`;
}

export function OpenBaskets({ supplierNames, refreshKey }: { supplierNames: ReadonlyMap<string, string>; refreshKey: number }) {
  const { shopId, customerById } = useShop();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let load: Promise<{ store: BasketStore; baskets: StoredBasket[] }>;
    try {
      load = resolveBasketStore(getSupabase(), shopId, storage());
    } catch {
      const store = createLocalStore(storage(), shopId);
      load = store.list().then((baskets) => ({ store, baskets }));
    }
    load.then(
      (r) => alive && setState({ status: 'ok', store: r.store, list: r.baskets }),
      (e: unknown) => alive && setState({ status: 'error', message: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [shopId, attempt, refreshKey]);

  async function discard(b: StoredBasket) {
    if (state.status !== 'ok' || busy) return;
    if (typeof window !== 'undefined' && !window.confirm("Savat tashlansinmi? Undagi qatorlar o'chadi (daftarga hech narsa yozilmagan).")) return;
    setBusy(b.id);
    try {
      await state.store.close(b.id, 'discarded', null, b.version);
      setState({ ...state, list: state.list.filter((x) => x.id !== b.id) });
      toast.success('Savat tashlandi.');
    } catch (e) {
      toast.error(errorMessage(e));
      setAttempt((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  if (state.status === 'loading') return <Skeleton className="h-24 rounded-xl" />;
  if (state.status === 'error')
    return (
      <Card>
        <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
      </Card>
    );

  const name = (b: StoredBasket) =>
    b.kind === 'sale' ? (b.partnerId ? (customerById.get(b.partnerId)?.name ?? 'Mijoz') : 'Mijozsiz (naqd)') : b.partnerId ? (supplierNames.get(b.partnerId) ?? "Ta'minotchi") : "Ta'minotchi tanlanmagan";

  return (
    <section aria-label="Ochiq savatlar" className="space-y-2" data-testid="open-baskets">
      <h2 className="text-base font-semibold text-fg">Yarim qolgan savdo va kirimlar</h2>
      {state.store.mode === 'local' && (
        <Alert tone="blue">Savat hozircha shu qurilmada saqlanadi (serverda savat yoqilmagan). Boshqa telefon yoki kompyuterda ko&apos;rinmaydi.</Alert>
      )}
      {state.list.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingBasket className="h-6 w-6" />} title="Ochiq savat yo'q" description="Panelda savdo yoki kirim boshlasangiz, tasdiqlanmaguncha shu yerda saqlanadi." />
        </Card>
      ) : (
        <ul className="space-y-2">
          {state.list.map((b) => {
            const pv = basketPreview(b);
            return (
              <li key={b.id} data-testid="open-basket">
                <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={b.kind === 'sale' ? 'green' : 'blue'}>{b.kind === 'sale' ? 'Savdo' : 'Kirim'}</Badge>
                      {b.sourceDraftId && <Badge tone="amber">AI qoralamasidan</Badge>}
                      <span className="truncate font-semibold text-fg">{name(b)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {pv.count} ta qator
                      {pv.incomplete > 0 ? `, ${pv.incomplete} tasi to'ldirilmagan` : ''} · <Money value={pv.total} />
                    </p>
                  </div>
                  <Link
                    href={basketHref(b)}
                    className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"
                  >
                    Ochish
                  </Link>
                  <Button variant="outline" onClick={() => void discard(b)} loading={busy === b.id} disabled={busy !== null} aria-label={`Savatni tashlash: ${name(b)}`} icon={<Trash2 className="h-4 w-4" />}>
                    Tashlash
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
