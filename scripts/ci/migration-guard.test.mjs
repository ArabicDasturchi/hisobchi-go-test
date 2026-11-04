import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyze, BASELINE_VERSIONS, findDangerous, parseMigrationList, parsePending, versionOf } from './migration-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'migration-guard.mjs');
const MIGRATIONS = path.resolve(HERE, '../../supabase/migrations');

// Supabase CLI 3.0.0 ning haqiqiy chiqishidan (lokal sinov, 02-03.11.2026)
const DRY_ALL = `Target: custom Postgres (localhost:5432)
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 001_initial_schema.sql
 • 002_test_calculations.sql
 • 003_security_and_mvp_rpc.sql
 • 004_mcp_agent.sql
{"upToDate":false,"dryRun":true,"migrations":["001_initial_schema.sql","002_test_calculations.sql","003_security_and_mvp_rpc.sql","004_mcp_agent.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push.","target":{"kind":"db-url","host":"localhost","port":5432}}`;
const DRY_UPTODATE = `Target: custom Postgres (localhost:5432)
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date.","target":{"kind":"db-url","host":"localhost","port":5432}}`;
const LIST_EMPTY_HISTORY = `Target: custom Postgres (localhost:5432)
{"migrations":[{"local":"001","remote":"","time":"001"},{"local":"002","remote":"","time":"002"},{"local":"003","remote":"","time":"003"},{"local":"004","remote":"","time":"004"}],"message":"Migrations listed","target":{"kind":"db-url","host":"localhost","port":5432}}`;
const LIST_REPAIRED = LIST_EMPTY_HISTORY.replace(/"local":"(\d+)","remote":""/g, '"local":"$1","remote":"$1"');

describe('parsePending', () => {
  it('JSON qatordan', () => assert.deepEqual(parsePending(DRY_ALL).length, 4));
  it('faqat ro\'yxat ko\'rinishidan (JSON bo\'lmasa)', () => {
    const text = DRY_ALL.split('\n').filter((l) => !l.startsWith('{')).join('\n');
    assert.deepEqual(parsePending(text), ['001_initial_schema.sql', '002_test_calculations.sql', '003_security_and_mvp_rpc.sql', '004_mcp_agent.sql']);
  });
  it('yangilangan baza', () => assert.deepEqual(parsePending(DRY_UPTODATE), []));
  it('tushunarsiz chiqish null (davom etilmaydi)', () => {
    assert.equal(parsePending('Error: connection refused'), null);
    assert.equal(parsePending(''), null);
  });
});

describe('parseMigrationList / versionOf', () => {
  it('bo\'sh tarix', () => assert.equal(parseMigrationList(LIST_EMPTY_HISTORY).filter((m) => m.remote === '').length, 4));
  it('repair dan keyin', () => assert.equal(parseMigrationList(LIST_REPAIRED).filter((m) => m.remote === '').length, 0));
  it('tushunarsiz chiqish', () => assert.equal(parseMigrationList('xato'), null));
  it('versiya', () => {
    assert.equal(versionOf('004_mcp_agent.sql'), '004');
    assert.equal(versionOf('20261103120000_x.sql'), '20261103120000');
    assert.equal(versionOf('readme.md'), null);
  });
});

describe('findDangerous', () => {
  const rules = (sql) => findDangerous(sql).map((f) => f.rule);
  it('xavfli buyruqlar topiladi', () => {
    assert.deepEqual(rules('DROP TABLE customers;'), ['DROP TABLE']);
    assert.deepEqual(rules('drop table if exists x cascade;'), ['DROP TABLE']);
    assert.deepEqual(rules('TRUNCATE payments;'), ['TRUNCATE']);
    assert.deepEqual(rules('TRUNCATE TABLE a, b;'), ['TRUNCATE']);
    assert.deepEqual(rules('ALTER TABLE t DROP COLUMN phone;'), ['DROP COLUMN']);
    assert.deepEqual(rules('DROP SCHEMA public CASCADE;'), ['DROP SCHEMA']);
    assert.deepEqual(rules('DELETE FROM customers;'), ["DELETE FROM (WHERE yo'q)"]);
    assert.deepEqual(rules('delete\n  from customers\n;'), ["DELETE FROM (WHERE yo'q)"]);
    assert.deepEqual(rules("DO $$ BEGIN DELETE FROM t; END $$;"), ["DELETE FROM (WHERE yo'q)"]);
  });
  it('oddiy qo\'shuvchi va idempotent buyruqlar xavfli emas', () => {
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS a (id int);',
      'ALTER TABLE a ADD COLUMN b text;',
      'DROP POLICY IF EXISTS p ON t; CREATE POLICY p ON t FOR SELECT USING (true);',
      'DROP TRIGGER IF EXISTS tr ON t;',
      'CREATE OR REPLACE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;',
      'DELETE FROM t WHERE id = 1;',
      'DELETE FROM t\n  USING u\n  WHERE t.id = u.id;',
      '-- DROP TABLE x;\nSELECT 1;',
      '/* TRUNCATE a;\n DROP TABLE b; */ SELECT 1;',
      'ALTER TABLE a DROP CONSTRAINT c;',
    ]) assert.deepEqual(rules(sql), [], sql);
  });
  it('qator raqami to\'g\'ri', () => {
    assert.equal(findDangerous('SELECT 1;\n\n-- izoh\nTRUNCATE t;')[0].line, 4);
  });
  it('mavjud 001-004 migratsiyalarida xavfli buyruq yo\'q (soxta ogohlantirish bo\'lmasin)', () => {
    for (const f of ['001_initial_schema.sql', '002_test_calculations.sql', '003_security_and_mvp_rpc.sql', '004_mcp_agent.sql']) {
      assert.deepEqual(findDangerous(readFileSync(path.join(MIGRATIONS, f), 'utf8')), [], f);
    }
  });
});

