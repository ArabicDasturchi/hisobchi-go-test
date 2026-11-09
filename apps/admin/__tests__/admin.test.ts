import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseApi } from '@/lib/api';
import { DEMO_SHOPS, DEMO_USERS, createDemoApi, demoFunnel, demoOverview, demoShopDetail, demoShops } from '@/lib/demo';
import { ForbiddenError, errorMessage, isForbidden } from '@/lib/errors';
import { formatCount, formatDate, shortDay, timeAgo } from '@/lib/format';
import { stageOf } from '@/lib/stage';

const NOW = new Date('2026-11-09T09:00:00Z');

describe('stageOf (SQL _admin_stage_of bilan bir xil jadval)', () => {
  const base = { products: 0, suppliers: 0, purchases: 0, sales: 0, sales7d: 0 };
  it.each([
    [{ ...base }, 1],
    [{ ...base, products: 3 }, 2],
    [{ ...base, products: 3, suppliers: 1 }, 3],
    [{ ...base, products: 3, suppliers: 1, purchases: 1 }, 4],
    [{ ...base, products: 3, suppliers: 1, purchases: 1, sales: 2, sales7d: 2 }, 5],
    [{ ...base, sales: 9, sales7d: 4 }, 5],
    [{ ...base, sales: 9, sales7d: 5 }, 6],
    // ta'minotchisiz sotgan do'kon "ta'minotchida to'xtadi" deb ko'rsatilmaydi
    [{ ...base, products: 1, sales: 1, sales7d: 1 }, 5],
    // eski savdo bor, 7 kunda yo'q: faol emas
    [{ ...base, sales: 50, sales7d: 0 }, 5],
  ])('%j → %i', (facts, stage) => {
    expect(stageOf(facts)).toBe(stage);
  });
});

describe('format', () => {
  it('timeAgo', () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    expect(timeAgo(null, NOW)).toBe("Faollik yo'q");
    expect(timeAgo(at(10_000), NOW)).toBe('hozir');
    expect(timeAgo(at(5 * 60_000), NOW)).toBe('5 daqiqa oldin');
    expect(timeAgo(at(3 * 3_600_000), NOW)).toBe('3 soat oldin');
    expect(timeAgo(at(3 * 86_400_000), NOW)).toBe('3 kun oldin');
    expect(timeAgo(at(21 * 86_400_000), NOW)).toBe('3 hafta oldin');
    expect(timeAgo(at(90 * 86_400_000), NOW)).toBe('3 oy oldin');
    expect(timeAgo('xato', NOW)).toBe('—');
  });
  it('sana va sonlar', () => {
    expect(formatDate('2026-11-09T20:30:00Z')).toBe('10.11.2026'); // Toshkent UTC+5: ertasi kun
    expect(formatDate(null)).toBe('—');
    expect(shortDay('2026-11-09')).toBe('09.11');
    expect(formatCount(1234567)).toBe('1 234 567');
    expect(formatCount(0)).toBe('0');
  });
});

describe('xatolar', () => {
  it('ruxsat xatosi aniqlanadi (kod va matn bo\'yicha)', () => {
    expect(isForbidden({ code: '42501', message: 'x' })).toBe(true);
    expect(isForbidden({ message: 'not_platform_admin' })).toBe(true);
    expect(isForbidden(new Error('boshqa'))).toBe(false);
  });
  it('foydalanuvchiga texnik tafsilot chiqmaydi', () => {
    expect(errorMessage({ message: 'relation "admin_audit" permission denied for table' })).toBe("Ma'lumotni yuklab bo'lmadi. Qayta urinib ko'ring.");
    expect(errorMessage({ message: 'TypeError: Failed to fetch' })).toContain('Internet');
    expect(errorMessage({ message: 'shop_not_found' })).toBe("Do'kon topilmadi.");
  });
});

