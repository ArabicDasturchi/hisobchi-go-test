import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Manba-kod tekshiruvi (UI render muhiti yo'q): savdo qatori kartochkasida birlik tanlovi bo'lmasligi kerak.
 * Birlik tovar kartasidan olinadi va faqat matn (miqdor maydoni oxirida) sifatida ko'rsatiladi.
 */
const src = readFileSync(path.resolve(__dirname, '../src/components/sale/SaleLineCard.tsx'), 'utf8');

describe('Yangi savdo kartochkasi: birlik tahrirlanmaydi (PANEL-2 S2)', () => {
  it('birlik <select> va UNITS ro‘yxati yo‘q', () => {
    expect(src).not.toMatch(/aria-label="Birlik"/);
    expect(src).not.toMatch(/\bUNITS\b/);
    expect(src).not.toMatch(/onChange\(\{ unit:/);
  });
  it("birlik «N so'm / dona» matni sifatida ko‘rinadi", () => {
    expect(src).toMatch(/uz\.units\[line\.unit\]/);
  });
});
