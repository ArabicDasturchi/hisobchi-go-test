/** Lokal server: `npm run dev -w apps/mcp` (apps/mcp/.env kerak). Productionda ishlatilmaydi. */
import { createServer } from 'node:http';
import { ConfigError } from './config.js';
import { buildHandler } from './runtime.js';

const port = Number(process.env.PORT ?? 8787);
let handler;
try {
  handler = buildHandler(process.env);
} catch (e) {
  console.error(e instanceof ConfigError ? `Sozlama xatosi:\n - ${e.problems.join('\n - ')}` : e);
  process.exit(1);
}

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 512 * 1024) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(c as Buffer);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const body = chunks.length > 0 && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
  const response = await handler(new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method: req.method, headers, body }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Hisobchi Go MCP: http://localhost:${port}/mcp`));
