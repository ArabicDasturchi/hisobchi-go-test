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
  it('aynan 7 ta asbob; confirm/reverse/accept/post yo\'q', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['daily_summary', 'draft_payment', 'draft_sale', 'get_customer_balance', 'get_sale', 'list_customers', 'list_sales']);
    expect(names.join(' ')).not.toMatch(/confirm|reverse|accept|reject|post|void|delete|update|create_shop/);
  });

  it('o\'qish asboblari readOnly, qoralama asboblari destruktiv emas', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    for (const t of tools) {
      if (t.name.startsWith('draft_')) expect(t.annotations?.destructiveHint).toBe(false);
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
