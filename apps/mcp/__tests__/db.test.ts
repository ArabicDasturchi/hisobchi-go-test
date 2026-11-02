import { describe, expect, it, vi } from 'vitest';
import { createSupabaseDb, DbError } from '../src/db.js';
import { CUSTOMER, SHOP } from './helpers.js';

function client(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc };
}

describe('createSupabaseDb', () => {
  it('draftSale agent_draft_sale RPC\'ni to\'g\'ri parametrlar bilan chaqiradi', async () => {
    const c = client('d3d3d3d3-0000-4000-8000-000000000001');
    const id = await createSupabaseDb(c).draftSale({
      shopId: SHOP, opId: 'mcp:x', customerId: CUSTOMER, rawInput: 'matn', clientTotal: 385000n,
      lines: [{ product_name: 'chirmoq', qty_milli: '10000', unit: 'dona', unit_price: '13000', raw_text: null, warnings: [] }],
    });
    expect(id).toBe('d3d3d3d3-0000-4000-8000-000000000001');
    expect(c.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = c.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe('agent_draft_sale');
    expect(args).toMatchObject({ p_shop_id: SHOP, p_client_op_id: 'mcp:x', p_customer_id: CUSTOMER, p_client_total: 385000 });
  });

  it('bazadan kelgan ortiqcha ustunlar (telefon) tashlab yuboriladi', async () => {
    const c = client([{ id: CUSTOMER, name: 'Karim', outstanding: 285000, phone: 'TEL-MAXFIY-123', notes: 'IZOH-MAXFIY' }]);
    const rows = await createSupabaseDb(c).listCustomers({ shopId: SHOP, query: null, limit: 50, offset: 0 });
    expect(rows).toEqual([{ id: CUSTOMER, name: 'Karim', outstanding: 285000n }]);
    expect(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/MAXFIY|phone/);
  });

  it('bigint satr yoki son ko\'rinishida kelishi mumkin', async () => {
    const c = client([{ id: CUSTOMER, name: 'Karim', outstanding: '285000' }]);
    expect((await createSupabaseDb(c).customerBalance({ shopId: SHOP, customerId: CUSTOMER })).outstanding).toBe(285000n);
  });

  it('RPC xatosi DbError bo\'ladi; kutilmagan shakl bad_response', async () => {
    await expect(createSupabaseDb(client(null, { message: 'forbidden' })).whoami()).rejects.toMatchObject({ name: 'DbError', raw: 'forbidden' });
    await expect(createSupabaseDb(client([{ shop_id: 'yo\'q' }])).whoami()).rejects.toBeInstanceOf(DbError);
  });

  it('mijoz topilmasa customer_not_found', async () => {
    await expect(createSupabaseDb(client([])).customerBalance({ shopId: SHOP, customerId: CUSTOMER })).rejects.toMatchObject({ raw: 'customer_not_found' });
  });
});
