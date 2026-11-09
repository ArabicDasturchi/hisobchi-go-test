import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import Link from 'next/link';
import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';

export const metadata: Metadata = {
  title: 'Maxfiylik',
  description: "Hisobchi Go nimani saqlaydi va ma'lumotni kimga ko'rsatmaydi.",
  ...(SITE_URL ? { alternates: { canonical: '/maxfiylik' } } : {}),
};

export default function Maxfiylik() {
  return (
    <div>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-fg">Maxfiylik</h1>
        <p role="note" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Bu qisqa tushuntirish, yuridik maslahat emas. Matnni asoschilar hali tasdiqlamagan.
        </p>
        <h2 className="mt-8 text-xl font-semibold text-fg">Nimani saqlaymiz</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
          <li>Kirish uchun email manzilingiz.</li>
          <li>Do&apos;koningiz nomi, tovarlar, mijoz va ta&apos;minotchilar ro&apos;yxati.</li>
          <li>Savdo, kirim va to&apos;lov yozuvlari hamda ulardan chiqqan qarz, foyda va qoldiq.</li>
        </ul>
        <h2 className="mt-8 text-xl font-semibold text-fg">Kimga ko&apos;rsatmaymiz</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
          <li>Do&apos;koningiz ma&apos;lumotini faqat do&apos;kon a&apos;zolari ko&apos;radi.</li>
          <li>Sahifada kuzatuv (analitika) skriptlari yo&apos;q.</li>
        </ul>
        <h2 className="mt-8 text-xl font-semibold text-fg">Yozuvlar qanday saqlanadi</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Jurnal faqat qo&apos;shiladi: yozuv o&apos;chirilmaydi, xato bo&apos;lsa teskari yozuv bilan tuzatiladi. Siz tasdiqlamaguncha
          hech narsa saqlanmaydi.
        </p>
        <p className="mt-8">
          <Link href="/" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            ← Bosh sahifaga
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
