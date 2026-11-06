/**
 * Daftar varag'i: ketma-ket qoldiq. Namuna qog'oz daftardan: Eski 47 163 000 + Tovar 9 268 000 = Jami 56 431 000,
 * Berildi 10 000 000 → Ostatka 46 431 000.
 */
import { describe, expect, it } from 'vitest';
import { assertLedgerChain, assertLedgerMatches, ledgerBalance, ledgerRows, partnerBalance, TotalsMismatchError, type LedgerEntry } from '../src/index.js';

const e = (id: string, kind: LedgerEntry['kind'], date: string, amount: bigint, cancelled = false, at?: string): LedgerEntry => ({ id, kind, date, amount, cancelled, at });

describe('daftar namunasi', () => {
  it('Eski 47 163 000 + Tovar 9 268 000 = Jami 56 431 000, Berildi 10 000 000 → Ostatka 46 431 000', () => {
    const rows = ledgerRows([e('o', 'opening', '2026-10-01', 47_163_000n), e('s1', 'goods', '2026-11-03', 9_268_000n), e('p1', 'payment', '2026-11-03', 10_000_000n)]);
    expect(rows).toHaveLength(2);
    const day = rows[1]!;
    expect(day.old).toBe(47_163_000n);
    expect(day.goods).toBe(9_268_000n);
    expect(day.total).toBe(56_431_000n);
    expect(day.paid).toBe(10_000_000n);
    expect(day.balance).toBe(46_431_000n);
  });

  it("zanjir: har qatorning Eski'si oldingi Ostatka'ga teng", () => {
    const rows = ledgerRows([
      e('s1', 'goods', '2026-11-01', 100_000n),
      e('p1', 'payment', '2026-11-02', 30_000n),
      e('s2', 'goods', '2026-11-04', 55_000n),
      e('p2', 'payment', '2026-11-04', 5_000n),
    ]);
    expect(rows.map((r) => [r.old, r.goods, r.paid, r.balance])).toEqual([
      [0n, 100_000n, 0n, 100_000n],
      [100_000n, 0n, 30_000n, 70_000n],
      [70_000n, 55_000n, 5_000n, 120_000n],
    ]);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.old).toBe(rows[i - 1]!.balance);
    expect(() => assertLedgerChain(rows)).not.toThrow();
    expect(ledgerBalance(rows)).toBe(120_000n);
  });

  it("kiritish tartibi ahamiyatsiz: sana bo'yicha tartiblanadi", () => {
    const rows = ledgerRows([e('b', 'goods', '2026-11-05', 20n), e('a', 'goods', '2026-11-01', 10n)]);
    expect(rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-05']);
    expect(rows[1]!.old).toBe(10n);
  });
});

describe('teskari yozuv (bekor qilingan)', () => {
  it('bekor qilingan savdo qatorda qoladi, lekin jamiga kirmaydi', () => {
    const rows = ledgerRows([e('s1', 'goods', '2026-11-01', 100n), e('s2', 'goods', '2026-11-02', 40n, true), e('p', 'payment', '2026-11-03', 30n)]);
    expect(rows).toHaveLength(3);
    expect(rows[1]!.allCancelled).toBe(true);
    expect(rows[1]!.goods).toBe(0n);
    expect(rows[1]!.old).toBe(100n);
    expect(rows[1]!.balance).toBe(100n);
    expect(rows[1]!.entries).toHaveLength(1);
    expect(ledgerBalance(rows)).toBe(70n);
  });

  it("bekor qilingan to'lov hisobga kirmaydi (qarz qaytadi)", () => {
    const rows = ledgerRows([e('s', 'goods', '2026-11-01', 100n), e('p', 'payment', '2026-11-01', 60n, true)]);
    expect(rows[0]!.paid).toBe(0n);
    expect(rows[0]!.allCancelled).toBe(false);
    expect(ledgerBalance(rows)).toBe(100n);
  });

  it("bir kunning bir yozuvi bekor qilingan bo'lsa, qator faol qoladi", () => {
    const rows = ledgerRows([e('s1', 'goods', '2026-11-01', 100n), e('s2', 'goods', '2026-11-01', 50n, true)]);
    expect(rows[0]!.goods).toBe(100n);
    expect(rows[0]!.entries).toHaveLength(2);
  });
});

describe("ochilish qoldig'i", () => {
  it("birinchi qator, Tovar jamiga qo'shilmaydi (Kirim daftaridagi 60 186 000 xatosi)", () => {
    const rows = ledgerRows([e('s', 'goods', '2026-10-05', 1_000_000n), e('o', 'opening', '2026-11-05', 60_186_000n)]);
    expect(rows[0]!.kind).toBe('opening');
    expect(rows[0]!.opening).toBe(60_186_000n);
    expect(rows[0]!.goods).toBe(0n);
    expect(rows[0]!.balance).toBe(60_186_000n);
    expect(rows[1]!.old).toBe(60_186_000n);
    expect(rows[1]!.goods).toBe(1_000_000n);
    expect(rows.reduce((a, r) => a + r.goods, 0n)).toBe(1_000_000n);
    expect(ledgerBalance(rows)).toBe(61_186_000n);
  });

  it("bekor qilingan ochilish qoldig'i zanjirga kirmaydi", () => {
    const rows = ledgerRows([e('o', 'opening', '2026-11-01', 500n, true), e('s', 'goods', '2026-11-02', 10n)]);
    expect(rows[0]!.allCancelled).toBe(true);
    expect(rows[0]!.balance).toBe(0n);
    expect(ledgerBalance(rows)).toBe(10n);
  });

  it("ikki ochilish (biri bekor, ikkinchisi to'g'rilangan) — faqat faoli", () => {
    const rows = ledgerRows([e('o1', 'opening', '2026-11-01', 500n, true), e('o2', 'opening', '2026-11-02', 700n)]);
    expect(ledgerBalance(rows)).toBe(700n);
  });
});

describe("ikkinchi yo'l bilan solishtirish", () => {
  const entries = [e('o', 'opening', '2026-10-01', 47_163_000n), e('s', 'goods', '2026-11-03', 9_268_000n), e('p', 'payment', '2026-11-03', 10_000_000n), e('x', 'goods', '2026-11-04', 1n, true)];

  it('partnerBalance (core) bilan mos', () => {
    const rows = ledgerRows(entries);
    const independent = partnerBalance(entries.map((x) => ({ kind: x.kind === 'payment' ? ('payment' as const) : ('goods' as const), date: x.date, amount: x.amount, cancelled: x.cancelled })));
    expect(assertLedgerMatches(rows, independent)).toBe(46_431_000n);
  });

  it("mos kelmasa TotalsMismatchError — to'xtaydi", () => {
    expect(() => assertLedgerMatches(ledgerRows(entries), 46_431_001n, 'mijoz')).toThrow(TotalsMismatchError);
  });

  it("manfiy summa va noto'g'ri sana rad etiladi", () => {
    expect(() => ledgerRows([e('a', 'goods', '2026-11-01', -1n)])).toThrow();
    expect(() => ledgerRows([e('a', 'goods', '01.11.2026', 1n)])).toThrow();
  });

  it("bo'sh daftar: qoldiq 0", () => {
    expect(ledgerRows([])).toEqual([]);
    expect(ledgerBalance([])).toBe(0n);
  });
});
