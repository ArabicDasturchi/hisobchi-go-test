import { STAGE_LABELS, STAGE_SHORT } from '@/lib/stage';
import type { Stage } from '@/lib/types';
import { Badge } from './ui';

export function StageBadge({ stage, short = false }: { stage: Stage; short?: boolean }) {
  const tone = stage === 6 ? 'ok' : 'neutral';
  return (
    <span title={STAGE_LABELS[stage]}>
      <Badge tone={tone}>
        {stage}/6 · {short ? STAGE_SHORT[stage] : STAGE_LABELS[stage]}
      </Badge>
    </span>
  );
}

/** 7+ kun faolsiz do'konlar sariq belgi bilan */
export function StaleBadge({ stale }: { stale: boolean }) {
  return stale ? <Badge tone="warn">7+ kun faolsiz</Badge> : null;
}
