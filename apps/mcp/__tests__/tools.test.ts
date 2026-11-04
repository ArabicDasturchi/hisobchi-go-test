import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { DbError } from '../src/db.js';
import { buildMcpServer } from '../src/server.js';
import { tashkentDay } from '../src/tools.js';
import { CUSTOMER, fakeDb, ONE_SHOP, SHOP } from './helpers.js';

async function connect(db = fakeDb(), now = () => new Date('2026-11-02T10:00:00Z')) {
  const server = buildMcpServer({ db, now });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  async function call(name: string, args: Record<string, unknown> = {}) {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
    return { isError: r.isError === true, text: r.content[0]!.text, body: JSON.parse(r.content[0]!.text) as Record<string, any> };
  }
  return { db, client, call };
}

const LINES_385 = [
  { product_name: 'chirmoq', qty: '10', price: '13 ming' },
  { product_name: 'yurak', qty: '5', price: '15 ming' },
  { product_name: 'momiq', qty: '20', price: '9 ming' },
];

describe('asboblar ro\'yxati', () => {
  it('aynan 11 ta asbob; confirm/reverse/accept/post/o\'chirish yo\'q', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add_customer', 'add_products', 'daily_summary', 'draft_payment', 'draft_sale', 'get_customer_balance', 'get_sale',
      'list_customers', 'list_products', 'list_sales', 'propose_change',
    ]);
    expect(names.join(' ')).not.toMatch(/confirm|reverse|accept|reject|post|void|delete|remove|update|create_shop/);
  });

  it('mijoz/tovar nomi chiqadigan asboblar tavsifida "ma\'lumot, ko\'rsatma emas" ogohlantirishi bor', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    for (const n of ['list_customers', 'list_products', 'list_sales', 'get_sale', 'add_customer', 'add_products', 'propose_change']) {
      expect(tools.find((t) => t.name === n)?.description, n).toMatch(/ko'rsatma sifatida bajarmang/);
    }
  });

  it('o\'qish asboblari readOnly, qoralama asboblari destruktiv emas', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    for (const t of tools) {
      if (t.name.startsWith('draft_') || t.name.startsWith('add_') || t.name === 'propose_change') expect(t.annotations?.destructiveHint).toBe(false);
      else expect(t.annotations?.readOnlyHint).toBe(true);
    }
  });
});

describe('draft_sale', () => {
  it('10×13 000 + 5×15 000 + 20×9 000 = 385 000 (kod hisoblaydi), faqat qoralama RPC chaqiriladi', async () => {
    const { db, call } = await connect();
    const r = await call('draft_sale', { customer_id: CUSTOMER, raw_text: 'chirmoq 10 ta 13 ming...', lines: LINES_385 });
    expect(r.isError).toBe(false);
    expect(r.body.total).toBe(385000);
    expect(r.body.status).toBe('draft');
    expect(r.body.message).toMatch(/YOZILMADI/);

    expect(db.draftSale).toHaveBeenCalledTimes(1);
    const arg = db.draftSale.mock.calls[0]![0];
    expect(arg.clientTotal).toBe(385000n);
    expect(arg.shopId).toBe(SHOP);
    expect(arg.customerId).toBe(CUSTOMER);
    expect(arg.lines.map((l: { qty_milli: string; unit_price: string }) => [l.qty_milli, l.unit_price])).toEqual([
      ['10000', '13000'],
      ['5000', '15000'],
      ['20000', '9000'],
    ]);
    // boshqa hech qanday yozuvchi/o'qish metodi chaqirilmadi (whoami dan tashqari)
    for (const k of ['listCustomers', 'customerBalance', 'listSales', 'getSale', 'dayRows', 'draftPayment']) {
      expect(db[k as keyof typeof db]).not.toHaveBeenCalled();
    }
  });

  it('aniq o\'qilmagan qatorda qoralama YARATILMAYDI va savdogardan so\'rash aytiladi', async () => {
    const { db, call } = await connect();
    const r = await call('draft_sale', {
      lines: [
        { product_name: 'non', qty: '10', price: '4000' },
        { product_name: 'sut', qty: "o'n besh", price: 'qimmat' },
      ],
    });
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/so'rang/);
    expect(r.body.details.map((d: { line: number; field: string }) => `${d.line}:${d.field}`).sort()).toEqual(['2:price', '2:qty']);
    expect(db.draftSale).not.toHaveBeenCalled();
  });

  it('noaniq kasr (1,500) taxmin qilinmaydi', async () => {
    const { db, call } = await connect();
    const r = await call('draft_sale', { lines: [{ product_name: 'un', qty: '1,500', price: '9000' }] });
    expect(r.isError).toBe(true);
    expect(db.draftSale).not.toHaveBeenCalled();
  });

  it('yaroqsiz birlik sxema bilan rad etiladi', async () => {
    const { client } = await connect();
    const r = (await client.callTool({ name: 'draft_sale', arguments: { lines: [{ product_name: 'x', qty: '1', unit: 'xyz', price: '1' }] } })) as { isError?: boolean };
    expect(r.isError).toBe(true);
  });

  it('request_id idempotentlik kaliti sifatida uzatiladi', async () => {
    const { db, call } = await connect();
    await call('draft_sale', { request_id: 'req-12345678', lines: [LINES_385[0]] });
    expect(db.draftSale.mock.calls[0]![0].opId).toBe('mcp:req-12345678');
  });

  it('baza hisob mos kelmasligini aytsa, xato o\'zbekcha va ichki matnsiz', async () => {
    const { call } = await connect(fakeDb({ draftSale: async () => { throw new DbError('calc_mismatch: server=1, client=2'); } }));
    const r = await call('draft_sale', { lines: [LINES_385[0]] });
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/Hisob mos kelmadi/);
    expect(r.text).not.toMatch(/server=1/);
  });

  it('kutilmagan xato ichki tafsilotsiz qaytadi', async () => {
    const { call } = await connect(fakeDb({ draftSale: async () => { throw new Error('connection to 10.0.0.5 refused'); } }));
    const r = await call('draft_sale', { lines: [LINES_385[0]] });
    expect(r.isError).toBe(true);
    expect(r.text).not.toMatch(/10\.0\.0\.5/);
  });
});

