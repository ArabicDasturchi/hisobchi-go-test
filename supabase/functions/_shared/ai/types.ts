/**
 * Provayderdan mustaqil LLM qatlami: umumiy turlar va xatolar.
 *
 * Bu papka (`_shared/ai`) sof TypeScript: tashqi import yo'q, faqat `fetch`, `AbortController`,
 * `atob`. Deno (Edge Function) va Node (vitest) da bir xil ishlaydi.
 *
 * Qoida (CLAUDE.md): AI faqat matnni tuzilmaga aylantiradi. Hech qanday yig'indi, summa yoki qarz
 * AI javobidan olinmaydi va bu qatlam bazaga yozmaydi.
 */

export interface LlmImage {
  /** image/jpeg | image/png | image/webp */
  mime: string;
  /** "data:" prefiksisiz base64 */
  base64: string;
}

export interface LlmRequest {
  system: string;
  user: string;
  images?: LlmImage[];
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  /** Provayder qaytargan model nomi (bo'lmasa sozlangan nom) */
  model: string;
}

export interface LlmProvider {
  /** 'openai-compatible' | 'anthropic' | 'mock' */
  readonly kind: string;
  /** Sozlangan model nomi */
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Mashina kodlari. Web shu kodlarga qarab xabar ko'rsatadi; matn ichida foydalanuvchi ma'lumoti bo'lmaydi.
 * - ai_not_configured: AI_PROVIDER/AI_MODEL yo'q yoki noma'lum (ilova AI'siz ishlayveradi)
 * - ai_timeout: provayder belgilangan vaqtda javob bermadi
 * - ai_provider_error: provayder HTTP xatosi yoki tarmoq xatosi
 * - ai_provider_busy: provayder 429 (rate limit) yoki 529/503 qaytardi
 * - ai_refused: model javob berishni rad etdi
 * - ai_output_truncated: javob max token chegarasida kesildi
 * - ai_bad_output: javob JSON emas yoki sxemaga mos emas
 */
export type AiErrorCode =
  | 'ai_not_configured'
  | 'ai_timeout'
  | 'ai_provider_error'
  | 'ai_provider_busy'
  | 'ai_refused'
  | 'ai_output_truncated'
  | 'ai_bad_output';

export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Provayder HTTP holati (bo'lsa). Javob tanasi saqlanmaydi: unda kirish matni qaytishi mumkin. */
  readonly httpStatus?: number;
  /** Xato bo'lsa ham provayder sarflagan tokenlar (ma'lum bo'lsa) */
  readonly usage?: LlmUsage;

  constructor(code: AiErrorCode, message: string, opts: { httpStatus?: number; usage?: LlmUsage } = {}) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.httpStatus = opts.httpStatus;
    this.usage = opts.usage;
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}
