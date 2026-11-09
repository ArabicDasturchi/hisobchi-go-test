'use client';

export interface BarPoint {
  label: string;
  value: number;
}

/**
 * Oddiy ustunli grafik (SVG, kutubxonasiz). Qiymatlar SQL'dan keladi, bu yerda faqat chiziladi.
 * Ekran o'quvchi uchun umumiy tavsif va har ustunda <title>.
 */
export function BarChart({ points, color, unit, height = 140 }: { points: BarPoint[]; color: string; unit: string; height?: number }) {
  const W = 560;
  const padTop = 18;
  const padBottom = 22;
  const n = Math.max(points.length, 1);
  const max = Math.max(1, ...points.map((p) => p.value));
  const slot = W / n;
  const bw = Math.min(slot * 0.62, 28);
  const innerH = height - padTop - padBottom;
  const total = points.reduce((a, p) => a + p.value, 0);
  const labelEvery = n > 10 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Kunma-kun ${unit}: jami ${total}`} className="h-auto w-full">
      <line x1="0" x2={W} y1={height - padBottom} y2={height - padBottom} stroke="var(--border)" />
      {points.map((p, i) => {
        const h = p.value === 0 ? 0 : Math.max(3, (p.value / max) * innerH);
        const x = i * slot + (slot - bw) / 2;
        const y = height - padBottom - h;
        return (
          <g key={`${p.label}-${i}`}>
            <title>{`${p.label}: ${p.value} ${unit}`}</title>
            {p.value === 0 ? (
              <rect x={x} y={height - padBottom - 2} width={bw} height={2} rx={1} fill="var(--border)" />
            ) : (
              <rect x={x} y={y} width={bw} height={h} rx={4} fill={color} />
            )}
            {p.value > 0 && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="11" fill="var(--foreground)" fontWeight="600">
                {p.value}
              </text>
            )}
            {(n - 1 - i) % labelEvery === 0 && (
              <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
