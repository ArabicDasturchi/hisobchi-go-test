/**
 * Anthropic Messages API (POST {baseUrl}/v1/messages), SDK'siz: `_shared/ai` tashqi import qilmaydi
 * (Deno va Node'da bir xil ishlashi uchun).
 *
 * Eslatmalar (Anthropic hujjati, 2026-11):
 * - `temperature`/`top_p` yuborilmaydi: hozirgi modellar ularni 400 bilan rad etadi.
 * - Hozirgi modellarda fikrlash (thinking) yoqilgan bo'lishi mumkin; u `max_tokens` ichidan sarflanadi.
 *   Javobdan faqat `type: "text"` bloklari olinadi.
 * - `stop_reason: "refusal"` → ai_refused, `"max_tokens"` → ai_output_truncated.
 */
import { AiError, type FetchLike, type LlmProvider, type LlmRequest, type LlmResponse } from '../types.ts';
import { isRecord, nonNegInt, postJson, trimTrailingSlash } from '../http.ts';

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export function createAnthropicProvider(cfg: AnthropicConfig): LlmProvider {
  const fetchFn: FetchLike = cfg.fetch ?? ((input, init) => fetch(input, init));
  const url = `${trimTrailingSlash(cfg.baseUrl || ANTHROPIC_DEFAULT_BASE_URL)}/v1/messages`;

  return {
    kind: 'anthropic',
    model: cfg.model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const content = [
        // Rasm matndan oldin (Anthropic tavsiyasi)
        ...(req.images ?? []).map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mime, data: img.base64 },
        })),
        { type: 'text', text: req.user },
      ];
      const body = {
        model: cfg.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: [{ role: 'user', content }],
      };
      const headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
      const data = await postJson(fetchFn, url, headers, body, req.timeoutMs);
      return parseAnthropicResponse(data, cfg.model);
    },
  };
}

export function parseAnthropicResponse(data: unknown, fallbackModel: string): LlmResponse {
  if (!isRecord(data)) throw new AiError('ai_provider_error', 'Provayder javobi obyekt emas');
  const usageRaw = isRecord(data.usage) ? data.usage : {};
  const usage = {
    inputTokens:
      nonNegInt(usageRaw.input_tokens) +
      nonNegInt(usageRaw.cache_read_input_tokens) +
      nonNegInt(usageRaw.cache_creation_input_tokens),
    outputTokens: nonNegInt(usageRaw.output_tokens),
  };
  const model = typeof data.model === 'string' && data.model ? data.model : fallbackModel;

  if (data.stop_reason === 'refusal') {
    throw new AiError('ai_refused', 'Model javob berishni rad etdi', { usage });
  }
  if (data.stop_reason === 'max_tokens') {
    throw new AiError('ai_output_truncated', 'Javob max token chegarasida kesildi', { usage });
  }
  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .map((b) => (isRecord(b) && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
    .join('');
  if (!text.trim()) throw new AiError('ai_bad_output', 'Provayder bo\'sh javob qaytardi', { usage });
  return { text, usage, model };
}
