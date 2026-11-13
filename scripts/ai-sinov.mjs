// Hisobchi Go — AI provayderini lokal HAQIQIY sinash (bazaga ulanmaydi, hech narsa yozmaydi).
//
//   AI_PROVIDER=gemini AI_MODEL=gemini-2.5-flash AI_API_KEY=... npx vite-node scripts/ai-sinov.mjs
//
// - Kalit faqat shu terminal muhitida (repoga, chatga yozilmaydi; `history` dan o'chirish uchun buyruq oldidan bo'shliq).
// - Server bilan AYNAN bir xil kod: supabase/functions/_shared/ai (prompt, provayder, javob tekshiruvi).
// - Sonlarni AI emas, kod o'qiydi (packages/core parse-list), qator jami kod bilan (calculateLineTotal):
//   AI natijasi "kod hisobi" bilan yonma-yon ko'rsatiladi. Namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000.
// vite-node (vitest bilan birga o'rnatilgan) TypeScript fayllarni yuklaydi.
import { createProvider } from '../supabase/functions/_shared/ai/provider.ts';
import { buildExtractionPrompt, validateExtraction } from '../supabase/functions/_shared/ai/extract.ts';
import { calculateLineTotal, parsePastedList, parseUnitPriceText } from '../packages/core/src/index.ts';

const CATALOG = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Chirmoq', unit: 'dona' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Yurak', unit: 'dona' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Momiq', unit: 'dona' },
];

const CASES = [
  { name: "Erkin gap (385 000 namunasi)", mode: 'sale_text', text: "Karim akaga o'nta chirmoq o'n uch mingdan, beshta yurak o'n besh ming, yigirmata momiq to'qqiz mingdan", expected: 385000n },
  { name: 'Kirill yozuv', mode: 'sale_text', text: 'ўнта чирмоқ 13 мингдан, 5 та юрак 15 000', expected: 205000n },
  { name: 'Kirim matni', mode: 'purchase_text', text: 'Rahim akadan 20 ta momiq 8 500 dan, jami 170 000', expected: 170000n },
];

function codeTotal(lines) {
  let total = 0n;
  const rows = [];
  for (const l of lines) {
    const [q] = l.qty_text ? parsePastedList(`Q ${l.qty_text}${l.unit ? ` ${l.unit}` : ''}`, { kind: 'sale' }) : [];
    const p = l.price_text ? parseUnitPriceText(l.price_text) : { ok: false };
    const qty = q && q.unitPrice === undefined ? q.qtyMilli : undefined;
    const sum = qty !== undefined && p.ok ? calculateLineTotal(qty, p.unitPrice) : null;
    if (sum !== null) total += sum;
    rows.push({ nom: l.name, katalog: l.product_id ? 'ha' : "yo'q", soni: l.qty_text, narx: l.price_text, 'kod jami': sum?.toString() ?? '—' });
  }
  return { total, rows };
}

let provider;
try {
  provider = createProvider(process.env);
} catch (e) {
  console.error(`Sozlanmagan: ${e.message}. Masalan: AI_PROVIDER=gemini AI_MODEL=gemini-2.5-flash AI_API_KEY=... npx vite-node scripts/ai-sinov.mjs`);
  process.exit(2);
}
console.log(`Provayder: ${provider.kind}, model: ${provider.model}\n`);
let fail = 0;
for (const c of CASES) {
  const prompt = buildExtractionPrompt({ mode: c.mode, text: c.text, catalog: CATALOG });
  const t0 = Date.now();
  try {
    const res = await provider.complete({ system: prompt.system, user: prompt.user, maxOutputTokens: 4096, timeoutMs: Number(process.env.AI_SINOV_TIMEOUT_MS ?? 20000) });
    const out = validateExtraction(res.text, { mode: c.mode, keyMap: prompt.keyMap });
    const { total, rows } = codeTotal(out.lines);
    const ok = total === c.expected;
    if (!ok) fail++;
    console.log(`${ok ? 'OK ' : 'FARQ'} ${c.name} — ${Date.now() - t0} ms, token ${res.usage.inputTokens}/${res.usage.outputTokens}`);
    console.table(rows);
    console.log(`   kod jami: ${total} (kutilgan ${c.expected})${out.warnings.length ? `, ogohlantirish: ${out.warnings.join(', ')}` : ''}\n`);
  } catch (e) {
    fail++;
    console.log(`XATO ${c.name} — ${e.code ?? ''} ${e.message}\n`);
  }
}
console.log(fail === 0 ? 'Hammasi kod hisobi bilan mos.' : `${fail} ta holat mos emas yoki xato: savdogar tasdig'i shuning uchun majburiy.`);
process.exit(fail === 0 ? 0 : 1);
