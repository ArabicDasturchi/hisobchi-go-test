/**
 * F4/F5: AI natijasi (Edge Function `ai-parse`) → savat qatorlari (UI'siz, testlanadi).
 *
 * Qoidalar (CLAUDE.md): AI faqat matnni tuzilmaga aylantiradi. Bu yerda:
 *  - sonlarni AI EMAS, kod o'qiydi: `qty_text`/`price_text` F1 tahlilchisidan (`parsePastedList`) o'tadi;
 *  - tovar faqat katalogdan: server tekshirgan `product_id` yoki nom bo'yicha F1 `matchCatalog`;
 *  - jami hisoblanmaydi; kirim suratida yuk xatidagi qator summasi (`row_total_text`) KOD hisobi
 *    (`calculateLineTotal`) bilan solishtiriladi, mos kelmasa qator to'xtaydi (sariq, tasdiqlanmaydi);
 *  - har AI qatori "tekshiring" savoli bilan tushadi: savdogar ko'rib "To'g'ri" demaguncha tasdiqlanmaydi
 *    (lokal sinovda modellar sonlarni to'qigan: docs/reports/2026-11-12-AI-QATLAM.md).
 * Natija savatga qoralama sifatida tushadi; daftarga yozish odatdagi tasdiq (post_sale/post_purchase) orqali.
 */
import { calculateLineTotal, parsePastedList, parseUnitPriceText } from '@hisobchi/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, Unit } from './data/types';
import { formatMoneyInput, formatSom } from './money';
import { matchCatalog, matchReviews, parserChecks, type LineReview } from './pasteList';
import { qtyToInput } from './productPicker';
import type { PurchaseDraftLine } from './purchaseForm';
import type { DraftLine } from './saleForm';

export type AiMode = 'sale_text' | 'purchase_text' | 'purchase_image';

/** Edge Function javobidagi qator (docs/AI-PROVAYDER.md) */
export interface AiLine {
  name: string;
  product_id: string | null;
  qty_text: string | null;
  unit: string | null;
  price_text: string | null;
  row_total_text: string | null;
  note: string | null;
  line?: string;
}

export interface AiResult {
  request_id: string;
  lines: AiLine[];
  model: string;
  warnings?: string[];
}

/** Xato kodi → savdogarga matn (har xatoda F1 qo'lda oqimi ishlayveradi) */
const AI_ERRORS: Record<string, string> = {
  ai_not_configured: "AI hali ulanmagan (serverda Gemini kaliti qo'yilmagan). Ro'yxatni joylab yoki qo'lda kiriting.",
  ai_daily_limit: "Bugungi AI so'rovlari chegarasi tugadi (do'kon bo'yicha 200 ta). Ro'yxatni joylab kiriting.",
  ai_timeout: "AI 20 soniyada javob bermadi. Qayta urinib ko'ring yoki ro'yxatni joylang.",
  ai_provider_busy: "AI band. Birozdan keyin qayta urinib ko'ring.",
  ai_provider_error: "AI xizmatida xato. Ro'yxatni joylab kiriting.",
  ai_bad_output: "AI javobini tushunib bo'lmadi. Ro'yxatni joylab kiriting.",
  ai_refused: "AI bu so'rovni bajarmadi.",
  ai_output_truncated: "Ro'yxat juda uzun: qismlarga bo'lib yuboring.",
  oauth_client_forbidden: 'Bu amal faqat Hisobchi Go ilovasida bajariladi.',
  forbidden: "Bu do'kon uchun ruxsat yo'q.",
  unauthorized: 'Sessiya tugagan. Qaytadan kiring.',
  text_too_long: 'Matn juda uzun (ko\'pi bilan 4000 belgi).',
  image_too_large: 'Rasm juda katta (ko\'pi bilan 4 MB).',
  unsupported_image_type: 'Faqat JPG, PNG yoki WEBP rasm.',
};

export class AiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AiError';
  }
}

export function aiErrorMessage(code: string | null | undefined): string {
  return (code && AI_ERRORS[code]) || "AI so'rovi bajarilmadi. Ro'yxatni joylab yoki qo'lda kiriting.";
}

/** Edge Function chaqiruvi (foydalanuvchi JWT bilan; kalit faqat serverda) */
export async function callAiParse(sb: SupabaseClient, body: { shop_id: string; mode: AiMode; text?: string; image?: { mime: string; base64: string } }): Promise<AiResult> {
  const { data, error } = await sb.functions.invoke('ai-parse', { body });
  if (error) {
    let code: string | null = null;
    // FunctionsHttpError: javob tanasida {error, message}
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    try {
      const j = (await ctx?.json?.()) as { error?: string } | undefined;
      code = j?.error ?? null;
    } catch {
      code = null;
    }
    if (!code && /failed to send|fetch/i.test(error.message)) code = 'ai_unreachable';
    throw new AiError(code ?? 'unknown', code === 'ai_unreachable' ? "AI xizmatiga ulanib bo'lmadi (server funksiyasi o'rnatilmagan bo'lishi mumkin). Ro'yxatni joylang." : aiErrorMessage(code));
  }
  const r = data as AiResult | null;
  if (!r || !Array.isArray(r.lines)) throw new AiError('ai_bad_output', aiErrorMessage('ai_bad_output'));
  return r;
}

const PLACEHOLDER = 'Q';

interface AiNumbers {
  qtyMilli?: bigint;
  unit?: Unit;
  unitPrice?: bigint;
  /** Tushunilmagan son (qo'lda kiritiladi) */
  error: string | null;
  /** Tahlilchi ogohlantirishlari (masalan "10 130" kabi bo'shliqli son) */
  checks: LineReview[];
}

