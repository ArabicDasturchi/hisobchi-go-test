/**
 * Daftar varag'ining sof (UI'siz, testlanadigan) mantig'i: sozlama, tez yozuv oldindan ko'rinishi, sana oralig'i,
 * ro'yxat filtri/tartibi, ulashish va eslatma matni. Summalar faqat BigInt va @hisobchi/core `settle`.
 */
import { MAX_UNIT_PRICE, settle, type Settlement } from '@hisobchi/core';
import type { PartnerKind, SheetRow } from './data/partnerLedger';
import { formatSom, parseMoneyInput } from './money';

export interface SheetConfig {
  kind: PartnerKind;
  /** Ro'yxat/varaq sarlavhasidagi so'z */
  partnerLabel: string;
  /** Jadvaldagi "Tovar" ustuni: mijozda olingan tovar summasi, ta'minotchida kirim summasi */
  goodsHeader: string;
  paidHeader: string;
  addGoodsLabel: string;
  addPaidLabel: string;
  /** Qoldiq so'zi: mijoz qarzi / mening qarzim */
  balanceLabel: string;
  /** Tezkor qatorda tovar summasi yoziladimi (ta'minotchida kirim tovar tanlashni talab qiladi) */
  quickGoods: boolean;
}

export const SHEET_CONFIG: Readonly<Record<PartnerKind, SheetConfig>> = {
  customer: {
    kind: 'customer',
    partnerLabel: 'Mijoz',
    goodsHeader: 'Tovar',
    paidHeader: 'Berildi',
    addGoodsLabel: '+ Savdo',
    addPaidLabel: "To'lov oldim",
    balanceLabel: 'Qarzi',
    quickGoods: true,
  },
  supplier: {
    kind: 'supplier',
    partnerLabel: "Ta'minotchi",
    goodsHeader: 'Tovar',
    paidHeader: 'Berildi',
    addGoodsLabel: '+ Kirim',
    addPaidLabel: "To'lov berdim",
    balanceLabel: 'Qarzim',
    quickGoods: false,
  },
};

// ---------------------------------------------------------------------------
// Sana oralig'i
// ---------------------------------------------------------------------------

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const ALL_TIME: DateRange = { from: null, to: null };

/**
 * Ko'rinadigan qatorlar. Qator qoldig'i (Eski/Ostatka) HAR DOIM butun tarixdan hisoblangan: oraliq faqat
 * ko'rsatishni cheklaydi. Boshlang'ich qarz qatori doim ko'rinadi.
 */
export function rowsInRange(rows: readonly SheetRow[], range: DateRange): SheetRow[] {
  return rows.filter((r) => r.kind === 'opening' || ((!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)));
}