describe('draft_payment', () => {
  it('"50 ming" kod bilan 50000 ga aylanadi, faqat qoralama', async () => {
    const { db, call } = await connect();
    const r = await call('draft_payment', { customer_id: CUSTOMER, amount: '50 ming', method: 'naqd' });
    expect(r.isError).toBe(false);
    expect(r.body.amount).toBe(50000);
    expect(db.draftPayment.mock.calls[0]![0].amount).toBe(50000n);
    expect(r.body.message).toMatch(/YOZILMADI/);
  });

  it('0 va noaniq summa rad etiladi', async () => {
    const { db, call } = await connect();
    expect((await call('draft_payment', { customer_id: CUSTOMER, amount: '0', method: 'naqd' })).isError).toBe(true);
    expect((await call('draft_payment', { customer_id: CUSTOMER, amount: 'ko\'p', method: 'naqd' })).isError).toBe(true);
    expect(db.draftPayment).not.toHaveBeenCalled();
  });

  it('qarzdan oshgan to\'lov bazadan rad etiladi', async () => {
    const { call } = await connect(fakeDb({ draftPayment: async () => { throw new DbError('payment_exceeds_debt: debt=100'); } }));
    const r = await call('draft_payment', { customer_id: CUSTOMER, amount: '500', method: 'karta' });
    expect(r.body.error).toMatch(/qarzidan oshib/);
  });
});

describe('o\'qish asboblari', () => {
  it('list_customers faqat id, name, outstanding qaytaradi (telefon sizib chiqmaydi)', async () => {
    const leaky = { id: CUSTOMER, name: 'Karim', outstanding: 285000n, phone: 'TEL-MAXFIY-123', notes: 'IZOH-MAXFIY' };
    const { call } = await connect(fakeDb({ listCustomers: async () => [leaky] }));
    const r = await call('list_customers');
    expect(r.body.customers).toEqual([{ id: CUSTOMER, name: 'Karim', outstanding: 285000 }]);
    expect(r.text).not.toMatch(/MAXFIY|phone|notes/);
  });

  it('get_customer_balance va get_sale pul butun son sifatida', async () => {
    const { call } = await connect(
      fakeDb({
        getSale: async () => ({
          id: CUSTOMER, customer_id: CUSTOMER, customer_name: 'Karim', status: 'posted' as const, subtotal: 385000n, created_at: '2026-11-02T05:00:00Z',
          lines: [{ line_index: 0, product_name: 'chirmoq', qty_milli: 10000n, unit: 'dona', unit_price: 13000n, line_total: 130000n }],
          reversal: null,
        }),
      }),
    );
    expect((await call('get_customer_balance', { customer_id: CUSTOMER })).body.outstanding).toBe(285000);
    const s = await call('get_sale', { sale_id: CUSTOMER });
    expect(s.body.total).toBe(385000);
    expect(s.body.lines[0].line_total).toBe(130000);
  });

  it('bir nechta do\'kon bo\'lsa shop_id talab qilinadi; begona shop_id rad etiladi', async () => {
    const two = [...ONE_SHOP, { shop_id: '22222222-2222-4222-8222-222222222222', shop_name: 'B', role: 'owner' }];
    const { call, db } = await connect(fakeDb({ whoami: async () => two }));
    const r = await call('list_customers');
    expect(r.isError).toBe(true);
    expect(r.body.details).toHaveLength(2);
    const stranger = await call('list_customers', { shop_id: '33333333-3333-4333-8333-333333333333' });
    expect(stranger.isError).toBe(true);
    expect(db.listCustomers).not.toHaveBeenCalled();
    expect((await call('list_customers', { shop_id: SHOP })).isError).toBe(false);
  });

  it('do\'koni yo\'q foydalanuvchi uchun xato', async () => {
    const { call } = await connect(fakeDb({ whoami: async () => [] }));
    expect((await call('list_customers')).isError).toBe(true);
  });
});

