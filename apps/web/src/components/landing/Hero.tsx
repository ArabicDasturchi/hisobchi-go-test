import Image from 'next/image';
import { CtaPrimary, CtaSecondary } from './ui';

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
      <div className="animate-fade-in">
        <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-fg sm:text-5xl">
          Daftaringizni telefonga ko&apos;chiring: qarz, foyda va ombor o&apos;zi hisoblanadi.
        </h1>
        <p className="mt-4 max-w-xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
          Savdo va to&apos;lovni yozasiz, hisobni dastur qiladi. Siz tasdiqlamaguncha hech narsa saqlanmaydi.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <CtaPrimary>Boshlash</CtaPrimary>
          <CtaSecondary href="/login">Kirish</CtaSecondary>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-md pb-2 sm:pb-10 lg:max-w-none">
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-slate-900/10 sm:block">
          <Image
            src="/landing/hero-kompyuter.webp"
            alt="Hisobchi Go bosh sahifasi kompyuterda: bugungi savdo, foyda, kassa va qarzlar"
            width={1200}
            height={703}
            sizes="(min-width: 1024px) 560px, 90vw"
            className="h-auto w-full"
          />
        </div>
        <div className="mx-auto w-64 overflow-hidden rounded-[1.75rem] border-4 border-slate-800 bg-surface shadow-xl shadow-slate-900/20 sm:absolute sm:-bottom-2 sm:-left-4 sm:w-40 lg:w-44 dark:border-slate-600">
          <Image
            src="/landing/hero-telefon.webp"
            alt="Hisobchi Go bosh sahifasi telefonda: Yangi savdo tugmasi va bugungi ko'rsatkichlar"
            width={520}
            height={1000}
            priority
            sizes="(min-width: 640px) 176px, 256px"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
