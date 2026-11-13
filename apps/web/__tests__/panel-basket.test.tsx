// @vitest-environment jsdom
/**
 * F2 integratsiya: panel savati (mahalliy rejim — test muhitida Supabase yo'q, 015 yo'q serverdagi kabi).
 * Qabul mezoni: ikki mijozga savdo ochiq turganda sahifalar orasida yurib qaytsa ham ikkalasi saqlanadi; sahifa
 * yangilansa ham yo'qolmaydi; tasdiqlangan savdodan keyin savat yopiladi; boshqa qurilma (tab) o'zgartirsa ustiga
 * yozilmaydi. Server, Supabase va submit hooklari almashtirilgan: hech narsa jurnalga yozilmaydi.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/data/types';

const nav = vi.hoisted(() => ({ params: new URLSearchParams('amal=savdo'), pushed: [] as string[] }));
const toasts = vi.hoisted(() => [] as { kind: string; m: string }[]);
const salePhase = vi.hoisted(() => ({ value: { kind: 'editing' } as { kind: string; done?: unknown } }));

vi.mock('next/navigation', () => ({
  // Haqiqiy routerdagi kabi: push URL'ni (va keyingi renderdagi useSearchParams ni) yangilaydi
  useRouter: () => ({ push: (u: string) => (nav.pushed.push(u), (nav.params = new URLSearchParams(u.split('?')[1] ?? ''))), replace: vi.fn() }),
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: (m: string) => toasts.push({ kind: 'success', m }), info: (m: string) => toasts.push({ kind: 'info', m }), error: (m: string) => toasts.push({ kind: 'error', m }) }),
}));

const P = (id: string, name: string, price: number | null): Product => ({
  id, name, unit: 'dona', last_price: price === null ? null : BigInt(price), is_active: true, source: 'app', created_at: '2026-01-01', updated_at: '',
});
const CATALOG = [P('c1', 'Chirmoq', 13000), P('y1', 'Yurak', 15000), P('m1', 'Momiq', 9000)];
const SHOP = 'aaaaaaaa-0000-0000-0000-0000000000aa';
const ALI = 'aaaaaaaa-0000-0000-0000-0000000000c1';

vi.mock('@/components/ShopDataProvider', () => ({
  useShop: () => ({
    balances: new Map(),
    customerById: new Map([[ALI, { id: ALI, name: 'Ali aka', kind: 'regular', is_active: true }]]),
    membership: { shop: { settings: { units: ['dona'] }, name: 'Test' }, role: 'owner' },
    shopId: SHOP,
  }),
}));
vi.mock('@/components/useBooks', () => ({ useBooks: () => ({ data: { suppliers: [], stock: [] }, reload: async () => {} }) }));
vi.mock('@/lib/data/books', () => ({ supplierTotals: () => new Map() }));
const saleKeys = vi.hoisted(() => [] as unknown[]);
vi.mock('@/components/sale/useSaleSubmit', () => ({
  useSaleSubmit: (input: { keys?: unknown }) => {
    saleKeys.push(input.keys);
    return { phase: salePhase.value, locked: false, frozen: false, busy: false, formError: null, paidError: null, currentDebt: 0n, submit: async () => {}, reset: () => {}, clearErrors: () => {} };
  },
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
vi.mock('@/components/customers/CustomerFormModal', () => ({ CustomerFormModal: () => null }));

const { PanelWorkspace } = await import('@/components/panel/PanelWorkspace');
const DATA = { customers: [{ id: ALI, name: 'Ali aka', kind: 'regular', is_active: true }], walkin: null, products: CATALOG, sales: [], payments: [], reversals: [], drafts: [], draftsError: null, saleLines: [], stock: null } as never;
const STORE_KEY = `hisobchi:savat:${SHOP}`;

function paste(text: string) {
  fireEvent.paste(screen.getByRole('combobox'), { clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') } });
}
const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as { id: string; partnerId: string | null; lines: { productName: string }[]; version: number }[];
const names = () => screen.queryAllByTestId('sale-line').map((c) => c.querySelector('p')?.textContent?.replace(/^(Aniq|Noaniq|Xato)/, ''));

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  nav.pushed.length = 0;
  saleKeys.length = 0;
  salePhase.value = { kind: 'editing' };
  nav.params = new URLSearchParams('amal=savdo');
});

describe('Panel savati (F2)', () => {
  it('qatorlar savatga avtomatik saqlanadi; panel qayta ochilsa (boshqa bo‘limdan qaytish / yangilash) joyida', async () => {
    const first = render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 10x13000\nYurak 5x15000');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    expect(stored()[0]!.lines.map((l) => l.productName)).toEqual(['Chirmoq', 'Yurak']);
    first.unmount();
    render(<PanelWorkspace data={DATA} />);
    await waitFor(() => expect(names()).toEqual(['Chirmoq', 'Yurak']));
    expect(screen.getByTestId('basket-chips').textContent).toContain('Mijozsiz');
  });

  it('savdo kaliti savat id sidan (qayta tasdiqlash takroriy savdo yaratmaydi)', async () => {
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    const id = stored()[0]!.id;
    expect(saleKeys.at(-1)).toEqual({ saleId: id, saleOp: `basket:${id}` });
  });

  it('ikki mijoz: ikkala savat saqlanadi, chip bilan almashiladi', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams(`amal=savdo&kimga=${ALI}`);
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 10x13000\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    expect(stored()[0]!.partnerId).toBe(ALI);
    await user.click(screen.getByTestId('basket-new'));
    expect(names()).toEqual([]);
    paste('Momiq 20x9000\nYurak 2');
    await waitFor(() => expect(stored()).toHaveLength(2), { timeout: 3000 });
    // Ali'ning savati chipda; bosilsa uning qatorlari qaytadi
    const chip = screen.getAllByTestId('basket-chip').find((c) => c.textContent?.includes('Ali aka'));
    expect(chip).toBeTruthy();
    await user.click(chip!);
    await waitFor(() => expect(names()).toEqual(['Chirmoq', 'Yurak']));
    expect(stored().map((b) => b.lines.length).sort()).toEqual([2, 2]);
  });

  it('hamma qator o‘chirilsa savat tashlanadi', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    for (const b of screen.getAllByRole('button', { name: /Qatorni o'chirish/ })) await user.click(b);
    await waitFor(() => expect(stored()).toHaveLength(0), { timeout: 3000 });
  });

  it('boshqa tab savatni o‘zgartirgan: ustiga yozilmaydi, tanlov so‘raladi; «Serverdagini olish»', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    // Boshqa tab: versiya 2, boshqa qatorlar
    const other = stored().map((b) => ({ ...b, version: b.version + 1, lastOpId: 'boshqa', lines: [{ key: 'z', productName: 'Momiq', productId: null, qty: '3', unit: 'dona', price: '9 000' }] }));
    localStorage.setItem(STORE_KEY, JSON.stringify(other.map((b) => ({ ...b, status: 'open' }))));
    paste('Yurak 5\nChirmoq 2');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Serverdagini olish' })).toBeTruthy(), { timeout: 3000 });
    expect(stored()[0]!.lines.map((l) => l.productName)).toEqual(['Momiq']);
    await user.click(screen.getByRole('button', { name: 'Serverdagini olish' }));
    expect(names()).toEqual(['Momiq']);
  });

  it('«Meniki qolsin»: mening qatorlarim yangi versiya bilan yoziladi', async () => {
    const user = userEvent.setup();
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    localStorage.setItem(STORE_KEY, JSON.stringify(stored().map((b) => ({ ...b, version: b.version + 1, lastOpId: 'boshqa', lines: [], status: 'open' }))));
    paste('Momiq 1\nMomiq 2');
    await user.click(await screen.findByRole('button', { name: 'Meniki qolsin' }, { timeout: 3000 }));
    await waitFor(() => expect(stored()[0]!.lines.map((l) => l.productName)).toEqual(['Chirmoq', 'Yurak', 'Momiq', 'Momiq']), { timeout: 3000 });
  });

  it('tasdiqlangan savdo: savat yopiladi (done), boshqa ochiq savat qoladi', async () => {
    const user = userEvent.setup();
    const r = render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    const firstId = stored()[0]!.id;
    await user.click(screen.getByTestId('basket-new'));
    paste('Momiq 1\nMomiq 2');
    await waitFor(() => expect(stored()).toHaveLength(2), { timeout: 3000 });
    const secondId = stored().find((b) => b.id !== firstId)!.id;
    // Joriy (ikkinchi) savat tasdiqlandi
    salePhase.value = { kind: 'done', done: { saleId: secondId, plan: { lines: [], total: 0n, paidNow: 0n, debt: 0n }, customerName: null, debtAfter: null, receipt: '' } };
    r.rerender(<PanelWorkspace data={DATA} />);
    await waitFor(() => expect(stored().map((b) => b.id)).toEqual([firstId]), { timeout: 3000 });
  });

  it('«Savat» bo‘limidan havola (?savat=) o‘sha savatni ochadi', async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify([
      { id: 'b-old', kind: 'sale', partnerId: null, lines: [{ key: 'q', productName: 'Yurak', productId: null, qty: '1', unit: 'dona', price: '15 000' }], version: 1, updatedAt: '2026-11-12T09:00:00Z', sourceDraftId: null, status: 'open', lastOpId: 'x' },
      { id: 'b-new', kind: 'sale', partnerId: null, lines: [{ key: 'w', productName: 'Momiq', productId: null, qty: '1', unit: 'dona', price: '9 000' }], version: 1, updatedAt: '2026-11-12T10:00:00Z', sourceDraftId: null, status: 'open', lastOpId: 'y' },
    ]));
    nav.params = new URLSearchParams('savat=b-old');
    render(<PanelWorkspace data={DATA} />);
    await waitFor(() => expect(names()).toEqual(['Yurak']));
    cleanup();
    // Havolasiz — eng oxirgi o'zgargani
    nav.params = new URLSearchParams('');
    render(<PanelWorkspace data={DATA} />);
    await waitFor(() => expect(names()).toEqual(['Momiq']));
    expect(within(screen.getByTestId('basket-chips')).getAllByTestId('basket-chip')).toHaveLength(2);
  });

  it('jurnalga hech narsa yozilmaydi: savat faqat ish holati (submit chaqirilmaydi)', async () => {
    render(<PanelWorkspace data={DATA} />);
    paste('Chirmoq 1\nYurak 1');
    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 3000 });
    expect(salePhase.value.kind).toBe('editing');
  });
});
