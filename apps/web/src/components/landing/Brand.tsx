// Landing uchun server-komponent logotip: Logo.tsx klient moduliga (cn, useId) tayanadi, bu yerda esa yo'q
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="landing-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#landing-logo)" />
        <path d="M18 42V22m0 10h14m0-10v20" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M40 36l5 5 9-12" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="text-base font-semibold tracking-tight text-fg">
        Hisobchi<span className="text-emerald-700 dark:text-emerald-400"> Go</span>
      </span>
    </span>
  );
}
