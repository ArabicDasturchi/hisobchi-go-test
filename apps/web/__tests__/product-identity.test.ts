/**
 * W4: bir xil nomli tovarlar. Savdo qatori aynan tanlangan tovarga bog'lanishi (product_id), nom/birlik tahririda
 * tanlov tozalanishi, takroriy tovar yaratilmasligi va normalizatsiya server `catalog_norm` bilan bir xilligi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeProductName } from '@hisobchi/core';
import { describe, expect, it } from 'vitest';
import type { Product, Unit } from '@/lib/data/types';
import { lineStatus } from '@/lib/lineStatus';
import type { DraftLine } from '@/lib/saleForm';
import { catalogNorm, checkProductDuplicate, identityChanged, patchSaleLine, resolveSaleProduct, sameCatalogName } from '@/lib/productIdentity';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const C_ID = '33333333-3333-4333-8333-333333333333';

const P = (id: string, name: string, o: Partial<Product> = {}): Product => ({
  id,
  name,
  unit: 'kg',
  last_price: 12_000n,
  cost_price: null,
  is_active: true,
  source: 'app',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...o,
});

/** Ikki bir xil nomli "Shakar" (kg): A eskiroq (server nom bo'yicha shuni oladi), B keyin qo'shilgan */
const A = P(A_ID, 'Shakar', { created_at: '2026-01-01T00:00:00Z', cost_price: 10_000n });
const B = P(B_ID, 'Shakar', { created_at: '2026-03-01T00:00:00Z', last_price: 14_000n, cost_price: 13_000n });
const CAT = [B, A];

describe('W4: nom yoki birlik tahririda productId tozalanadi', () => {
  const picked: DraftLine = { key: 'x', productId: B_ID, productName: 'Shakar', qty: '1', unit: 'kg', price: '14 000' };

  it('nom boshqa tovarga o‘zgarsa — tozalanadi', () => {
    expect(patchSaleLine(picked, { productName: 'Shakar upa' }).productId).toBeNull();
  });
  it('birlik o‘zgarsa — tozalanadi', () => {
    expect(patchSaleLine(picked, { unit: 'dona' }).productId).toBeNull();
  });
  it('faqat registr/bo‘shliq farqi (server uchun bir xil nom) — saqlanadi', () => {
    expect(patchSaleLine(picked, { productName: '  SHAKAR ' }).productId).toBe(B_ID);
  });
  it('soni yoki narxi o‘zgarsa — saqlanadi', () => {
    expect(patchSaleLine(picked, { qty: '3', price: '15 000' })).toMatchObject({ productId: B_ID, qty: '3', price: '15 000' });
  });
  it('patch o‘zi productId bersa — o‘sha ustun', () => {
    expect(patchSaleLine(picked, { productName: 'Boshqa', productId: A_ID }).productId).toBe(A_ID);
  });
});

describe('W4: ombor va tan narx ogohlantirishi to‘g‘ri tovardan', () => {
  it('tanlovsiz qator server kabi eng eski faol, birligi mos tovarga bog‘lanadi', () => {
    const line = { productId: null, productName: 'shakar', unit: 'kg' as Unit };
    expect(resolveSaleProduct(CAT, line)?.id).toBe(A_ID);
    expect(resolveSaleProduct(CAT, { ...line, unit: 'dona' })).toBeUndefined();
    // productId bor, lekin birlik mos emas → server nom bo'yicha qaytadi
    expect(resolveSaleProduct(CAT, { productId: B_ID, productName: 'Shakar', unit: 'dona' })).toBeUndefined();
    expect(resolveSaleProduct([...CAT, P(C_ID, 'Shakar', { unit: 'dona' })], { productId: B_ID, productName: 'Shakar', unit: 'dona' })?.id).toBe(C_ID);
  });

  it('arxivlangan tovar id bilan tanlangan bo‘lsa ham shu tovar (server is_active tekshirmaydi)', () => {
    const old = P(C_ID, 'Shakar', { is_active: false });
    expect(resolveSaleProduct([old], { productId: C_ID, productName: 'Shakar', unit: 'kg' })?.id).toBe(C_ID);
    expect(lineStatus({ key: 'q', productId: C_ID, productName: 'Shakar', qty: '1', unit: 'kg', price: '1' }, [old]).isNew).toBe(false);
  });
});

