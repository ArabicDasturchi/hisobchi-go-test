import { describe, expect, it } from 'vitest';
import { base64DecodedBytes, imageMagicMatches, MAX_IMAGE_BYTES, MAX_TEXT_CHARS, parseAiParseRequest } from '../request.ts';

const SHOP = '11111111-2222-4333-8444-555555555555';
const b64 = (bytes: number[] | string) => Buffer.from(typeof bytes === 'string' ? bytes : Uint8Array.from(bytes)).toString('base64');
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = b64('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ');

const code = (body: unknown) => {
  const r = parseAiParseRequest(body);
  return r.ok ? 'ok' : r.code;
};

describe('parseAiParseRequest', () => {
  it('matn rejimlari', () => {
    const r = parseAiParseRequest({ shop_id: SHOP.toUpperCase(), mode: 'sale_text', text: "  o'nta chirmoq  " });
    expect(r).toEqual({ ok: true, value: { shop_id: SHOP, mode: 'sale_text', text: "o'nta chirmoq" } });
    expect(code({ shop_id: SHOP, mode: 'purchase_text', text: 'un 10 kg 8000' })).toBe('ok');
  });

  it('noto\'g\'ri tana, do\'kon, rejim', () => {
    expect(code(null)).toBe('invalid_request');
    expect(code([])).toBe('invalid_request');
    expect(code({ mode: 'sale_text', text: 'a' })).toBe('invalid_shop_id');
    expect(code({ shop_id: 'abc', mode: 'sale_text', text: 'a' })).toBe('invalid_shop_id');
    expect(code({ shop_id: SHOP, mode: 'audio', text: 'a' })).toBe('invalid_mode');
    expect(code({ shop_id: SHOP, text: 'a' })).toBe('invalid_mode');
  });

  it('matn majburiy va ≤ 4000 belgi (emoji/kirill ham bitta belgi)', () => {
    expect(code({ shop_id: SHOP, mode: 'sale_text' })).toBe('text_required');
    expect(code({ shop_id: SHOP, mode: 'sale_text', text: '   ' })).toBe('text_required');
    expect(code({ shop_id: SHOP, mode: 'sale_text', text: 5 })).toBe('text_required');
    expect(code({ shop_id: SHOP, mode: 'sale_text', text: 'я'.repeat(MAX_TEXT_CHARS) })).toBe('ok');
    expect(code({ shop_id: SHOP, mode: 'sale_text', text: '😀'.repeat(MAX_TEXT_CHARS) })).toBe('ok');
    expect(code({ shop_id: SHOP, mode: 'sale_text', text: 'a'.repeat(MAX_TEXT_CHARS + 1) })).toBe('text_too_long');
  });

  it('rasm: faqat jpeg/png/webp, sehrli baytlar mos, data URL prefiksi olinadi', () => {
    for (const [mime, data] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP]]) {
      const r = parseAiParseRequest({ shop_id: SHOP, mode: 'purchase_image', image: { mime, base64: data } });
      expect(r.ok).toBe(true);
    }
    const withPrefix = parseAiParseRequest({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: `data:image/png;base64,${PNG}` }, text: 'e\'tiborsiz' });
    expect(withPrefix.ok && withPrefix.value.image?.base64).toBe(PNG);
    expect(withPrefix.ok && withPrefix.value.text).toBeUndefined();

    expect(code({ shop_id: SHOP, mode: 'purchase_image' })).toBe('image_required');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: '' } })).toBe('image_required');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/gif', base64: PNG } })).toBe('unsupported_image_type');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/svg+xml', base64: PNG } })).toBe('unsupported_image_type');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: `data:image/jpeg;base64,${PNG}` } })).toBe('unsupported_image_type');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/jpeg', base64: PNG } })).toBe('invalid_image');
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: 'not*base64!' } })).toBe('invalid_image');
  });

  it('rasm ≤ 4 MB', () => {
    const okLen = Math.floor(MAX_IMAGE_BYTES / 3) * 4; // ~4 MB dan sal kam
    const big = PNG + 'A'.repeat(okLen - PNG.length + 8);
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: big } })).toBe('image_too_large');
    const fits = PNG + 'A'.repeat(okLen - PNG.length - 16);
    expect(base64DecodedBytes(fits)).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(code({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: fits } })).toBe('ok');
  });

  it('imageMagicMatches / base64DecodedBytes', () => {
    expect(imageMagicMatches('image/png', PNG)).toBe(true);
    expect(imageMagicMatches('image/webp', PNG)).toBe(false);
    expect(base64DecodedBytes('AAAA')).toBe(3);
    expect(base64DecodedBytes('AA==')).toBe(1);
  });
});
