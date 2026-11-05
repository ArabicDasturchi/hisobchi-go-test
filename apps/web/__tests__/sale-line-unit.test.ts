import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Manba-kod tekshiruvi (UI render muhiti yo'q): savdo qatorida birlik tanlovi bo'lmasligi kerak.
 * Birlik tovar kartasidan olinadi va faqat matn (miqdor maydoni oxirida) sifatida ko'rsatiladi.
 */
const src = readFileSync(path.resolve(__dirname, '../src/app/(app)/sales/new/page.tsx'), 'utf8');

describe('Yangi savdo: birlik tahrirlanmaydi (PANEL-2 S2)', () => {
  it('birlik <select> va UNITS ro‘yxati yo‘q', () => {
    expect(src).not.toMatch(/aria-label="Birlik"/);
    expect(src).not.toMatch(/\bUNITS\b/);
    expect(src).not.toMatch(/onChange=\{\(e\) => update\([^)]*\{ unit:/);
  });
  it('birlik miqdor maydonida matn sifatida ko‘rinadi', () => {
    expect(src).toMatch(/suffix=\{uz\.units\[l\.unit\]\}/);
  });
});