describe('daily_summary', () => {
  const rows = (pg: { sales_posted: bigint; sales_reversed: bigint; payments: bigint }) => ({
    day: '2026-11-02',
    sales: [
      { id: CUSTOMER, status: 'posted' as const, subtotal: 385000n },
      { id: SHOP, status: 'posted' as const, subtotal: 15000n },
      { id: '44444444-4444-4444-8444-444444444444', status: 'reversed' as const, subtotal: 9000n },
    ],
    payments: [
      { id: CUSTOMER, amount: 100000n, voided: false },
      { id: SHOP, amount: 7000n, voided: true },
    ],
    pg_totals: pg,
  });

  it('jami kodda hisoblanadi, bekor qilingan to\'lov va savdo alohida', async () => {
    const { call, db } = await connect(fakeDb({ dayRows: vi.fn(async () => rows({ sales_posted: 400000n, sales_reversed: 9000n, payments: 100000n })) }));
    const r = await call('daily_summary');
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({
      date: '2026-11-02', sales_total: 400000, sales_count: 2, reversed_total: 9000, reversed_count: 1, payments_total: 100000, payments_count: 1,
    });
    expect(db.dayRows.mock.calls[0]![0].day).toBe('2026-11-02');
  });

  it('kod va baza yig\'indisi farq qilsa hisobot BERILMAYDI', async () => {
    const { call } = await connect(fakeDb({ dayRows: async () => rows({ sales_posted: 400001n, sales_reversed: 9000n, payments: 100000n }) }));
    const r = await call('daily_summary');
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/mos kelmadi/);
    expect(r.body.sales_total).toBeUndefined();
  });

  it('sana: Toshkent kuni (UTC+5) va noto\'g\'ri sana rad etiladi', async () => {
    expect(tashkentDay(new Date('2026-11-02T19:30:00Z'))).toBe('2026-11-03');
    expect(tashkentDay(new Date('2026-11-02T18:59:00Z'))).toBe('2026-11-02');
    const { client } = await connect();
    const bad = (await client.callTool({ name: 'daily_summary', arguments: { date: '2026-02-31' } })) as { isError?: boolean };
    expect(bad.isError).toBe(true);
  });
});

