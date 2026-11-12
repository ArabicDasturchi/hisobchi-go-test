// @vitest-environment jsdom
/**
 * useBooks (W16): effect ichida sinxron setState yo'q, lekin xatti-harakat avvalgidek:
 * birinchi yuklash, xato, qo'lda yangilash va eskirgan javobni yozmaslik.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BooksData } from '@/lib/data/books';

const shop = { shopId: 'shop-1' };
const loadBooks = vi.fn<(sb: unknown, shopId: string) => Promise<BooksData>>();

vi.mock('@/components/ShopDataProvider', () => ({ useShop: () => shop }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/data/books', () => ({ loadBooks: (sb: unknown, shopId: string) => loadBooks(sb, shopId) }));

const { useBooks } = await import('@/components/useBooks');

const books = (tag: string): BooksData => ({ suppliers: [{ id: tag, name: tag, phone: null, notes: null, is_active: true, created_at: '2026-11-11T00:00:00Z' }], purchases: [], lines: [], payments: [], stock: [] });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  shop.shopId = 'shop-1';
  loadBooks.mockReset();
});
afterEach(cleanup);

describe('useBooks', () => {
  it('birinchi yuklash: loading true → ma’lumot, loadedAt yangilanadi', async () => {
    loadBooks.mockResolvedValue(books('a'));
    const { result } = renderHook(() => useBooks());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.suppliers[0]?.id).toBe('a');
    expect(result.current.error).toBeNull();
    expect(result.current.loadedAt).toBeGreaterThan(0);
    expect(loadBooks).toHaveBeenCalledWith({}, 'shop-1');
  });

  it('xato: matn ko‘rsatiladi, ma’lumot yo‘q, loading tugaydi', async () => {
    loadBooks.mockRejectedValue(new Error('tarmoq yo‘q'));
    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(result.current.loadedAt).toBe(0);
  });

  it('reload: loading qayta yoqiladi va yangi ma’lumot olinadi; xatodan keyin xato tozalanadi', async () => {
    loadBooks.mockRejectedValueOnce(new Error('birinchi xato'));
    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.error).toBeTruthy());

    const d = deferred<BooksData>();
    loadBooks.mockReturnValueOnce(d.promise);
    let p!: Promise<void>;
    act(() => {
      p = result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      d.resolve(books('b'));
      await p;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.suppliers[0]?.id).toBe('b');
  });

  it('do‘kon almashsa eski (kech kelgan) javob yangisining ustiga yozilmaydi', async () => {
    const first = deferred<BooksData>();
    const second = deferred<BooksData>();
    loadBooks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(() => useBooks());

    shop.shopId = 'shop-2';
    rerender();
    await act(async () => {
      second.resolve(books('yangi'));
      await second.promise;
    });
    await act(async () => {
      first.resolve(books('eski'));
      await first.promise;
    });
    expect(loadBooks).toHaveBeenLastCalledWith({}, 'shop-2');
    expect(result.current.data?.suppliers[0]?.id).toBe('yangi');
  });
});
