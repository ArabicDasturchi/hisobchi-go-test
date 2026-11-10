import { describe, expect, it } from 'vitest';
import { BOTTOM_ITEMS, hasComposer, isActive, isItemActive, LEDGERS_ITEM, MORE_ITEM, NAV_GROUPS, NAV_ITEMS, pageTitle, parentSection, searchPlaceholder, SETTINGS_ITEM } from '../src/components/layout/nav';

describe('menyu: Qoralamalar', () => {
  it('"Asosiy" bo\'limida, sarlavha va faol holat to\'g\'ri', () => {
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === '/drafts'));
    expect(group?.label).toBe('Asosiy');
    expect(NAV_ITEMS.filter((i) => i.href === '/drafts')).toHaveLength(1);
    expect(pageTitle('/drafts')).toBe('Qoralamalar');
    expect(isActive('/drafts', '/drafts')).toBe(true);
    expect(isActive('/sales', '/drafts')).toBe(false);
  });
});

describe('yangi menyu (M1)', () => {
  it('aynan shu tartib: Asosiy, Daftarlar, Baza; Sozlamalar pastda', () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items.map((i) => i.href)])).toEqual([
      ['Asosiy', ['/dashboard', '/sales', '/drafts', '/dashboard/report']],
      ['Daftarlar', ['/suppliers', '/customers']],
      ['Baza', ['/products', '/warehouse']],
    ]);
    expect(SETTINGS_ITEM.href).toBe('/settings');
  });

  it("ortiqcha band yo'q: To'lovlar, Qarzlar, Kirim/Chiqim daftari, Hisobotlar menyuda emas", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    for (const gone of ['/payments', '/debts', '/books/in', '/books/out', '/reports']) expect(hrefs).not.toContain(gone);
    expect(hrefs).toHaveLength(9);
  });

  it('telefonda pastki menyu: Panel, Savdolar, Daftarlar, Baza (+ Yana tugmasi AppShell da)', () => {
    expect(BOTTOM_ITEMS.map((i) => i.short ?? i.label)).toEqual(['Panel', 'Savdolar', 'Daftarlar', 'Baza']);
  });

  it("\"Daftarlar\" ham mijozlar, ham ta'minotchilar sahifasida faol", () => {
    expect(isItemActive('/customers', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/customers/abc', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/suppliers', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/warehouse', LEDGERS_ITEM)).toBe(false);
  });

  it('ichki sahifa sarlavhalari va ota bo\'lim', () => {
    expect(pageTitle('/dashboard/report')).toBe('Hisobotlar');
    expect(parentSection('/dashboard/report')).toBeNull();
    expect(pageTitle('/purchases/new')).toBe('Kirim yozish');
    expect(parentSection('/purchases/new')?.href).toBe('/suppliers');
    expect(pageTitle('/customers/1')).toBe('Mijoz daftari');
  });
});

describe('P3: bo\u2018lim moslik va qidiruv', () => {
  it('Boshqaruv paneli faqat /dashboard da faol; Hisobotlar alohida', () => {
    const dash = NAV_ITEMS.find((i) => i.href === '/dashboard')!;
    expect(isItemActive('/dashboard', dash)).toBe(true);
    expect(isItemActive('/dashboard/report', dash)).toBe(false);
    expect(isItemActive('/dashboard/report', NAV_ITEMS.find((i) => i.href === '/dashboard/report')!)).toBe(true);
  });
  it('telefon moslik: Mijozlar/Taminotchilar -> Daftarlar, Mahsulotlar/Ombor -> Baza, Qoralamalar/Hisobotlar/Sozlamalar -> Yana', () => {
    const at = (path: string) => [...BOTTOM_ITEMS, MORE_ITEM].filter((i) => isItemActive(path, i)).map((i) => i.short ?? i.label);
    expect(at('/customers/x')).toEqual(['Daftarlar']);
    expect(at('/suppliers')).toEqual(['Daftarlar']);
    expect(at('/products')).toEqual(['Baza']);
    expect(at('/warehouse')).toEqual(['Baza']);
    expect(at('/sales')).toEqual(['Savdolar']);
    expect(at('/drafts')).toEqual(['Yana']);
    expect(at('/dashboard/report')).toEqual(['Yana']);
    expect(at('/settings')).toEqual(['Yana']);
    expect(at('/dashboard')).toEqual(['Panel']);
  });
  it('kiritish oynasi faqat /dashboard da', () => {
    expect(hasComposer('/dashboard')).toBe(true);
    for (const p of ['/products', '/warehouse', '/sales', '/customers', '/suppliers', '/drafts', '/dashboard/report', '/settings']) expect(hasComposer(p)).toBe(false);
  });
  it('PC qidiruvi: sahifaga mos; Hisobotlar, Sozlamalar va panelda yoq', () => {
    expect(searchPlaceholder('/products')).toBe('Mahsulot qidirish');
    expect(searchPlaceholder('/warehouse')).toBe('Tovar qidirish');
    expect(searchPlaceholder('/drafts')).toBe('Qoralama qidirish');
    expect(searchPlaceholder('/customers')).toBe('Mijoz qidirish');
    expect(searchPlaceholder('/suppliers')).toBe("Ta'minotchi qidirish");
    for (const p of ['/dashboard', '/dashboard/report', '/settings']) expect(searchPlaceholder(p)).toBeNull();
  });
});
