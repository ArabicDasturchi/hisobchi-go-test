'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { DEMO_MODE, supabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/client';

/** Faqat email + parol. Ro'yxatdan o'tish yo'q: admin bo'lish uchun asoschi foydalanuvchini `platform_admins` ga qo'shadi. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (DEMO_MODE) {
      router.replace('/overview');
      return;
    }
    if (!email.trim() || !password) {
      setError('Email va parolni kiriting');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(err.status === 400 || /invalid login/i.test(err.message) ? "Email yoki parol noto'g'ri" : "Kirib bo'lmadi. Qayta urinib ko'ring.");
        setBusy(false);
        return;
      }
      router.replace('/overview');
      router.refresh();
    } catch {
      setError("Internet bilan aloqa yo'q. Qayta urinib ko'ring.");
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Hisobchi Go · Admin</h1>
      <p className="mt-1 text-sm text-muted">Faqat platforma egalari uchun.</p>
      {!supabaseConfigured && (
        <p role="alert" className="mt-4 rounded-xl bg-warn-bg p-3 text-sm text-warn-fg">
          Supabase sozlanmagan: <code>.env.local</code> da <code>NEXT_PUBLIC_SUPABASE_URL</code> va <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> kerak (yoki <code>npm run demo:admin</code>).
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <label className="block text-sm font-medium">
          Email
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">
          Parol
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad-fg">
            {error}
          </p>
        )}
        <div className="flex">
          <Button type="submit" disabled={busy}>
            {busy ? 'Kirilmoqda…' : DEMO_MODE ? 'Demo’ga kirish' : 'Kirish'}
          </Button>
        </div>
      </form>
    </main>
  );
}