describe('katalog: qo\'shish (tasdiqsiz)', () => {
  it('add_customer faqat nom bilan db.addCustomer ni chaqiradi; telefon/izoh imkoni yo\'q', async () => {
    const { db, call, client } = await connect();
    const r = await call('add_customer', { name: '  Rahim aka ', request_id: 'abcdefgh1234' });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ created: true, source: 'agent' });
    expect(db.addCustomer.mock.calls[0]![0]).toEqual({ shopId: SHOP, requestId: 'mcp:abcdefgh1234', name: 'Rahim aka' });
    const schema = (await client.listTools()).tools.find((t) => t.name === 'add_customer')!.inputSchema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties).sort()).toEqual(['name', 'request_id', 'shop_id']);
    // savdo/to'lov/o'zgartirish yozuvchi metodlar chaqirilmagan
    for (const k of ['draftSale', 'draftPayment', 'proposeCustomerUpdate', 'proposeProductUpdate', 'proposeArchive', 'addProducts']) {
      expect(db[k as keyof typeof db]).not.toHaveBeenCalled();
    }
  });

  it('add_customer: dublikat bo\'lsa "yaratilmadi" deyiladi; kunlik limit xabari', async () => {
    const dup = await connect(fakeDb({ addCustomer: vi.fn(async () => ({ id: CUSTOMER, name: 'Karim', created: false, is_active: true, source: 'app' })) }));
    const r = await dup.call('add_customer', { name: 'karim' });
    expect(r.body.created).toBe(false);
    expect(r.body.message).toMatch(/yangisi yaratilmadi/);
    const lim = await connect(fakeDb({ addCustomer: vi.fn(async () => { throw new DbError('daily_limit_exceeded: kind=customer, limit=100, used=100'); }) }));
    const e = await lim.call('add_customer', { name: 'Yangi' });
    expect(e.isError).toBe(true);
    expect(e.body.error).toMatch(/Kunlik limit tugadi \(mijoz: kuniga 100 ta, bugun 100 ta/);
  });

  it('add_products: narx matni kod bilan o\'qiladi ("13 ming" = 13000), birlik standart dona', async () => {
    const { db, call } = await connect();
    const r = await call('add_products', { items: [{ name: 'Chirmoq', unit: 'dona', price: '13 ming' }, { name: 'Yurak', price: 15000 }, { name: 'Un' }] });
    expect(r.isError).toBe(false);
    expect(db.addProducts.mock.calls[0]![0].items).toEqual([
      { name: 'Chirmoq', unit: 'dona', price: 13000 },
      { name: 'Yurak', unit: 'dona', price: 15000 },
      { name: 'Un', unit: 'dona', price: null },
    ]);
    expect(db.addProducts.mock.calls[0]![0].requestId).toMatch(/^mcp:[0-9a-f-]{36}$/);
  });

  it('add_products: narxi o\'qilmagan qator bo\'lsa HECH NARSA yuborilmaydi', async () => {
    const { db, call } = await connect();
    const r = await call('add_products', { items: [{ name: 'A', price: '1000' }, { name: 'B', price: 'qimmat' }, { name: 'C', price: '999999999999' }] });
    expect(r.isError).toBe(true);
    expect(r.body.details.map((d: { item: number }) => d.item).sort()).toEqual([2, 3]);
    expect(db.addProducts).not.toHaveBeenCalled();
  });

  it('add_products: natijada mavjud tovar narxi o\'zgarmagani aytiladi; xato qator raqami bilan', async () => {
    const prod = { id: CUSTOMER, name: 'Non', unit: 'dona', price: 4000n, is_active: true };
    const ok1 = await connect(fakeDb({ addProducts: vi.fn(async () => ({ created: [], existing: [prod], created_count: 0, existing_count: 1 })) }));
    const r = await ok1.call('add_products', { items: [{ name: 'non', price: '5000' }] });
    expect(r.body.existing[0]).toEqual({ id: CUSTOMER, name: 'Non', unit: 'dona', price: 4000, is_active: true });
    expect(r.body.message).toMatch(/1 tasi allaqachon bor/);
    const bad = await connect(fakeDb({ addProducts: vi.fn(async () => { throw new DbError('invalid_item: index=2, field=unit'); }) }));
    expect((await bad.call('add_products', { items: [{ name: 'A' }, { name: 'B' }] })).body.error).toMatch(/Tovar №2: unit noto'g'ri/);
  });

  it('add_products: 100 tadan ko\'p yoki bo\'sh ro\'yxat sxema bilan rad etiladi', async () => {
    const { client, db } = await connect();
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `T${i}` }));
    for (const items of [many, []]) {
      const r = (await client.callTool({ name: 'add_products', arguments: { items } })) as { isError?: boolean };
      expect(r.isError).toBe(true);
    }
    expect(db.addProducts).not.toHaveBeenCalled();
  });

  it('list_products narxni butun son qilib qaytaradi', async () => {
    const { call } = await connect(fakeDb({ listProducts: vi.fn(async () => [{ id: CUSTOMER, name: 'Non', unit: 'dona', price: 4000n, is_active: true, source: 'app' }, { id: SHOP, name: 'Un', unit: 'kg', price: null, is_active: false, source: 'agent' }]) }));
    const r = await call('list_products', { include_archived: true });
    expect(r.body.products).toEqual([
      { id: CUSTOMER, name: 'Non', unit: 'dona', price: 4000, is_active: true, source: 'app' },
      { id: SHOP, name: 'Un', unit: 'kg', price: null, is_active: false, source: 'agent' },
    ]);
  });
});

