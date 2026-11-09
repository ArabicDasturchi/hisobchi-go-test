/**
 * Qidiruv uchun yozuvni bir shaklga keltirish (hisob emas, shuning uchun core emas).
 * O'zbek va rus Kirill harflari Lotinga o'giriladi, keyin core `normalizeProductName` (kichik harf, apostrof turlari, bo'shliq).
 * `normalizeProductName` o'zgarmaydi: u tovar nomining kanonik shakli, bu esa faqat qidiruv kaliti.
 */
import { normalizeProductName } from '@hisobchi/core';

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // o'zbek Kirilli
  ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h',
};

/** Kirill harflarni Lotinga o'giradi; boshqa belgilar o'zgarmaydi. "қуръон" → "qur'on", "жой" → "joy" */
export function cyrillicToLatin(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) out += MAP[ch] ?? ch;
  return out;
}

/** Qidiruv kaliti: Kirill → Lotin, keyin kanonik normalizatsiya */
export function searchKey(input: string): string {
  return normalizeProductName(cyrillicToLatin(input));
}

/** Apostrofsiz shakl: "qur'on" va "quron" bir xil (imlo xatosiga bardosh) */
export function looseKey(input: string): string {
  return searchKey(input).replace(/'/g, '');
}
