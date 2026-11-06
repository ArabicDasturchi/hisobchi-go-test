import { describe, expect, it } from 'vitest';
import { agedDebt, isoMinusDays, type LedgerEntry } from '../src/index.js';

const e = (id: string, kind: LedgerEntry['kind'], date: string, amount: bigint, cancelled = false): LedgerEntry => ({ id, kind, date, amount, cancelled });
const ASOF = '2026-11-10';

describe('30+ kunlik qarz (FIFO)', () => {
  it('sana arifmetikasi', () => {
    expect(isoMinusDays('2026-11-10', 30)).toBe('2026-10-11');
    expect(isoMinusDays('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('hammasi yangi: eskirgan qarz yo\'q', () => {
    expect(agedDebt([e('a', 'goods', '2026-11-05', 1000n)], ASOF)).toBe(0n);
  });

  it('eski tovar to\'lanmagan: butunlay eskirgan', () => {
    expect(agedDebt([e('a', 'goods', '2026-09-01', 1000n)], ASOF)).toBe(1000n);
  });

  it('to\'lov eng eski tovarni yopadi: 1000 (eski) + 300 (yangi) − 400 = 900 qoldiq, shundan 600 eski', () => {
    const r = agedDebt([e('a', 'goods', '2026-09-01', 1000n), e('b', 'goods', '2026-11-08', 300n), e('p', 'payment', '2026-11-09', 400n)], ASOF);
    expect(r).toBe(600n);
  });

  it('eski tovar to\'liq to\'langan bo\'lsa 0', () => {
    expect(agedDebt([e('a', 'goods', '2026-09-01', 1000n), e('b', 'goods', '2026-11-08', 300n), e('p', 'payment', '2026-11-09', 1000n)], ASOF)).toBe(0n);
  });

  it('chegara: aynan 30 kun oldingi tovar eski, 29 kun oldingi yangi', () => {
    expect(agedDebt([e('a', 'goods', '2026-10-11', 100n)], ASOF)).toBe(100n);
    expect(agedDebt([e('a', 'goods', '2026-10-12', 100n)], ASOF)).toBe(0n);
  });

  it('boshlang\'ich qarz doim eski; bekor qilingan hisobga kirmaydi', () => {
    expect(agedDebt([e('o', 'opening', '2026-11-09', 500n), e('x', 'goods', '2026-09-01', 999n, true)], ASOF)).toBe(500n);
  });

  it('ortiqcha to\'lov (manfiy qoldiq) 0', () => {
    expect(agedDebt([e('a', 'goods', '2026-09-01', 100n), e('p', 'payment', '2026-09-02', 500n)], ASOF)).toBe(0n);
  });
});
