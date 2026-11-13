// @vitest-environment jsdom
/**
 * F1 integratsiya: boshqaruv panelida (PanelWorkspace) Savdo/Kirim tanlab 10 qatorli ro'yxat joylanadi.
 *
 * Regressiya (asoschi xatosi, 11.11.2026): avval kiritish oynasi `maxLength={120}` va `\n → ' '` tufayli ro'yxatni
 * bitta 120 belgili qatorga aylantirardi (8–10-qatorlar yo'qolardi, "Qur'on 1x45000" → "1x4500"), takliflar chiqmasdi,
 * yuborilganda bitta "yangi tovar" qatori (soni 1, narxsiz / kirimda birliksiz) paydo bo'lib xato berardi.
 *
 * Server, Supabase va submit hooklari almashtirilgan (faqat UI oqimi): hech narsa saqlanmaydi.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/data/types';

const nav = vi.hoisted(() => ({ params: new URLSearchParams('amal=savdo') }));
const toasts = vi.hoisted(() => [] as { kind: string; m: string }[]);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: (m: string) => toasts.push({ kind: 'success', m }), info: (m: string) => toasts.push({ kind: 'info', m }), error: (m: string) => toasts.push({ kind: 'error', m }) }),
}));

const P = (id: string, name: string, price: number | null): Product => ({
  id, name, unit: 'dona', last_price: price === null ? null : BigInt(price), is_active: true, source: 'app', created_at: '2026-01-01', updated_at: '',
});
const CATALOG = [P('c1', 'Chirmoq', 13000), P('y1', 'Yurak', 15000), P('m1', 'Momiq', 9000), P('j1', 'Joynamoz Turk', 13000), P('j2', 'Joynamoz Eron', 15000), P('q1', "Qur'on", 45000)];

vi.mock('@/components/ShopDataProvider', () => ({
  useShop: () => ({
    balances: new Map(),
    customerById: new Map(),
    // Sherik (#59): ombor narx sozlamalari; standart (optom o'chiq)
    pricing: { wholesaleEnabled: false, stockEnabled: true, markupPercent: null },
    membership: { shop: { settings: { units: ['dona'] } }, role: 'owner' },
    shopId: 's1',
  }),
}));
vi.mock('@/components/useBooks', () => ({ useBooks: () => ({ data: { suppliers: [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Karim aka', is_active: true }], stock: [] }, reload: async () => {} }) }));
vi.mock('@/lib/data/books', () => ({ supplierTotals: () => new Map() }));

const saleSubmit = vi.hoisted(() => vi.fn());
vi.mock('@/components/sale/useSaleSubmit', () => ({
  useSaleSubmit: () => ({ phase: { kind: 'editing' }, locked: false, frozen: false, busy: false, formError: null, paidError: null, currentDebt: 0n, submit: saleSubmit, reset: () => {}, clearErrors: () => {} }),
}));
vi.mock('@/components/sale/usePaymentSubmit', () => ({
  usePaymentSubmit: () => ({ debt: 0n, busy: false, locked: false, error: null, submit: async () => null, reset: () => {}, clearError: () => {} }),
}));
const idle = { busy: false, locked: false, error: null, clearError: () => {}, submit: async () => null };
vi.mock('@/components/panel/usePanelActions', () => ({
  useSupplierPaymentSubmit: () => idle,
  usePurchaseSubmit: () => ({ ...idle, lineErrors: new Map(), paidError: null, clearLineError: () => {} }),
  useLedgerNoteSubmit: () => idle,
}));

const { PanelWorkspace } = await import('@/components/panel/PanelWorkspace');

const DATA = { customers: [], walkin: null, products: CATALOG, sales: [], payments: [], reversals: [], drafts: [], draftsError: null, saleLines: [], stock: null };

const LIST = [
  'Chirmoq 10x13 000',
  'Yurak 5x15.000',
  'Momiq 20x9000',
  'Joynamoz Turk 3x13000',
  'Joynamoz Eron 2x15000',
  'Tasbeh 10x5000',
  "Qur'on 1x45000",
  'Atir 4x20000',
  "Do'ppi 6x30000",
  "Ro'mol 8x25000",
].join('\n');

afterEach(cleanup);
beforeEach(() => {
  // F2: panel savati localStorage'da; har test bo'sh savatdan boshlansin
  localStorage.clear();
  toasts.length = 0;
  saleSubmit.mockReset();
});

function paste(box: HTMLElement, text: string) {
  // Haqiqiy brauzerdagi kabi: paste hodisasi clipboardData bilan
  fireEvent.paste(box, { clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') } });
}

describe('Panel: ro‘yxatni joylash (Savdo)', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams('amal=savdo');
  });

  it('10 qator → 10 karta; katalogda yo‘qlari sariq; oyna bo‘sh; Tasdiqlash yopiq', async () => {
    render(<PanelWorkspace data={DATA} />);
    const box = screen.getByRole('combobox');
    paste(box, LIST);
    const cards = await screen.findAllByTestId('sale-line');
    expect(cards).toHaveLength(10);
    expect(cards.map((c) => c.getAttribute('data-paste-status'))).toEqual(['aniq', 'aniq', 'aniq', 'aniq', 'aniq', 'noaniq', 'aniq', 'noaniq', 'noaniq', 'noaniq']);
    // Kesilish yo'q: 7-qator narxi 45 000 (eski xatoda 4 500 bo'lardi)
    expect(within(cards[6]!).getByTestId('line-total').textContent?.replace(/\s/g, ' ')).toContain('45 000');
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Tasdiqlash' })).toHaveProperty('disabled', true);
    expect(toasts).toEqual([{ kind: 'info', m: "Ro'yxatdan 10 ta qator qo'shildi: 6 ta aniq, 4 ta tekshirish kerak." }]);
    // Takliflar paneli joylashdan keyin ochilmaydi (#53/#54 bilan to'qnashuv yo'q)
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('yangi tovarlar tasdiqlangach Tasdiqlash ochiladi; jami to‘g‘ri', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste(screen.getByRole('combobox'), LIST);
    for (const b of await screen.findAllByRole('button', { name: /Yangi tovar sifatida/ })) await user.click(b);
    expect(screen.getAllByTestId('sale-line').map((c) => c.getAttribute('data-paste-status'))).toEqual(Array(10).fill('aniq'));
    const confirm = screen.getByRole('button', { name: 'Tasdiqlash' });
    expect(confirm).toHaveProperty('disabled', false);
    // 130000+75000+180000+39000+30000+50000+45000+80000+180000+200000
    expect(screen.getByTestId('panel-main').textContent?.replace(/\s/g, ' ')).toContain('1 009 000');
  });

  it('namuna 385 000', async () => {
    render(<PanelWorkspace data={DATA} />);
    paste(screen.getByRole('combobox'), 'Chirmoq 10x13 000\nYurak 5x15.000\nMomiq 20x9000');
    expect(await screen.findAllByTestId('sale-line')).toHaveLength(3);
    expect(screen.getByTestId('panel-main').textContent?.replace(/\s/g, ' ')).toContain('385 000');
    expect(screen.getByRole('button', { name: 'Tasdiqlash' })).toHaveProperty('disabled', false);
  });

  it('variantlardan tanlash: "Joynamoz 3" → ikki variant, bosilgach aniq', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste(screen.getByRole('combobox'), 'Joynamoz 3\nChirmoq 1');
    const [first] = await screen.findAllByTestId('sale-line');
    expect(first!.getAttribute('data-paste-status')).toBe('noaniq');
    await user.click(within(first!).getByRole('button', { name: /Joynamoz Eron/ }));
    const [after] = screen.getAllByTestId('sale-line');
    expect(after!.getAttribute('data-paste-status')).toBe('aniq');
    expect(after!.textContent).toContain('Joynamoz Eron');
  });

  it('bitta qatorli joylash odatdagidek oynaga yoziladi (ro‘yxat emas)', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    const box = screen.getByRole('combobox');
    await user.click(box);
    await user.paste('Chirmoq');
    expect((box as HTMLTextAreaElement).value).toBe('Chirmoq');
    expect(screen.queryAllByTestId('sale-line')).toHaveLength(0);
  });

  it('zaxira yo‘l: klaviatura paste hodisasisiz yangi qatorli matn kiritsa ham ro‘yxat bo‘ladi', async () => {
    render(<PanelWorkspace data={DATA} />);
    const box = screen.getByRole('combobox');
    act(() => {
      fireEvent.change(box, { target: { value: 'Chirmoq 2\nYurak 3' } });
    });
    expect(await screen.findAllByTestId('sale-line')).toHaveLength(2);
  });
});

describe('Panel: To‘lov amalida ko‘p qatorli joylash ro‘yxat bo‘lmaydi', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams('amal=tolov');
  });
  it('paste hodisasi to‘xtatilmaydi, karta yo‘q; yangi qatorli kiritish bitta qatorga aylanadi', () => {
    render(<PanelWorkspace data={DATA} />);
    const box = screen.getByRole('combobox') as HTMLTextAreaElement;
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.assign(ev, { clipboardData: { getData: () => '5 000\n6 000' } });
    act(() => {
      box.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    act(() => {
      fireEvent.change(box, { target: { value: '5 000\n6 000' } });
    });
    expect(box.value).toBe('5 000 6 000');
    expect(screen.queryAllByTestId('sale-line')).toHaveLength(0);
    expect(toasts).toEqual([]);
  });
});

describe('Panel: ro‘yxatni joylash (Kirim)', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams('amal=kirim&kimga=aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('10 qator → 10 kirim qatori; yangilari birlik bilan (do‘konda bitta birlik), tasdiqlash qulfi', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste(screen.getByRole('combobox'), LIST);
    const rows = await screen.findAllByTestId('purchase-line');
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.getAttribute('data-paste-status'))).toEqual(['aniq', 'aniq', 'aniq', 'aniq', 'aniq', 'noaniq', 'aniq', 'noaniq', 'noaniq', 'noaniq']);
    const confirm = screen.getByTestId('purchase-confirm');
    expect(confirm).toHaveProperty('disabled', true);
    for (const b of screen.getAllByRole('button', { name: /Yangi tovar sifatida/ })) await user.click(b);
    expect(screen.getByTestId('purchase-confirm')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('purchase-view').textContent?.replace(/\s/g, ' ')).toContain('1 009 000');
  });

  it('kirimda "Chirmoq 13" (narxsiz bitta son) — xato', async () => {
    render(<PanelWorkspace data={DATA} />);
    paste(screen.getByRole('combobox'), 'Chirmoq 13\nYurak 5x15000');
    const rows = await screen.findAllByTestId('purchase-line');
    expect(rows.map((r) => r.getAttribute('data-paste-status'))).toEqual(['xato', 'aniq']);
  });
});

describe('Kiritish oynasi: bitta qatorli yozuv chegarasi saqlangan', () => {
  it('120 belgidan uzun bitta qator kesiladi (avvalgi maxLength xatti-harakati)', async () => {
    const { SaleComposer } = await import('@/components/sale/SaleComposer');
    function H() {
      const [v, setV] = useState('');
      return <SaleComposer value={v} onChange={setV} panelOpen={false} panelId="p" onSubmit={() => {}} onFocusPanel={() => {}} onEscape={() => {}} plus={null} action={null} who={null} />;
    }
    render(<H />);
    const box = screen.getByRole('combobox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'a'.repeat(200) } });
    expect(box.value).toHaveLength(120);
    // onPasteText berilmagan: yangi qator bo'shliqqa almashadi (avvalgidek)
    fireEvent.change(box, { target: { value: 'a\nb' } });
    expect(box.value).toBe('a b');
  });
});
