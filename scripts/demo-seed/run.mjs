// `npm run demo`: veb panelni soxta ma'lumot bilan ochadi. Kalit, .env, Supabase kerak emas.
// Windows/macOS/Linux'da bir xil ishlaydi (env o'zgaruvchi shu skriptda beriladi).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.env.DEMO_PORT || '3000';

console.log(`\nDemo: veb panel http://localhost:${port} (soxta ma'lumot, yozish o'chirilgan). To'xtatish: Ctrl+C\n`);

const child = spawn('npx', ['next', 'dev', '--webpack', '--port', port], {
  cwd: path.join(root, 'apps/web'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEXT_PUBLIC_DEMO: '1', NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
