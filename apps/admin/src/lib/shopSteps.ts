import { STEP_LABELS } from './stage';
import type { AdminShopDetail, Stage, StepKey } from './types';

export type StepState = 'done' | 'skipped' | 'next' | 'todo';

export interface StepView {
  key: StepKey;
  label: string;
  at: string | null;
  state: StepState;
}

/** Bosqichdan keyingi qadam (do'kon shu qadamda "to'xtagan"); 5-bosqichdan keyin qadam yo'q (faollik 6-bosqich) */
const NEXT_AFTER: Record<Stage, StepKey | null> = { 1: 'product', 2: 'supplier', 3: 'purchase', 4: 'sale', 5: null, 6: null };

/**
 * Do'kon sahifasidagi qadamlar: bajarilgan (sana bilan), o'tkazib yuborilgan (keyingi qadam bajarilgan, bu yo'q;
 * masalan ta'minotchisiz sotgan do'kon), keyingi (shu yerda to'xtagan), hali kelmagan.
 * Bosqich va sanalar SQL'dan keladi; bu yerda faqat ko'rinish.
 */
export function describeSteps(detail: Pick<AdminShopDetail, 'steps' | 'stage'>): StepView[] {
  const next = NEXT_AFTER[detail.stage];
  const order = detail.steps.map((s) => s.key);
  return detail.steps.map((s) => {
    let state: StepState;
    if (s.at) state = 'done';
    else if (s.key === next) state = 'next';
    else if (order.slice(order.indexOf(s.key) + 1).some((k) => detail.steps.find((x) => x.key === k)?.at)) state = 'skipped';
    else state = 'todo';
    return { key: s.key, label: STEP_LABELS[s.key], at: s.at, state };
  });
}

/** Do'kon qaysi qadamda to'xtaganini aytuvchi qisqa matn (jadval va sahifa uchun) */
export function stoppedAt(stage: Stage): string | null {
  const key = NEXT_AFTER[stage];
  if (key) return `Keyingi qadam: ${STEP_LABELS[key].toLowerCase()}`;
  if (stage === 5) return "Faol bo'lishi uchun: 7 kunda 5+ savdo";
  return null;
}
