'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatCompactSom, formatSom } from '@/lib/money';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/** Grafik nuqtasi: `label` (x o'qi) va har seriya uchun son (so'm) */
export type ChartDatum = { label: string } & Record<string, number | string>;

const DEFAULT_SERIES: readonly ChartSeries[] = [
  { key: 'sales', label: 'Savdo', color: 'var(--series-1)' },
  { key: 'payments', label: "To'lovlar", color: 'var(--series-2)' },
];

/** "400 ming" qatorga bo'linib ketmasin: son va birlik orasida buzilmaydigan bo'shliq */
const axisLabel = (v: number) => formatCompactSom(v).replace(' ', ' ');

function makeTooltip(SERIES: readonly ChartSeries[]) {
  return function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-fg">{label}</p>
      {SERIES.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        const v = typeof item?.value === 'number' ? item.value : 0;
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}: <span className="tabular font-medium text-fg">{formatSom(BigInt(Math.round(v)))}</span>
          </p>
        );
      })}
    </div>
  );
  };
}

/** Kunlik dinamika — bitta o'q (hammasi so'm), legenda + hover tooltip. Standart: savdo va to'lovlar */
export function TrendChart({ data, height = 260, series = DEFAULT_SERIES }: { data: readonly { label: string }[]; height?: number; series?: readonly ChartSeries[] }) {
  const SERIES = series;
  const ChartTooltip = makeTooltip(SERIES);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ height }} role="img" aria-label="Kunlik savdo va to'lovlar grafigi">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data as unknown as ChartDatum[]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={32} interval="preserveStartEnd" tickMargin={6} />
            <YAxis tickLine={false} axisLine={false} width={68} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={axisLabel} allowDecimals={false} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
