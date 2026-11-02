import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftCard } from '@/components/DraftCard';
import { toAgentDraft, type AgentDraftRow } from '@/lib/data/agentDrafts';

const LINES = [
  { product_name: 'chirmoq', qty_milli: '10000', unit: 'dona', unit_price: '13000', line_total: '130000', warnings: ['narx odatdagidan farq qiladi'] },
  { product_name: 'yurak', qty_milli: '5000', unit: 'dona', unit_price: '15000', line_total: '75000' },
  { product_name: 'momiq', qty_milli: '20000', unit: 'dona', unit_price: '9000', line_total: '180000' },
];
const row = (over: Partial<AgentDraftRow> = {}): AgentDraftRow => ({
  id: 'd3d3d3d3-0000-4000-8000-000000000001', kind: 'sale', status: 'draft', customer_id: 'c2c2c2c2-0000-4000-8000-000000000001', total: '385000',
  payload: { raw_input: 'chirmoq 10 ta 13 ming', lines: LINES }, client_id: 'c1c1c1c1-0000-4000-8000-000000000001', created_by: 'u',
  created_at: '2026-11-02T10:00:00Z', decided_at: null, reject_reason: null, ...over,
});
/** formatSom NBSP ishlatadi: testda oddiy bo'shliqqa keltiriladi */
const nb = (html: string) => html.replace(/\u00a0/g, ' ');
const DIS = '<button[^>]*\\sdisabled=""[^>]*>(?:(?!<\\/button>).)*';
const render = (r: AgentDraftRow, over: { busy?: boolean; anyBusy?: boolean; error?: string | null } = {}) =>
  nb(renderToStaticMarkup(
    <DraftCard draft={toAgentDraft(r)} customerName="Karim" source="Claude" busy={over.busy ?? false} anyBusy={over.anyBusy ?? false} error={over.error ?? null} onAccept={() => {}} onReject={() => {}} />,
  ));
const accept = (html: string) => /<button[^>]*>[^<]*(<[^>]+>)*[^<]*Tasdiqlash \(/.exec(html);

describe('DraftCard', () => {
  it('ochiq savdo qoralamasi: sariq, 385 000, qatorlar, kim yaratgan, tugmalar', () => {
    const html = render(row());
    expect(html).toContain('Tasdiqlanmagan');
    expect(html).toContain('border-amber-300');
    expect(html).toContain('385 000');
    expect(html).toContain('Karim');
    expect(html).toContain('Yaratdi: Claude');
    for (const n of ['chirmoq', 'yurak', 'momiq']) expect(html).toContain(n);
    expect(html).toContain('130 000');
    expect(html).toContain('Tasdiqlash (385');
    expect(html).toContain('Rad etish');
    // Yaxlitligi joyida qoralamada tugmalar ochiq
    expect(html).not.toMatch(new RegExp(DIS + 'Tasdiqlash \\(', 's'));
    expect(html).not.toMatch(new RegExp(DIS + 'Rad etish', 's'));
  });

  it('ogohlantirishli qator ajratiladi (sariq), boshqalari oddiy', () => {
    const html = render(row());
    expect(html).toContain('narx odatdagidan farq qiladi');
    expect((html.match(/bg-amber-100\/60/g) ?? []).length).toBe(1);
  });

  it('jami mos kelmasa "Tasdiqlash" o\'chiriladi va sabab ko\'rsatiladi', () => {
    const html = render(row({ total: '385001' }));
    expect(html).toContain("Tasdiqlab bo&#x27;lmaydi");
    expect(accept(html)).not.toBeNull();
    expect(html).toMatch(new RegExp(DIS + 'Tasdiqlash \\(', 's'));
  });

  it('buzilgan payload: o\'qib bo\'lmaydi, Tasdiqlash o\'chiq, Rad etish ochiq', () => {
    const html = render(row({ payload: { lines: 'x' } }));
    expect(html).toContain("o&#x27;qib bo&#x27;lmadi");
    expect(html).toMatch(new RegExp(DIS + 'Tasdiqlash \\(', 's'));
    expect(html).not.toMatch(new RegExp(DIS + 'Rad etish', 's'));
  });

  it('boshqa qoralama bajarilayotganda tugmalar bloklanadi; xato sababi ko\'rinadi', () => {
    const html = render(row(), { anyBusy: true, error: 'Hisob mos kelmadi' });
    expect(html).toMatch(new RegExp(DIS + 'Rad etish', 's'));
    expect(html).toContain('Hisob mos kelmadi');
    expect(html).toContain('hech narsa yozilmadi');
  });

  it('tasdiqlangan: sariq emas, tugmalar yo\'q, savdoga havola', () => {
    const html = render(row({ status: 'accepted', decided_at: '2026-11-02T10:05:00Z' }));
    expect(html).toContain('Tasdiqlangan');
    expect(html).not.toContain('border-amber-300');
    expect(html).not.toContain('Tasdiqlash (');
    expect(html).toContain('href="/sales/d3d3d3d3-0000-4000-8000-000000000001"');
  });

  it('rad etilgan: sabab ko\'rinadi; to\'lov qoralamasi usul bilan', () => {
    expect(render(row({ status: 'rejected', reject_reason: 'kerak emas' }))).toContain('Rad etish sababi: kerak emas');
    const pay = render(row({ kind: 'payment', total: '50000', payload: { method: 'karta', note: 'nasiya' } }));
    expect(pay).toContain("To&#x27;lov qoralamasi");
    expect(pay).toContain('Karta');
    expect(pay).toContain('Izoh: nasiya');
    expect(pay).toContain('50 000');
  });

  it('mijozsiz savdo', () => {
    const html = nb(
      renderToStaticMarkup(
        <DraftCard draft={toAgentDraft(row({ customer_id: null }))} customerName={null} source="Agent" busy={false} anyBusy={false} error={null} onAccept={() => {}} onReject={() => {}} />,
      ),
    );
    expect(html).toContain('Mijozsiz');
  });
});