/**
 * Soni va narx ALOHIDA o'qiladi (biri ikkinchisiga aralashmasin): soni — F1 tahlilchisi ("Q 10 ta"), narx —
 * `parseUnitPriceText` ("13 ming", "15.000"). Nomdagi raqamlar umuman tahlilga kirmaydi.
 */
function parseNumbers(l: AiLine): AiNumbers {
  const qty = (l.qty_text ?? '').trim();
  const unit = (l.unit ?? '').trim();
  const price = (l.price_text ?? '').trim();
  const out: AiNumbers = { error: null, checks: [] };
  if (qty) {
    const [row] = parsePastedList(`${PLACEHOLDER} ${qty}${unit ? ` ${unit}` : ''}`, { kind: 'sale' });
    const bad = !row || row.qtyMilli === undefined || row.unitPrice !== undefined || row.issues.some((x) => x.severity === 'error');
    if (bad) out.error = `Soni tushunilmadi («${qty.slice(0, 30)}»)`;
    else {
      out.qtyMilli = row.qtyMilli;
      out.unit = row.unit;
      out.checks.push(...parserChecks(row));
    }
  }
  if (price) {
    const p = parseUnitPriceText(price);
    if (p.ok) out.unitPrice = p.unitPrice;
    else out.error = out.error ? `${out.error}, narxi ham («${price.slice(0, 30)}»)` : `Narxi tushunilmadi («${price.slice(0, 30)}»)`;
  }
  return out;
}

const numbersError = (msg: string): LineReview => ({ kind: 'xato', message: `${msg}: soni va narxini qo'lda kiriting` });

const aiCheck = (l: AiLine): LineReview => ({
  kind: 'check',
  message: `AI o'qidi${l.note ? ` (${l.note.slice(0, 80)})` : ''}: soni va narxini tekshiring`,
});

function catalogFor(products: readonly Product[], l: AiLine, unit: Unit | undefined) {
  const byId = l.product_id ? products.find((p) => p.id === l.product_id && p.is_active) : undefined;
  if (byId) return { product: byId, reviews: [] as LineReview[] };
  const match = matchCatalog(products, l.name, unit);
  return { product: match.kind === 'exact' ? match.product : undefined, reviews: matchReviews(match, l.name, unit) };
}

const priceText = (v: bigint | null | undefined) => (v === null || v === undefined ? '' : formatMoneyInput(v.toString()));
const rawOf = (l: AiLine) => (l.line ?? [l.name, l.qty_text, l.unit, l.price_text].filter(Boolean).join(' ')).slice(0, 200);

export function aiSaleLines(lines: readonly AiLine[], products: readonly Product[], makeKey: () => string = () => crypto.randomUUID()): DraftLine[] {
  return lines.map((l, i) => {
    const row = parseNumbers(l);
    const { product, reviews } = catalogFor(products, l, row.unit);
    const base: DraftLine = {
      key: makeKey(),
      productId: product?.id ?? null,
      productName: product?.name ?? l.name.trim(),
      qty: row.qtyMilli === undefined ? '' : qtyToInput(row.qtyMilli),
      unit: product?.unit ?? row.unit ?? 'dona',
      price: priceText(row.unitPrice) || priceText(product?.last_price),
      pasted: { lineNo: i + 1, raw: rawOf(l) },
    };
    const head = row.error ? [numbersError(row.error)] : [];
    return { ...base, reviews: [...head, ...reviews, ...row.checks, aiCheck(l)] };
  });
}

export function aiPurchaseLines(
  lines: readonly AiLine[],
  products: readonly Product[],
  opts: { costOf?: (id: string) => bigint | null | undefined; newUnit?: Unit | null; makeKey?: () => string } = {},
): PurchaseDraftLine[] {
  const makeKey = opts.makeKey ?? (() => crypto.randomUUID());
  return lines.map((l, i) => {
    const row = parseNumbers(l);
    const { product, reviews } = catalogFor(products, l, row.unit);
    const base: PurchaseDraftLine = {
      key: makeKey(),
      productId: product?.id ?? null,
      productName: product?.name ?? l.name.trim(),
      unit: product?.unit ?? row.unit ?? opts.newUnit ?? null,
      qty: row.qtyMilli === undefined ? '' : qtyToInput(row.qtyMilli),
      unitCost: priceText(row.unitPrice) || (product ? priceText(opts.costOf?.(product.id)) : ''),
      pasted: { lineNo: i + 1, raw: rawOf(l) },
    };
    const extra: LineReview[] = [];
    // F4: yuk xatidagi qator summasi kod hisobi bilan solishtiriladi; mos kelmasa to'xtaydi
    if (l.row_total_text && row.qtyMilli !== undefined && row.unitPrice !== undefined) {
      const doc = parseUnitPriceText(l.row_total_text);
      const code = calculateLineTotal(row.qtyMilli, row.unitPrice);
      if (!doc.ok) extra.push({ kind: 'check', message: `Yuk xatidagi qator summasi o'qilmadi («${l.row_total_text.slice(0, 40)}»): tekshiring`, field: 'price' });
      else if (doc.unitPrice !== code) {
        extra.push({ kind: 'check', message: `Yuk xatida qator summasi ${formatSom(doc.unitPrice)}, kod hisobi ${formatSom(code)}: mos emas — soni yoki narxini tuzating` });
      }
    }
    const head = row.error ? [numbersError(row.error)] : [];
    return { ...base, reviews: [...head, ...reviews, ...row.checks, ...extra, aiCheck(l)] };
  });
}
