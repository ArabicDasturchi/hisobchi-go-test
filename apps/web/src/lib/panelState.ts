/**
 * Boshqaruv paneli holati (UI'siz, testlanadi): amallar, "Kimga" turi va URL (`/dashboard?amal=savdo&kimga=...`).
 * Holat URL'da: orqaga tugmasi ishlaydi, "Panelda yozish" havolalari shu shaklni ishlatadi.
 */
export const PANEL_ACTIONS = ['savdo', 'tolov', 'kirim', 'ta-tolov', 'daftar'] as const;
export type PanelAction = (typeof PANEL_ACTIONS)[number];

/** Kimga chipi kimlarni ko'rsatadi: mijozlar, ta'minotchilar yoki ikkalasi (Daftarga yozish) */
export type WhoKind = 'customer' | 'supplier' | 'either';

export interface ActionInfo {
  key: PanelAction;
  /** Chipda va menyuda */
  label: string;
  /** Menyuda o'ng tomonda */
  hint: string;
  /** Asosiy maydon sarlavhasi */
  title: string;
  who: WhoKind;
  /** Kimga majburiymi (Savdoda bo'sh = mijozsiz naqd) */
  whoRequired: boolean;
  /** Chip yozuvi: "Kimga" yoki "Kimdan" */
  whoLabel: string;
  placeholder: string;
  /** Strelka tugmasi nomi */
  sendLabel: string;
}

export const ACTION_INFO: Readonly<Record<PanelAction, ActionInfo>> = {
  savdo: { key: 'savdo', label: 'Savdo', hint: 'mijozga tovar sotish', title: 'Savdo', who: 'customer', whoRequired: false, whoLabel: 'Kimga', placeholder: 'Tovar nomini yozing: masalan, atir yoki юрак', sendLabel: "Tovarni qo'shish" },
  tolov: { key: 'tolov', label: "To'lov olish", hint: 'mijozdan pul olish', title: "To'lov olish", who: 'customer', whoRequired: true, whoLabel: 'Kimdan', placeholder: "To'lov summasi, so'm", sendLabel: "To'lovni tasdiqlash" },
  kirim: { key: 'kirim', label: 'Kirim', hint: "ta'minotchidan tovar kirimi", title: 'Kirim', who: 'supplier', whoRequired: true, whoLabel: 'Kimdan', placeholder: "Tovar nomini yozing: qator qo'shiladi", sendLabel: "Tovarni qo'shish" },
  'ta-tolov': { key: 'ta-tolov', label: "Ta'minotchiga to'lov", hint: 'qarzni qaytarish', title: "Ta'minotchiga to'lov", who: 'supplier', whoRequired: true, whoLabel: 'Kimga', placeholder: "To'lov summasi, so'm", sendLabel: "To'lovni tasdiqlash" },
  daftar: { key: 'daftar', label: 'Daftarga yozish', hint: "mijoz yoki ta'minotchi daftari", title: 'Daftarga yozish', who: 'either', whoRequired: true, whoLabel: 'Kimga', placeholder: 'Masalan: kirim 1 000 000', sendLabel: "Yozuvni ko'rish" },
};

export interface PanelState {
  action: PanelAction;
  /** Mijoz yoki ta'minotchi id'si; bo'sh = tanlanmagan */
  who: string;
}

export const DEFAULT_PANEL: PanelState = { action: 'savdo', who: '' };

export function isPanelAction(v: string | null | undefined): v is PanelAction {
  return !!v && (PANEL_ACTIONS as readonly string[]).includes(v);
}

type Params = { get(name: string): string | null };

/** URL'dan holat. Eski `?customer=` (mijoz sahifasidagi "Savdo" tugmalari) ham tushuniladi */
export function parsePanelParams(params: Params): PanelState {
  const a = params.get('amal');
  const action: PanelAction = isPanelAction(a) ? a : 'savdo';
  const who = (params.get('kimga') ?? params.get('customer') ?? '').trim();
  return { action, who: /^[0-9a-f-]{8,64}$/i.test(who) ? who : '' };
}

/** Holat → URL ("savdo" va bo'sh kimga yozilmaydi: toza manzil `/dashboard`) */
export function panelHref(state: Partial<PanelState>, base = '/dashboard'): string {
  const q = new URLSearchParams();
  if (state.action && state.action !== 'savdo') q.set('amal', state.action);
  if (state.who) q.set('kimga', state.who);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Amal almashganda "Kimga" mos kelmasa (mijoz ↔ ta'minotchi) tozalanadi */
export function whoForAction(action: PanelAction, who: string, ids: { customers: ReadonlySet<string>; suppliers: ReadonlySet<string> }): string {
  if (!who) return '';
  const kind = ACTION_INFO[action].who;
  if (kind === 'customer') return ids.customers.has(who) ? who : '';
  if (kind === 'supplier') return ids.suppliers.has(who) ? who : '';
  return ids.customers.has(who) || ids.suppliers.has(who) ? who : '';
}

/** "+" menyusi: ochiq bandlar va "Tez orada" bandlar (o'chirilgan) */
export const PLUS_ITEMS = [
  { key: 'report', label: 'Hisobotlar', hint: "ko'rsatkichlar, grafik", href: '/dashboard/report' },
  { key: 'product', label: 'Yangi mahsulot', hint: '', href: '/products?yangi=1' },
  { key: 'customer', label: 'Yangi mijoz', hint: '', href: null },
  { key: 'supplier', label: "Yangi ta'minotchi", hint: '', href: null },
] as const;
export const PLUS_SOON = ["Ro'yxat yopishtirish", 'Rasm yoki fayl', 'Agentlar'] as const;
