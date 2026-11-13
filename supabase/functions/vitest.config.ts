import { defineConfig } from 'vitest/config';

// Ishga tushirish (repo ildizidan): npx vitest run --root supabase/functions
// Faqat `_shared` sof TypeScript kodi testlanadi; `ai-parse/index.ts` Deno'ga bog'liq (Deno.serve, esm.sh).
export default defineConfig({
  test: {
    include: ['_shared/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
