import { ConfigError } from './config.js';
import { buildHandler } from './runtime.js';

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | undefined;

/** Vercel Function (Web standart `fetch` eksporti). Sozlama xatosi serverni yiqitmaydi, 500 va muammo nomlarini qaytaradi. */
export default {
  async fetch(req: Request): Promise<Response> {
    try {
      handler ??= buildHandler(process.env);
    } catch (e) {
      const problems = e instanceof ConfigError ? e.problems : ['noma\'lum xato'];
      return new Response(JSON.stringify({ error: 'server_misconfigured', problems }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return handler(req);
  },
};
