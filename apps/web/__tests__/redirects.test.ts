import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENU_REDIRECTS } from '../src/lib/redirects';
import nextConfig from '../next.config';

const APP = path.resolve(__dirname, '../src/app/(app)');
/** Yo'naltirish manzilining sahifasi mavjudligini tekshiradi (query olib tashlanadi) */
const pageExists = (dest: string) => existsSync(path.join(APP, ...dest.split('?')[0]!.split('/').filter(Boolean), 'page.tsx'));

describe('eski menyu URL\'lari yangi joyga yo\'naltiriladi', () => {
  it('har eski URL uchun yo\'naltirish bor va manzil sahifasi mavjud', () => {
    const map = Object.fromEntries(MENU_REDIRECTS.map((r) => [r.source, r.destination]));
    expect(map['/payments']).toBe('/customers');
    expect(map['/debts']).toBe('/customers?filter=debt');
    expect(map['/reports']).toBe('/dashboard/report');
    for (const r of MENU_REDIRECTS) expect(pageExists(r.destination), `${r.source} -> ${r.destination}`).toBe(true);
  });

  it("eski manba sahifalari o'chirilgan (redirect bilan to'qnashmaydi)", () => {
    for (const r of MENU_REDIRECTS) expect(pageExists(r.source), `${r.source} sahifasi qolgan`).toBe(false);
  });

  it('next.config.ts shu ro\'yxatni qaytaradi', async () => {
    expect(await nextConfig.redirects?.()).toEqual([...MENU_REDIRECTS]);
  });
});
