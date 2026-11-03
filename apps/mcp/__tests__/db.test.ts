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

  it('katalog RPC\'lari to\'g\'ri nom va parametrlar bilan; ortiqcha maydonlar tashlanadi', async () => {
    const ID = 'c2c2c2c2-0000-4000-8000-000000000001';
    const c1 = client({ id: ID, name: 'Rahim aka', created: true, is_active: true, source: 'agent', phone: 'TEL-MAXFIY-123' });
    const r1 = await createSupabaseDb(c1).addCustomer({ shopId: SHOP, requestId: 'mcp:abcdefgh', name: 'Rahim aka' });
    expect(r1).toEqual({ id: ID, name: 'Rahim aka', created: true, is_active: true, source: 'agent' });
    expect(c1.rpc.mock.calls[0]).toEqual(['agent_add_customer', { p_shop_id: SHOP, p_request_id: 'mcp:abcdefgh', p_name: 'Rahim aka' }]);

    const prod = { id: ID, name: 'Non', unit: 'dona', price: 4000, is_active: true };
    const c2 = client({ created: [prod], existing: [], created_count: 1, existing_count: 0 });
    const r2 = await createSupabaseDb(c2).addProducts({ shopId: SHOP, requestId: 'mcp:abcdefgh', items: [{ name: 'Non', unit: 'dona', price: 4000 }] });
    expect(r2.created[0]!.price).toBe(4000n);
    expect(c2.rpc.mock.calls[0]).toEqual(['agent_add_products', { p_shop_id: SHOP, p_request_id: 'mcp:abcdefgh', p_items: [{ name: 'Non', unit: 'dona', price: 4000 }] }]);

    const c3 = client(ID);
    const api = createSupabaseDb(c3);
    await api.proposeCustomerUpdate({ shopId: SHOP, requestId: 'mcp:abcdefgh', customerId: ID, name: 'Yangi' });
    await api.proposeProductUpdate({ shopId: SHOP, requestId: 'mcp:abcdefgh', productId: ID, changes: { price: null } });
    await api.proposeArchive({ shopId: SHOP, requestId: 'mcp:abcdefgh', kind: 'product', targetId: ID });
    expect(c3.rpc.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['agent_propose_customer_update', 'agent_propose_product_update', 'agent_propose_archive']);
    expect((c3.rpc.mock.calls[1] as unknown as [string, Record<string, unknown>])[1]).toEqual({ p_shop_id: SHOP, p_request_id: 'mcp:abcdefgh', p_product_id: ID, p_changes: { price: null } });

    const c4 = client([{ id: ID, name: 'Non', unit: 'dona', price: 4000, is_active: true, source: 'app', cost_price: 3000 }]);
    const rows = await createSupabaseDb(c4).listProducts({ shopId: SHOP, query: null, includeArchived: false, limit: 50, offset: 0 });
    expect(rows).toEqual([{ id: ID, name: 'Non', unit: 'dona', price: 4000n, is_active: true, source: 'app' }]);
  });
});
