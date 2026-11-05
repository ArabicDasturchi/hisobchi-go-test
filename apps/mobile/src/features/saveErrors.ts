/**
 * Saqlash xatolarini foydalanuvchiga tushunarli xabarga aylantirish.
 * Har bir xabar keyingi qadamni aytadi. Saqlash bitta tranzaksiyada bo'lgani uchun
 * xato bo'lsa hech narsa yozilmagan — buni ham aniq bildiramiz.
 */
import { CalculationMismatchError, PaymentError, SaleValidationError } from '../data/ledger';
import { PurchaseError } from '../data/purchasing';

const NOTHING_SAVED = 'Hech narsa saqlanmadi.';

export function describeSaveError(error: unknown): string {
  if (error instanceof CalculationMismatchError) {
    return `${error.message} Ro'yxatni qayta tekshiring.`;
  }
  if (error instanceof PaymentError || error instanceof PurchaseError) {
    return `${error.message}. ${NOTHING_SAVED}`;
  }
  if (error instanceof SaleValidationError) {
    return `${error.message}. ${NOTHING_SAVED} Tekshirish ekraniga qaytib, qatorni tuzating.`;
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (/FOREIGN KEY/i.test(raw)) {
    return `Tanlangan mijoz topilmadi. ${NOTHING_SAVED} Mijozni qayta tanlang.`;
  }
  if (/database is locked|SQLITE_BUSY/i.test(raw)) {
    return `Ma'lumotlar bazasi band. ${NOTHING_SAVED} Bir necha soniyadan keyin qayta urinib ko'ring.`;
  }
  if (/disk|full|SQLITE_FULL/i.test(raw)) {
    return `Qurilmada bo'sh joy yetarli emas. ${NOTHING_SAVED} Joy bo'shatib, qayta urinib ko'ring.`;
  }
  return `Savdo saqlanmadi. ${NOTHING_SAVED} Qayta urinib ko'ring. (Texnik ma'lumot: ${raw})`;
}
