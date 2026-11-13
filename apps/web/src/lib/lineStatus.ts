/**
 * Qator holati (kartochka rangi) va jamlanma. Summa faqat mavjud `buildSalePlan` dan; yangi formula yo'q.
 */
import type { Product } from './data/types';
import { parseMoneyInput, parseQtyInput } from './money';
import { resolveSaleProduct } from './productIdentity';
import { findProductByName } from './productPicker';
import { buildSalePlan, isBlank, type DraftLine } from './saleForm';

export type YellowReason = 'review' | 'name' | 'qty' | 'price';

export type LineStatus =
  | { status: 'ok'; isNew: boolean }
  | { status: 'yellow'; reason: YellowReason; message: string; isNew: boolean };

const MESSAGES: Record<YellowReason, string> = {
  review: 'Tekshiring',
  name: "Tovar nomi yo'q",
  qty: "Soni yo'q yoki noto'g'ri",
  price: "Narxi yo'q, kiriting",
};

/**
 * ok | yellow(sabab). Katalogda yo'q nom "Yangi tovar" (isNew) belgisini oladi, lekin son va narx to'liq bo'lsa
 * sariq EMAS: server uni yangi tovar sifatida qabul qiladi (mavjud xatti-harakat).
 * Narx yo'q: maydon bo'sh yoki noto'g'ri (katalogdagi narxsiz tovar ham shu yo'l bilan sariq bo'ladi: narx qo'lda yoziladi).
 */
export function lineStatus(line: DraftLine, products: readonly Product[]): LineStatus {
  const name = line.productName.trim();
  // Tanlangan tovar (productId) birinchi; aks holda nom bo'yicha (avvalgi xatti-harakat)
  const isNew = name !== '' && resolveSaleProduct(products, line) === undefined && findProductByName(products, name) === undefined;
  const yellow = (reason: YellowReason): LineStatus => ({ status: 'yellow', reason, message: MESSAGES[reason], isNew });
  // F1: joylangan qatorda hal qilinmagan savol (variant, yangi tovar, tekshirish, tushunilmagan) — birinchi
  const review = line.reviews?.[0];
  if (review) return { status: 'yellow', reason: 'review', message: review.message, isNew };
  if (!name) return yellow('name');
  if (!parseQtyInput(line.qty).ok) return yellow('qty');
  if (line.price.trim() === '' || !parseMoneyInput(line.price, { allowZero: true }).ok) return yellow('price');
  return { status: 'ok', isNew };
}

export interface SaleSummary {
  /** To'liq (ok) qatorlar soni */
  ready: number;
  /** Sariq (to'ldirilmagan) qatorlar soni */
  incomplete: number;
  /** Faqat to'liq qatorlar jami (buildSalePlan); qator yo'q bo'lsa 0n */
  total: bigint;
  /** "Tasdiqlash" bosilishi mumkinmi */
  canConfirm: boolean;
  /** Tasdiqlash o'chiq bo'lsa sababi */
  blockedReason: string | null;
}

export function summarizeLines(lines: readonly DraftLine[], products: readonly Product[]): SaleSummary {
  const filled = lines.filter((l) => !isBlank(l));
  const okLines = filled.filter((l) => lineStatus(l, products).status === 'ok');
  const incomplete = filled.length - okLines.length;
  const plan = buildSalePlan({ lines: okLines, customerId: null, mode: 'paid', partial: '' });
  const total = plan.ok ? plan.plan.total : 0n;
  let blockedReason: string | null = null;
  if (filled.length === 0) blockedReason = "Avval tovar qo'shing";
  else if (incomplete > 0) blockedReason = `${incomplete} ta qator to'ldirilmagan`;
  else if (!plan.ok) blockedReason = plan.message;
  return { ready: okLines.length, incomplete, total, canConfirm: blockedReason === null, blockedReason };
}
