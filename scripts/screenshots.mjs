// Demo ekranlarining skrinshotlari (telefon va kompyuter) -> docs/ekranlar/.
//
//   npm run screenshots -- oldin     (yoki: keyin)
//
// `npm run demo` serverini o'zi ishga tushiradi va to'xtatadi (DEMO_PORT, standart 3000). Brauzer yuklab olinmaydi:
// o'rnatilgan Chrome yoki Edge ishlatiladi (CHROME_PATH bilan o'zgartirish mumkin). Faqat soxta demo ma'lumot.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] ?? 'keyin';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Yorliq faqat lotin harf, raqam va "-" bo\'lishi mumkin (masalan: oldin, keyin)');
const port = process.env.DEMO_PORT || '3000';
const base = `http://localhost:${port}`;
const outDir = path.join(root, 'docs', 'ekranlar');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('Chrome yoki Edge topilmadi. CHROME_PATH muhit o\'zgaruvchisini bering.');

/** [fayl nomi, yo'l, kutiladigan matn] */
const PAGES = [
  ['bosh-sahifa', '/dashboard', null],
  ['yangi-savdo', '/sales/new', null],
  ['taminotchilar', '/suppliers', null],
  ['kirim-yozish', '/purchases/new', null],
  ['ombor', '/warehouse', null],
  ['kirim-daftari', '/books/in', null],
  ['sozlamalar', '/settings', null],
];
const VIEWS = [
  ['telefon', { width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['kompyuter', { width: 1366, height: 860 }, { deviceScaleFactor: 1 }],
];

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${base}/dashboard`);
      if (r.ok) return;
    } catch {
      /* hali ishga tushmagan */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Demo server ${base} da javob bermadi`);
}

mkdirSync(outDir, { recursive: true });
const server = spawn('node', ['scripts/demo-seed/run.mjs'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32', env: { ...process.env, DEMO_PORT: port } });
const stop = () => {
  if (process.platform === 'win32' && server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
};
process.on('exit', stop);

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath, headless: true });
  for (const [viewName, viewport, extra] of VIEWS) {
    const ctx = await browser.newContext({ viewport, colorScheme: 'light', locale: 'uz-UZ', ...extra });
    const page = await ctx.newPage();
    for (const [name, route] of PAGES) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      // Ma'lumot yuklanishini kutish: "yuklanmoqda" matni yo'qolguncha
      await page.waitForFunction(() => !document.body.innerText.includes('yuklanmoqda'), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(700); // animatsiyalar tugasin
      const file = path.join(outDir, `${name}-${viewName}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('saqlandi:', path.relative(root, file));
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  stop();
}
process.exit(0);