describe('createSupabaseApi (faqat admin_* RPC)', () => {
  function fakeClient(result: { data?: unknown; error?: unknown }) {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
      },
      from: () => {
        throw new Error('jadvalga to\'g\'ridan-to\'g\'ri murojaat taqiqlangan');
      },
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it('RPC nomlari va parametrlari', async () => {
    const { client, calls } = fakeClient({ data: {} });
    const api = createSupabaseApi(client);
    await api.overview();
    await api.shops({ search: '  karim ', limit: 20, offset: 40, sort: 'new' });
    await api.shops();
    await api.shopDetail('abc');
    await api.funnel();
    await api.myAudit();
    expect(calls).toEqual([
      { fn: 'admin_overview', args: { p_days: 14 } },
      { fn: 'admin_shops', args: { p_search: 'karim', p_limit: 20, p_offset: 40, p_sort: 'new' } },
      { fn: 'admin_shops', args: { p_search: null, p_limit: 50, p_offset: 0, p_sort: 'activity' } },
      { fn: 'admin_shop_detail', args: { p_shop_id: 'abc' } },
      { fn: 'admin_funnel', args: undefined },
      { fn: 'admin_my_audit', args: { p_limit: 100 } },
    ]);
  });

  it('42501 → ForbiddenError', async () => {
    const { client } = fakeClient({ error: { code: '42501', message: 'not_platform_admin' } });
    await expect(createSupabaseApi(client).overview()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('boshqa xato o\'zgarishsiz uzatiladi', async () => {
    const { client } = fakeClient({ error: { code: 'XX000', message: 'boom' } });
    await expect(createSupabaseApi(client).funnel()).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('demo ma\'lumot', () => {
  it('turli faollik: har bosqich va faolsiz do\'kon bor', () => {
    const rows = demoShops(NOW).rows;
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.stage)).size).toBeGreaterThanOrEqual(4);
    expect(rows.some((r) => r.is_stale)).toBe(true);
    expect(rows.some((r) => !r.is_stale)).toBe(true);
  });

  it('umumiy ko\'rinish ro\'yxat va kunma-kun qator bilan mos', () => {
    const ov = demoOverview(NOW);
    const shops = demoShops(NOW).rows;
    expect(ov.shops).toBe(shops.length);
    expect(ov.daily).toHaveLength(14);
    expect(ov.sales_today).toBe(ov.daily[13].sales);
    expect(ov.active_shops_7d).toBe(shops.filter((s) => s.last_activity_at && NOW.getTime() - new Date(s.last_activity_at).getTime() < 7 * 86_400_000).length);
    expect(ov.daily.reduce((a, d) => a + d.new_shops, 0)).toBe(shops.filter((s) => NOW.getTime() - new Date(s.created_at).getTime() < 14 * 86_400_000).length);
  });

  it('qidiruv, tartib, sahifalash', () => {
    expect(demoShops(NOW, { search: 'KARIM@' }).rows.map((r) => r.name)).toEqual(['Bahor oziq-ovqat']);
    expect(demoShops(NOW, { search: 'example.test' }).total).toBe(6);
    expect(demoShops(NOW, { search: 'yo\'q-bunaqa' }).total).toBe(0);
    expect(demoShops(NOW, { sort: 'new' }).rows[0].name).toBe("Yangi do'kon");
    const byActivity = demoShops(NOW, { sort: 'activity' }).rows;
    expect(byActivity[0].name).toBe('Bahor oziq-ovqat');
    const page = demoShops(NOW, { limit: 2, offset: 2 });
    expect(page.total).toBe(6);
    expect(page.rows).toHaveLength(2);
  });

  it('voronka: kamayib boradi, to\'xtaganlar bosqichga mos', () => {
    const f = demoFunnel(NOW);
    expect(f.steps.map((s) => s.key)).toEqual(['registered', 'shop', 'product', 'supplier', 'purchase', 'sale', 'active']);
    expect(f.steps[0].count).toBe(DEMO_USERS);
    for (let i = 1; i < f.steps.length; i++) expect(f.steps[i].count).toBeLessThanOrEqual(f.steps[i - 1].count);
    const stuckTotal = Object.values(f.stuck).reduce((a, l) => a + l.length, 0);
    expect(stuckTotal + f.steps[6].count).toBe(f.shops);
    expect(f.users_without_shop).toBe(DEMO_USERS - DEMO_SHOPS.length);
  });

  it('do\'kon sahifasi: qadamlar va 14 kun', () => {
    const d = demoShopDetail(NOW, DEMO_SHOPS[3].id); // Sardor: kirim bor, savdo yo'q
    expect(d.stage).toBe(4);
    expect(d.daily_sales).toHaveLength(14);
    expect(d.steps.find((s) => s.key === 'purchase')?.at).not.toBeNull();
    expect(d.steps.find((s) => s.key === 'sale')?.at).toBeNull();
    expect(() => demoShopDetail(NOW, 'yo\'q')).toThrow('shop_not_found');
  });

  it('MAXFIYLIK: hech bir demo natijada mijoz/ta\'minotchi nomi, telefon, summa kalitlari yo\'q', async () => {
    const api = createDemoApi(() => NOW);
    const all = JSON.stringify([
      await api.overview(),
      await api.shops(),
      await api.shopDetail(DEMO_SHOPS[0].id),
      await api.funnel(),
      await api.myAudit(),
    ]);
    expect(all).not.toMatch(/"(phone|notes|customer_name|supplier_name|amount|total_amount|subtotal|line_total|unit_price|debt|balance|lines)"/);
  });

  it('demo audit: har chaqiruv yoziladi, qidiruv matni yozilmaydi', async () => {
    const api = createDemoApi(() => NOW);
    await api.overview();
    await api.shops({ search: 'maxfiy@email.test' });
    await api.shopDetail(DEMO_SHOPS[0].id);
    const rows = await api.myAudit();
    expect(rows.map((r) => r.action)).toEqual(['admin_my_audit', 'admin_shop_detail', 'admin_shops', 'admin_overview']);
    expect(rows.find((r) => r.action === 'admin_shops')?.target).toBe('search');
    expect(JSON.stringify(rows)).not.toContain('maxfiy@email.test');
  });
});

describe('voronka demo: to\'xtaganlar ro\'yxati bosqichga mos', () => {
  it("3-bosqichda faqat Nilufar; barcha ro'yxatlarda faqat id va nom", () => {
    const f = demoFunnel(NOW);
    expect(f.stuck['3'].map((s) => s.name)).toEqual(['Nilufar kiyim']);
    for (const list of Object.values(f.stuck)) for (const s of list) expect(Object.keys(s).sort()).toEqual(['id', 'name']);
  });
});
