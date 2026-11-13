/**
 * OpenAI Chat Completions bilan mos provayderlar: OpenAI, OpenRouter, DeepSeek, Groq, Together,
 * Ollama (`http://localhost:11434/v1`), vLLM, LM Studio va boshqalar.
 *
 * POST {baseUrl}/chat/completions. Rasm `image_url` data URL sifatida yuboriladi (vision modeli kerak).
 */
import { AiError, type FetchLike, type LlmProvider, type LlmRequest, type LlmResponse } from '../types.ts';
import { isRecord, nonNegInt, postJson, trimTrailingSlash } from '../http.ts';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  /** Ollama kabi lokal serverlarda kalit kerak emas */
  apiKey?: string;
  /** `response_format: {type: 'json_object'}` yuborilsinmi (standart: ha). Qo'llamaydigan provayder uchun false. */
  jsonMode?: boolean;
  /** Berilsa yuboriladi; berilmasa provayder standarti (ba'zi modellar temperature'ni rad etadi) */
  temperature?: number;
  fetch?: FetchLike;
}

export function createOpenAiCompatibleProvider(cfg: OpenAiCompatibleConfig): LlmProvider {
  const fetchFn: FetchLike = cfg.fetch ?? ((input, init) => fetch(input, init));
  const url = `${trimTrailingSlash(cfg.baseUrl)}/chat/completions`;

  return {
    kind: 'openai-compatible',
    model: cfg.model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const images = req.images ?? [];
      const userContent =
        images.length === 0
          ? req.user
          : [
              { type: 'text', text: req.user },
              ...images.map((img) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mime};base64,${img.base64}` },
              })),
            ];
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: userContent },
        ],
        max_tokens: req.maxOutputTokens,
        stream: false,
      };
      if (cfg.jsonMode !== false) body.response_format = { type: 'json_object' };
      if (cfg.temperature !== undefined) body.temperature = cfg.temperature;

      const headers: Record<string, string> = {};
      if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;

      const data = await postJson(fetchFn, url, headers, body, req.timeoutMs);
      return parseOpenAiResponse(data, cfg.model);
    },
  };
}

export function parseOpenAiResponse(data: unknown, fallbackModel: string): LlmResponse {
  if (!isRecord(data)) throw new AiError('ai_provider_error', 'Provayder javobi obyekt emas');
  const usageRaw = isRecord(data.usage) ? data.usage : {};
  const usage = { inputTokens: nonNegInt(usageRaw.prompt_tokens), outputTokens: nonNegInt(usageRaw.completion_tokens) };
  const model = typeof data.model === 'string' && data.model ? data.model : fallbackModel;

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : undefined;
  if (!first) throw new AiError('ai_bad_output', 'Provayder javobida choices yo\'q', { usage });
  const message = isRecord(first.message) ? first.message : {};

  if (typeof message.refusal === 'string' && message.refusal.trim()) {
    throw new AiError('ai_refused', 'Model javob berishni rad etdi', { usage });
  }
  if (first.finish_reason === 'length') {
    throw new AiError('ai_output_truncated', 'Javob max token chegarasida kesildi', { usage });
  }
  if (first.finish_reason === 'content_filter') {
    throw new AiError('ai_refused', 'Provayder kontent filtri javobni to\'xtatdi', { usage });
  }

  let text = '';
  if (typeof message.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .map((p) => (isRecord(p) && typeof p.text === 'string' ? p.text : ''))
      .join('');
  }
  if (!text.trim()) throw new AiError('ai_bad_output', 'Provayder bo\'sh javob qaytardi', { usage });
  return { text, usage, model };
}
