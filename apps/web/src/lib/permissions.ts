/**
 * Ruxsat tekshiruvi — YAGONA nuqta. Hozir ilova faqat do'kon egasi uchun quriladi; rollar (prodavec va h.k.)
 * keyin qo'shiladi. Sahifa va komponentlar `role === 'owner'` deb qattiq yozmaydi, faqat `can(role, action)` ni chaqiradi:
 * rol qo'shilganda faqat shu jadval o'zgaradi.
 */
import type { Role } from './data/types';

/** Amallar ro'yxati. Yangi cheklov kerak bo'lsa avval shu yerga qo'shiladi */
export type Action =
  | 'settings.manage' // do'kon nomi, birliklar
  | 'ledger.write' // daftarga yozuv: savdo, to'lov, kirim
  | 'ledger.reverse' // yozuvni bekor qilish (teskari yozuv)
  | 'stock.adjust' // ombor tuzatishi (inventarizatsiya)
  | 'partner.manage'; // mijoz/ta'minotchi qo'shish, tahrirlash, arxivlash

const ALL: readonly Role[] = ['owner', 'admin', 'member'];

/** Qaysi rol qaysi amalni bajara oladi. Hozirgi xatti-harakat saqlangan: faqat sozlamalar egasiga tegishli */
export const PERMISSIONS: Readonly<Record<Action, readonly Role[]>> = {
  'settings.manage': ['owner'],
  'ledger.write': ALL,
  'ledger.reverse': ALL,
  'stock.adjust': ALL,
  'partner.manage': ALL,
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}
