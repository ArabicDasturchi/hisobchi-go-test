#!/usr/bin/env node
/**
 * Migratsiya qo'riqchisi (CI). Bog'liqliksiz Node skripti; `supabase db push --dry-run` natijasini tahlil qiladi.
 *
 *   node scripts/ci/migration-guard.mjs plan     --dry-run-file dry.txt [--migrations-dir supabase/migrations]
 *   node scripts/ci/migration-guard.mjs apply    --dry-run-file dry.txt --expect "005_a.sql,006_b.sql"
 *   node scripts/ci/migration-guard.mjs baseline --list-file list.txt
 *
 * plan:     kutilayotgan fayllarni topadi, xavfli buyruqlarni qidiradi, GITHUB_OUTPUT ga yozadi.
 *           001-004 (qo'lda qo'llangan) kutilayotgan bo'lsa TO'XTAYDI: ularni qayta ishga tushirish bazani buzadi.
 * apply:    tasdiqdan keyin kutilayotgan ro'yxat plan'dagi bilan bir xilligini tekshiradi (tasdiq va qo'llash orasida
 *           boshqa migratsiya "kirib qolmasin").
 * baseline: `supabase migration list` natijasidan 001-004 dan qaysilari tarixda yo'qligini chiqaradi.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** SQL Editor'da qo'lda qo'llangan migratsiyalar. CI ularni HECH QACHON o'zi qo'llamaydi. */
export const BASELINE_VERSIONS = ['001', '002', '003', '004'];

/**
 * 001 va 003 oldin Supabase MCP `apply_migration` orqali qo'llangan: bazada ular vaqt belgisi bilan yozilgan
 * (001_initial_schema, 003_security_and_mvp_rpc), repoda esa 001/003 nomi bilan. Bular aynan o'sha SQL.
 * Baseline ularni tarixdan "bekor" deb belgilaydi (faqat tarix yozuvi, SQL bajarilmaydi), keyin 001-004 "qo'llangan".
 */
export const LEGACY_REMOTE_VERSIONS = ['20261031102214', '20261031104302'];

/** "004_mcp_agent.sql" → "004" */
export const versionOf = (file) => /^(\d+)_/.exec(file)?.[1] ?? null;

/**
 * `supabase db push --dry-run` chiqishidan fayl nomlari. Avval JSON qator ({"migrations":[...]}), bo'lmasa " • fayl.sql".
 * Natija aniqlanmasa null (qo'riqchi buni xato deb hisoblaydi: noma'lum chiqish bilan davom etmaymiz).
 */
export function parsePending(output) {
  for (const line of output.split('\n').reverse()) {
    const t = line.trim();
    if (t.startsWith('{') && t.includes('"migrations"')) {
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j.migrations)) return j.migrations.map(String);
      } catch {
        /* keyingi usul */
      }
    }
  }
  if (/Remote database is up to date/i.test(output)) return [];
  const bullets = [...output.matchAll(/^\s*[•*-]\s+(\S+\.sql)\s*$/gm)].map((m) => m[1]);
  return bullets.length > 0 ? bullets : null;
}