describe('analyze', () => {
  it('001-004 kutilayotgan bo\'lsa baseline ro\'yxatiga tushadi', () => {
    const r = analyze(['004_mcp_agent.sql', '005_x.sql'], () => 'SELECT 1;');
    assert.deepEqual(r.baseline, ['004_mcp_agent.sql']);
    assert.equal(r.dangerous, false);
  });
  it('xavfli fayl topiladi', () => {
    const r = analyze(['005_x.sql'], () => 'TRUNCATE t;');
    assert.equal(r.dangerous, true);
    assert.deepEqual(BASELINE_VERSIONS, ['001', '002', '003', '004']);
  });
});

/** CLI: vaqtinchalik papkada, GITHUB_OUTPUT fayli bilan */
function run(args, { dry, files = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'guard-'));
  const mig = path.join(dir, 'migrations');
  execFileSync('mkdir', ['-p', mig]);
  for (const [n, c] of Object.entries(files)) writeFileSync(path.join(mig, n), c);
  const out = path.join(dir, 'out.txt');
  writeFileSync(out, '');
  const extra = [];
  if (dry !== undefined) {
    writeFileSync(path.join(dir, 'dry.txt'), dry);
    extra.push('--dry-run-file', path.join(dir, 'dry.txt'));
  }
  const r = spawnSync('node', [SCRIPT, ...args, ...extra, '--migrations-dir', mig], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: path.join(dir, 'sum.md') } });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, outputs: readFileSync(out, 'utf8'), dir };
}
const dryFor = (...names) => `Would push these migrations:\n${names.map((n) => ` • ${n}`).join('\n')}\n{"upToDate":false,"dryRun":true,"migrations":${JSON.stringify(names)}}`;

describe('CLI', () => {
  it('plan: oddiy qo\'shuvchi migratsiya o\'zi o\'tadi (dangerous=false)', () => {
    const r = run(['plan'], { dry: dryFor('005_add.sql'), files: { '005_add.sql': 'ALTER TABLE a ADD COLUMN b text;' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.outputs, /dangerous=false/);
    assert.match(r.outputs, /pending=005_add\.sql/);
    assert.match(r.outputs, /pending_count=1/);
  });
  it('plan: DROP TABLE → dangerous=true (qo\'lda tasdiq)', () => {
    const r = run(['plan'], { dry: dryFor('005_x.sql'), files: { '005_x.sql': 'DROP TABLE old;' } });
    assert.equal(r.status, 0);
    assert.match(r.outputs, /dangerous=true/);
  });
  it('plan: yangilangan baza → 0 ta', () => {
    const r = run(['plan'], { dry: DRY_UPTODATE });
    assert.equal(r.status, 0);
    assert.match(r.outputs, /pending_count=0/);
  });
  it('plan: 001-004 kutilayotgan bo\'lsa TO\'XTAYDI (qayta qo\'llanib ketmasin)', () => {
    const r = run(['plan'], { dry: DRY_ALL, files: Object.fromEntries(['001_initial_schema.sql', '002_test_calculations.sql', '003_security_and_mvp_rpc.sql', '004_mcp_agent.sql'].map((n) => [n, 'SELECT 1;'])) });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /baseline/);
    assert.equal(r.outputs, '');
  });
  it('plan: tushunarsiz chiqishda to\'xtaydi; fayl repoda yo\'q bo\'lsa ham', () => {
    assert.equal(run(['plan'], { dry: 'Error: connection refused' }).status, 1);
    assert.equal(run(['plan'], { dry: dryFor('005_yoq.sql') }).status, 1);
  });
  it('apply: reja bilan mos kelsa o\'tadi, o\'zgargan bo\'lsa to\'xtaydi', () => {
    assert.equal(run(['apply', '--expect', '005_a.sql'], { dry: dryFor('005_a.sql') }).status, 0);
    assert.equal(run(['apply', '--expect', '005_a.sql'], { dry: dryFor('005_a.sql', '006_b.sql') }).status, 1);
    assert.equal(run(['apply', '--expect', '005_a.sql'], { dry: DRY_UPTODATE }).status, 1);
  });
  it('baseline: tarixda yo\'q 001-004 aniqlanadi; allaqachon belgilangan bo\'lsa bo\'sh', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bl-'));
    writeFileSync(path.join(dir, 'a.txt'), LIST_EMPTY_HISTORY);
    writeFileSync(path.join(dir, 'b.txt'), LIST_REPAIRED);
    const env = { ...process.env, GITHUB_OUTPUT: path.join(dir, 'o.txt') };
    writeFileSync(env.GITHUB_OUTPUT, '');
    assert.equal(spawnSync('node', [SCRIPT, 'baseline', '--list-file', path.join(dir, 'a.txt')], { env }).status, 0);
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /versions=001 002 003 004/);
    writeFileSync(env.GITHUB_OUTPUT, '');
    assert.equal(spawnSync('node', [SCRIPT, 'baseline', '--list-file', path.join(dir, 'b.txt')], { env }).status, 0);
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /count=0/);
  });
});
