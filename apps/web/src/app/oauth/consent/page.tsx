'use client';
import { Check, ShieldCheck, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Logo } from '@/components/Logo';
import { Alert, Button, Card, FullPageSpinner } from '@/components/ui/primitives';
import { CONSENT_COPY, parseAuthorizationId, redirectHost, safeClientRedirect } from '@/lib/oauthConsent';
import { getSupabase } from '@/lib/supabase/client';

type Details = { authorization_id: string; redirect_uri: string; client: { name: string; uri?: string }; user: { email: string } };
type State =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }
  | { status: 'consent'; details: Details }
  | { status: 'redirecting' };

function ConsentView() {
  const params = useSearchParams();
  const { user } = useAuth();
  const authorizationId = parseAuthorizationId(params.get('authorization_id'));
  const [state, setState] = useState<State>({ status: authorizationId ? 'loading' : 'invalid' });
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);

  function leave(url: string | null | undefined) {
    const safe = safeClientRedirect(url);
    if (!safe) {
      setState({ status: 'error', message: "Qaytish manzili xavfsiz emas. Ruxsat berilmadi, ilovaga qayting va qaytadan urining." });
      return;
    }
    setState({ status: 'redirecting' });
    window.location.assign(safe);
  }

  useEffect(() => {
    if (!authorizationId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabase().auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error || !data) {
        setState({ status: 'error', message: "So'rov topilmadi yoki muddati o'tgan. Ilovaga qaytib, ulanishni qaytadan boshlang." });
      } else if ('authorization_id' in data) {
        setState({ status: 'consent', details: data as Details });
      } else {
        // Oldin ruxsat berilgan: to'g'ridan-to'g'ri klientga qaytariladi
        leave(data.redirect_url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(kind: 'approve' | 'deny') {
    if (!authorizationId || busy) return;
    setBusy(kind);
    const oauth = getSupabase().auth.oauth;
    const { data, error } =
      kind === 'approve'
        ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) {
      setBusy(null);
      setState({ status: 'error', message: "Amalni bajarib bo'lmadi. Qaytadan urining." });
      return;
    }
    leave(data.redirect_url);
  }

  if (state.status === 'loading' || state.status === 'redirecting') {
    return <FullPageSpinner label={state.status === 'redirecting' ? 'Ilovaga qaytilmoqda…' : 'Yuklanmoqda…'} />;
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <Logo />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        {state.status === 'invalid' && <Alert tone="red" title="So'rov noto'g'ri">Bu sahifa faqat tashqi ilovadan ulanish paytida ochiladi.</Alert>}
        {state.status === 'error' && <Alert tone="red">{state.message}</Alert>}
        {state.status === 'consent' && (
          <Card className="p-5 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-[20px] font-semibold tracking-tight text-fg">Tashqi ilovaga ruxsat</h1>
            <p className="mt-1.5 text-sm text-muted">
              <b className="text-fg">{state.details.client.name}</b> sizning Hisobchi Go hisobingizga ulanmoqchi
              {redirectHost(state.details.redirect_uri) && <> (qaytish manzili: <b className="text-fg">{redirectHost(state.details.redirect_uri)}</b>)</>}.
              Tanimasangiz yoki o&apos;zingiz boshlamagan bo&apos;lsangiz, rad eting.
            </p>

            <h2 className="mt-4 text-sm font-semibold text-fg">U qila oladi</h2>
            <ul className="mt-1.5 space-y-1.5 text-sm text-muted">
              {CONSENT_COPY.can.map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{t}</li>
              ))}
            </ul>
            <h2 className="mt-4 text-sm font-semibold text-fg">U qila olmaydi</h2>
            <ul className="mt-1.5 space-y-1.5 text-sm text-muted">
              {CONSENT_COPY.cannot.map((t) => (
                <li key={t} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />{t}</li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <Button size="lg" className="w-full" loading={busy === 'approve'} disabled={busy !== null} onClick={() => void decide('approve')}>
                Ruxsat berish
              </Button>
              <Button size="lg" variant="secondary" className="w-full" loading={busy === 'deny'} disabled={busy !== null} onClick={() => void decide('deny')}>
                Rad etish
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-muted">Hisob: {state.details.user.email || user?.email}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ConsentView />
    </Suspense>
  );
}
