// @vitest-environment jsdom
/**
 * W5: panel kirimi (`usePurchaseSubmit`). Yangi tovar faqat TO'LIQ tekshiruvdan keyin, tanlangan birlik bilan
 * yaratiladi; reja xato bo'lsa `createProduct` umuman chaqirilmaydi; qayta urinishda takror yaratilmaydi.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, Unit } from '@/lib/data/types';
import type { PurchaseDraftLine } from '@/lib/purchaseForm';

const createProduct = vi.fn();
const postPurchase = vi.fn();
const updateProduct = vi.fn();
const reload = vi.fn(async () => {});

vi.mock('@/components/ShopDataProvider', () => ({ useShop: () => ({ shopId: 'shop1', reload }) }));
vi.mock('@/components/ledger/CustomerLedger', () => ({ QUICK_SALE_LINE: 'Tez savdo' }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/data/api', () => ({ createProduct: (...a: unknown[]) => createProduct(...a), updateProduct: (...a: unknown[]) => updateProduct(...a), postSale: vi.fn(), recordPayment: vi.fn() }));
vi.mock('@/lib/data/purchases', () => ({ postPurchase: (...a: unknown[]) => postPurchase(...a), postSupplierOpeningBalance: vi.fn() }));
vi.mock('@/lib/data/supplierPayments', () => ({ recordSupplierPayment: vi.fn() }));

const { usePurchaseSubmit } = await import('@/components/panel/usePanelActions');

const P = (id: string, name: string, unit: Unit = 'dona'): Product => ({ id, name, unit, last_price: null, is_active: true, source: 'app', created_at: '', updated_at: '' });
const CAT = [P('un', 'Un', 'kg'), P('yog', "Yog'", 'litr')];
const L = (key: string, name: string, qty: string, unitCost: string, unit: Unit | null, productId: string | null = null): PurchaseDraftLine => ({ key, productId, productName: name, unit, qty, unitCost });

function setup(lines: PurchaseDraftLine[], paid = '', products: Product[] = CAT) {
  return renderHook(() => usePurchaseSubmit({ supplierId: 's1', lines, products, balanceBefore: 0n, paid, method: 'naqd', reloadBooks: async () => {} }));
}

let seq = 0;
beforeEach(() => {
  seq = 0;
  createProduct.mockReset();
  postPurchase.mockReset();
  updateProduct.mockReset();
  updateProduct.mockResolvedValue({});
  createProduct.mockImplementation(async (_sb: unknown, _shop: string, input: { name: string; unit: Unit }) => P(`new-${++seq}`, input.name, input.unit));
  postPurchase.mockResolvedValue(undefined);
});

describe('usePurchaseSubmit: tekshiruvdan oldin hech narsa yaratilmaydi', () => {
  it("berilgan summa jamidan ko'p bo'lsa createProduct chaqirilmaydi", async () => {
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg')], '120 001');
    let done: unknown;
    await act(async () => {
      done = await result.current.submit();
    });
    expect(done).toBeNull();
    expect(createProduct).not.toHaveBeenCalled();
    expect(postPurchase).not.toHaveBeenCalled();
    expect(result.current.paidError).toMatch(/ko'p bo'lishi mumkin emas/);
  });

  it("boshqa qatorda xato (noto'g'ri narx) bo'lsa yangi tovar yaratilmaydi", async () => {
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg'), L('b', 'Un', '5', 'abc', 'kg', 'un')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).not.toHaveBeenCalled();
    expect(postPurchase).not.toHaveBeenCalled();
    expect(result.current.lineErrors.get('b')?.cost).toBeTruthy();
  });

  it("yangi tovarning o'zida xato (miqdor 0) bo'lsa ham yaratilmaydi", async () => {
    const { result } = setup([L('a', 'Shakar', '0', '12 000', 'kg')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).not.toHaveBeenCalled();
    expect(result.current.lineErrors.get('a')?.qty).toBeTruthy();
  });
});

describe('usePurchaseSubmit: birlik', () => {
  it('yangi tovar tanlangan birlik (kg) bilan yaratiladi va kirimga shu id bilan ketadi', async () => {
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg'), L('b', 'Un', '5', '8 000', 'kg', 'un')], '50 000');
    let done: { subtotal: bigint; balanceAfter: bigint } | null = null;
    await act(async () => {
      done = await result.current.submit();
    });
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(createProduct.mock.calls[0]![2]).toEqual({ name: 'Shakar', unit: 'kg', last_price: null, is_active: true });
    const args = postPurchase.mock.calls[0]![1] as { lines: { product_id: string; qty_milli: bigint; unit_cost: bigint }[]; clientTotal: bigint };
    expect(args.lines).toEqual([
      { product_id: 'new-1', qty_milli: 10_000n, unit_cost: 12_000n },
      { product_id: 'un', qty_milli: 5_000n, unit_cost: 8_000n },
    ]);
    expect(args.clientTotal).toBe(160_000n);
    expect(done!.balanceAfter).toBe(110_000n);
  });

  it("katalogdagi nom boshqa birlik bilan yozilsa xato, takror tovar yaratilmaydi", async () => {
    const { result } = setup([L('a', 'un', '10', '8 000', 'dona')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).not.toHaveBeenCalled();
    expect(postPurchase).not.toHaveBeenCalled();
    expect(result.current.lineErrors.get('a')?.unit).toBe('«Un» katalogda kg birlikda bor');
  });

  it('katalogdagi nom bir xil birlik bilan yozilsa mavjud tovar ishlatiladi', async () => {
    const { result } = setup([L('a', ' UN ', '10', '8 000', 'kg')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).not.toHaveBeenCalled();
    expect((postPurchase.mock.calls[0]![1] as { lines: { product_id: string }[] }).lines[0]!.product_id).toBe('un');
  });
});

describe('PurchaseView: birlik ko‘rinishi', () => {
  it('katalog tovarida birlik matn (o‘zgarmaydi), yangi nomda tanlov; tan narx yorlig‘i birlikka mos', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PurchaseView } = await import('@/components/panel/PurchaseView');
    const lines = [L('a', 'Un', '5', '8 000', 'kg', 'un'), L('b', 'Shakar', '1', '', null)];
    const html = renderToStaticMarkup(
      <PurchaseView
        supplierName="Ali"
        lines={lines}
        onLine={() => {}}
        onRemove={() => {}}
        balanceBefore={0n}
        paid=""
        onPaid={() => {}}
        paidError={null}
        lineErrors={new Map()}
        isNew={(l) => l.productId === null}
        unitOf={(l) => (l.productId ? 'kg' : l.unit)}
        units={['dona', 'kg']}
        error={null}
        locked={false}
        busy={false}
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Tan narx (1 kg): Un"');
    expect(html).toContain('aria-label="Tan narx (1 birlik): Shakar"');
    expect(html).toContain('aria-label="Birlik: Shakar"');
    expect(html).not.toContain('aria-label="Birlik: Un"');
    expect(html).toContain('Yangi tovar birligini tanlang');
    expect(html).not.toContain('1 dona');
  });
});

describe('usePurchaseSubmit: qayta urinish', () => {
  it('tovar yaratilgach kirim tarmoq xatosi bilan tushsa, qayta urinishda tovar takror yaratilmaydi', async () => {
    postPurchase.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg'), L('b', 'shakar', '2', '12 000', 'kg')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.locked).toBe(true);
    expect(createProduct).toHaveBeenCalledTimes(1); // bir kirimda bir xil nom ikki qatorda: bitta tovar
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(postPurchase).toHaveBeenCalledTimes(2);
    const first = postPurchase.mock.calls[0]![1] as { purchaseId: string; lines: { product_id: string }[] };
    const second = postPurchase.mock.calls[1]![1] as { purchaseId: string; lines: { product_id: string }[] };
    expect(second.purchaseId).toBe(first.purchaseId);
    expect(second.lines.map((l) => l.product_id)).toEqual(['new-1', 'new-1']);
  });
});

describe('K4: rad etilgan kirimdan keyin yangi tovar yetim qolmaydi', () => {
  it('server rad etsa (validation) — shu urinishda yaratilgan tovar arxivlanadi', async () => {
    postPurchase.mockRejectedValue({ code: '22000', message: 'calc_mismatch: server=1, client=2' });
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(updateProduct).toHaveBeenCalledWith(expect.anything(), 'shop1', 'new-1', expect.objectContaining({ name: 'Shakar', is_active: false }));
    expect(result.current.locked).toBe(false);
  });

  it('tarmoq xatosi — tovar qoladi (kirim saqlangan bo‘lishi mumkin), qayta urinish uni qayta ishlatadi', async () => {
    postPurchase.mockRejectedValueOnce({ message: 'Failed to fetch' });
    const { result } = setup([L('a', 'Shakar', '10', '12 000', 'kg')]);
    await act(async () => {
      await result.current.submit();
    });
    expect(updateProduct).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(createProduct).toHaveBeenCalledTimes(1);
  });
});
