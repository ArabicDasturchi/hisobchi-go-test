/** Admin huquqi yo'q (RPC `not_platform_admin`, SQLSTATE 42501) */
export class ForbiddenError extends Error {
  constructor() {
    super("Ruxsat yo'q");
    this.name = 'ForbiddenError';
  }
}

/** Foydalanuvchiga ko'rsatiladigan xabar: texnik tafsilot (SQL, kalit) chiqarilmaydi */
export function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return "Ruxsat yo'q";
  const raw = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (/failed to fetch|network|fetch failed/i.test(raw)) return "Internet bilan aloqa yo'q. Qayta urinib ko'ring.";
  if (/shop_not_found/.test(raw)) return "Do'kon topilmadi.";
  return "Ma'lumotni yuklab bo'lmadi. Qayta urinib ko'ring.";
}

export function isForbidden(err: unknown): boolean {
  if (err instanceof ForbiddenError) return true;
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    return e.code === '42501' || (typeof e.message === 'string' && e.message.includes('not_platform_admin'));
  }
  return false;
}
