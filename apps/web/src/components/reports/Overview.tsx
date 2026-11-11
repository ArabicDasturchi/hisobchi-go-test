'use client';
/**
 * Hisobotlar: "Umumiy ko'rinish" (bugungi savdo/foyda/kassa, qarzlar, diqqat, so'nggi savdolar, grafik).
 * Bosh sahifadan ko'chirildi: kiritish oynasi bor panelda hisobot kartochkalari yo'q. Raqamlar `dashboardModel` dan.
 */
import { AlertTriangle, ArrowRight, Banknote, Boxes, CreditCard, Receipt, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TrendChart, type ChartSeries } from '@/components/charts/TrendChart';
import { Money, StatCard, StatusBadge } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Avatar, Card, CardHeader, EmptyState, LinkButton, Segmented } from '@/components/ui/primitives';
import { useBooks } from '@/components/useBooks';
import { uz } from '@/i18n/uz';
import { buildDashboard, chartSeries, methodBreakdown } from '@/lib/dashboardModel';
import { formatDateTime, shortNumber } from '@/lib/dates';
import { formatQty } from '@/lib/money';

type Range = '7' | '30';

const CHART_SERIES: readonly ChartSeries[] = [
  { key: 'sales', label: 'Savdo', color: 'var(--series-1)' },
  { key: 'profit', label: 'Foyda', color: 'var(--series-2)' },
];

