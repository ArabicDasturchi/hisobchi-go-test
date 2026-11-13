/**
 * Tovar identifikatori (W4, UI'siz, testlanadi): bir xil nomli tovarlar chalkashmasligi uchun.
 *
 * 1. `catalogNorm` — server `catalog_norm` (supabase/migrations/005_agent_catalog.sql) bilan AYNAN bir xil normalizatsiya.
 *    `post_sale` nom bo'yicha bog'lashda shuni ishlatadi, shuning uchun takror tekshiruvi ham shu bilan.
 *    Kirill → Lotin o'girish YO'Q (server ham o'girmaydi): "Шакар" va "Shakar" serverda boshqa-boshqa nom.
 *    Bunday "o'xshash" nomlar faqat ogohlantirish oladi (`looseKey`).
 * 2. `resolveSaleProduct` — savdo qatori serverda qaysi tovarga bog'lanishini `post_sale` qoidasi bilan bir xil topadi
 *    (avval `productId` + birlik, keyin nom + birlik bo'yicha eng eski faol tovar).
 * 3. `patchSaleLine` — qatorda nom yoki birlik o'zgarsa, tanlangan tovar (`productId`) tozalanadi.
 * 4. `checkProductDuplicate` — yangi tovar yaratish / nom-birlikni tahrirlashdan oldin klient tekshiruvi.
 *    Bu faqat klient himoyasi: bazada UNIQUE yo'q (keyingi migratsiya vazifasi, docs/QARORLAR.md).
 */
import { uz } from '@/i18n/uz';
import type { Product, Unit } from './data/types';
import type { DraftLine } from './saleForm';
import { looseKey } from './translit';

