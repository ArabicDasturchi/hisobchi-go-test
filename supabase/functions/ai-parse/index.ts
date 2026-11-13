// Supabase Edge Function: ai-parse — erkin matn / ovoz matni / yuk xati surati → qatorlar (jami YO'Q).
// Yupqa Deno o'rami: barcha mantiq `../_shared/ai/handler.ts` da (Node'da testlanadi).
//
// Xavfsizlik:
// - service_role ISHLATILMAYDI. Har so'rovda foydalanuvchi JWT'si bilan supabase-js mijozi yaratiladi,
//   shuning uchun RPC va katalog o'qish RLS ostida ishlaydi.
// - OAuth (MCP) tokeni rad etiladi (client_id claim), bazada ham require_shop_member rad etadi.
// - Logga matn, rasm, ism yozilmaydi (handler.ts).
//
// Deploy (asoschi): docs/AI-PROVAYDER.md
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleAiParse } from '../_shared/ai/handler.ts';
import type { CatalogProduct } from '../_shared/ai/extract.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

function userClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Handler'ga faqat AI_* o'zgaruvchilari beriladi (SUPABASE_SERVICE_ROLE_KEY kabi sirlar uzatilmaydi)
function aiEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(Deno.env.toObject()).filter(([k]) => k.startsWith('AI_')));
}

Deno.serve((req: Request) =>
  handleAiParse(req, {
    env: aiEnv(),
    async getUserId(jwt) {
      const { data, error } = await userClient(jwt).auth.getUser(jwt);
      return error || !data?.user ? null : data.user.id;
    },
    async rpc(jwt, fn, args) {
      const { data, error } = await userClient(jwt).rpc(fn, args);
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
    async loadCatalog(jwt, shopId, limit) {
      const { data, error } = await userClient(jwt)
        .from('products')
        .select('id, name, unit')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(limit);
      if (error) throw new Error('catalog_unavailable');
      return (data ?? []) as CatalogProduct[];
    },
  }),
);
