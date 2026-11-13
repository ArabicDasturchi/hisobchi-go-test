// @vitest-environment jsdom
/**
 * F2 savat sessiyasi: tarmoq javobi yo'qolsa qayta yuborish idempotent (o'sha op id, soxta to'qnashuv yo'q);
 * tasdiqlash paytida uchib turgan saqlash yangi savat holatini buzmaydi (poyga).
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBasketSession } from '@/components/panel/useBasketSession';
import { createLocalStore, type BasketStore, type SaveInput } from '@/lib/basketStore';
import type { StoredBasket } from '@/lib/basketStore';

const mem = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const ser = (ls: readonly string[]) => ls.map((x) => ({ x }));

function setup(store: BasketStore, lines: string[]) {
  let list: StoredBasket[] = [];
  // Panelda bo'lgani kabi barqaror funksiya (setState) — aks holda flush har renderda qayta yaratiladi
  const onListChange = (f: (l: StoredBasket[]) => StoredBasket[]) => {
    list = f(list);
  };
  const hook = renderHook((p: { lines: string[] }) => useBasketSession({ store, kind: 'sale', active: true, lines: p.lines, partnerId: null, serialize: ser, onListChange }), { initialProps: { lines } });
  return { hook, list: () => list };
}

describe('useBasketSession', () => {
  it('javob yo‘qolsa: qayta yuborish o‘sha op id bilan, server takrorni taniydi — to‘qnashuv yo‘q', async () => {
    const inner = createLocalStore(mem(), 'shop');
    const ops: string[] = [];
    let drop = true;
    const store: BasketStore = {
      ...inner,
      save: async (b: SaveInput) => {
        ops.push(b.clientOpId);
        const r = await inner.save(b); // server yozdi...
        if (drop) {
          drop = false;
          throw new Error('Failed to fetch'); // ...lekin javob yo'qoldi
        }
        return r;
      },
    };
    const { hook } = setup(store, ['a']);
    await act(async () => hook.result.current.flush());
    expect(hook.result.current.error).toBeTruthy();
    await act(async () => hook.result.current.flush());
    expect(ops).toHaveLength(2);
    expect(ops[0]).toBe(ops[1]);
    expect(hook.result.current.conflict).toBeNull();
    expect(hook.result.current.saved).toBe(true);
    // Keyingi o'zgarish yangi op id bilan va to'g'ri versiya ustidan
    hook.rerender({ lines: ['a', 'b'] });
    await act(async () => hook.result.current.flush());
    expect(ops[2]).not.toBe(ops[0]);
    expect(hook.result.current.conflict).toBeNull();
    expect((await inner.list())[0]!.version).toBe(2);
  });

  it('tasdiqlash paytida uchib turgan saqlash yangi savatga eski versiyani yozmaydi', async () => {
    const inner = createLocalStore(mem(), 'shop');
    let release: () => void = () => {};
    let slow = false;
    const store: BasketStore = {
      ...inner,
      save: async (b) => {
        // Server yozdi, lekin javob kechikdi
        const r = await inner.save(b);
        if (slow) await new Promise<void>((res) => (release = res));
        return r;
      },
    };
    const { hook } = setup(store, ['a']);
    await act(async () => hook.result.current.flush());
    const firstId = hook.result.current.currentId;
    slow = true;
    hook.rerender({ lines: ['a', 'b'] });
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.flush();
    });
    let finished!: Promise<string | null>;
    act(() => {
      finished = hook.result.current.finish('doc-1');
    });
    await act(async () => {
      // Sekin saqlash serverga yozib, javobni kutib turgan holatga yetsin
      await new Promise((r) => setTimeout(r, 10));
      release();
      await pending;
      await finished;
    });
    expect(hook.result.current.currentId).not.toBe(firstId);
    expect(hook.result.current.saved).toBe(false);
    // Yangi savatning birinchi saqlashi muvaffaqiyatli (basket_not_found emas)
    slow = false;
    hook.rerender({ lines: ['c'] });
    await act(async () => hook.result.current.flush());
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.saved).toBe(true);
  });
});
