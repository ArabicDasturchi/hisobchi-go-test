/**
 * Provayderni muhit o'zgaruvchilaridan tanlash. Kalitlar faqat Supabase secret'larda (repoda emas).
 *
 *   AI_PROVIDER   = gemini | openai-compatible | openrouter | anthropic   (majburiy)
 *                   gemini — HOZIRGI standart (asoschi qarori 13.11.2026);
 *                   openrouter — keyin almashtirish uchun tayyor preset (openai-compatible + OpenRouter manzili),
 *                   hozir YOQILMAGAN: faqat AI_PROVIDER=openrouter va uning kaliti qo'yilganda ishlaydi
 *   AI_MODEL      = provayderdagi model nomi             (majburiy)
 *   AI_API_KEY    = kalit (gemini, openrouter, anthropic uchun majburiy; Ollama kabi lokal server uchun shart emas)
 *   AI_BASE_URL   = ixtiyoriy; standartlar: gemini → generativelanguage.googleapis.com/v1beta,
 *                   openai-compatible → api.openai.com/v1, openrouter → openrouter.ai/api/v1, anthropic → api.anthropic.com
 *   AI_JSON_MODE  = off  → response_format yuborilmaydi (qo'llamaydigan openai-compatible provayder uchun)
 *   AI_TEMPERATURE= son  → so'rovga qo'shiladi (0..2)
 *
 * 12.11 dagi "Gemini yo'q" qarori 13.11 da bekor qilindi (QARORLAR). Noma'lum qiymat → `ai_not_configured`.
 * Sozlanmagan bo'lsa ilova AI'siz ishlayveradi (web qo'lda kiritish / F1 joylash oqimiga qaytadi).
 */
import { AiError, type FetchLike, type LlmProvider } from './types.ts';
import { createOpenAiCompatibleProvider } from './providers/openaiCompatible.ts';
import { ANTHROPIC_DEFAULT_BASE_URL, createAnthropicProvider } from './providers/anthropic.ts';
import { GEMINI_DEFAULT_BASE_URL, createGeminiProvider } from './providers/gemini.ts';

export const SUPPORTED_PROVIDERS = ['gemini', 'openai-compatible', 'openrouter', 'anthropic'] as const;
export type ProviderKind = (typeof SUPPORTED_PROVIDERS)[number];

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export type EnvLike = Record<string, string | undefined>;

const MODEL_RE = /^[A-Za-z0-9._:/@+-]{1,200}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal']);

/** Standart provayder va model (asoschi qarori 13.11.2026): faqat AI_API_KEY qo'yilsa Gemini ishlaydi */
export const DEFAULT_PROVIDER: ProviderKind = 'gemini';
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

export function createProvider(env: EnvLike, opts: { fetch?: FetchLike } = {}): LlmProvider {
  const apiKey = (env.AI_API_KEY ?? '').trim();
  // AI_PROVIDER berilmasa: kalit bo'lsa Gemini (standart), kalit ham yo'q bo'lsa — sozlanmagan
  const kind = (env.AI_PROVIDER ?? '').trim().toLowerCase() || (apiKey ? DEFAULT_PROVIDER : '');
  const model = (env.AI_MODEL ?? '').trim() || (kind === 'gemini' ? GEMINI_DEFAULT_MODEL : '');
  const baseUrlRaw = (env.AI_BASE_URL ?? '').trim();

  if (!kind) throw new AiError('ai_not_configured', 'AI_PROVIDER sozlanmagan');
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(kind)) {
    throw new AiError('ai_not_configured', `Noma'lum AI_PROVIDER. Qo'llanadi: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }
  if (!model) throw new AiError('ai_not_configured', 'AI_MODEL sozlanmagan');
  if (!MODEL_RE.test(model)) throw new AiError('ai_not_configured', "AI_MODEL formati noto'g'ri");

  const tRaw = (env.AI_TEMPERATURE ?? '').trim();
  let temperature: number | undefined;
  if (tRaw) {
    const t = Number(tRaw);
    if (!Number.isFinite(t) || t < 0 || t > 2) throw new AiError('ai_not_configured', "AI_TEMPERATURE 0..2 oralig'ida bo'lishi kerak");
    temperature = t;
  }

  if (kind === 'gemini') {
    if (!apiKey) throw new AiError('ai_not_configured', 'gemini uchun AI_API_KEY kerak');
    const baseUrl = checkBaseUrl(baseUrlRaw || GEMINI_DEFAULT_BASE_URL);
    return createGeminiProvider({ apiKey, model, baseUrl, temperature, fetch: opts.fetch });
  }

  if (kind === 'anthropic') {
    if (!apiKey) throw new AiError('ai_not_configured', 'anthropic uchun AI_API_KEY kerak');
    const baseUrl = checkBaseUrl(baseUrlRaw || ANTHROPIC_DEFAULT_BASE_URL);
    return createAnthropicProvider({ apiKey, model, baseUrl, fetch: opts.fetch });
  }

  // openrouter: openai-compatible + OpenRouter manzili; kalit shart (hozir yoqilmagan, faqat env bilan yoqiladi)
  if (kind === 'openrouter' && !apiKey) throw new AiError('ai_not_configured', 'openrouter uchun AI_API_KEY kerak');
  const baseUrl = checkBaseUrl(baseUrlRaw || (kind === 'openrouter' ? OPENROUTER_DEFAULT_BASE_URL : OPENAI_DEFAULT_BASE_URL));
  const jsonMode = (env.AI_JSON_MODE ?? '').trim().toLowerCase() !== 'off';
  return createOpenAiCompatibleProvider({
    baseUrl,
    model,
    apiKey: apiKey || undefined,
    jsonMode,
    temperature,
    fetch: opts.fetch,
  });
}

/** Kalit ochiq tarmoqda ketmasligi uchun: https majburiy, faqat lokal server uchun http ruxsat. */
function checkBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AiError('ai_not_configured', 'AI_BASE_URL URL emas');
  }
  if (u.username || u.password) throw new AiError('ai_not_configured', "AI_BASE_URL ichida login/parol bo'lmasin");
  if (u.protocol === 'https:') return raw;
  if (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname)) return raw;
  throw new AiError('ai_not_configured', "AI_BASE_URL https bo'lishi kerak (http faqat lokal server uchun)");
}
