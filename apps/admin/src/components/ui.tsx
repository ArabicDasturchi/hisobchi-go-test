'use client';
import type { ReactNode } from 'react';

/** Kichik umumiy komponentlar (apps/web dan alohida: admin panel o'zining minimal to'plamiga ega, QARORLAR.md) */

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60';
  const style = variant === 'primary' ? 'bg-accent text-white hover:opacity-90' : 'border border-line bg-surface text-fg hover:bg-subtle';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  const tones = {
    ok: 'bg-ok-bg text-ok-fg',
    warn: 'bg-warn-bg text-warn-fg',
    bad: 'bg-bad-bg text-bad-fg',
    neutral: 'bg-subtle text-muted',
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Yuklanish holati: skeleton bloklar */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Yuklanmoqda" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-subtle" />
      ))}
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  );
}

/** Xato holati: "Qayta urinish" */
export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-fg">{message}</p>
      <div className="mt-4 flex justify-center">
        <Button onClick={onRetry}>Qayta urinish</Button>
      </div>
    </div>
  );
}

/** Bo'sh holat */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4 sm:mb-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}
