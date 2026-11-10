/**
 * "Tuzatish" mexanizmining sof mantig'i (UI'siz, testlanadi): maydon tavsifi va tekshiruv.
 * Tekshiruv mavjud `parseMoneyInput` / `parseQtyInput` bilan; xato katakda ko'rinadi, qiymat yo'qolmaydi.
 */
import { parseMoneyInput, parseQtyInput } from './money';

export type FieldKind = 'text' | 'money' | 'qty' | 'select';

export interface FieldDef {
  key: string;
  /** aria-label va xato matni uchun */
  label: string;
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
  /** money: 0 ruxsat etiladimi */
  allowZero?: boolean;
  /** money: bo'sh qiymat ruxsat (masalan sotuv narxi yo'q) */
  optional?: boolean;
  options?: readonly { value: string; label: string }[];
  /** Qo'shimcha tekshiruv: xato matni yoki null */
  check?: (value: string, all: Readonly<Record<string, string>>) => string | null;
}

export type RowValues = Readonly<Record<string, string>>;
export type RowErrors = Record<string, string>;

/** Bitta maydonni tekshiradi: xato matni yoki null */
export function validateField(f: FieldDef, value: string, all: RowValues = {}): string | null {
  const v = value.trim();
  if (f.kind === 'text') {
    if (f.required && !v) return `${f.label}ni kiriting`;
    if (f.maxLength && v.length > f.maxLength) return `${f.label} juda uzun (eng ko'pi ${f.maxLength})`;
  } else if (f.kind === 'money') {
    if (!v) return f.optional ? null : `${f.label}ni kiriting`;
    const r = parseMoneyInput(v, { allowZero: f.allowZero });
    if (!r.ok) return r.message;
  } else if (f.kind === 'qty') {
    if (!v) return f.optional ? null : `${f.label}ni kiriting`;
    const r = parseQtyInput(v);
    if (!r.ok) return r.message;
  } else if (f.kind === 'select') {
    if (f.required && !v) return `${f.label}ni tanlang`;
    if (v && f.options && !f.options.some((o) => o.value === v)) return `${f.label} noto'g'ri`;
  }
  return f.check ? f.check(value, all) : null;
}

/** Hamma (yoki faqat `only`) maydonlarni tekshiradi. Bo'sh obyekt = xato yo'q */
export function validateRow(fields: readonly FieldDef[], values: RowValues, only?: string): RowErrors {
  const errors: RowErrors = {};
  for (const f of fields) {
    if (only && f.key !== only) continue;
    const e = validateField(f, values[f.key] ?? '', values);
    if (e) errors[f.key] = e;
  }
  return errors;
}

/** Qiymat o'zgardimi (saqlash kerakmi): bo'sh joylar e'tiborsiz */
export function isDirty(initial: RowValues, values: RowValues, only?: string): boolean {
  const keys = only ? [only] : Object.keys({ ...initial, ...values });
  return keys.some((k) => (initial[k] ?? '').trim() !== (values[k] ?? '').trim());
}
