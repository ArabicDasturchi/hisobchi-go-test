// docs/ekranlar dagi demo skrinshotlardan landing rasmlarini (WebP, qirqilgan) yasaydi.
// Demo plashka (pastdagi sariq "DEMO") kadrdan chiqarib tashlanadi. Ishga tushirish: node scripts/landing-images.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const sharp = require('sharp');
const src = (f) => path.join(root, 'docs/ekranlar', f);
const out = (f) => path.join(root, 'apps/web/public/landing', f);

// [chiqish, manba, {left, top, width, height}, chiqish kengligi]
const JOBS = [
  ['hero-telefon.webp', 'bosh-sahifa-telefon-keyin.png', { left: 0, top: 0, width: 780, height: 1500 }, 520],
  ['hero-kompyuter.webp', 'bosh-sahifa-kompyuter-keyin.png', { left: 0, top: 0, width: 1366, height: 800 }, 1200],
  ['qarz.webp', 'mijozlar-kompyuter-keyin.png', { left: 232, top: 56, width: 1134, height: 740 }, 760],
  ['foyda.webp', 'bosh-sahifa-telefon-keyin.png', { left: 0, top: 780, width: 780, height: 520 }, 640],
  ['ombor.webp', 'ombor-kompyuter-keyin.png', { left: 232, top: 56, width: 1134, height: 740 }, 760],
  ['varaq.webp', 'mijoz-daftari-kompyuter-keyin.png', { left: 232, top: 56, width: 1134, height: 580 }, 1100],
];

for (const [name, file, region, width] of JOBS) {
  const info = await sharp(src(file)).extract(region).resize({ width }).webp({ quality: 82 }).toFile(out(name));
  console.log(name, `${info.width}x${info.height}`, `${(info.size / 1024).toFixed(0)} KB`);
}
