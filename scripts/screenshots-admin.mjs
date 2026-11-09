// Admin panel demo ekranlarining skrinshotlari (telefon va kompyuter) -> docs/ekranlar/admin/.
//
//   npm run screenshots:admin
//
// `npm run demo:admin` serverini o'zi ishga tushiradi va to'xtatadi (DEMO_ADMIN_PORT, standart 3100). Brauzer yuklab olinmaydi:
// o'rnatilgan Chrome yoki Edge ishlatiladi (CHROME_PATH bilan o'zgartirish mumkin). Faqat soxta demo ma'lumot.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.DEMO_ADMIN_PORT || '3100';
const base = `http://localhost:${port}`;
const outDir = path.join(root, 'docs', 'ekranlar', 'admin');

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
if (!executablePath) throw new Error("Chrome yoki Edge topilmadi. CHROME_PATH muhit o'zgaruvchisini bering.");

/**
 * [fayl nomi, yo'l, bosiladigan selektor (ixtiyoriy)]. Selektor bo'lsa, sahifa ochilgach shu element bosiladi
 * (masalan, ro'yxatdan birinchi do'kon). Sahifa yoki element yo'q bo'lsa, o'sha skrinshot o'tkazib yuboriladi.
 */
const PAGES = [
  ['kirish', '/login', null],
  ['ruxsat-yoq', '/forbidden', null],
  ['umumiy', '/overview', null],
  ['dokonlar', '/shops', null],
  ['dokon-sahifasi', '/shops', 'a[href^="/shops/"]:visible'],
  ['voronka', '/funnel', null],
  ['voronka-tanlangan', '/funnel', '[data-stage="3"]:visible'],
  ['jurnal', '/audit', null],
];
const VIEWS = [
  ['telefon', { width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['kompyuter', { width: 1366, height: 860 }, { deviceScaleFactor: 1 }],
];

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${base}/login`);
      if (r.ok) return;
    } catch {
      /* hali ishga tushmagan */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Demo server ${base} da javob bermadi`);
}

mkdirSync(outDir, { recursive: true });
const server = spawn('node', ['scripts/demo-admin.mjs'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32', env: { ...process.env, DEMO_ADMIN_PORT: port } });
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
    for (const [name, route, click] of PAGES) {
      const res = await page.goto(base + route, { waitUntil: 'networkidle' });
      if (!res || res.status() >= 400) {
        console.log("o'tkazildi (sahifa yo'q):", route);
        continue;
      }
      await page.waitForFunction(() => !document.body.innerText.includes('Yuklanmoqda'), null, { timeout: 20_000 }).catch(() => {});
      if (click) {
        const target = page.locator(click).first();
        if (!(await target.waitFor({ timeout: 8000 }).then(() => true, () => false))) {
          console.log("o'tkazildi (element yo'q):", route, click);
          continue;
        }
        await target.click();
        await page.waitForURL((u) => u.pathname !== route.split('?')[0], { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !document.body.innerText.includes('Yuklanmoqda'), null, { timeout: 20_000 }).catch(() => {});
      }
      await page.waitForTimeout(800);
      const file = path.join(outDir, `${name}-${viewName}.png`);
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
