/**
 * @module cross-check
 * Ikki mustaqil hisob yo'lini solishtirish. Mos kelmasa to'xtaydi (jimgina tuzatilmaydi, saqlanmaydi).
 */
export class TotalsMismatchError extends Error {
  constructor(
    readonly label: string,
    readonly first: bigint,
    readonly second: bigint,
  ) {
    super(`Hisob mos kelmadi (${label}): ${first} != ${second}`);
    this.name = 'TotalsMismatchError';
  }
}

export function assertTotalsMatch(label: string, first: bigint, second: bigint): bigint {
  if (first !== second) throw new TotalsMismatchError(label, first, second);
  return first;
}
