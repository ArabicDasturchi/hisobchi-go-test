'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { signOut } from '@/components/Shell';

/** Kirgan, lekin `platform_admins` ro'yxatida yo'q foydalanuvchi. Hech qanday ma'lumot ko'rsatilmaydi. */
export default function ForbiddenPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Ruxsat yo&apos;q</h1>
      <p className="mt-2 text-sm text-muted">Bu hisob admin panelga kirish huquqiga ega emas. Boshqa hisob bilan kiring.</p>
      <div className="mt-6 flex justify-center">
        <Button onClick={onSignOut} disabled={busy}>
          Chiqish
        </Button>
      </div>
    </main>
  );
}
