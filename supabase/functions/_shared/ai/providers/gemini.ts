/**
 * Google Gemini (Generative Language API, AI Studio kaliti) — asoschi qarori 13.11.2026: AI hozir Gemini orqali.
 *
 * POST {baseUrl}/models/{model}:generateContent
 *   - kalit faqat `x-goog-api-key` sarlavhasida (URL'da EMAS: loglarga tushmasin);
 *   - `systemInstruction` + `contents`; rasm `inline_data` (base64);
 *   - `generationConfig.responseMimeType = application/json` (JSON rejim), `maxOutputTokens`.
 * Haqiqiy savdogar ma'lumoti bilan faqat PULLIK darajadagi kalit (docs/GEMINI-LLM.md: bepul darajada Google
 * ma'lumotdan foydalanishi mumkin).
 */
import { AiError, type FetchLike, type LlmProvider, type LlmRequest, type LlmResponse } from '../types.ts';
import { isRecord, nonNegInt, postJson, trimTrailingSlash } from '../http.ts';

export const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  fetch?: FetchLike;
}

export function createGeminiProvider(cfg: GeminiConfig): LlmProvider {
  const fetchFn: FetchLike = cfg.fetch ?? ((input, init) => fetch(input, init));
  const base = trimTrailingSlash(cfg.baseUrl ?? GEMINI_DEFAULT_BASE_URL);
  // Model nomi "models/" prefiksi bilan ham, siz ham berilishi mumkin
  const model = cfg.model.replace(/^models\//, '');
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;

  return {
    kind: 'gemini',
    model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const parts: Record<string, unknown>[] = [{ text: req.user }];
      for (const img of req.images ?? []) parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
      const generationConfig: Record<string, unknown> = {
        responseMimeType: 'application/json',
        maxOutputTokens: req.maxOutputTokens,
      };
      if (cfg.temperature !== undefined) generationConfig.temperature = cfg.temperature;
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig,
      };
      const data = await postJson(fetchFn, url, { 'x-goog-api-key': cfg.apiKey }, body, req.timeoutMs);
      return parseGeminiResponse(data, model);
    },
  };
}

export function parseGeminiResponse(data: unknown, fallbackModel: string): LlmResponse {
  if (!isRecord(data)) throw new AiError('ai_provider_error', 'Provayder javobi obyekt emas');
  const u = isRecord(data.usageMetadata) ? data.usageMetadata : {};
  const usage = { inputTokens: nonNegInt(u.promptTokenCount), outputTokens: nonNegInt(u.candidatesTokenCount) };
  const model = typeof data.modelVersion === 'string' && data.modelVersion ? data.modelVersion : fallbackModel;

  const feedback = isRecord(data.promptFeedback) ? data.promptFeedback : {};
  if (typeof feedback.blockReason === 'string' && feedback.blockReason) {
    throw new AiError('ai_refused', 'Provayder so\'rovni bloklagan', { usage });
  }
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = isRecord(candidates[0]) ? candidates[0] : undefined;
  if (!first) throw new AiError('ai_bad_output', 'Provayder javobida candidates yo\'q', { usage });

  const reason = first.finishReason;
  if (reason === 'MAX_TOKENS') throw new AiError('ai_output_truncated', 'Javob max token chegarasida kesildi', { usage });
  if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'BLOCKLIST' || reason === 'PROHIBITED_CONTENT' || reason === 'SPII') {
    throw new AiError('ai_refused', 'Provayder javobni to\'xtatdi', { usage });
  }
  const content = isRecord(first.content) ? first.content : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  // "Fikrlash" qismlari (thought: true) javob matniga qo'shilmaydi
  const text = parts.map((p) => (isRecord(p) && typeof p.text === 'string' && p.thought !== true ? p.text : '')).join('');
  if (!text.trim()) throw new AiError('ai_bad_output', 'Provayder bo\'sh javob qaytardi', { usage });
  return { text, usage, model };
}
