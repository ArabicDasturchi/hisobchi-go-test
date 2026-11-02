/** Pul va miqdor: butun son. PostgREST bigint'ni son yoki satr sifatida qaytarishi mumkin. */
import { z } from 'zod';

export const bigintLike = z
  .union([z.number().int().safe(), z.string().regex(/^-?\d+$/)])
  .transform((v) => BigInt(v));

/** JSON javob uchun: xavfsiz butun son bo'lishi shart, aks holda xato (jimgina yaxlitlash yo'q). */
export function toSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Son JSON uchun juda katta');
  }
  return Number(v);
}
