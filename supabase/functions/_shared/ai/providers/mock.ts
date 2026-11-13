/**
 * Testlar uchun soxta provayder: tayyor javob qaytaradi yoki xato tashlaydi, chaqiruvlarni yozib boradi.
 * Production'da `createProvider` uni hech qachon tanlamaydi.
 */
import { AiError, type AiErrorCode, type LlmProvider, type LlmRequest, type LlmResponse, type LlmUsage } from '../types.ts';

export type MockReply =
  | string
  | { text: string; usage?: Partial<LlmUsage>; model?: string }
  | { error: AiErrorCode; usage?: LlmUsage }
  | ((req: LlmRequest) => Promise<LlmResponse> | LlmResponse);

export interface MockProvider extends LlmProvider {
  readonly calls: LlmRequest[];
}

export function createMockProvider(reply: MockReply, model = 'mock-model'): MockProvider {
  const calls: LlmRequest[] = [];
  return {
    kind: 'mock',
    model,
    calls,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      calls.push(req);
      if (typeof reply === 'function') return reply(req);
      if (typeof reply === 'string') return { text: reply, usage: { inputTokens: 100, outputTokens: 50 }, model };
      if ('error' in reply) throw new AiError(reply.error, `mock: ${reply.error}`, { usage: reply.usage });
      return {
        text: reply.text,
        usage: { inputTokens: reply.usage?.inputTokens ?? 100, outputTokens: reply.usage?.outputTokens ?? 50 },
        model: reply.model ?? model,
      };
    },
  };
}
