/**
 * Yoqilgan o'lchov birliklari (do'kon sozlamasi). FAQAT UI filtri: `ALLOWED_UNITS` (core) qisqartirilmaydi, eski
 * tovarlar va hujjat qatorlaridagi birliklar (kg, litr, ...) o'z holicha qoladi.
 * Standart: faqat dona va pachka; boshqalarini Sozlamalar → Birliklar da qo'lda yoqish mumkin.
 */
import { ALLOWED_UNITS, type AllowedUnit } from '@hisobchi/core';

export const DEFAULT_UNITS: readonly AllowedUnit[] = ['dona', 'pachka'];

const isUnit = (v: unknown): v is AllowedUnit => typeof v === 'string' && (ALLOWED_UNITS as readonly string[]).includes(v);

/** ALLOWED_UNITS tartibida, takrorlarsiz */
function ordered(units: Iterable<AllowedUnit>): AllowedUnit[] {
  const set = new Set(units);
  return ALLOWED_UNITS.filter((u) => set.has(u));
}

/** `shops.settings` dan yoqilgan birliklar. Yo'q, noto'g'ri yoki bo'sh bo'lsa — standart (dona, pachka) */
export function parseEnabledUnits(settings: unknown): AllowedUnit[] {
  const raw = settings && typeof settings === 'object' ? (settings as { units?: unknown }).units : undefined;
  if (!Array.isArray(raw)) return [...DEFAULT_UNITS];
  const valid = ordered(raw.filter(isUnit));
  return valid.length > 0 ? valid : [...DEFAULT_UNITS];
}

/**
 * Tovar formasidagi tanlov: yoqilgan birliklar + (tahrirlanayotgan tovarning hozirgi birligi, o'chirilgan bo'lsa ham:
 * eski ma'lumot jimgina o'zgarib ketmasin).
 */
export function unitChoices(enabled: readonly AllowedUnit[], current?: AllowedUnit | null): AllowedUnit[] {
  return ordered(current ? [...enabled, current] : enabled);
}

/** Sozlamaga yoziladigan qiymat: tanlangan birliklar (kamida bittasi) */
export function normalizeUnitSelection(units: readonly string[]): { ok: true; units: AllowedUnit[] } | { ok: false; message: string } {
  const valid = ordered(units.filter(isUnit));
  if (valid.length === 0) return { ok: false, message: 'Kamida bitta birlikni yoqing.' };
  return { ok: true, units: valid };
}

/** Mavjud sozlamalarga (boshqa kalitlarni saqlab) `units` ni yozadi */
export function withUnits(settings: Record<string, unknown> | null | undefined, units: readonly AllowedUnit[]): Record<string, unknown> {
  return { ...(settings ?? {}), units: [...units] };
}
