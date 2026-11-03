import type { SupabaseClient } from '@supabase/supabase-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftCard } from '@/components/DraftCard';
import { RecordBadges } from '@/components/shared';
import { draftTitle, integrityError, isCatalogDraft, toAgentDraft, type AgentDraftRow } from '@/lib/data/agentDrafts';
import { acceptAgentDraft } from '@/lib/data/api';
import { activeCustomerCount, inCustomerView, selectableCustomers } from '@/lib/data/customers';
import type { Customer } from '@/lib/data/types';
import { toAppError } from '@/lib/errors';

const SHOP = '11111111-1111-4111-8111-111111111111';
const TARGET = 'c2c2c2c2-0000-4000-8000-000000000001';
const ID = 'e4e4e4e4-0000-4000-8000-000000000001';

const row = (kind: string, payload: unknown, over: Partial<AgentDraftRow> = {}): AgentDraftRow => ({
  id: ID, kind, status: 'draft', customer_id: kind.startsWith('customer') ? TARGET : null, total: '0', payload,
  client_id: 'c1c1c1c1-0000-4000-8000-000000000001', created_by: 'u', created_at: '2026-11-03T10:00:00Z', decided_at: null, reject_reason: null, ...over,
});
const CUST_UPD = { target_id: TARGET, target_name: 'Rahim aka', changes: { name: { from: 'Rahim aka', to: 'Rahim Karimov' } } };
const PROD_UPD = { target_id: TARGET, target_name: 'Chirmoq', changes: { price: { from: 13000, to: 14000 }, name: { from: 'Chirmoq', to: 'Chirmoq 1-nav' } } };
const CUST_ARCH = { target_id: TARGET, target_name: 'Karim', outstanding: 385000 };
const PROD_ARCH = { target_id: TARGET, target_name: 'momiq' };

const nb = (html: string) => html.replace(/ /g, ' ');
const DIS = '<button[^>]*\\sdisabled=""[^>]*>(?:(?!<\\/button>).)*';
const render = (r: AgentDraftRow) =>
  nb(renderToStaticMarkup(<DraftCard draft={toAgentDraft(r)} customerName="Rahim aka" source="Claude" busy={false} anyBusy={false} error={null} onAccept={() => {}} onReject={() => {}} />));

describe('katalog qoralamalari: tahlil', () => {
  it('to\'rt tur o\'qiladi va yaxlitlik tekshiruvidan o\'tadi', () => {
    for (const [kind, payload] of [['customer_update', CUST_UPD], ['product_update', PROD_UPD], ['customer_archive', CUST_ARCH], ['product_archive', PROD_ARCH]] as const) {
      const d = toAgentDraft(row(kind, payload));
      expect(d.detail.kind, kind).toBe(kind);
      expect(integrityError(d), kind).toBeNull();
      expect(isCatalogDraft(d)).toBe(true);
    }
  });

  it('tovar o\'zgartirish: narx BigInt, null narx, faqat berilgan maydonlar', () => {
    const d = toAgentDraft(row('product_update', PROD_UPD));
    expect(d.detail).toMatchObject({ kind: 'product_update', name: { from: 'Chirmoq', to: 'Chirmoq 1-nav' }, unit: null, price: { from: 13000n, to: 14000n } });
    const clear = toAgentDraft(row('product_update', { target_id: TARGET, target_name: 'X', changes: { price: { from: 5000, to: null } } }));
    expect(clear.detail).toMatchObject({ price: { from: 5000n, to: null }, name: null });
  });

  it('qarzi bor mijozni arxivlash: qarz saqlanadi; qarz yo\'q (null) bo\'lsa ham o\'qiladi', () => {
    expect(toAgentDraft(row('customer_archive', CUST_ARCH)).detail).toMatchObject({ outstanding: 385000n });
    expect(toAgentDraft(row('customer_archive', { target_id: TARGET, target_name: 'K' })).detail).toMatchObject({ outstanding: null });
  });

  it('buzilgan payload yoki jami 0 bo\'lmagan katalog so\'rovi tasdiqlanmaydi', () => {
    for (const [kind, payload] of [['customer_update', {}], ['product_update', { target_id: TARGET, target_name: 'X', changes: {} }], ['customer_archive', { target_id: 'yo\'q' }], ['product_archive', null]] as const) {
      expect(toAgentDraft(row(kind, payload)).detail.kind, kind).toBe('unreadable');
    }
    expect(integrityError(toAgentDraft(row('product_archive', PROD_ARCH, { total: '5000' })))).toMatch(/summa bo'lmasligi/);
  });

  it('sarlavhalar', () => {
    expect(draftTitle(toAgentDraft(row('customer_update', CUST_UPD)))).toBe("Mijoz nomini o'zgartirish");
    expect(draftTitle(toAgentDraft(row('product_archive', PROD_ARCH)))).toBe('Tovarni arxivlash');
    expect(draftTitle(toAgentDraft(row('sale', { lines: [{ product_name: 'a', qty_milli: '1000', unit: 'dona', unit_price: '1', line_total: '1' }] }, { total: '1' })))).toBe('Savdo qoralamasi');
  });
});

describe('DraftCard: katalog turlari', () => {
  it('mijoz nomi: eski va yangi qiymat, summa ko\'rsatilmaydi, oddiy "Tasdiqlash"', () => {
    const html = render(row('customer_update', CUST_UPD));
    expect(html).toContain("Mijoz nomini o&#x27;zgartirish");
    expect(html).toContain('Rahim aka');
    expect(html).toContain('Rahim Karimov');
    expect(html).toContain('line-through');
    expect(html).not.toContain("so'm");
    expect(html).toContain('>Tasdiqlash<');
    expect(html).toContain('border-amber-300');
    expect(html).not.toMatch(new RegExp(DIS + 'Tasdiqlash', 's'));
  });

  it('tovar: nom va narx qatorlari (13 000 > 14 000)', () => {
    const html = render(row('product_update', PROD_UPD));
    expect(html).toContain('Narx');
    expect(html).toContain('13 000');
    expect(html).toContain('14 000');
    expect(html).toContain('Chirmoq 1-nav');
  });

  it('qarzli mijozni arxivlash: qarz haqida ogohlantirish va tarix saqlanishi', () => {
    const html = render(row('customer_archive', CUST_ARCH));
    expect(html).toContain('Mijozni arxivlash');
    expect(html).toContain('qarzi bor: 385 000');
    expect(html).toContain('Savdo tarixi, qarz va to&#x27;lovlar saqlanadi');
  });

  it('tovar arxivi', () => {
    const html = render(row('product_archive', PROD_ARCH));
    expect(html).toContain('Tovarni arxivlash');
    expect(html).toContain('momiq');
    expect(html).not.toContain('qarzi bor');
  });

  it('buzilgan katalog so\'rovida Tasdiqlash o\'chiq', () => {
    expect(render(row('customer_update', {}))).toMatch(new RegExp(DIS + 'Tasdiqlash', 's'));
  });
});

/** Soxta klient: accept RPC va tekshiruv so'rovlari */
function fake(tables: Record<string, unknown>) {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data, error: null });
    return c;
  };
  return {
    rpc: async () => ({ data: ID, error: null }),
    from: (t: string) => chain(t === 'agent_drafts' ? { status: 'accepted' } : tables[t] ?? null),
  } as unknown as SupabaseClient;
}

