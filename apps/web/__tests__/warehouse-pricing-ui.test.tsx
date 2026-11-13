// @vitest-environment jsdom
/**
 * Ombor sahifasi (narxlar markazi): sozlamalarga qarab ustunlar, narx yozish ("70 000" telefon xatosi takrorlanmasin),
 * ustama taklifi (qo'lda narxni o'zgartirmaydi), tan narx > sotuv narxi ogohlantirishi, sozlamalar paneli.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockTab } from '@/components/warehouse/StockTab';
import { WarehouseSettingsView } from '@/components/warehouse/WarehouseSettings';
import type { BooksData, StockItem } from '@/lib/data/books';
import { DEFAULT_PRICING, type PricingSettings } from '@/lib/shopPricing';

const updateProductPrices = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const reload = vi.fn(async () => {});
let pricing: PricingSettings = DEFAULT_PRICING;

vi.mock('@/lib/data/api', () => ({
  updateProductPrices: (...a: unknown[]) => updateProductPrices(...a),
  saveShopSettings: vi.fn(async () => {}),
}));
vi.mock('@/lib/data/purchases', () => ({ adjustStock: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));
vi.mock('@/components/layout/pageQuery', () => ({ usePageQuery: () => ['', vi.fn()] }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/components/ShopDataProvider', () => ({
  useShop: () => ({
    shopId: 'shop1',
    reload,
    pricing,
    membership: { role: 'owner', shop: { id: 'shop1', name: 'D', settings: {} } },
    setMembership: vi.fn(),
  }),
}));

const item = (extra: Partial<StockItem> = {}): StockItem => ({
  product_id: 'p1', name: 'Chirmoq', unit: 'dona', is_active: true, qty_milli: 20_000n, cost_price: 9_000n, sale_price: 13_000n, wholesale_price: null, wholesale_min_qty_milli: null, ...extra,
});
const books = (...items: StockItem[]): BooksData => ({ suppliers: [], purchases: [], lines: [], payments: [], stock: items });

beforeEach(() => {
  updateProductPrices.mockClear();
  reload.mockClear();
  pricing = DEFAULT_PRICING;
});
afterEach(cleanup);

const renderTab = (...items: StockItem[]) => render(<StockTab books={books(...items)} loading={false} reload={async () => {}} />);

describe('Ombor sozlamalariga qarab ustunlar', () => {
  it("default (qoldiq hisobi yoqiq, optom o'chiq): qoldiq bor, optom maydonlari UMUMAN yo'q", () => {
    renderTab(item());
    expect(screen.getByLabelText('Qoldiq: Chirmoq: tuzatish')).toBeTruthy();
    expect(screen.getByText(/Kam qolgan/)).toBeTruthy();
    expect(screen.queryByText(/Optom narx/i, { selector: 'span.text-right' })).toBeNull();
    expect(screen.queryByLabelText(/Optom narx kiriting/)).toBeNull();
    expect(screen.getByLabelText('Tan narx: tuzatish')).toBeTruthy();
    expect(screen.getByLabelText('Sotuv narxi: tuzatish')).toBeTruthy();
  });

  it("Baza o'chiq: soni, «Kam qoldi», «Manfiy», qoldiq tuzatish yo'q", () => {
    pricing = { ...DEFAULT_PRICING, stockEnabled: false };
    renderTab(item({ qty_milli: 1_000n }), item({ product_id: 'p2', name: 'Manfiy tovar', qty_milli: -5_000n }));
    expect(screen.queryByLabelText(/Qoldiq: .*tuzatish/)).toBeNull();
    expect(screen.queryByText('Kam qoldi')).toBeNull();
    expect(screen.queryByText('Manfiy')).toBeNull();
    expect(screen.queryByText(/Kam qolgan \(/)).toBeNull();
    expect(screen.queryByText(/Manfiy qoldiq/)).toBeNull();
    expect(screen.queryByText(/qoldig'i manfiy/)).toBeNull();
    expect(screen.getByText(/Narxi yo'q/)).toBeTruthy();
  });

  it("Optom/dona yoqiq: optom narx va boshlanadigan miqdor ko'rinadi", () => {
    pricing = { ...DEFAULT_PRICING, wholesaleEnabled: true };
    renderTab(item({ wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n }), item({ product_id: 'p2', name: 'Boshqa' }));
    expect(screen.getByLabelText('Optom narx: tuzatish')).toBeTruthy();
    expect(screen.getByText(/10 dona dan/)).toBeTruthy();
    expect(screen.getByLabelText('Optom narx kiriting: Boshqa')).toBeTruthy();
  });
});

describe('Narx yozish', () => {
  it("«narx kiriting» bosiladi; birinchi raqamdan keyin maydon yopilmaydi; 70 000 yoziladi va saqlanadi", async () => {
    const user = userEvent.setup();
    renderTab(item({ sale_price: null }));
    await user.click(screen.getByLabelText('Narx kiriting: Chirmoq'));
    const input = screen.getByLabelText('Sotuv narxi') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('7');
    const still = screen.getByLabelText('Sotuv narxi') as HTMLInputElement;
    expect(still).toBe(document.activeElement);
    await user.keyboard('0000');
    expect((screen.getByLabelText('Sotuv narxi') as HTMLInputElement).value).toBe('70 000');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalledTimes(1));
    expect(updateProductPrices.mock.calls[0]![2]).toBe('p1');
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ sale_price: 70_000n });
    expect(reload).toHaveBeenCalled();
  });

  it("tan narx kiritiladi: faqat cost_price yoziladi (sotuv narxiga tegilmaydi)", async () => {
    const user = userEvent.setup();
    renderTab(item({ cost_price: null }));
    await user.click(screen.getByLabelText('Tan narx kiriting: Chirmoq'));
    await user.keyboard('9500{Enter}');
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ cost_price: 9_500n });
  });

  it("noto'g'ri narx (harf/nol) saqlanmaydi, xato ko'rinadi", async () => {
    const user = userEvent.setup();
    renderTab(item({ sale_price: null }));
    await user.click(screen.getByLabelText('Narx kiriting: Chirmoq'));
    await user.keyboard('0{Enter}');
    expect(updateProductPrices).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it("tan narx sotuv narxidan baland: ogohlantirish, lekin saqlash mumkin", async () => {
    const user = userEvent.setup();
    renderTab(item({ cost_price: 15_000n, sale_price: 13_000n }));
    expect(screen.getByText(/zarar bilan sotiladi/)).toBeTruthy();
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    await user.click(screen.getByLabelText('Sotuv narxi'));
    await user.keyboard('{Control>}a{/Control}16000');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ sale_price: 16_000n });
  });

  it("optom: faqat narx yozilsa (miqdorsiz) saqlanmaydi, xato ko'rinadi", async () => {
    pricing = { ...DEFAULT_PRICING, wholesaleEnabled: true };
    const user = userEvent.setup();
    renderTab(item());
    await user.click(screen.getByLabelText('Optom narx kiriting: Chirmoq'));
    await user.click(screen.getByLabelText('Optom narx'));
    await user.keyboard('12000');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    expect(updateProductPrices).not.toHaveBeenCalled();
    expect(await screen.findByText(/ikkalasini to'ldiring/)).toBeTruthy();
  });

  it("tan narxi YO'Q tovarga optom narx + miqdor saqlanadi (yolg'on 0 kerak emas)", async () => {
    pricing = { ...DEFAULT_PRICING, wholesaleEnabled: true };
    const user = userEvent.setup();
    renderTab(item({ cost_price: null }));
    await user.click(screen.getByLabelText('Optom narx kiriting: Chirmoq'));
    await user.click(screen.getByLabelText('Optom narx'));
    await user.keyboard('12000');
    await user.click(screen.getByLabelText('Optom boshlanadigan miqdor'));
    await user.keyboard('10');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n });
  });

  it("tan va sotuv narxi bo'sh tovarda faqat tan narx yozilsa, sotuv narxi tegilmaydi", async () => {
    const user = userEvent.setup();
    renderTab(item({ cost_price: null, sale_price: null }));
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    await user.click(screen.getByLabelText('Tan narx'));
    await user.keyboard('9000');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ cost_price: 9_000n });
  });

  it("mavjud tan narxni bo'shatib bo'lmaydi: saqlanmaydi, xato ko'rinadi", async () => {
    const user = userEvent.setup();
    renderTab(item());
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    await user.click(screen.getByLabelText('Tan narx'));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    expect(updateProductPrices).not.toHaveBeenCalled();
    expect(await screen.findByText(/Tan narxni bo'sh qoldirib bo'lmaydi/)).toBeTruthy();
  });

  it("mavjud sotuv narxini bo'shatib bo'lmaydi", async () => {
    const user = userEvent.setup();
    renderTab(item());
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    await user.click(screen.getByLabelText('Sotuv narxi'));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    expect(updateProductPrices).not.toHaveBeenCalled();
    expect(await screen.findByText(/bo'sh qoldirib bo'lmaydi/)).toBeTruthy();
  });

  it("optom narx va miqdor birga yoziladi", async () => {
    pricing = { ...DEFAULT_PRICING, wholesaleEnabled: true };
    const user = userEvent.setup();
    renderTab(item());
    await user.click(screen.getByLabelText('Optom narx kiriting: Chirmoq'));
    await user.click(screen.getByLabelText('Optom narx'));
    await user.keyboard('12000');
    await user.click(screen.getByLabelText('Optom boshlanadigan miqdor'));
    await user.keyboard('10');
    await user.click(screen.getByLabelText('Chirmoq narxi: saqlash'));
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n });
  });
});

describe('Ustama taklifi', () => {
  it("«narx kiriting» bosilsa taklif maydonga TAKLIF sifatida yoziladi; o'zi saqlanmaydi, Enter qabul qiladi", async () => {
    pricing = { ...DEFAULT_PRICING, markupPercent: 20 };
    const user = userEvent.setup();
    renderTab(item({ sale_price: null, cost_price: 9_000n }));
    await user.click(screen.getByLabelText('Narx kiriting: Chirmoq'));
    expect((screen.getByLabelText('Sotuv narxi') as HTMLInputElement).value).toBe('10 800');
    expect(screen.getByText(/20% bo'yicha taklif qilindi/)).toBeTruthy();
    expect(updateProductPrices).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ sale_price: 10_800n });
  });

  it("taklifni o'zgartirish mumkin (qo'lda narx ustun)", async () => {
    pricing = { ...DEFAULT_PRICING, markupPercent: 20 };
    const user = userEvent.setup();
    renderTab(item({ sale_price: null, cost_price: 9_000n }));
    await user.click(screen.getByLabelText('Narx kiriting: Chirmoq'));
    await user.keyboard('{Control>}a{/Control}12000{Enter}');
    await waitFor(() => expect(updateProductPrices).toHaveBeenCalled());
    expect(updateProductPrices.mock.calls[0]![3]).toEqual({ sale_price: 12_000n });
  });

  it("qator rejimida tan narx yozilganda taklif tugmasi chiqadi va bosish maydonni to'ldiradi (blur tahrirni yopmaydi)", async () => {
    pricing = { ...DEFAULT_PRICING, markupPercent: 20 };
    const user = userEvent.setup();
    renderTab(item({ sale_price: null, cost_price: null }));
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    await user.click(screen.getByLabelText('Tan narx'));
    await user.keyboard('9000');
    expect(within(screen.getByTestId('price-notes')).getByText(/10 800/)).toBeTruthy();
    await user.click(screen.getByLabelText("Taklif narxni qo'llash"));
    expect((screen.getByLabelText('Sotuv narxi') as HTMLInputElement).value).toBe('10 800');
    expect(updateProductPrices).not.toHaveBeenCalled();
  });

  it("sotuv narxi QO'LDA kiritilgan tovarda taklif umuman chiqmaydi", async () => {
    pricing = { ...DEFAULT_PRICING, markupPercent: 20 };
    const user = userEvent.setup();
    renderTab(item({ sale_price: 13_000n, cost_price: 9_000n }));
    await user.click(screen.getByLabelText('Chirmoq narxini tuzatish'));
    expect(screen.queryByText(/bo'yicha taklif/)).toBeNull();
    expect((screen.getByLabelText('Sotuv narxi') as HTMLInputElement).value).toBe('13 000');
  });

  it("ustama yo'q bo'lsa taklif yo'q", async () => {
    const user = userEvent.setup();
    renderTab(item({ sale_price: null, cost_price: 9_000n }));
    await user.click(screen.getByLabelText('Narx kiriting: Chirmoq'));
    expect(screen.queryByText(/bo'yicha taklif/)).toBeNull();
  });
});

describe('WarehouseSettingsView', () => {
  it("uch sozlama ko'rinadi; tugma bosilsa saqlaydi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => {});
    render(<WarehouseSettingsView value={DEFAULT_PRICING} canEdit onChange={onChange} />);
    const wholesale = screen.getByRole('switch', { name: 'Optom/dona' });
    const stock = screen.getByRole('switch', { name: 'Baza (qoldiq hisobi)' });
    expect(wholesale.getAttribute('aria-checked')).toBe('false');
    expect(stock.getAttribute('aria-checked')).toBe('true');
    await user.click(wholesale);
    expect(onChange).toHaveBeenLastCalledWith({ wholesaleEnabled: true });
    await user.click(stock);
    expect(onChange).toHaveBeenLastCalledWith({ stockEnabled: false });
  });

  it("ustama: «Saqlash» faqat o'zgarganda; noto'g'ri qiymat xato beradi; bo'sh = yo'q", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => {});
    render(<WarehouseSettingsView value={{ ...DEFAULT_PRICING, markupPercent: 20 }} canEdit onChange={onChange} />);
    const input = screen.getByLabelText('Umumiy ustama foizi') as HTMLInputElement;
    expect(input.value).toBe('20');
    expect(screen.queryByLabelText('Ustamani saqlash')).toBeNull();
    await user.clear(input);
    await user.type(input, '25');
    await user.click(screen.getByLabelText('Ustamani saqlash'));
    expect(onChange).toHaveBeenLastCalledWith({ markupPercent: 25 });
    await user.clear(input);
    await user.type(input, '5000');
    await user.click(screen.getByLabelText('Ustamani saqlash'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.clear(input);
    await user.click(screen.getByLabelText('Ustamani saqlash'));
    expect(onChange).toHaveBeenLastCalledWith({ markupPercent: null });
  });

  it("egasi bo'lmagan foydalanuvchi o'zgartira olmaydi", () => {
    render(<WarehouseSettingsView value={DEFAULT_PRICING} canEdit={false} onChange={vi.fn(async () => {})} />);
    expect((screen.getByRole('switch', { name: 'Optom/dona' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/faqat do'kon egasi/)).toBeTruthy();
  });

  it("saqlash xatosi ko'rinadi", async () => {
    const user = userEvent.setup();
    render(<WarehouseSettingsView value={DEFAULT_PRICING} canEdit onChange={async () => { throw new Error('Server rad etdi'); }} />);
    await user.click(screen.getByRole('switch', { name: 'Optom/dona' }));
    expect(await screen.findByText('Server rad etdi')).toBeTruthy();
  });
});
