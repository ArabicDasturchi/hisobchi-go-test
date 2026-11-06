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

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadBooks(getSupabase(), shopId));
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, loadedAt };
}
