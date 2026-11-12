'use client';
/**
 * Daftar/ombor/ta'minotchi ma'lumotlari (006/007). Alohida yuklanadi: bu migratsiyalar qo'llanmagan bo'lsa
 * faqat shu sahifalar xato ko'rsatadi, ilovaning qolgan qismi ishlayveradi.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadBooks, type BooksData } from '@/lib/data/books';
import { errorMessage } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import { useShop } from './ShopDataProvider';

export function useBooks() {
  const { shopId } = useShop();
  const [data, setData] = useState<BooksData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Oxirgi muvaffaqiyatli yuklash vaqti (ms): ikkinchi yo'l tekshiruvi shu bo'yicha yangilanadi */
  const [loadedAt, setLoadedAt] = useState(0);

  /** Javobni holatga yozish. Faqat promise callback'ida chaqiriladi (effect ichida sinxron setState yo'q) */
  const settle = useCallback((res: { ok: true; data: BooksData } | { ok: false; error: unknown }) => {
    if (res.ok) {
      setData(res.data);
      setLoadedAt(Date.now());
      setError(null);
    } else {
      setError(errorMessage(res.error));
    }
    setLoading(false);
  }, []);

  const fetchBooks = useCallback(
    () =>
      loadBooks(getSupabase(), shopId).then(
        (data) => ({ ok: true as const, data }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    [shopId],
  );

  /** Qo'lda yangilash (amal saqlangandan keyin): yuklanish belgisi yoqiladi */
  const reload = useCallback(async () => {
    setLoading(true);
    settle(await fetchBooks());
  }, [fetchBooks, settle]);

  // Birinchi yuklash (`loading` boshlang'ich holatda true). Komponent yopilsa yoki do'kon almashsa eskirgan javob yozilmaydi
  useEffect(() => {
    let active = true;
    void fetchBooks().then((res) => {
      if (active) settle(res);
    });
    return () => {
      active = false;
    };
  }, [fetchBooks, settle]);

  return { data, error, loading, reload, loadedAt };
}