export type RangePreset = 'all' | 'week' | 'month' | 'custom';

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Tayyor davrlar (today — Toshkent sanasi). 'custom' uchun chaqiruvchi o'z oralig'ini beradi */
export function presetRange(p: Exclude<RangePreset, 'custom'>, today: string): DateRange {
  if (p === 'week') return { from: addDaysIso(today, -6), to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return ALL_TIME;
}

export function rangeError(range: DateRange): string | null {
  return range.from && range.to && range.to < range.from ? "Tugash sanasi boshlanishidan oldin bo'lishi mumkin emas" : null;
}

// ---------------------------------------------------------------------------
// Tez yozuv (bloknot qatori)
// ---------------------------------------------------------------------------

export type QuickPreview =
  | { ok: true; goods: bigint; paid: bigint; settlement: Settlement }
  | { ok: false; message: string | null };

/**
 * Tez yozuvning oldindan ko'rinishi: Jami va Ostatka core `settle` bilan hisoblanadi (UI qo'shmaydi).
 * `message === null` — hali hech narsa kiritilmagan (xato emas).
 * - Mijozda tovar summasi bitta qator bo'lib yoziladi, narx chegarasi (MAX_UNIT_PRICE) amal qiladi.
 * - To'lov joriy qarz + shu yozuvdagi tovardan oshmaydi (server `payment_exceeds_debt` bilan bir xil).
 */
export function quickPreview(kind: PartnerKind, balance: bigint, goodsRaw: string, paidRaw: string): QuickPreview {
  const cfg = SHEET_CONFIG[kind];
  let goods = 0n;
  let paid = 0n;
  if (goodsRaw.trim()) {
    if (!cfg.quickGoods) return { ok: false, message: 'Kirim uchun «Tovar tanlash» dan foydalaning' };
    const g = parseMoneyInput(goodsRaw, { max: MAX_UNIT_PRICE });
    if (!g.ok) return { ok: false, message: g.message.startsWith("Eng ko'pi") ? `${g.message}. Katta summani «Yangi savdo» orqali yozing` : g.message };
    goods = g.value;
  }
  if (paidRaw.trim()) {
    const p = parseMoneyInput(paidRaw);
    if (!p.ok) return { ok: false, message: p.message };
    paid = p.value;
  }
  if (goods === 0n && paid === 0n) return { ok: false, message: null };
  const limit = balance + goods;
  if (paid > 0n && paid > (limit > 0n ? limit : 0n)) {
    return { ok: false, message: limit > 0n ? `Berildi jamidan katta (jami ${formatSom(limit)})` : "Qarz yo'q, to'lov yozib bo'lmaydi" };
  }
  return { ok: true, goods, paid, settlement: settle(balance, goods, paid) };
}

/**
 * Tez yozuv klaviaturasi: Enter oxirgi maydonda saqlaydi, oldingilarida keyingi maydonga o'tadi;
 * Ctrl/Cmd+Enter istalgan maydonda saqlaydi. Boshqa tugmalar e'tiborsiz (Tab brauzerning o'zida ishlaydi).
 */
export type QuickKeyAction = 'save' | 'next' | 'none';
export function quickKeyAction(key: string, mods: { ctrl?: boolean; meta?: boolean }, isLastField: boolean): QuickKeyAction {
  if (key !== 'Enter') return 'none';
  return mods.ctrl || mods.meta || isLastField ? 'save' : 'next';
}

/** Strelkalar bilan qator tanlash: yuqoriga/pastga, chetda to'xtaydi (aylanmaydi). null — o'zgarmaydi */
export function arrowTarget(index: number, count: number, key: string): number | null {
  if (index < 0 || count === 0) return null;
  const next = key === 'ArrowDown' ? index + 1 : key === 'ArrowUp' ? index - 1 : null;
  return next === null || next < 0 || next >= count ? null : next;
}

/** Kiritilgan sana bugundan keyin bo'lmasin (ixtiyoriy sana faqat ta'minotchi to'lovida) */
export function dateError(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Sanani kiriting';
  if (date > today) return "Kelajak sanasi bo'lmaydi";
  return null;
}

// ---------------------------------------------------------------------------
// Ro'yxat (mijozlar / ta'minotchilar): qidiruv, filtr, tartib
// ---------------------------------------------------------------------------

export interface PartnerListRow {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  /** Joriy qoldiq: musbat = qarz (mijozda menga, ta'minotchida men) */
  balance: bigint;
  /** Oxirgi harakat vaqti (ISO) */
  lastActivity: string | null;
}

export type ListFilter = 'debtors' | 'all' | 'archive';
export type ListSort = 'debt' | 'recent';

const norm = (s: string) => s.toLocaleLowerCase('uz').replace(/[ʻʼ‘’`']/g, "'").trim();

export function filterPartners(rows: readonly PartnerListRow[], o: { query: string; filter: ListFilter; sort: ListSort }): PartnerListRow[] {
  const q = norm(o.query);
  const digits = o.query.replace(/\D/g, '');
  const out = rows.filter((r) => {
    if (o.filter === 'archive' ? r.is_active : !r.is_active) return false;
    if (o.filter === 'debtors' && r.balance <= 0n) return false;
    if (!q) return true;
    return norm(r.name).includes(q) || (digits.length > 0 && (r.phone ?? '').replace(/\D/g, '').includes(digits));
  });
  const time = (r: PartnerListRow) => (r.lastActivity ? new Date(r.lastActivity).getTime() : 0);
  out.sort((a, b) => {
    if (o.sort === 'recent') return time(b) - time(a) || a.name.localeCompare(b.name, 'uz');
    return a.balance === b.balance ? a.name.localeCompare(b.name, 'uz') : a.balance > b.balance ? -1 : 1;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Ulashish va eslatma
// ---------------------------------------------------------------------------

const show = (d: string) => d.split('-').reverse().join('.');
const num = (v: bigint) => formatSom(v).replace(/\s*so'm$/, '');

/** Mijozga eslatma: "Assalomu alaykum, qarzingiz X so'm" */
export function reminderText(name: string, balance: bigint, shopName?: string): string | null {
  if (balance <= 0n) return null;
  const tail = shopName ? ` (${shopName})` : '';
  return `Assalomu alaykum, ${name}! Qarzingiz ${formatSom(balance)}${tail}. Iltimos, to'lov vaqtini ayting.`;
}

/**
 * "Varaqni yuborish": Telegram/WhatsApp uchun matn nusxasi. Oxirgi `limit` qator; bekor qilingan kunlar o'tkazib yuboriladi.
 * Raqamlar tayyor qatorlardan olinadi (core), bu yerda hisob yo'q.
 */
export function sheetText(o: { shopName: string; partnerName: string; kind: PartnerKind; rows: readonly SheetRow[]; balance: bigint; limit?: number }): string {
  const cfg = SHEET_CONFIG[o.kind];
  const live = o.rows.filter((r) => !r.allCancelled);
  const shown = live.slice(-(o.limit ?? 20));
  const lines = shown.map((r) =>
    r.kind === 'opening'
      ? `${show(r.date)}  Boshlang'ich qarz: ${num(r.opening)}  → Ostatka ${num(r.balance)}`
      : `${show(r.date)}  Eski ${num(r.old)} + ${cfg.goodsHeader} ${num(r.goods)} = Jami ${num(r.total)}; ${cfg.paidHeader} ${num(r.paid)} → Ostatka ${num(r.balance)}`,
  );
  const more = live.length > shown.length ? [`… oldingi ${live.length - shown.length} ta qator ko'rsatilmadi`] : [];
  return [`${o.shopName} — ${cfg.partnerLabel}: ${o.partnerName}`, ...more, ...lines, `Joriy ${cfg.balanceLabel.toLowerCase()}: ${formatSom(o.balance)}`].join('\n');
}
