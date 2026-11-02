// esbuild bilan to'plash: @hisobchi/core TypeScript manba sifatida paketga qo'shiladi
// (Node uni node_modules ichidan .ts sifatida ishga tushira olmaydi).
//   dist/handler.mjs — yig'ilgan funksiya; api/index.js (git'da, kichik) uni qayta eksport qiladi.
//   (api/index.js build vaqtida yaratilsa Vercel uni funksiya sifatida topmaydi: 404.)
//   dist/dev.mjs  — lokal server (--dev)
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  // CJS paketlar ESM to'plamda require() so'rashi mumkin
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};

await build({ ...common, entryPoints: ['src/vercel.ts'], outfile: 'dist/handler.mjs' });
if (process.argv.includes('--dev')) {
  await build({ ...common, entryPoints: ['src/dev.ts'], outfile: 'dist/dev.mjs' });
}
