'use client';
import { AlertTriangle, Inbox, Loader2, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400',
  secondary: 'bg-subtle text-fg hover:bg-line/70',
  outline: 'border border-line bg-surface text-fg hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-fg',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Form maydonlari
// ---------------------------------------------------------------------------

const fieldBase =
  'w-full rounded-lg border bg-surface px-3 text-[13px] text-fg placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-[3px] disabled:opacity-60';
const fieldOk = 'border-line focus:border-emerald-500 focus:ring-emerald-500/15';
const fieldErr = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15';

interface FieldWrapProps {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldWrap({ label, error, hint, required, id, children, className }: FieldWrapProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends ComponentProps<'input'> {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  wrapClassName?: string;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, wrapClassName, className, id, required, suffix, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} id={fid} className={wrapClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={fid}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={cn(fieldBase, 'h-9', error ? fieldErr : fieldOk, suffix ? 'pr-12' : undefined, className)}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{suffix}</span>}
      </div>
    </FieldWrap>
  );
});

interface TextareaProps extends ComponentProps<'textarea'> {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  wrapClassName?: string;
}

export function Textarea({ label, error, hint, wrapClassName, className, id, required, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} id={fid} className={wrapClassName}>
      <textarea
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'min-h-16 py-2', error ? fieldErr : fieldOk, className)}
        {...rest}
      />
    </FieldWrap>
  );
}

interface SelectProps extends ComponentProps<'select'> {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  wrapClassName?: string;
}

export function Select({ label, error, hint, wrapClassName, className, id, required, children, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} id={fid} className={wrapClassName}>
      <select
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'h-9 appearance-none bg-[length:14px] bg-[right_0.625rem_center] bg-no-repeat pr-8', error ? fieldErr : fieldOk, className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Qidirish'}
        className={cn(fieldBase, fieldOk, 'h-9 pl-8 pr-8')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-subtle hover:text-fg"
          aria-label="Qidiruvni tozalash"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Tugmalar guruhi (segmented control) */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex max-w-full overflow-x-auto rounded-lg bg-subtle p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-disabled={o.disabled || undefined}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            o.disabled && 'cursor-not-allowed opacity-40 hover:text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Konteynerlar va holatlar
// ---------------------------------------------------------------------------

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('print-plain rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.03)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5', className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="no-print min-w-0 max-w-full">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'green' | 'blue' | 'red' | 'amber';
const TONES: Record<Tone, string> = {
  neutral: 'bg-subtle text-muted',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-medium ring-1 ring-inset ring-transparent', TONES[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-subtle', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-9 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-9 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-fg">Ma&apos;lumotni yuklab bo&apos;lmadi</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'red', title, children, className }: { tone?: 'red' | 'amber' | 'blue' | 'green'; title?: string; children?: ReactNode; className?: string }) {
  const tones = {
    red: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    blue: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  };
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cn('rounded-lg border px-3 py-2.5 text-[13px]', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-tight text-fg sm:text-[22px]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  // Nomdan barqaror rang
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = [
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
  ];
  return (
    <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', palette[h % palette.length], className)} aria-hidden>
      {initials}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-emerald-600', className)} aria-label="Yuklanmoqda" />;
}

export function FullPageSpinner({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-muted" role="status">
      <Spinner className="h-6 w-6" />
      {label}
    </div>
  );
}
