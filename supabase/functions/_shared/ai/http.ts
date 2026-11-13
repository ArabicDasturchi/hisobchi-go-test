/**
 * Provayderlar uchun umumiy HTTP yordamchisi: timeout (AbortController) va xatolarni AiError'ga aylantirish.
 * Javob tanasi xato xabariga QO'SHILMAYDI (unda foydalanuvchi matni qaytishi mumkin, log siyosati).
 */
import { AiError, type FetchLike } from './types.ts';

export async function postJson(
  fetchFn: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AiError('ai_timeout', 'Timeout musbat bo\'lishi kerak');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new AiError('ai_timeout', `Provayder ${timeoutMs} ms ichida javob bermadi`);
    }
    throw new AiError('ai_provider_error', `Provayderga ulanib bo'lmadi: ${errName(e)}`);
  }
  try {
    if (!res.ok) {
      // Tanani o'qib tashlaymiz (ulanish bo'shashi uchun), lekin saqlamaymiz
      await res.text().catch(() => '');
      const busy = res.status === 429 || res.status === 503 || res.status === 529;
      throw new AiError(busy ? 'ai_provider_busy' : 'ai_provider_error', `Provayder HTTP ${res.status}`, {
        httpStatus: res.status,
      });
    }
    try {
      return await res.json();
    } catch (e) {
      if (controller.signal.aborted) {
        throw new AiError('ai_timeout', `Provayder ${timeoutMs} ms ichida javob bermadi`);
      }
      throw new AiError('ai_provider_error', 'Provayder javobi JSON emas');
    }
  } finally {
    clearTimeout(timer);
  }
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : 'unknown';
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function nonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
