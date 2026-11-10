/**
 * "Daftarga yozish": erkin matn ("kirim 1 000 000", "savdo 500 000 tolov 200 000") → tovar summasi va to'lov.
 * Matn tuzilmaga aylanadi, summa esa kodda: oldindan ko'rish `settle` (core) bilan, hisob BigInt'da (float yo'q).
 * AI yo'q: faqat kalit so'zlar va raqamlar. Tasdiqlanmaguncha hech narsa saqlanmaydi.
 */
import { MAX_UNIT_PRICE, settle, type Settlement } from '@hisobchi/core';
import { formatSom } from './money';
import { looseKey } from './translit';

export type NoteKind = 'customer' | 'supplier';

const GOODS_WORDS = new Set(['kirim', 'savdo', 'tovar', 'qarz', 'nasiya']);
const PAID_WORDS = new Set(['tolov', 'tolovi', 'berdi', 'berildi', 'berdim', 'toladi', 'toladim', 'tolandi', 'oldim', 'olindi', 'naqd']);

export type NoteParse = { ok: true; goods: bigint; paid: bigint } | { ok: false; message: string | null };

/** "1 000 000" yoki "500000" yoki "13 ming" → bigint; noto'g'ri bo'lsa null */
function toAmount(raw: string): bigint | null {
  const ming = /\bming$/.test(raw.trim());
  const digits = raw.replace(/ming$/, '').replace(/\s+/g, '');
  if (!/^\d{1,15}$/.test(digits)) return null;
  const v = BigInt(digits) * (ming ? 1000n : 1n);
  return v <= MAX_UNIT_PRICE ? v : null;
}

/**
 * Matnni o'qiydi. Kalit so'z (kirim/savdo/tovar → tovar; to'lov/berdi/oldim → to'lov) va undan keyingi son.
 * Son kalit so'zdan oldin ham yozilishi mumkin ("1 000 000 kirim"). Kalit so'zsiz son noaniq: xato.
 * `message === null` — hali hech narsa yozilmagan.
 */
export function parseLedgerNote(text: string): NoteParse {
  const key = looseKey(text);
  if (!key) return { ok: false, message: null };
  const tokens = [...key.matchAll(/(\d+(?: \d{3})*(?: ming)?)|([a-z]+)/g)];
  let goods = 0n;
  let paid = 0n;
  let kind: 'goods' | 'paid' | null = null;
  let pending: bigint | null = null;
  let any = false;
  const put = (k: 'goods' | 'paid', v: bigint) => {
    if (k === 'goods') goods += v;
    else paid += v;
    any = true;
  };
  for (const m of tokens) {
    if (m[1] !== undefined) {
      const v = toAmount(m[1]);
      if (v === null) return { ok: false, message: "Summa noto'g'ri yoki juda katta" };
      if (kind) {
        put(kind, v);
        kind = null;
      } else pending = v;
    } else if (m[2] !== undefined) {
      const w = m[2];
      const k = GOODS_WORDS.has(w) ? 'goods' : PAID_WORDS.has(w) ? 'paid' : null;
      if (!k) continue; // boshqa so'zlar e'tiborsiz (masalan "somga")
      if (pending !== null) {
        put(k, pending);
        pending = null;
      } else kind = k;
    }
  }
  if (pending !== null) return { ok: false, message: "Turini yozing: «kirim» yoki «to'lov» va summa" };
  if (!any) return { ok: false, message: "Masalan: kirim 1 000 000 yoki to'lov 500 000" };
  return { ok: true, goods, paid };
}

export type NotePreview =
  | { ok: true; goods: bigint; paid: bigint; settlement: Settlement }
  | { ok: false; message: string | null };

/**
 * Oldindan ko'rish: Eski + Tovar − Berildi (core `settle`). To'lov jami qarzdan oshmaydi (server bilan bir xil qoida).
 * `balance` — hozirgi qarz (mijoz qarzi yoki ta'minotchiga qarzim).
 */
export function previewLedgerNote(balance: bigint, text: string): NotePreview {
  const p = parseLedgerNote(text);
  if (!p.ok) return p;
  const limit = balance + p.goods;
  if (p.paid > 0n && p.paid > (limit > 0n ? limit : 0n)) {
    return { ok: false, message: limit > 0n ? `To'lov jami qarzdan katta (jami ${formatSom(limit).replace(/ /g, ' ')})` : "Qarz yo'q, to'lov yozib bo'lmaydi" };
  }
  return { ok: true, goods: p.goods, paid: p.paid, settlement: settle(balance, p.goods, p.paid) };
}

/** Yozuv turi nomi (oldindan ko'rish sarlavhasi) */
export function noteTitle(goods: bigint, paid: bigint, kind: NoteKind): string {
  const g = kind === 'supplier' ? 'kirim' : 'savdo';
  if (goods > 0n && paid > 0n) return `${g} va to'lov`;
  return goods > 0n ? g : "to'lov";
}
