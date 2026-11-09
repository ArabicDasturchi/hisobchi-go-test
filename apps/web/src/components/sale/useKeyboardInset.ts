'use client';
import { useEffect, useState } from 'react';

/**
 * Ekran klaviaturasi ochilganda pastga yopishgan oyna klaviatura ostida qolmasligi uchun:
 * `visualViewport` balandligi farqidan (px). Klaviatura yo'q yoki API yo'q bo'lsa 0.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setInset(diff > 80 ? Math.round(diff) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