describe('katalog: o\'zgartirish va arxiv faqat so\'rov', () => {
  it('mijoz nomini o\'zgartirish: proposeCustomerUpdate; xabarda "O\'ZGARMADI"', async () => {
    const { db, call } = await connect();
    const r = await call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'update', changes: { name: 'Rahim Karimov' } });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ status: 'draft', draft_id: 'e4e4e4e4-0000-4000-8000-000000000001' });
    expect(r.body.message).toMatch(/Hech narsa O'ZGARMADI/);
    expect(db.proposeCustomerUpdate.mock.calls[0]![0]).toMatchObject({ shopId: SHOP, customerId: CUSTOMER, name: 'Rahim Karimov' });
  });

  it('mijozda nomdan boshqa maydon yoki bo\'sh changes rad etiladi', async () => {
    const { db, call } = await connect();
    expect((await call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'update', changes: { name: 'A', price: '5' } })).isError).toBe(true);
    expect((await call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'update', changes: { unit: 'kg' } })).isError).toBe(true);
    expect((await call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'update' })).isError).toBe(true);
    expect(db.proposeCustomerUpdate).not.toHaveBeenCalled();
  });

  it('tovar: narx matni kod bilan o\'qiladi, null narxni tozalaydi, noaniq narx rad etiladi', async () => {
    const { db, call } = await connect();
    await call('propose_change', { target: 'product', target_id: CUSTOMER, action: 'update', changes: { price: '14 ming', name: 'Chirmoq 1-nav' } });
    expect(db.proposeProductUpdate.mock.calls[0]![0].changes).toEqual({ name: 'Chirmoq 1-nav', price: 14000 });
    await call('propose_change', { target: 'product', target_id: CUSTOMER, action: 'update', changes: { price: null } });
    expect(db.proposeProductUpdate.mock.calls[1]![0].changes).toEqual({ price: null });
    const bad = await call('propose_change', { target: 'product', target_id: CUSTOMER, action: 'update', changes: { price: 'arzon' } });
    expect(bad.isError).toBe(true);
    expect(db.proposeProductUpdate).toHaveBeenCalledTimes(2);
  });

  it('arxiv: proposeArchive; changes berilsa rad etiladi; o\'chirish asbobi yo\'q', async () => {
    const { db, call, client } = await connect();
    const r = await call('propose_change', { target: 'product', target_id: CUSTOMER, action: 'archive' });
    expect(r.body.message).toMatch(/tovarni arxivlash/);
    expect(db.proposeArchive.mock.calls[0]![0]).toMatchObject({ kind: 'product', targetId: CUSTOMER });
    expect((await call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'archive', changes: { name: 'X' } })).isError).toBe(true);
    // action faqat update|archive (delete sxemada yo'q)
    const del = (await client.callTool({ name: 'propose_change', arguments: { target: 'customer', target_id: CUSTOMER, action: 'delete' } })) as { isError?: boolean };
    expect(del.isError).toBe(true);
    expect(db.proposeArchive).toHaveBeenCalledTimes(1);
  });

  it('ochiq so\'rov bor bo\'lsa: id bilan tushunarli xabar; request_id kalit sifatida', async () => {
    const pending = await connect(fakeDb({ proposeArchive: vi.fn(async () => { throw new DbError('proposal_pending: e4e4e4e4-0000-4000-8000-0000000000aa'); }) }));
    const r = await pending.call('propose_change', { target: 'customer', target_id: CUSTOMER, action: 'archive', request_id: 'req-12345678' });
    expect(r.body.error).toMatch(/tasdiqlanmagan so'rov allaqachon bor \(e4e4e4e4-0000-4000-8000-0000000000aa\)/);
    expect(pending.db.proposeArchive.mock.calls[0]![0].requestId).toBe('mcp:req-12345678');
  });

  it('savdo/to\'lov hali ham faqat qoralama: draft_sale 385 000 (katalog asboblari ularga tegmaydi)', async () => {
    const { db, call } = await connect();
    const r = await call('draft_sale', { lines: LINES_385 });
    expect(r.body).toMatchObject({ total: 385000, status: 'draft' });
    expect(db.draftSale.mock.calls[0]![0].clientTotal).toBe(385000n);
    for (const k of ['addCustomer', 'addProducts', 'proposeCustomerUpdate', 'proposeProductUpdate', 'proposeArchive']) {
      expect(db[k as keyof typeof db]).not.toHaveBeenCalled();
    }
  });
});
