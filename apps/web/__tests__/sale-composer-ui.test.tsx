import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SaleLineCard } from '@/components/sale/SaleLineCard';
import { SaleSummaryBar } from '@/components/sale/SaleSummaryBar';
import { SuggestionPanel } from '@/components/sale/SuggestionPanel';
import { validatePayment } from '@/components/sale/usePaymentSubmit';
import type { Product } from '@/lib/data/types';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import { applySelection } from '@/lib/productSearch';
import type { DraftLine } from '@/lib/saleForm';

const P = (id: string, name: string, price: number | null): Product => ({
  id, name, unit: 'dona', last_price: price === null ? null : BigInt(price), is_active: true, source: 'app', created_at: '', updated_at: '',
});
const TURK = P('j1', 'Joynamoz Turk', 13000);
const ERON = P('j2', 'Joynamoz Eron', 15000);
const KATTA = P('j3', 'Joynamoz katta', 22000);
const BOLALAR = P('j4', 'Joynamoz bolalar', 9000);
const CHONTAK = P('j5', "Joynamoz cho'ntak", 11000);
const QURON = P('q1', "Qur'on (kichik)", null);
const CATALOG = [TURK, ERON, KATTA, BOLALAR, CHONTAK, QURON];
const nb = (html: string) => html.replace(/ /g, ' ');
const noop = () => {};

const panel = (lines: DraftLine[], selected: string[], newName: string | null = null) =>
  nb(
    renderToStaticMarkup(
      <SuggestionPanel
        id="p" query="joy" items={CATALOG.slice(0, 5)} lines={lines} selected={selected} newName={newName} focusSignal={0}
        onToggle={noop} onBump={noop} onAddSelected={noop} onAddNew={noop} onClose={noop} onReturnFocus={noop}
      />,
    ),
  );

describe('SuggestionPanel', () => {
  const lines = applySelection([], [TURK]).map((l) => ({ ...l, qty: '10' }));

  it('sarlavha, 5 qator, 3 tasi belgilangan: aria-pressed va "3 tasini qo\'shish" yoqilgan', () => {
    const html = panel(lines, ['j2', 'j3', 'j5']);
    expect(html).toContain('&quot;joy&quot; bo&#x27;yicha 5 ta tovar');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1); // bolalar
    expect(html).toContain('3 ta tanlandi');
    expect(html).toMatch(/3 tasini qo&#x27;shish/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>3 tasini/);
  });

  it('ro‘yxatda bor tovar belgilanmaydi: "Ro‘yxatda: 10 ta. Bossangiz +1"', () => {
    const html = panel(lines, []);
    expect(html).toContain('Ro&#x27;yxatda: 10 ta. Bossangiz +1');
    expect(html.match(/aria-pressed/g)).toHaveLength(4); // Turk belgilanuvchi emas
  });

  it('hech narsa tanlanmagan: qo‘shish tugmasi o‘chiq', () => {
    expect(panel([], [])).toMatch(/<button[^>]*disabled=""[^>]*>0 tasini/);
  });

  it('katalogda yo‘q nom: oxirida "yangi tovar sifatida" qatori', () => {
    expect(panel([], [], 'joyxyz')).toContain('«joyxyz» ni yangi tovar sifatida');
  });
});

describe('SaleLineCard', () => {
  const card = (line: DraftLine) =>
    nb(renderToStaticMarkup(<SaleLineCard line={line} status={lineStatus(line, CATALOG)} onChange={noop} onRemove={noop} />));

  it('narxi yo‘q qator sariq: belgi + matn + narx maydoni', () => {
    const l = applySelection([], [QURON])[0]!;
    const html = card(l);
    expect(html).toContain('data-status="yellow"');
    expect(html).toContain('Narxi yo&#x27;q');
    expect(html).toContain('border-amber-400');
    expect(html).toMatch(/aria-label="Narx: /);
    expect(html).toContain('role="status"');
  });

  it('to‘liq qator: "13 000 so‘m / dona" va jami 130 000', () => {
    const html = card({ key: 'a', productName: 'Joynamoz Turk', qty: '10', unit: 'dona', price: '13 000' });
    expect(html).toContain('data-status="ok"');
    expect(html).toContain('13 000 so&#x27;m');
    expect(html).toMatch(/hidden sm:inline"> \/ dona/);
    expect(html).toContain('130 000');
  });

  it('bosiladigan elementlar ≥44px (h-11) va o‘chirish tugmasida aria-label', () => {
    const html = card({ key: 'a', productName: 'Tasbeh', qty: '5', unit: 'dona', price: '15 000' });
    expect(html).toMatch(/aria-label="Qatorni o&#x27;chirish: Tasbeh"[^>]*class="[^"]*h-11 w-11/);
  });
});

describe('SaleSummaryBar', () => {
  const L = (over: Partial<DraftLine> = {}): DraftLine => ({ key: 'k', productName: 'Tasbeh', qty: '5', unit: 'dona', price: '15 000', ...over });
  const bar = (lines: DraftLine[]) => nb(renderToStaticMarkup(<SaleSummaryBar summary={summarizeLines(lines, CATALOG)} onConfirm={noop} />));

  it('sariq qator bilan "Tasdiqlash" o‘chiq va sabab ko‘rinadi', () => {
    const html = bar([L(), { ...L({ key: 'q', productName: "Qur'on (kichik)", qty: '1', price: '' }) }]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Tasdiqlash/);
    expect(html).toContain('1 qator tayyor, 1 tasi to&#x27;ldirilmagan');
    expect(html).toContain('1 ta qator to&#x27;ldirilmagan');
    expect(html).toContain('75 000'); // jami faqat to'liq qatorlardan
  });
  it('hammasi to‘liq: Tasdiqlash yoqilgan, jami 385 000', () => {
    const html = bar([
      L({ key: '1', productName: 'Joynamoz Turk', qty: '10', price: '13 000' }),
      L({ key: '2', productName: 'Tasbeh', qty: '5', price: '15 000' }),
      L({ key: '3', productName: "Ro'mol", qty: '20', price: '9 000' }),
    ]);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Tasdiqlash/);
    expect(html).toContain('385 000');
  });
  it('qator yo‘q: Tasdiqlash o‘chiq', () => {
    expect(bar([])).toMatch(/<button[^>]*disabled=""[^>]*>Tasdiqlash/);
  });
});

describe('validatePayment (To‘lov amali)', () => {
  it('mijoz majburiy', () => expect(validatePayment('', 100000n, '5 000')).toEqual({ ok: false, message: 'Mijozni tanlang' }));
  it('qarzi yo‘q mijoz', () => expect(validatePayment('c', 0n, '5 000')).toMatchObject({ ok: false, message: "Bu mijozning qarzi yo'q" }));
  it('qarzdan ortiq to‘lov rad etiladi, teng yoki kam qabul qilinadi', () => {
    expect(validatePayment('c', 100000n, '100 001').ok).toBe(false);
    expect(validatePayment('c', 100000n, '100 000')).toEqual({ ok: true, amount: 100000n });
    expect(validatePayment('c', 100000n, '50 000')).toEqual({ ok: true, amount: 50000n });
  });
  it('bo‘sh, nol yoki harfli summa rad etiladi', () => {
    for (const v of ['', '0', 'abc']) expect(validatePayment('c', 100000n, v).ok).toBe(false);
  });
});
