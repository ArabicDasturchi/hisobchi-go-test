/**
 * `ai-parse` so'rov tanasini tekshirish (sof funksiya, Deno'siz testlanadi).
 */
import { AI_PARSE_MODES, type AiParseMode } from './extract.ts';
import { isRecord } from './http.ts';

export const MAX_TEXT_CHARS = 4000;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** 4 MB rasm base64 da ~5.6 MB; JSON o'rami uchun zaxira */
export const MAX_BODY_BYTES = 6 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface AiParseRequest {
  shop_id: string;
  mode: AiParseMode;
  text?: string;
  image?: { mime: string; base64: string; bytes: number };
}

export type RequestErrorCode =
  | 'invalid_request'
  | 'invalid_shop_id'
  | 'invalid_mode'
  | 'text_required'
  | 'text_too_long'
  | 'image_required'
  | 'unsupported_image_type'
  | 'invalid_image'
  | 'image_too_large';

export type ParseRequestResult = { ok: true; value: AiParseRequest } | { ok: false; code: RequestErrorCode };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function base64DecodedBytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Fayl boshidagi "sehrli baytlar" e'lon qilingan turga mosmi */
export function imageMagicMatches(mime: string, b64: string): boolean {
  let head: string;
  try {
    head = atob(b64.slice(0, 24));
  } catch {
    return false;
  }
  const bytes = Array.from(head, (c) => c.charCodeAt(0));
  const at = (i: number) => bytes[i] ?? -1;
  if (mime === 'image/jpeg') return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (mime === 'image/png') return at(0) === 0x89 && head.slice(1, 4) === 'PNG';
  if (mime === 'image/webp') return head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP';
  return false;
}

export function parseAiParseRequest(body: unknown): ParseRequestResult {
  if (!isRecord(body)) return { ok: false, code: 'invalid_request' };
  const shopId = body.shop_id;
  if (typeof shopId !== 'string' || !UUID_RE.test(shopId)) return { ok: false, code: 'invalid_shop_id' };
  const mode = body.mode;
  if (typeof mode !== 'string' || !(AI_PARSE_MODES as readonly string[]).includes(mode)) {
    return { ok: false, code: 'invalid_mode' };
  }

  if (mode === 'purchase_image') {
    const img = body.image;
    if (!isRecord(img)) return { ok: false, code: 'image_required' };
    const mime = typeof img.mime === 'string' ? img.mime.trim().toLowerCase() : '';
    if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)) return { ok: false, code: 'unsupported_image_type' };
    let b64 = typeof img.base64 === 'string' ? img.base64 : '';
    const dataUrl = /^data:([^;,]+);base64,/i.exec(b64);
    if (dataUrl) {
      if (dataUrl[1].toLowerCase() !== mime) return { ok: false, code: 'unsupported_image_type' };
      b64 = b64.slice(dataUrl[0].length);
    }
    b64 = b64.replace(/\s+/g, '');
    if (!b64) return { ok: false, code: 'image_required' };
    // Hajmni regex'dan oldin: juda katta satrda vaqt yo'qotmaslik uchun
    if (base64DecodedBytes(b64) > MAX_IMAGE_BYTES) return { ok: false, code: 'image_too_large' };
    if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return { ok: false, code: 'invalid_image' };
    if (!imageMagicMatches(mime, b64)) return { ok: false, code: 'invalid_image' };
    // purchase_image rejimida `text` e'tiborga olinmaydi (promptga bormaydi)
    return { ok: true, value: { shop_id: shopId.toLowerCase(), mode, image: { mime, base64: b64, bytes: base64DecodedBytes(b64) } } };
  }

  if (typeof body.text !== 'string' || !body.text.trim()) return { ok: false, code: 'text_required' };
  const text = body.text.trim();
  if (Array.from(text).length > MAX_TEXT_CHARS) return { ok: false, code: 'text_too_long' };
  return { ok: true, value: { shop_id: shopId.toLowerCase(), mode: mode as AiParseMode, text } };
}
