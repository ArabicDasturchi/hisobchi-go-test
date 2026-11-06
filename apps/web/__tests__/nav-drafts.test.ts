import { describe, expect, it } from 'vitest';
import { BOTTOM_ITEMS, isActive, isItemActive, LEDGERS_ITEM, NAV_GROUPS, NAV_ITEMS, pageTitle, parentSection, SETTINGS_ITEM } from '../src/components/layout/nav';

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
      ['Asosiy', ['/dashboard', '/sales', '/drafts']],
      ['Daftarlar', ['/suppliers', '/customers']],
      ['Baza', ['/products', '/warehouse']],
    ]);
    expect(SETTINGS_ITEM.href).toBe('/settings');
  });

  it("ortiqcha band yo'q: To'lovlar, Qarzlar, Kirim/Chiqim daftari, Hisobotlar menyuda emas", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    for (const gone of ['/payments', '/debts', '/books/in', '/books/out', '/reports']) expect(hrefs).not.toContain(gone);
    expect(hrefs).toHaveLength(8);
  });

  it('telefonda pastki panel: Bosh sahifa, Savdolar, Daftarlar (+ Menyu tugmasi AppShell da)', () => {
    expect(BOTTOM_ITEMS.map((i) => i.label)).toEqual(['Bosh sahifa', 'Savdolar', 'Daftarlar']);
  });

  it("\"Daftarlar\" ham mijozlar, ham ta'minotchilar sahifasida faol", () => {
    expect(isItemActive('/customers', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/customers/abc', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/suppliers', LEDGERS_ITEM)).toBe(true);
    expect(isItemActive('/warehouse', LEDGERS_ITEM)).toBe(false);
  });

  it('ichki sahifa sarlavhalari va ota bo\'lim', () => {
    expect(pageTitle('/dashboard/report')).toBe('Hisobot');
    expect(parentSection('/dashboard/report')?.href).toBe('/dashboard');
    expect(pageTitle('/purchases/new')).toBe('Kirim yozish');
    expect(parentSection('/purchases/new')?.href).toBe('/suppliers');
    expect(pageTitle('/customers/1')).toBe('Mijoz daftari');
  });
});