/** SQL: translate(t, chr(699)||chr(700)||chr(8216)||chr(8217)||chr(96)||chr(180), repeat(chr(39), 6)) */
const SQL_APOSTROPHES = /[ʻʼ‘’`´]/g;

/**
 * `catalog_norm(t)` ning TS nusxasi:
 * `lower(btrim(regexp_replace(translate(coalesce(t,''), <6 apostrof>, ''''''), '\s+', ' ', 'g')))`.
 * Tartib SQL bilan bir xil: apostrof → bo'shliqlarni bittaga → chetlarini kesish → kichik harf.
 */
export function catalogNorm(t: string | null | undefined): string {
  return (t ?? '').replace(SQL_APOSTROPHES, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Server nuqtai nazaridan bir xil nommi (bo'sh nom hech narsaga teng emas) */
export function sameCatalogName(a: string, b: string): boolean {
  const ka = catalogNorm(a);
  return ka !== '' && ka === catalogNorm(b);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server `post_sale` qabul qiladigan product_id shaklimi (aks holda yuborilmaydi) */
export function isProductId(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

const byAge = (a: Product, b: Product) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Savdo qatori serverda qaysi tovarga bog'lanadi (post_sale, 006 migratsiya qoidasi):
 * 1) `productId` bo'yicha, birlik mos bo'lsa (arxivlangan bo'lsa ham — server is_active tekshirmaydi);
 * 2) aks holda faol, bir xil `catalogNorm` nom va birlikdagi ENG ESKI tovar (created_at, id);
 * 3) topilmasa undefined: qator tovarsiz saqlanadi (ombor harakati yo'q).
 */
export function resolveSaleProduct(products: readonly Product[], line: Pick<DraftLine, 'productId' | 'productName' | 'unit'>): Product | undefined {
  if (line.productId) {
    const p = products.find((x) => x.id === line.productId);
    if (p && p.unit === line.unit) return p;
  }
  const n = catalogNorm(line.productName);
  if (!n) return undefined;
  return products.filter((p) => p.is_active && p.unit === line.unit && catalogNorm(p.name) === n).sort(byAge)[0];
}

/**
 * Qatorni tahrirlash (sof): nom server ma'nosida o'zgarsa yoki birlik o'zgarsa, eski tanlov endi to'g'ri emas —
 * `productId` tozalanadi (server nom bo'yicha qayta bog'laydi). `patch` o'zi `productId` bersa, shu ustun.
 */
export function patchSaleLine(line: DraftLine, patch: Partial<DraftLine>): DraftLine {
  const next = { ...line, ...patch };
  if ('productId' in patch || !line.productId) return next;
  const renamed = patch.productName !== undefined && catalogNorm(patch.productName) !== catalogNorm(line.productName);
  const reunit = patch.unit !== undefined && patch.unit !== line.unit;
  return renamed || reunit ? { ...next, productId: null } : next;
}

/** Tahrirda nom (server ma'nosida) yoki birlik o'zgardimi: faqat shunda takror tekshiriladi (faqat narxni tuzatish to'silmaydi) */
export function identityChanged(p: Pick<Product, 'name' | 'unit'>, next: { name: string; unit: Unit }): boolean {
  return catalogNorm(p.name) !== catalogNorm(next.name) || p.unit !== next.unit;
}

const unitLabel = (u: Unit) => uz.units[u] ?? u;

export interface DuplicateCheck {
  /** Saqlashni to'xtatadigan xato (bir xil nom + birlik); null — saqlash mumkin */
  error: string | null;
  /** Arxivda aynan shu tovar bor: yangisini yaratish o'rniga faollashtirish taklif qilinadi */
  reactivate: Product | null;
  /** Saqlashni to'smaydigan ogohlantirishlar (sariq) */
  warnings: string[];
}

/**
 * Takroriy tovar tekshiruvi (shu do'kon katalogi, `selfId` — tahrirlanayotgan tovar, o'zi bilan solishtirilmaydi).
 * - faol, bir xil nom va birlik → xato (saqlanmaydi): server nom bo'yicha eng eskisini oladi, ikkinchisi "ko'rinmas" bo'ladi;
 * - arxivda bir xil nom va birlik → yangi yaratishda xato + faollashtirish taklifi; tahrirda faqat ogohlantirish;
 * - bir xil nom, boshqa birlik → ogohlantirish;
 * - Kirill/Lotin yoki apostrof farqi bilan o'xshash nom → ogohlantirish.
 */
export function checkProductDuplicate(
  products: readonly Product[],
  input: { name: string; unit: Unit },
  opts: { selfId?: string | null; mode: 'create' | 'edit' },
): DuplicateCheck {
  const out: DuplicateCheck = { error: null, reactivate: null, warnings: [] };
  const n = catalogNorm(input.name);
  if (!n) return out;
  const others = products.filter((p) => p.id !== opts.selfId);
  const same = others.filter((p) => catalogNorm(p.name) === n);
  const label = `«${input.name.trim()}» (${unitLabel(input.unit)})`;

  const activeTwin = same.filter((p) => p.is_active && p.unit === input.unit).sort(byAge)[0];
  if (activeTwin) {
    out.error = `${label} katalogda bor. Mavjud tovarni ishlating yoki nomini farqlang.`;
    return out;
  }
  const archivedTwin = same.filter((p) => !p.is_active && p.unit === input.unit).sort(byAge)[0];
  if (archivedTwin) {
    if (opts.mode === 'create') {
      out.error = `${label} arxivda bor. Yangisini yaratish o'rniga uni faollashtiring.`;
      out.reactivate = archivedTwin;
      return out;
    }
    out.warnings.push(`${label} arxivda ham bor. Bir tovar bo'lsa, arxivdagini faollashtirish to'g'riroq.`);
  }

  const otherUnits = [...new Set(same.filter((p) => p.unit !== input.unit).map((p) => unitLabel(p.unit)))];
  if (otherUnits.length > 0) {
    out.warnings.push(`«${input.name.trim()}» katalogda boshqa birlikda ham bor (${otherUnits.join(', ')}). Bir tovar bo'lsa, o'shani ishlating.`);
  }

  const lk = looseKey(input.name);
  const similar = others.filter((p) => catalogNorm(p.name) !== n && lk !== '' && looseKey(p.name) === lk);
  if (similar.length > 0) {
    out.warnings.push(`O'xshash nom katalogda bor: ${similar.map((p) => `«${p.name}»`).join(', ')}. Bir tovar bo'lsa, o'shani ishlating.`);
  }
  return out;
}

/**
 * K3 (014): ombor harakati bor tovarda birlik o'zgarmaydi — server `unit_locked` bilan rad etadi, web oldindan aytadi.
 * Boshqa birlikda sotish kerak bo'lsa: yangi tovar (masalan «Un (kg)») qo'shiladi, eskisi arxivlanadi.
 */
export function unitLockedMessage(name: string): string {
  return `«${name}» bo'yicha ombor harakati bor: birligini o'zgartirib bo'lmaydi (qoldiq hisobi buziladi). Boshqa birlik kerak bo'lsa, yangi tovar qo'shing va eskisini arxivlang.`;
}