/** `supabase migration list` chiqishidan [{local, remote}] (JSON qator bo'lsa). Aniqlanmasa null. */
export function parseMigrationList(output) {
  for (const line of output.split('\n').reverse()) {
    const t = line.trim();
    if (t.startsWith('{') && t.includes('"migrations"')) {
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j.migrations)) return j.migrations.map((m) => ({ local: String(m.local ?? ''), remote: String(m.remote ?? '') }));
      } catch {
        /* null */
      }
    }
  }
  // `supabase migration list` odatda jadval chiqaradi: " `001` | ` ` | `001` " (backtick'lar bilan).
  const rows = [];
  for (const line of output.split('\n')) {
    const cells = line.split('|').map((c) => c.replace(/`/g, '').trim());
    if (cells.length < 3 || /^local$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
    if (!/^\d*$/.test(cells[0]) || !/^\d*$/.test(cells[1])) continue;
    if (cells[0] === '' && cells[1] === '') continue;
    rows.push({ local: cells[0], remote: cells[1] });
  }
  return rows.length > 0 ? rows : null;
}

/** Izohlarni olib tashlaydi, qator raqamlarini saqlaydi (satrlar o'zgarmaydi: ichidagi so'zlar ham tekshiriladi, ehtiyot uchun). */
export function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
}

const RULES = [
  { id: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  { id: 'DROP SCHEMA', re: /\bDROP\s+SCHEMA\b/i },
  { id: 'DROP DATABASE', re: /\bDROP\s+DATABASE\b/i },
  { id: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { id: 'TRUNCATE', re: /\bTRUNCATE\b/i },
];

/**
 * Xavfli buyruqlar: DROP TABLE/SCHEMA/DATABASE/COLUMN, TRUNCATE, WHERE'siz DELETE FROM.
 * `DROP POLICY/TRIGGER/FUNCTION ... IF EXISTS` (idempotent migratsiyalarda odatiy) xavfli emas.
 * Cheklov: qator ichidagi dinamik SQL (EXECUTE '...') tahlil qilinmaydi.
 */
export function findDangerous(sql) {
  const clean = stripComments(sql);
  const lineAt = (idx) => clean.slice(0, idx).split('\n').length;
  const found = [];
  for (const rule of RULES) {
    for (const m of clean.matchAll(new RegExp(rule.re.source, 'gi'))) found.push({ rule: rule.id, line: lineAt(m.index ?? 0) });
  }
  // DELETE FROM ... (WHERE yo'q): buyruq ';' gacha
  for (const m of clean.matchAll(/\bDELETE\s+FROM\b[^;]*/gi)) {
    if (!/\bWHERE\b/i.test(m[0]) && !/\bCURRENT\s+OF\b/i.test(m[0])) found.push({ rule: 'DELETE FROM (WHERE yo\'q)', line: lineAt(m.index ?? 0) });
  }
  return found.sort((a, b) => a.line - b.line);
}

/** Kutilayotgan fayllar bo'yicha hisobot */
export function analyze(pending, readFile) {
  const baseline = pending.filter((f) => BASELINE_VERSIONS.includes(versionOf(f) ?? ''));
  const findings = [];
  for (const f of pending) {
    for (const d of findDangerous(readFile(f))) findings.push({ file: f, ...d });
  }
  return { pending, baseline, findings, dangerous: findings.length > 0 };
}

function setOutputs(obj) {
  const file = process.env.GITHUB_OUTPUT;
  const text = Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (file) appendFileSync(file, text);
  else process.stdout.write(`[outputs]\n${text}`);
}
function summary(md) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, md + '\n');
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
function fail(msg) {
  console.error(`::error::${msg}`);
  summary(`### Migratsiya to'xtatildi\n\n${msg}`);
  process.exit(1);
}

function main() {
  const mode = process.argv[2];
  const dir = arg('migrations-dir') ?? 'supabase/migrations';
  const readFile = (f) => {
    const p = path.join(dir, f);
    if (!existsSync(p)) fail(`Kutilayotgan migratsiya fayli repoda topilmadi: ${f}`);
    return readFileSync(p, 'utf8');
  };

  if (mode === 'baseline') {
    const list = parseMigrationList(readFileSync(arg('list-file') ?? '', 'utf8'));
    if (!list) fail("`supabase migration list` chiqishi tushunarsiz. Baseline qilinmadi.");
    const local = new Set(list.map((m) => m.local).filter(Boolean));
    const missing = BASELINE_VERSIONS.filter((v) => local.has(v) && !list.some((m) => m.local === v && m.remote === v));
    const remoteOnly = list.filter((m) => m.remote && !m.local).map((m) => m.remote);
    const unknown = remoteOnly.filter((v) => !LEGACY_REMOTE_VERSIONS.includes(v));
    if (unknown.length > 0) fail(`Bazada tarixi bor, lekin repoda fayli yo'q migratsiyalar: ${unknown.join(', ')}. Avval ularni aniqlang.`);
    const revert = remoteOnly.filter((v) => LEGACY_REMOTE_VERSIONS.includes(v));
    setOutputs({ versions: missing.join(' '), count: missing.length, revert: revert.join(' ') });
    if (revert.length > 0) console.log(`Eski vaqt belgili yozuvlar (bekor deb belgilanadi): ${revert.join(' ')}`);
    console.log(`Tarixda yo'q (belgilanadi): ${missing.join(' ') || "yo'q, baseline kerak emas"}`);
    return;
  }

  const raw = readFileSync(arg('dry-run-file') ?? '', 'utf8');
  const pending = parsePending(raw);
  if (!pending) fail("`supabase db push --dry-run` chiqishi tushunarsiz: kutilayotgan migratsiyalar aniqlanmadi. Hech narsa qo'llanmadi.");

  if (mode === 'apply') {
    const expected = (arg('expect') ?? '').split(',').filter(Boolean);
    if (JSON.stringify(expected) !== JSON.stringify(pending)) {
      fail(`Tasdiqdan keyin kutilayotgan migratsiyalar o'zgardi (reja: ${expected.join(', ') || "yo'q"}; hozir: ${pending.join(', ') || "yo'q"}). Ish qayta ishga tushirilsin.`);
    }
    console.log('Reja bilan mos.');
    return;
  }

  if (mode !== 'plan') fail(`Noma'lum rejim: ${mode}`);
  const r = analyze(pending, readFile);
  if (r.baseline.length > 0) {
    fail(
      `Bazaning migratsiya tarixida qo'lda qo'llangan migratsiyalar yo'q: ${r.baseline.join(', ')}. ` +
        `Ularni qayta ishga tushirib bo'lmaydi (masalan 001 \"already exists\" xatosi bilan yiqiladi), shuning uchun to'xtadim. Avval "Migratsiya" ish jarayonini ` +
        `mode=baseline bilan qo'lda ishga tushiring (docs/MIGRATSIYA-CI.md).`,
    );
  }
  const lines = [`### Migratsiya rejasi`, '', r.pending.length ? r.pending.map((f) => `- \`${f}\``).join('\n') : "Kutilayotgan migratsiya yo'q.", ''];
  if (r.dangerous) {
    lines.push('**Xavfli buyruqlar topildi: qo\'lda tasdiq kerak (`production-approval`).**', '');
    for (const f of r.findings) lines.push(`- \`${f.file}\` qator ${f.line}: ${f.rule}`);
  }
  summary(lines.join('\n'));
  setOutputs({ pending: r.pending.join(','), pending_count: r.pending.length, dangerous: r.dangerous });
  console.log(lines.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
