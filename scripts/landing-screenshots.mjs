// Ochiq bosh sahifa (landing) skrinshotlari -> docs/ekranlar/sayt/ (telefon 390 px va kompyuter 1366 px, och va qorong'i).
//   LANDING_URL=http://localhost:3107 node scripts/landing-screenshots.mjs
// Server oldindan ishga tushirilgan bo'lishi kerak. Brauzer yuklab olinmaydi: o'rnatilgan Chrome/Edge (CHROME_PATH bilan o'zgartiriladi).
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.LANDING_URL || 'http://localhost:3000';
const outDir = path.join(root, 'docs', 'ekranlar', 'sayt');
mkdirSync(outDir, { recursive: true });

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p));
if (!executablePath) throw new Error("Chrome yoki Edge topilmadi. CHROME_PATH bering.");

const VIEWS = [
  ['telefon', { width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['kompyuter', { width: 1366, height: 860 }, { deviceScaleFactor: 1 }],
];
const browser = await chromium.launch({ executablePath });
try {
  for (const scheme of ['light', 'dark']) {
    for (const [name, viewport, extra] of VIEWS) {
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, ...extra });
      const page = await ctx.newPage();
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      // Sekin yuklanadigan (lazy) rasmlar ko'rinishi uchun pastgacha aylantiriladi
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      const file = path.join(outDir, `landing-${name}-${scheme === 'light' ? 'och' : 'qorongi'}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('yozildi:', path.relative(root, file));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
