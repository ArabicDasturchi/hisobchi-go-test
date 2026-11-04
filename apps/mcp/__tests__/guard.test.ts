/**
 * Qo'riqchi: MCP server kodi faqat agent_* RPC'larni chaqiradi va yozuvchi/tasdiqlovchi RPC'larga, service_role'ga tegmaydi.
 * Kimdir keyin `post_sale` yoki `accept_agent_draft` qo'shsa, shu test yiqiladi.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (f: string) => stripComments(readFileSync(join(SRC, f), 'utf8'));

describe('MCP manba kodi qo\'riqchisi', () => {
  it('bazaga faqat shu agent_* RPC\'lar orqali murojaat qiladi', () => {
    const used = [...code('db.ts').matchAll(/call\(\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(used).toEqual([
      'agent_add_customer', 'agent_add_products', 'agent_customer_balance', 'agent_day_rows', 'agent_draft_payment', 'agent_draft_sale',
      'agent_get_sale', 'agent_list_customers', 'agent_list_products', 'agent_list_sales', 'agent_propose_archive',
      'agent_propose_customer_update', 'agent_propose_product_update', 'agent_whoami',
    ]);
    // .rpc() faqat db.ts ichida
    for (const f of files.filter((x) => x !== 'db.ts')) expect(code(f), f).not.toMatch(/\.rpc\(/);
  });

  it('yozuvchi/tasdiqlovchi RPC nomlari va to\'g\'ridan-to\'g\'ri jadval yozuvi yo\'q', () => {
    const forbidden = /post_sale|reverse_sale|record_payment|void_payment|accept_agent_draft|reject_agent_draft|create_shop/;
    const tableWrites = /\.from\(\s*['"`]|\.insert\(|\.upsert\(|\.delete\(/;
    for (const f of files) {
      expect(code(f), f).not.toMatch(forbidden);
      expect(code(f), f).not.toMatch(tableWrites);
    }
  });

  it('service_role kalitiga havola faqat config.ts dagi rad etish qo\'riqchisida', () => {
    for (const f of files.filter((x) => x !== 'config.ts')) {
      expect(code(f), f).not.toMatch(/service_role|SERVICE_ROLE|sb_secret_/);
    }
  });
});