describe('acceptAgentDraft: katalog turlari serverdan tekshiriladi', () => {
  it('mijoz nomi o\'zgargan bo\'lsa o\'tadi, boshqacha bo\'lsa xato', async () => {
    const d = toAgentDraft(row('customer_update', CUST_UPD));
    await expect(acceptAgentDraft(fake({ customers: { name: 'Rahim Karimov', is_active: true } }), SHOP, d)).resolves.toBe('accepted');
    await expect(acceptAgentDraft(fake({ customers: { name: 'Rahim aka', is_active: true } }), SHOP, d)).rejects.toThrow(/kutilgan holatda emas/);
  });

  it('arxiv: is_active=false bo\'lishi shart', async () => {
    const c = toAgentDraft(row('customer_archive', CUST_ARCH));
    await expect(acceptAgentDraft(fake({ customers: { name: 'Karim', is_active: false } }), SHOP, c)).resolves.toBe('accepted');
    await expect(acceptAgentDraft(fake({ customers: { name: 'Karim', is_active: true } }), SHOP, c)).rejects.toThrow();
    const p = toAgentDraft(row('product_archive', PROD_ARCH));
    await expect(acceptAgentDraft(fake({ products: { name: 'momiq', unit: 'dona', last_price: '9000', is_active: false } }), SHOP, p)).resolves.toBe('accepted');
    await expect(acceptAgentDraft(fake({ products: null }), SHOP, p)).rejects.toThrow();
  });

  it('tovar o\'zgartirish: nom va narx kutilgandek bo\'lishi shart', async () => {
    const d = toAgentDraft(row('product_update', PROD_UPD));
    const good = { name: 'Chirmoq 1-nav', unit: 'dona', last_price: '14000', is_active: true };
    await expect(acceptAgentDraft(fake({ products: good }), SHOP, d)).resolves.toBe('accepted');
    await expect(acceptAgentDraft(fake({ products: { ...good, last_price: '13000' } }), SHOP, d)).rejects.toThrow(/kutilgan holatda emas/);
  });

  it('eskirgan so\'rov (draft_stale) va nom bandligi o\'zbekcha xabar', () => {
    expect(toAppError({ message: 'draft_stale', code: '40001' }).message).toMatch(/rad eting/);
    expect(toAppError({ message: 'name_taken', code: '23505' }).message).toMatch(/Bunday nomli tovar/);
  });
});

describe('"AI qo\'shdi" va arxiv belgilari', () => {
  it('agent qo\'shgan yozuvda belgi, ilova yozuvida yo\'q, arxivda "Arxiv"', () => {
    expect(renderToStaticMarkup(<RecordBadges source="agent" />)).toContain("AI qo&#x27;shdi");
    expect(renderToStaticMarkup(<RecordBadges source="app" />)).toBe('');
    const both = renderToStaticMarkup(<RecordBadges source="agent" archived />);
    expect(both).toContain("AI qo&#x27;shdi");
    expect(both).toContain('Arxiv');
    expect(renderToStaticMarkup(<RecordBadges source="app" archived />)).toContain('Arxiv');
  });
});

describe('arxivlangan mijoz', () => {
  const c = (name: string, is_active: boolean): Customer => ({ id: name, name, phone: null, notes: null, is_active, source: 'app', created_at: 'x', updated_at: 'x' });
  const list = [c('Zafar', true), c('Anvar', false), c('Bobur', true)];

  it('yangi savdo tanlovida arxivlangan ko\'rinmaydi, tartiblangan', () => {
    expect(selectableCustomers(list).map((x) => x.name)).toEqual(['Bobur', 'Zafar']);
    expect(list.map((x) => x.name)).toEqual(['Zafar', 'Anvar', 'Bobur']);
  });

  it('ro\'yxat ko\'rinishlari va faol mijozlar soni', () => {
    expect(list.filter((x) => inCustomerView(x, false)).map((x) => x.name)).toEqual(['Zafar', 'Bobur']);
    expect(list.filter((x) => inCustomerView(x, true)).map((x) => x.name)).toEqual(['Anvar']);
    expect(activeCustomerCount(list)).toBe(2);
  });
});
