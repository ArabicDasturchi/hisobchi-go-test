// @vitest-environment jsdom
/**
 * Savdo panelida optom narx (S5): miqdor o'zgarganda narx `resolveUnitPrice` bilan yangilanadi, FAQAT narx qo'lda
 * o'zgartirilmagan bo'lsa; qatorda "Optom narx" belgisi; optom o'chiq bo'lsa hech narsa o'zgarmaydi.
 * Telefon xatosi takrorlanmasin: narx maydonida "70 000" to'liq yoziladi.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SaleLineCard } from '@/components/sale/SaleLineCard';
import type { Product } from '@/lib/data/types';
import { lineStatus } from '@/lib/lineStatus';
import { patchSaleLine } from '@/lib/productIdentity';
import { applyProduct } from '@/lib/productPicker';
import { applySelection } from '@/lib/productSearch';
import type { DraftLine } from '@/lib/saleForm';
import { isWholesaleLine, repriceLines } from '@/lib/shopPricing';

afterEach(cleanup);

const prod = (extra: Partial<Product> = {}): Product => ({
  id: 'p1', source: 'app', name: 'Chirmoq', unit: 'dona', last_price: 13_000n, wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n, is_active: true, created_at: '', updated_at: '', ...extra,
});
const base: DraftLine = { key: 'k', productName: '', qty: '', unit: 'dona', price: '' };
const lineOf = (p: Product, qty: string): DraftLine => ({ ...applyProduct(base, p), qty });

describe('repriceLines', () => {
  it("optom yoqiq: chegaradan oldin 13 000, chegarada va keyin 12 000", () => {
    const p = prod();
    const at = (qty: string) => repriceLines([lineOf(p, qty)], [p], true)[0]!.price.replace(/\s/g, '');
    expect(at('9')).toBe('13000');
    expect(at('9,999')).toBe('13000');
    expect(at('10')).toBe('12000');
    expect(at('25')).toBe('12000');
  });

  it("optom O'CHIQ: narx hamisha sotuv narxi", () => {
    const p = prod();
    expect(repriceLines([lineOf(p, '50')], [p], false)[0]!.price.replace(/\s/g, '')).toBe('13000');
  });

  it("qo'lda yozilgan narx (autoPrice=false) HECH QACHON o'zgarmaydi", () => {
    const p = prod();
    const manual: DraftLine = { ...lineOf(p, '50'), price: '11 111', autoPrice: false };
    const out = repriceLines([manual], [p], true);
    expect(out[0]!.price).toBe('11 111');
    expect(out[0]).toBe(manual);
  });

  it("tanlovsiz (erkin matn) va «Qayta yozish» qatorlari (autoPrice yo'q) o'zgarmaydi", () => {
    const p = prod();
    const free: DraftLine = { key: 'f', productName: 'Chirmoq', qty: '50', unit: 'dona', price: '9 999' };
    const resale: DraftLine = { ...free, productId: 'p1' };
    expect(repriceLines([free, resale], [p], true)).toEqual([free, resale]);
  });

  it("miqdor hali yozilmagan/noto'g'ri bo'lsa narx o'zgarmaydi; hech narsa o'zgarmasa o'sha massiv", () => {
    const p = prod();
    const l = lineOf(p, '');
    const lines = [l];
    expect(repriceLines(lines, [p], true)).toBe(lines);
    expect(repriceLines([{ ...l, qty: 'abc' }], [p], true)[0]!.price).toBe(l.price);
  });

  it("tovarda sotuv narxi yo'q: narx bo'sh qoladi (tegilmaydi)", () => {
    const p = prod({ last_price: null, wholesale_price: null, wholesale_min_qty_milli: null });
    const l = lineOf(p, '5');
    expect(repriceLines([l], [p], true)[0]!.price).toBe('');
  });

  it("optom belgisi: yoqiq + avtomatik + chegarada", () => {
    const p = prod();
    expect(isWholesaleLine(lineOf(p, '10'), [p], true)).toBe(true);
    expect(isWholesaleLine(lineOf(p, '9'), [p], true)).toBe(false);
    expect(isWholesaleLine(lineOf(p, '10'), [p], false)).toBe(false);
    expect(isWholesaleLine({ ...lineOf(p, '10'), autoPrice: false }, [p], true)).toBe(false);
  });

  it("tanlash (applySelection) qty 1 bilan qo'shadi; yana tanlansa +1: narx hamon sotuv narxi", () => {
    const p = prod();
    const once = repriceLines(applySelection([], [p]), [p], true);
    expect(once[0]!.price.replace(/\s/g, '')).toBe('13000');
    expect(repriceLines(applySelection(once, [p]), [p], true)[0]!.qty).toBe('2');
  });
});

function Harness({ wholesaleEnabled, product = prod() }: { wholesaleEnabled: boolean; product?: Product }) {
  const [lines, setLines] = useState<DraftLine[]>(() => applySelection([], [product]));
  return (
    <ul>
      {lines.map((l) => (
        <SaleLineCard
          key={l.key}
          line={l}
          status={lineStatus(l, [product])}
          wholesale={isWholesaleLine(l, [product], wholesaleEnabled)}
          onChange={(patch) => setLines((ls) => repriceLines(ls.map((x) => (x.key === l.key ? patchSaleLine(x, patch) : x)), [product], wholesaleEnabled))}
          onRemove={() => {}}
        />
      ))}
    </ul>
  );
}

const unitText = () => screen.getByLabelText(/Narxni o'zgartirish: Chirmoq|Narxni o'zgartirish/).textContent ?? '';
const clearAndType = async (user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) => {
  await user.click(el);
  await user.keyboard('{Control>}a{/Control}' + text);
};

describe('SaleLineCard: miqdor o‘zgarganda optom narx', () => {
  it("10 yozilsa narx 12 000 va «Optom narx» belgisi; 9 yozilsa 13 000, belgi yo'q", async () => {
    const user = userEvent.setup();
    render(<Harness wholesaleEnabled />);
    expect(unitText().replace(/\s/g, '')).toContain('13000');
    expect(screen.queryByTestId('wholesale-badge')).toBeNull();
    await clearAndType(user, screen.getByLabelText(/Soni: Chirmoq|Miqdor: Chirmoq|Soni/), '10');
    expect(unitText().replace(/\s/g, '')).toContain('12000');
    expect(screen.getByTestId('wholesale-badge').textContent).toBe('Optom narx');
    await clearAndType(user, screen.getByLabelText(/Soni: Chirmoq|Miqdor: Chirmoq|Soni/), '9');
    expect(unitText().replace(/\s/g, '')).toContain('13000');
    expect(screen.queryByTestId('wholesale-badge')).toBeNull();
  });

  it("optom o'chiq: miqdor qancha bo'lsa ham narx 13 000, belgi yo'q", async () => {
    const user = userEvent.setup();
    render(<Harness wholesaleEnabled={false} />);
    await clearAndType(user, screen.getByLabelText(/Soni: Chirmoq|Miqdor: Chirmoq|Soni/), '100');
    expect(unitText().replace(/\s/g, '')).toContain('13000');
    expect(screen.queryByTestId('wholesale-badge')).toBeNull();
  });

  it("foydalanuvchi narxni qo'lda yozsa (70 000), keyin miqdor o'zgarsa ham narx 70 000 qoladi", async () => {
    const user = userEvent.setup();
    render(<Harness wholesaleEnabled />);
    await user.click(screen.getByLabelText(/Narxni o'zgartirish/));
    const input = screen.getByLabelText(/Narx: Chirmoq/) as HTMLInputElement;
    await user.keyboard('{Control>}a{/Control}7');
    // birinchi raqamdan keyin maydon yopilmaydi
    expect(screen.getByLabelText(/Narx: Chirmoq/)).toBe(document.activeElement);
    await user.keyboard('0000');
    expect((screen.getByLabelText(/Narx: Chirmoq/) as HTMLInputElement).value.replace(/\s/g, '')).toBe('70000');
    void input;
    await user.tab();
    await clearAndType(user, screen.getByLabelText(/Soni: Chirmoq|Miqdor: Chirmoq|Soni/), '50');
    expect(unitText().replace(/\s/g, '')).toContain('70000');
    expect(screen.queryByTestId('wholesale-badge')).toBeNull();
  });
});
