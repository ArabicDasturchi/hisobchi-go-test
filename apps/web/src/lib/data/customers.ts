import type { Customer } from './types';

/**
 * Yangi savdo/to'lov tanlovida ko'rinadigan mijozlar: arxivlanganlari yashiriladi (tarix, savdo va qarz saqlanadi),
 * nom bo'yicha tartiblanadi.
 */
export function selectableCustomers(list: readonly Customer[]): Customer[] {
  return list.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name, 'uz'));
}

/** Mijozlar ro'yxati: oddiy ko'rinishda faqat faollar, "Arxiv" filtrida faqat arxivlanganlar */
export function inCustomerView(c: Customer, archivedView: boolean): boolean {
  return archivedView ? !c.is_active : c.is_active;
}

export const activeCustomerCount = (list: readonly Customer[]): number => list.filter((c) => c.is_active).length;
