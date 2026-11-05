import { ALLOWED_UNITS } from '@hisobchi/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNITS, normalizeUnitSelection, parseEnabledUnits, unitChoices, withUnits } from '@/lib/units';

describe('parseEnabledUnits', () => {
  it('sozlama yo‘q yoki noto‘g‘ri → standart: faqat dona va pachka', () => {
    for (const s of [undefined, null, {}, { units: 'kg' }, { units: [] }, { units: ['xx', 5] }, 'abc']) {
      expect(parseEnabledUnits(s)).toEqual(['dona', 'pachka']);
    }
    expect([...DEFAULT_UNITS]).toEqual(['dona', 'pachka']);
  });
  it('yoqilgan birliklar ALLOWED_UNITS tartibida, takrorsiz, noma‘lumlarsiz', () => {
    expect(parseEnabledUnits({ units: ['litr', 'dona', 'kg', 'dona', 'zzz'] })).toEqual(['dona', 'kg', 'litr']);
  });
});

describe('unitChoices (tovar formasi)', () => {
  it("sozlamada o'chirilgan birlik yangi tovar formasida chiqmaydi", () => {
    const choices = unitChoices(parseEnabledUnits({ units: ['dona'] }));
    expect(choices).toEqual(['dona']);
    expect(choices).not.toContain('pachka');
    expect(choices).not.toContain('kg');
  });
  it("standartda faqat dona va pachka (kg, litr yo'q)", () => {
    expect(unitChoices(parseEnabledUnits(undefined))).toEqual(['dona', 'pachka']);
  });
  it("mavjud tovarning o'chirilgan birligi tahrirlashda saqlanadi (eski ma'lumot buzilmaydi)", () => {
    expect(unitChoices(['dona', 'pachka'], 'kg')).toEqual(['dona', 'kg', 'pachka']);
    expect(unitChoices(['dona'], 'dona')).toEqual(['dona']);
  });
  it('core ALLOWED_UNITS qisqartirilmagan (eski ma‘lumot uchun)', () => {
    expect(ALLOWED_UNITS).toEqual(expect.arrayContaining(['kg', 'litr', 'metr', 'qop', 'tonna']));
  });
});

describe('normalizeUnitSelection / withUnits', () => {
  it('kamida bitta birlik shart', () => {
    expect(normalizeUnitSelection([]).ok).toBe(false);
    expect(normalizeUnitSelection(['zzz']).ok).toBe(false);
  });
  it('tartiblanadi va takrorlar olib tashlanadi', () => {
    expect(normalizeUnitSelection(['pachka', 'kg', 'dona', 'kg'])).toEqual({ ok: true, units: ['dona', 'kg', 'pachka'] });
  });
  it('boshqa sozlama kalitlari saqlanadi', () => {
    expect(withUnits({ lang: 'uz', units: ['kg'] }, ['dona', 'pachka'])).toEqual({ lang: 'uz', units: ['dona', 'pachka'] });
    expect(withUnits(null, ['dona'])).toEqual({ units: ['dona'] });
  });
});