export function Overview({ data }: { data: ShopData }) {
  const { balances, customerById } = useShop();
  const { data: books } = useBooks();
  const [range, setRange] = useState<Range>('7');
  const now = useMemo(() => new Date(), []);
  const model = useMemo(
    () => buildDashboard({ sales: data.sales, saleLines: data.saleLines, payments: data.payments, customers: data.customers, balances, products: data.products, stock: data.stock, books, now }),
    [data, balances, books, now],
  );
  const series = useMemo(() => chartSeries({ sales: data.sales, saleLines: data.saleLines, payments: data.payments, now }, Number(range)), [data, range, now]);
  const recent = data.sales.slice(0, 5);
  const empty = data.sales.length === 0;
  const { today, debts } = model;
  const drafts = data.drafts?.length ?? 0;
  const attention = model.lowStock.length + (model.noCostProducts?.length ? 1 : 0) + (drafts > 0 ? 1 : 0);

  return (
    <div data-testid="overview">
          {/* 2. Bugun */}
          <h2 className="mb-2 mt-5 text-sm font-semibold text-muted">Bugun</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="today">
            <StatCard label="Savdo" value={<Money value={today.sales} />} hint={`${today.saleCount} ta savdo`} icon={Receipt} accent="emerald" />
            <StatCard
              label="Foyda"
              value={<Money value={today.profit} signed />}
              hint={
                today.unknownCostLines > 0 || today.salesWithoutLines > 0 ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    {today.unknownCostLines > 0 ? `${today.unknownCostLines} qator hisobga kirmadi (tan narxi yo'q)` : `${today.salesWithoutLines} savdo hisobga kirmadi`}
                  </span>
                ) : (
                  'Tan narxi ma’lum qatorlardan'
                )
              }
              icon={TrendingUp}
              accent="blue"
            />
            <StatCard label="Kassa (naqd)" value={<Money value={today.cash} />} hint="Mijozsiz savdo + naqd to‘lovlar − naqd chiqim" icon={Wallet} accent="slate" />
            <StatCard
              label="Karta va o‘tkazma"
              value={<Money value={today.paymentsInByMethod.karta + today.paymentsInByMethod.otkazma} />}
              hint={`Mijozlardan; kassaga kirmaydi${methodBreakdown(today.paymentsInByMethod, ['karta', 'otkazma']) ? ` · ${methodBreakdown(today.paymentsInByMethod, ['karta', 'otkazma'])}` : ''}`}
              icon={CreditCard}
              accent="blue"
            />
          </div>

          {/* 3. Qarzlar */}
          <h2 className="mb-2 mt-5 text-sm font-semibold text-muted">Qarzlar</h2>
          <div className="grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3" data-testid="owed-to-me">
              <CardHeader
                title="Menga qarzdorlar"
                description={debts.debtorCount > 0 ? `${debts.debtorCount} ta mijoz` : undefined}
                action={
                  <Link href="/customers?filter=debt" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Hammasi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="px-4 pt-3">
                <Money value={debts.owedToMe} className="text-2xl font-semibold text-rose-600 dark:text-rose-400" />
              </div>
              {debts.topDebtors.length === 0 ? (
                <p className="p-4 text-sm text-muted">Qarzdor mijoz yo&apos;q.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {debts.topDebtors.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Link href={`/customers/${d.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{customerById.get(d.id)?.name ?? d.name}</p>
                        <Money value={d.debt} className="text-xs font-semibold text-rose-600 dark:text-rose-400" />
                      </Link>
                      <LinkButton href={`/dashboard?amal=tolov&kimga=${d.id}`} size="sm" variant="outline" icon={<Banknote className="h-3.5 w-3.5" />}>
                        To&apos;lov
                      </LinkButton>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-2" data-testid="i-owe">
              <CardHeader
                title="Mening qarzim"
                description={books ? (debts.supplierCount > 0 ? `${debts.supplierCount} ta ta'minotchiga` : "Ta'minotchilarga") : undefined}
                action={
                  <Link href="/suppliers" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Ta&apos;minotchilar <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="p-4">
                {books ? (
                  <>
                    <Money value={debts.iOwe} className="text-2xl font-semibold text-fg" />
                    {debts.iOwe === 0n && <p className="mt-1 text-xs text-muted">Ta&apos;minotchilarga qarz yo&apos;q.</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted">Kirim ma&apos;lumoti yuklanmadi.</p>
                )}
              </div>
            </Card>
          </div>

          {/* 4. Diqqat */}
          <h2 className="mb-2 mt-5 text-sm font-semibold text-muted">Diqqat</h2>
          <Card data-testid="attention">
            {attention === 0 ? (
              <p className="p-4 text-sm text-muted">Hozircha e&apos;tibor talab qiladigan narsa yo&apos;q.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {model.lowStock.length > 0 && (
                  <li className="px-4 py-3">
                    <Link href="/warehouse" className="flex items-start gap-3">
                      <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-fg">Tugayotgan tovarlar ({model.lowStock.length})</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {model.lowStock
                            .slice(0, 4)
                            .map((i) => `${i.name}: ${i.qtyMilli <= 0n ? (i.level === 'negative' ? `minus ${formatQty(-i.qtyMilli)}` : 'tugagan') : `${formatQty(i.qtyMilli)} ${i.unit}`}`)
                            .join(' · ')}
                          {model.lowStock.length > 4 ? ' …' : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                )}
                {model.noCostProducts && model.noCostProducts.length > 0 && (
                  <li className="px-4 py-3">
                    <Link href="/products" className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-fg">Tan narxi yo&apos;q tovarlar ({model.noCostProducts.length})</span>
                        <span className="mt-0.5 block text-xs text-muted">Kirim yozilganda tan narx o&apos;zi paydo bo&apos;ladi; shundan keyin foyda hisoblanadi.</span>
                      </span>
                    </Link>
                  </li>
                )}
                {drafts > 0 && (
                  <li className="px-4 py-3">
                    <Link href="/drafts" className="flex items-start gap-3">
                      <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-fg">Kutayotgan qoralamalar ({drafts})</span>
                        <span className="mt-0.5 block text-xs text-muted">AI tayyorlagan yozuvlar tasdiqingizni kutmoqda.</span>
                      </span>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>

          {/* 5. So'nggi 5 savdo */}
          <Card className="mt-3">
            <CardHeader
              title="So'nggi savdolar"
              action={
                <Link href="/sales" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Hammasi <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {recent.length === 0 && <p className="p-4 text-sm text-muted">Savdolar yo&apos;q.</p>}
            <ul className="divide-y divide-line">
              {recent.map((s) => {
                const c = s.customer_id ? customerById.get(s.customer_id) : null;
                return (
                  <li key={s.id}>
                    <Link href={`/sales/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                      <Avatar name={c?.name ?? '—'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{c?.name ?? uz.common.noCustomer}</p>
                        <p className="text-xs text-muted">
                          {shortNumber(s.id)} · {formatDateTime(s.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Money value={s.subtotal} className={s.status === 'reversed' ? 'text-sm text-muted line-through' : 'text-sm font-semibold text-fg'} />
                        {s.status === 'reversed' && <StatusBadge status={s.status} />}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* 6. Grafik — eng pastda */}
          <Card className="mt-3">
            <CardHeader
              title="Savdo va foyda"
              description="Kunlik savdo va foyda (tan narxi ma'lum qatorlardan)"
              action={
                <Segmented
                  ariaLabel="Davr"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: '7', label: '7 kun' },
                    { value: '30', label: '30 kun' },
                  ]}
                />
              }
            />
            <div className="p-4">
              {empty ? (
                <EmptyState icon={<Receipt className="h-6 w-6" />} title="Hali savdo yo'q" description="Birinchi savdoni kiriting — grafik shu yerda paydo bo'ladi." action={<LinkButton href="/dashboard" size="sm">Savdo kiritish</LinkButton>} />
              ) : (
                <TrendChart data={series} series={CHART_SERIES} height={220} />
              )}
            </div>
          </Card>
    </div>
  );
}
