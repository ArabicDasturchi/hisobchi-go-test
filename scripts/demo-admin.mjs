// `npm run demo:admin`: admin panelni soxta ma'lumot bilan ochadi. Kalit, .env, Supabase kerak emas.
// Windows/macOS/Linux'da bir xil ishlaydi (env o'zgaruvchi shu skriptda beriladi).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.DEMO_ADMIN_PORT || '3100';

console.log(`\nDemo: admin panel http://localhost:${port} (soxta ma'lumot, Supabase'siz). To'xtatish: Ctrl+C\n`);

const child = spawn('npx', ['next', 'dev', '--webpack', '--port', port], {
  cwd: path.join(root, 'apps/admin'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEXT_PUBLIC_ADMIN_DEMO: '1', NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
