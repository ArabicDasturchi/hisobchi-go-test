/**
 * F4 «Rasmdan kirim»: suratni serverga yuborishdan oldin tayyorlash (brauzerda, serverga hech narsa saqlanmaydi).
 * Telefon suratlari ko'pincha 4 MB dan katta yoki HEIC (iPhone) bo'ladi; server faqat JPG/PNG/WEBP ≤ 4 MB qabul qiladi.
 *  - mos tur va ≤ 4 MB → o'zgarmaydi;
 *  - aks holda canvas bilan uzun tomoni ≤ 2000 px qilib JPEG'ga (sifat 0.85 → 0.7 → 0.55) siqiladi;
 *  - brauzer suratni o'qiy olmasa (masalan HEIC'ni qo'llamasa) — tushunarli xato.
 * Yuk xatidagi mayda yozuvlar o'qilishi uchun 2000 px yetarli (Gemini vision tavsiyasi bo'yicha 1–3 MP).
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_DIM = 2000;
const QUALITIES = [0.85, 0.7, 0.55];

export interface PreparedImage {
  mime: string;
  bytes: Uint8Array;
  /** Siqildimi (foydalanuvchiga ko'rsatish uchun) */
  resized: boolean;
}

/** Brauzerga bog'liq qismlar (testda almashtiriladi) */
export interface ImageCodec {
  /** Suratni o'qish: o'lchami; o'qib bo'lmasa xato */
  decode: (file: Blob) => Promise<{ width: number; height: number; source: unknown }>;
  /** Berilgan o'lchamda JPEG ga kodlash */
  encodeJpeg: (source: unknown, width: number, height: number, quality: number) => Promise<Blob>;
}

export class ImagePrepError extends Error {}

export function fitWithin(width: number, height: number, max = MAX_DIM): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export async function prepareImage(file: Blob, codec: ImageCodec | null = browserCodec()): Promise<PreparedImage> {
  const okType = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  if (okType && file.size <= MAX_IMAGE_BYTES) {
    return { mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()), resized: false };
  }
  if (!codec) throw new ImagePrepError("Bu brauzer suratni siqa olmaydi. JPG yoki PNG, 4 MB gacha surat tanlang.");
  let decoded: Awaited<ReturnType<ImageCodec['decode']>>;
  try {
    decoded = await codec.decode(file);
  } catch {
    throw new ImagePrepError("Suratni o'qib bo'lmadi (format qo'llanmaydi). Kamerada JPG formatida suratga oling yoki skrinshot yuboring.");
  }
  const size = fitWithin(decoded.width, decoded.height);
  for (const q of QUALITIES) {
    const blob = await codec.encodeJpeg(decoded.source, size.width, size.height, q);
    if (blob.size <= MAX_IMAGE_BYTES) return { mime: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()), resized: true };
  }
  throw new ImagePrepError("Surat siqilgandan keyin ham juda katta. Yaqinroqdan, faqat yuk xatini suratga oling.");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Haqiqiy brauzer: createImageBitmap + canvas. Mavjud bo'lmasa null */
function browserCodec(): ImageCodec | null {
  if (typeof window === 'undefined' || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  return {
    decode: async (file) => {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bmp.width, height: bmp.height, source: bmp };
    },
    encodeJpeg: (source, width, height, quality) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality);
      }),
  };
}
