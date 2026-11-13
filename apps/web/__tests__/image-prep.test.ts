/**
 * F4: suratni tayyorlash — mos surat o'zgarmaydi, katta/HEIC surat JPEG'ga siqiladi (≤ 4 MB, uzun tomoni ≤ 2000 px).
 */
import { describe, expect, it, vi } from 'vitest';
import { bytesToBase64, fitWithin, ImagePrepError, MAX_IMAGE_BYTES, prepareImage, type ImageCodec } from '@/lib/imagePrep';

const blob = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

function codec(sizes: number[], dims = { width: 4000, height: 3000 }) {
  const calls: { w: number; h: number; q: number }[] = [];
  const c: ImageCodec = {
    decode: vi.fn(async () => ({ ...dims, source: 'bmp' })),
    encodeJpeg: vi.fn(async (_s, w, h, q) => {
      calls.push({ w, h, q });
      return blob(sizes[calls.length - 1] ?? 1, 'image/jpeg');
    }),
  };
  return { c, calls };
}

describe('prepareImage', () => {
  it('mos tur va ≤ 4 MB — o‘zgarmaydi, kodek chaqirilmaydi', async () => {
    const { c } = codec([]);
    const r = await prepareImage(blob(1000, 'image/png'), c);
    expect(r).toMatchObject({ mime: 'image/png', resized: false });
    expect(r.bytes.length).toBe(1000);
    expect(c.decode).not.toHaveBeenCalled();
  });

  it('katta JPEG — 2000 px gacha kichraytirilib siqiladi', async () => {
    const { c, calls } = codec([500_000]);
    const r = await prepareImage(blob(MAX_IMAGE_BYTES + 1, 'image/jpeg'), c);
    expect(r).toMatchObject({ mime: 'image/jpeg', resized: true });
    expect(calls).toEqual([{ w: 2000, h: 1500, q: 0.85 }]);
  });

  it('HEIC (iPhone) — JPEG ga aylantiriladi; birinchi sifat katta bo‘lsa pastroq sifat', async () => {
    const { c, calls } = codec([MAX_IMAGE_BYTES + 5, 3_000_000], { width: 1500, height: 2000 });
    const r = await prepareImage(blob(2_000_000, 'image/heic'), c);
    expect(r.mime).toBe('image/jpeg');
    expect(calls.map((x) => x.q)).toEqual([0.85, 0.7]);
    expect(calls[0]).toMatchObject({ w: 1500, h: 2000 });
  });

  it('o‘qib bo‘lmasa yoki siqilgandan keyin ham katta bo‘lsa — tushunarli xato', async () => {
    const bad: ImageCodec = { decode: async () => { throw new Error('x'); }, encodeJpeg: async () => blob(1, 'image/jpeg') };
    await expect(prepareImage(blob(10, 'image/heic'), bad)).rejects.toBeInstanceOf(ImagePrepError);
    const { c } = codec([MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES + 1]);
    await expect(prepareImage(blob(MAX_IMAGE_BYTES + 1, 'image/jpeg'), c)).rejects.toThrow(/juda katta/);
    await expect(prepareImage(blob(10, 'image/heic'), null)).rejects.toThrow(/siqa olmaydi/);
  });

  it('yordamchilar', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(6000, 1000)).toEqual({ width: 2000, height: 333 });
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });
});
