import { DEMO_MODE } from '@/lib/env';

/** Demo rejimida (npm run demo) har sahifada ko'rinadi: ma'lumot soxta, yozish o'chirilgan */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4"
    >
      <p className="pointer-events-auto rounded-full border border-amber-300 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 shadow dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-100">
        DEMO: soxta ma&apos;lumot, veb panel faqat ko&apos;rsatadi (yozish o&apos;chirilgan)
      </p>
    </div>
  );
}