describe('W4: takroriy tovar rad etiladi', () => {
  it('bir xil nom va birlik (registr, bo‘shliq, apostrof farqi bilan ham) — xato', () => {
    const r = checkProductDuplicate(CAT, { name: '  SHAKAR ', unit: 'kg' }, { mode: 'create' });
    expect(r.error).toBe("«SHAKAR» (kg) katalogda bor. Mavjud tovarni ishlating yoki nomini farqlang.");
    const qur = [P(C_ID, "Qur'on")];
    expect(checkProductDuplicate(qur, { name: 'Qur’on', unit: 'kg' }, { mode: 'create' }).error).not.toBeNull();
  });

  it('bir xil nom, boshqa birlik — saqlash mumkin, lekin ogohlantirish', () => {
    const r = checkProductDuplicate(CAT, { name: 'Shakar', unit: 'dona' }, { mode: 'create' });
    expect(r.error).toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('boshqa birlikda');
  });

  it('arxivda aynan shu tovar — yaratish to‘xtaydi va faollashtirish taklif qilinadi', () => {
    const arch = P(C_ID, 'Guruch', { is_active: false });
    const r = checkProductDuplicate([arch], { name: 'guruch', unit: 'kg' }, { mode: 'create' });
    expect(r.error).toContain('arxivda bor');
    expect(r.reactivate?.id).toBe(C_ID);
    // Tahrirda arxivdagi egizak faqat ogohlantirish
    const e = checkProductDuplicate([arch, P(A_ID, 'Gurunch')], { name: 'Guruch', unit: 'kg' }, { selfId: A_ID, mode: 'edit' });
    expect(e.error).toBeNull();
    expect(e.warnings[0]).toContain('arxivda ham bor');
  });

  it('tahrirda o‘zi bilan solishtirilmaydi; boshqa faol egizakka qayta nomlash — xato', () => {
    expect(checkProductDuplicate(CAT, { name: 'Shakar', unit: 'kg' }, { selfId: A_ID, mode: 'edit' }).error).not.toBeNull();
    expect(checkProductDuplicate([A], { name: 'Shakar', unit: 'kg' }, { selfId: A_ID, mode: 'edit' }).error).toBeNull();
  });

  it('Kirill/Lotin o‘xshash nom — server uchun boshqa nom, faqat ogohlantirish', () => {
    const r = checkProductDuplicate(CAT, { name: 'Шакар', unit: 'kg' }, { mode: 'create' });
    expect(r.error).toBeNull();
    expect(r.warnings.some((w) => w.includes("O'xshash nom"))).toBe(true);
  });

  it('identityChanged: faqat narx o‘zgarsa takror tekshirilmaydi (eski takrorlar narxini tuzatish to‘silmaydi)', () => {
    expect(identityChanged(A, { name: ' shakar', unit: 'kg' })).toBe(false);
    expect(identityChanged(A, { name: 'Shakar', unit: 'g' })).toBe(true);
    expect(identityChanged(A, { name: 'Shakar oq', unit: 'kg' })).toBe(true);
  });
});

describe('W4: catalogNorm = SQL catalog_norm (005_agent_catalog.sql)', () => {
  const SQL = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/005_agent_catalog.sql'), 'utf8');
  const def = /CREATE OR REPLACE FUNCTION catalog_norm\(t text\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(SQL)?.[1] ?? '';

  it('SQL ta’rifi kutilgan shaklda (o‘zgarsa bu test va TS nusxa birga yangilanadi)', () => {
    expect(def).toMatch(/lower\(btrim\(regexp_replace\(/);
    expect(def).toMatch(/'\\s\+', ' ', 'g'/);
    expect(def).toMatch(/repeat\(chr\(39\), 6\)/);
  });

  it('SQL dagi har bir apostrof belgisi (chr(N)) ASCII apostrofga aylanadi', () => {
    const codes = [...def.matchAll(/chr\((\d+)\)/g)].map((m) => Number(m[1])).filter((c) => c !== 39);
    expect(codes).toEqual([699, 700, 8216, 8217, 96, 180]);
    for (const c of codes) expect(catalogNorm(`to${String.fromCodePoint(c)}rt`)).toBe("to'rt");
  });

  it.each([
    ['  SHAKAR  ', 'shakar'],
    ['Oq   Un', 'oq un'],
    ['oq\tun', 'oq un'],
    ['\n Guruch \t', 'guruch'],
    ['to´rt', "to'rt"],
    ['Шакар', 'шакар'],
    ['', ''],
  ])('catalog_norm(%j) = %j', (input, expected) => {
    expect(catalogNorm(input)).toBe(expected);
  });

  it('null → bo‘sh; Kirill va Lotin birlashtirilmaydi (server ham o‘girmaydi)', () => {
    expect(catalogNorm(null)).toBe('');
    expect(sameCatalogName('Шакар', 'Shakar')).toBe(false);
    expect(sameCatalogName('', '')).toBe(false);
  });

  it('core normalizeProductName dan farqi (shuning uchun alohida funksiya): tab va ´', () => {
    expect(normalizeProductName('oq\tun')).not.toBe(catalogNorm('oq\tun'));
    expect(normalizeProductName('to´rt')).not.toBe(catalogNorm('to´rt'));
  });
});
