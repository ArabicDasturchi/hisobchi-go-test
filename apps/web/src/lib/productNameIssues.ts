/**
 * Tovar nomidagi gumon: narx nomga yozilgan ("Атиргул 7 500"). Faqat ANIQLAYDI, nomni o'zgartirmaydi
 * (nomlarni avtomatik tozalash doirada emas): ro'yxat `docs/MAHSULOT-XATOLARI.md` ga yoziladi, savdogar o'zi tuzatadi.
 * Qoida: nom oxirida kamida 4 xonali, ming ajratuvchili ("7 500", "59 000", "13000") son.
 */
export function priceInName(name: string): boolean {
  return /(?:^|\s)(?:\d{1,3}(?: \d{3})+|\d{4,})\s*$/.test(name.trim());
}

export function productsWithPriceInName<T extends { name: string }>(products: readonly T[]): T[] {
  return products.filter((p) => priceInName(p.name));
}
