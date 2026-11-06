/**
 * Daftar varag'i (M2): ma'lumot qatlami, tez yozuv oldindan ko'rinishi, ro'yxat filtri, ulashish matni va
 * LedgerSheet render (klaviatura bilan yozuv mantig'i jsdom'siz: sof funksiyalar + statik render).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ledgerBalance, TotalsMismatchError } from '@hisobchi/core';
import { LedgerSheet } from '../src/components/ledger/LedgerSheet';
import { ToastProvider } from '../src/components/ui/Toast';
import type { BooksData } from '../src/lib/data/books';
import { supplierTotals } from '../src/lib/data/books';
import { buildSheet, customerEntries, supplierEntries, verifySheet } from '../src/lib/data/partnerLedger';
import type { Payment, SaleDoc } from '../src/lib/data/types';
import { arrowTarget, filterPartners, quickKeyAction, presetRange, quickPreview, reminderText, rowsInRange, sheetText, type PartnerListRow } from '../src/lib/ledgerView';

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const sale = (id: string, at: string, subtotal: bigint, status: SaleDoc['status'] = 'posted'): SaleDoc => ({ id, customer_id: 'c1', status, subtotal, created_at: at, posted_at: at, created_by: 'u' });
const pay = (id: string, at: string, amount: bigint, voided = false): Payment => ({
  id,
  customer_id: 'c1',
  amount,
  method: 'naqd',
  note: null,
  created_by: 'u',
  created_at: at,
  void: voided ? { id: 'v' + id, payment_id: id, reason: 'xato', created_by: 'u', created_at: at } : null,
});

describe('customerEntries → ledgerRows (Toshkent sanasi)', () => {
  it('namuna: Eski 47 163 000 + Tovar 9 268 000 = Jami 56 431 000, Berildi 10 000 000 → Ostatka 46 431 000', () => {
    const entries = customerEntries(
      'c1',
      [sale('s0', '2026-10-01T05:00:00Z', 47_163_000n), sale('s1', '2026-11-03T07:00:00Z', 9_268_000n)],
      [pay('p1', '2026-11-03T08:00:00Z', 10_000_000n)],
    );
    const rows = buildSheet(entries);
    expect(rows).toHaveLength(2);
    expect([rows[1]!.old, rows[1]!.goods, rows[1]!.total, rows[1]!.paid, rows[1]!.balance]).toEqual([47_163_000n, 9_268_000n, 56_431_000n, 10_000_000n, 46_431_000n]);
  });

  it('UTC 20:00 = Toshkentda ertasi kuni', () => {
    const rows = buildSheet(customerEntries('c1', [sale('s', '2026-11-03T20:00:00Z', 5n)], []));
    expect(rows[0]!.date).toBe('2026-11-04');
  });

  it("bekor qilingan savdo va to'lov qatorda qoladi, jamiga kirmaydi", () => {
    const rows = buildSheet(customerEntries('c1', [sale('s1', '2026-11-01T07:00:00Z', 100n), sale('s2', '2026-11-02T07:00:00Z', 40n, 'reversed')], [pay('p', '2026-11-03T07:00:00Z', 30n, true)]));
    expect(rows).toHaveLength(3);
    expect(rows[1]!.allCancelled).toBe(true);
    expect(rows[2]!.allCancelled).toBe(true);
    expect(ledgerBalance(rows)).toBe(100n);
  });

  it('boshqa mijoz yozuvlari aralashmaydi', () => {
    const other = { ...sale('x', '2026-11-01T07:00:00Z', 999n), customer_id: 'c2' };
    expect(customerEntries('c1', [other], [])).toHaveLength(0);
  });
});

describe("ta'minotchi varag'i va ochilish qoldig'i", () => {
  const books = {
    purchases: [
      { id: 'o1', kind: 'opening' as const, supplier_id: 's1', doc_date: '2026-11-05', status: 'posted' as const, subtotal: 60_186_000n, created_at: '2026-11-05T09:00:00Z' },
      { id: 'k1', kind: 'purchase' as const, supplier_id: 's1', doc_date: '2026-11-01', status: 'posted' as const, subtotal: 2_000_000n, created_at: '2026-11-01T09:00:00Z' },
    ],
    payments: [{ id: 'sp1', supplier_id: 's1', amount: 500_000n, method: 'naqd', note: 'avans', created_at: '2026-11-02T09:00:00Z', voided: false }],
  } satisfies Pick<BooksData, 'purchases' | 'payments'>;

  it("boshlang'ich qarz birinchi qator va Tovar jamiga kirmaydi", () => {
    const rows = buildSheet(supplierEntries('s1', books));
    expect(rows[0]!.kind).toBe('opening');
    expect(rows[0]!.opening).toBe(60_186_000n);
    expect(rows.reduce((a, r) => a + r.goods, 0n)).toBe(2_000_000n);
    expect(ledgerBalance(rows)).toBe(61_686_000n);
  });

  it('supplierTotals: opening alohida, goods kirimlargina, qarz o\'zgarmaydi', () => {
    const t = supplierTotals(books).get('s1')!;
    expect(t.opening).toBe(60_186_000n);
    expect(t.goods).toBe(2_000_000n);
    expect(t.paid).toBe(500_000n);
    expect(t.outstanding).toBe(61_686_000n);
  });
});

describe("ikkinchi yo'l (verifySheet)", () => {
  const entries = customerEntries('c1', [sale('s', '2026-11-03T07:00:00Z', 1000n)], [pay('p', '2026-11-03T08:00:00Z', 400n)]);
  const rows = buildSheet(entries);

  it("SQL bilan mos: ok (manba sql); SQL yo'q bo'lsa mahalliy", () => {
    expect(verifySheet(rows, entries, 600n)).toEqual({ status: 'ok', source: 'sql' });
    expect(verifySheet(rows, entries, null)).toEqual({ status: 'ok', source: 'local' });
  });

  it("SQL boshqa qoldiq qaytarsa: mismatch — yozish to'xtaydi", () => {
    const v = verifySheet(rows, entries, 601n);
    expect(v).toMatchObject({ status: 'mismatch', ledger: 600n, independent: 601n, source: 'sql' });
    expect(TotalsMismatchError).toBeTypeOf('function');
  });
});

describe('quickPreview — Jami va Ostatka core hisoblaydi', () => {
  it('mijoz: Eski 47 163 000 + 9 268 000, berildi 10 000 000', () => {
    const q = quickPreview('customer', 47_163_000n, '9 268 000', '10 000 000');
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.settlement).toMatchObject({ opening: 47_163_000n, goods: 9_268_000n, total: 56_431_000n, paid: 10_000_000n, balance: 46_431_000n });
  });

  it('bo\'sh maydon: xato emas, xabar yo\'q', () => {
    expect(quickPreview('customer', 5n, '', '')).toEqual({ ok: false, message: null });
  });

  it("to'lov jamidan katta bo'lsa rad etiladi", () => {
    const q = quickPreview('customer', 1000n, '500', '2000');
    expect(q.ok).toBe(false);
    expect(q).toMatchObject({ message: expect.stringContaining('jamidan katta') });
  });

  it("qarz yo'q bo'lsa to'lov yozib bo'lmaydi", () => {
    expect(quickPreview('supplier', 0n, '', '100')).toMatchObject({ ok: false, message: expect.stringContaining("Qarz yo'q") });
  });

  it("ta'minotchida tovar summasi tezkor qatordan emas (kirim tovar tanlashni talab qiladi)", () => {
    expect(quickPreview('supplier', 100n, '50', '')).toMatchObject({ ok: false, message: expect.stringContaining('Tovar tanlash') });
  });

  it("noto'g'ri son va katta summa", () => {
    expect(quickPreview('customer', 0n, '12a', '')).toMatchObject({ ok: false });
    expect(quickPreview('customer', 0n, '200 000 000', '')).toMatchObject({ ok: false, message: expect.stringContaining('Yangi savdo') });
  });

  it("faqat to'lov (tovarsiz) ishlaydi", () => {
    const q = quickPreview('supplier', 61_686_000n, '', '1 000 000');
    expect(q.ok && q.settlement.balance).toBe(60_686_000n);
  });
});

describe("oraliq, ro'yxat, ulashish", () => {
  const rows = buildSheet(
    customerEntries('c1', [sale('a', '2026-09-01T07:00:00Z', 100n), sale('b', '2026-11-03T07:00:00Z', 50n)], [pay('p', '2026-11-04T07:00:00Z', 30n)]),
  );

  it('oraliq faqat ko\'rsatadi: Eski butun tarixdan', () => {
    const shown = rowsInRange(rows, presetRange('month', '2026-11-10'));
    expect(shown.map((r) => r.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(shown[0]!.old).toBe(100n);
  });

  const list: PartnerListRow[] = [
    { id: '1', name: 'Karim', phone: '+998 90 111 22 33', is_active: true, balance: 500n, lastActivity: '2026-11-01T00:00:00Z' },
    { id: '2', name: 'Anvar', phone: null, is_active: true, balance: 0n, lastActivity: '2026-11-05T00:00:00Z' },
    { id: '3', name: 'Zarina', phone: '901112233', is_active: true, balance: 900n, lastActivity: '2026-10-01T00:00:00Z' },
    { id: '4', name: 'Eski', phone: null, is_active: false, balance: 10n, lastActivity: null },
  ];

  it('filtr: qarzdorlar / hammasi / arxiv', () => {
    expect(filterPartners(list, { query: '', filter: 'debtors', sort: 'debt' }).map((r) => r.id)).toEqual(['3', '1']);
    expect(filterPartners(list, { query: '', filter: 'all', sort: 'recent' }).map((r) => r.id)).toEqual(['2', '1', '3']);
    expect(filterPartners(list, { query: '', filter: 'archive', sort: 'debt' }).map((r) => r.id)).toEqual(['4']);
  });

  it('qidiruv: ism va telefon raqami (bo\'sh joysiz)', () => {
    expect(filterPartners(list, { query: 'kar', filter: 'all', sort: 'debt' }).map((r) => r.id)).toEqual(['1']);
    expect(filterPartners(list, { query: '90111', filter: 'all', sort: 'debt' }).map((r) => r.id).sort()).toEqual(['1', '3']);
  });

  it('eslatma matni faqat qarz bor bo\'lsa', () => {
    expect(reminderText('Karim', 0n)).toBeNull();
    expect(reminderText('Karim', 46_431_000n)).toContain('Assalomu alaykum, Karim! Qarzingiz 46 431 000 so\'m');
  });

  it('varaq matni: qatorlar va joriy qarz', () => {
    const t = sheetText({ shopName: 'Baraka', partnerName: 'Karim', kind: 'customer', rows, balance: 120n });
    expect(t).toContain('Baraka — Mijoz: Karim');
    expect(t).toContain('03.11.2026');
    expect(t).toContain('Joriy qarzi');
  });
});

describe('LedgerSheet render', () => {
  const entries = customerEntries('c1', [sale('s0', '2026-10-01T05:00:00Z', 47_163_000n), sale('s1', '2026-11-03T07:00:00Z', 9_268_000n, 'reversed')], [pay('p1', '2026-11-04T08:00:00Z', 10_000_000n)]);
  const rows = buildSheet(entries);
  const base = {
    kind: 'customer' as const,
    partner: { id: 'c1', name: 'Rahim aka', phone: '+998 90 123 45 67', is_active: true },
    shopName: 'Baraka',
    rows,
    verification: { status: 'ok', source: 'sql' } as const,
    canWrite: true,
    goodsHref: '/sales/new?customer=c1',
    onPay: () => {},
    onQuickSave: async () => {},
    onCancel: async () => {},
  };
  const html = (over: Partial<Parameters<typeof LedgerSheet>[0]> = {}) =>
    renderToStaticMarkup(
      <ToastProvider>
        <LedgerSheet {...base} {...over} />
      </ToastProvider>,
    );

  it('tepada ism, qarz va tugmalar; jadval ustunlari qog\'oz daftardagidek', () => {
    const h = html();
    expect(h).toContain('Rahim aka');
    expect(h).toContain('+ Savdo');
    expect(h).toContain('To&#x27;lov oldim');
    expect(h).toContain('/sales/new?customer=c1');
    for (const col of ['Sana', 'Eski', 'Tovar', 'Jami', 'Berildi', 'Ostatka', 'Izoh']) expect(h).toContain(`>${col}<`);
    expect(h).toContain('47 163 000');
  });

  it('bekor qilingan savdo qatorda belgi bilan turadi (o\'chirilmaydi)', () => {
    expect(html()).toContain('bekor qilingan');
  });

  it("tez yozuv qatori jadval pastida doim ochiq (bo'sh daftarda ham)", () => {
    const h = html({ rows: [] });
    expect(h).toContain('data-testid="quick-row"');
    expect(h).toContain('Birinchi yozuvni kiriting');
  });

  it('hisob mos kelmasa yozish to\'xtaydi va xato ko\'rinadi', () => {
    const h = html({ verification: { status: 'mismatch', ledger: 1n, independent: 2n, source: 'sql' } });
    expect(h).toContain('Hisob mos kelmadi');
    expect(h).toMatch(/<input[^>]*disabled[^>]*aria-label="Berildi summasi"|aria-label="Berildi summasi"[^>]*disabled/);
  });

  it('ta\'minotchi sozlamasi: + Kirim, To\'lov berdim, Tovar tanlash', () => {
    const h = html({ kind: 'supplier', goodsHref: '/purchases/new?supplier=c1' });
    expect(h).toContain('+ Kirim');
    expect(h).toContain('To&#x27;lov berdim');
    expect(h).toContain('Tovar tanlash');
    expect(h).not.toContain('Eslatma matni');
  });

  it('mijozda eslatma tugmasi faqat qarz bo\'lsa', () => {
    expect(html()).toContain('Eslatma matni');
    expect(html({ rows: [] })).not.toContain('Eslatma matni');
  });
});

describe('klaviatura bilan yozuv', () => {
  it("Enter: oldingi maydonlarda keyingisiga o'tadi, oxirgisida saqlaydi", () => {
    expect(quickKeyAction('Enter', {}, false)).toBe('next');
    expect(quickKeyAction('Enter', {}, true)).toBe('save');
  });
  it("Ctrl/Cmd+Enter istalgan maydonda saqlaydi; boshqa tugmalar e'tiborsiz", () => {
    expect(quickKeyAction('Enter', { ctrl: true }, false)).toBe('save');
    expect(quickKeyAction('Enter', { meta: true }, false)).toBe('save');
    expect(quickKeyAction('a', {}, true)).toBe('none');
    expect(quickKeyAction('Tab', {}, false)).toBe('none');
  });
  it("strelkalar: qatorlar orasida yuradi, chetda to'xtaydi", () => {
    expect(arrowTarget(0, 3, 'ArrowDown')).toBe(1);
    expect(arrowTarget(2, 3, 'ArrowDown')).toBeNull();
    expect(arrowTarget(0, 3, 'ArrowUp')).toBeNull();
    expect(arrowTarget(2, 3, 'ArrowUp')).toBe(1);
    expect(arrowTarget(-1, 3, 'ArrowDown')).toBeNull();
    expect(arrowTarget(0, 3, 'ArrowLeft')).toBeNull();
  });
});
