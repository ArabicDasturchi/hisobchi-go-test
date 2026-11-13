// @vitest-environment jsdom
/**
 * F4/F5 web: AI natijasi → savat qatorlari. Sonlarni AI emas kod o'qiydi, tovar faqat katalogdan, har qator
 * "tekshiring" bilan, yuk xatidagi qator summasi kod hisobi bilan solishtiriladi. AI oynasi xatoda qo'lda oqimga
 * qaytaradi. Server (Edge Function) almashtirilgan — haqiqiy provayder sinalmagan.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product, Unit } from '@/lib/data/types';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import { acceptCheck, keepAsNew } from '@/lib/pasteList';
import { buildPurchasePlan } from '@/lib/purchaseForm';
import type { AiLine } from '@/lib/aiLines';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const { aiErrorMessage, aiPurchaseLines, aiSaleLines, callAiParse } = await import('@/lib/aiLines');
const { AiAssist } = await import('@/components/panel/AiAssist');

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const P = (id: string, name: string, price: number | null, unit: Unit = 'dona'): Product => ({
  id, name, unit, last_price: price === null ? null : BigInt(price), is_active: true, source: 'app', created_at: '', updated_at: '',
});
const CATALOG = [P('aaaaaaaa-0000-0000-0000-0000000000c1', 'Chirmoq', 13000), P('aaaaaaaa-0000-0000-0000-0000000000y1', 'Yurak', 15000), P('aaaaaaaa-0000-0000-0000-0000000000m1', 'Momiq', 9000)];
const L = (o: Partial<AiLine>): AiLine => ({ name: '', product_id: null, qty_text: null, unit: null, price_text: null, row_total_text: null, note: null, ...o });
let n = 0;
const key = () => `k${++n}`;

describe('aiSaleLines', () => {
  const lines = aiSaleLines([
    L({ name: 'Chirmoq', product_id: CATALOG[0]!.id, qty_text: '10', unit: 'ta', price_text: '13 ming' }),
    L({ name: 'юрак', qty_text: '5', price_text: '15.000' }),
    L({ name: 'Momiq', qty_text: '20', unit: 'ta' }),
  ], CATALOG, key);

  it('sonlar kod bilan o‘qiladi, tovar katalogdan (id yoki Kirill nom), narx yozilmasa katalogdan', () => {
    expect(lines.map((l) => [l.productId, l.productName, l.qty, l.price])).toEqual([
      [CATALOG[0]!.id, 'Chirmoq', '10', '13 000'],
      [CATALOG[1]!.id, 'Yurak', '5', '15 000'],
      [CATALOG[2]!.id, 'Momiq', '20', '9 000'],
    ]);
  });

  it('har AI qatori «tekshiring» bilan: tasdiqlash yopiq; «To‘g‘ri» dan keyin jami 385 000', () => {
    expect(lines.every((l) => l.reviews?.at(-1)?.kind === 'check')).toBe(true);
    expect(summarizeLines(lines, CATALOG).canConfirm).toBe(false);
    const ok = lines.map((l) => acceptCheck(l));
    expect(summarizeLines(ok, CATALOG)).toMatchObject({ canConfirm: true, total: 385000n });
  });

  it('nomdagi raqam soniga aralashmaydi: «Coca-Cola 1.5L» 2 ta × 12 000', () => {
    const [l] = aiSaleLines([L({ name: 'Coca-Cola 1.5L', qty_text: '2', unit: 'ta', price_text: '12000' })], CATALOG, key);
    expect(l).toMatchObject({ productName: 'Coca-Cola 1.5L', qty: '2', price: '12 000', productId: null });
    expect(l!.reviews!.map((r) => r.kind)).toEqual(['new', 'check']);
  });

  it('katalogda yo‘q product_id (soxta) e’tiborsiz: nom bo‘yicha qidiriladi', () => {
    const [l] = aiSaleLines([L({ name: 'Atir', product_id: 'bbbbbbbb-0000-0000-0000-000000000000', qty_text: '1', price_text: '20000' })], CATALOG, key);
    expect(l!.productId).toBeNull();
    expect(l!.reviews![0]!.kind).toBe('new');
  });

  it('AI tushunmagan son: xato, qo‘lda kiritiladi', () => {
    const [l] = aiSaleLines([L({ name: 'Chirmoq', qty_text: 'bir necha', price_text: '13000' })], CATALOG, key);
    expect(lineStatus(l!, CATALOG).status).toBe('yellow');
    expect(l!.qty).toBe('');
  });
});

describe('aiPurchaseLines (rasmdan kirim, F4)', () => {
  it('yuk xatidagi qator summasi kod hisobiga mos: faqat «tekshiring»', () => {
    const [l] = aiPurchaseLines([L({ name: 'Momiq', qty_text: '20', unit: 'ta', price_text: '9 000', row_total_text: '180 000' })], CATALOG, { makeKey: key });
    expect(l!.reviews!.map((r) => r.kind)).toEqual(['check']);
  });

  it('mos kelmasa to‘xtaydi: qator summasi xabari, kirim rejasi tuzilmaydi', () => {
    const lines = aiPurchaseLines([L({ name: 'Momiq', qty_text: '20', unit: 'ta', price_text: '9 000', row_total_text: '170 000' })], CATALOG, { makeKey: key });
    expect(lines[0]!.reviews![0]!.message).toContain('mos emas');
    const plan = buildPurchasePlan({ lines, products: CATALOG, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(plan.ok).toBe(false);
    // Savdogar tekshirib tasdiqlasa (ikki savol) — reja tuziladi, jami kod hisobi
    const ok = lines.map((l) => acceptCheck(acceptCheck(l)));
    const plan2 = buildPurchasePlan({ lines: ok, products: CATALOG, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(plan2.ok && plan2.plan.subtotal).toBe(180000n);
  });

  it('yangi tovar birlik bilan; yangi tovar tasdiqlangach reja OK', () => {
    const lines = aiPurchaseLines([L({ name: 'Atir', qty_text: '4', price_text: '15000' })], CATALOG, { makeKey: key, newUnit: 'dona' });
    const ok = lines.map((l) => acceptCheck(keepAsNew(l)));
    const plan = buildPurchasePlan({ lines: ok, products: CATALOG, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(plan.ok && plan.plan.newProducts).toEqual([{ key: 'atir|dona', name: 'Atir', unit: 'dona' }]);
  });
});

describe('callAiParse va xato kodlari', () => {
  it('xato tanasidagi kod → o‘zbekcha xabar', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { json: async () => ({ error: 'ai_not_configured' }) } }) });
    const { getSupabase } = await import('@/lib/supabase/client');
    await expect(callAiParse(getSupabase(), { shop_id: 's', mode: 'sale_text', text: 'x' })).rejects.toMatchObject({ code: 'ai_not_configured', message: aiErrorMessage('ai_not_configured') });
  });
  it('noma’lum kod — umumiy xabar', () => {
    expect(aiErrorMessage('zzz')).toContain("Ro'yxatni joylab");
  });
});

describe('AiAssist oynasi', () => {
  it('matn yuboriladi (kalit klientda yo‘q), natija chaqiruvchiga', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: { request_id: 'r', lines: [L({ name: 'Chirmoq', qty_text: '10' })], model: 'm' }, error: null });
    const onResult = vi.fn();
    render(<AiAssist open variant="text" kind="sale" shopId="s1" onClose={() => {}} onResult={onResult} />);
    await user.type(screen.getByRole('textbox'), "o'nta chirmoq");
    await user.click(screen.getByTestId('ai-submit'));
    expect(invoke).toHaveBeenCalledWith('ai-parse', { body: { shop_id: 's1', mode: 'sale_text', text: "o'nta chirmoq" } });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ request_id: 'r' }), 'sale_text');
  });

  it('AI ulanmagan: tushunarli xabar, natija yo‘q', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: { json: async () => ({ error: 'ai_not_configured' }) } }) });
    const onResult = vi.fn();
    render(<AiAssist open variant="text" kind="purchase" shopId="s1" onClose={() => {}} onResult={onResult} />);
    await user.type(screen.getByRole('textbox'), 'momiq 20');
    await user.click(screen.getByTestId('ai-submit'));
    expect(await screen.findByText(/AI hali ulanmagan/)).toBeTruthy();
    expect(onResult).not.toHaveBeenCalled();
  });

  it('rasm: rasm bo‘lmagan fayl va tayyorlab bo‘lmagan surat serverga yuborilmaydi', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { ImagePrepError } = await import('@/lib/imagePrep');
    const prepare = vi.fn(async () => {
      throw new ImagePrepError("Suratni o'qib bo'lmadi (format qo'llanmaydi).");
    });
    render(<AiAssist open variant="photo" kind="purchase" shopId="s1" onClose={() => {}} onResult={() => {}} prepare={prepare} />);
    await user.upload(screen.getByLabelText('Rasm'), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByTestId('ai-submit'));
    expect(await screen.findByText(/Faqat rasm fayli/)).toBeTruthy();
    expect(prepare).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText('Rasm'), new File(['x'], 'b.heic', { type: 'image/heic' }));
    await user.click(screen.getByTestId('ai-submit'));
    expect(await screen.findByText(/o'qib bo'lmadi/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rasm: katta surat siqilib (JPEG) yuboriladi', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: { request_id: 'r', lines: [L({ name: 'Momiq' })], model: 'm' }, error: null });
    const prepare = vi.fn(async () => ({ mime: 'image/jpeg', bytes: new Uint8Array([9, 9]), resized: true }));
    render(<AiAssist open variant="photo" kind="purchase" shopId="s1" onClose={() => {}} onResult={() => {}} prepare={prepare} />);
    await user.upload(screen.getByLabelText('Rasm'), new File([new Uint8Array(10)], 'katta.png', { type: 'image/png' }));
    await user.click(screen.getByTestId('ai-submit'));
    expect(invoke).toHaveBeenCalledWith('ai-parse', { body: { shop_id: 's1', mode: 'purchase_image', image: { mime: 'image/jpeg', base64: 'CQk=' } } });
  });

  it('rasm: base64 bilan purchase_image rejimida', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: { request_id: 'r', lines: [L({ name: 'Momiq' })], model: 'm' }, error: null });
    const onResult = vi.fn();
    render(<AiAssist open variant="photo" kind="purchase" shopId="s1" onClose={() => {}} onResult={onResult} />);
    await user.upload(screen.getByLabelText('Rasm'), new File([new Uint8Array([1, 2, 3])], 'c.png', { type: 'image/png' }));
    await user.click(screen.getByTestId('ai-submit'));
    expect(invoke).toHaveBeenCalledWith('ai-parse', { body: { shop_id: 's1', mode: 'purchase_image', image: { mime: 'image/png', base64: 'AQID' } } });
    expect(onResult).toHaveBeenCalledWith(expect.anything(), 'purchase_image');
  });
});
