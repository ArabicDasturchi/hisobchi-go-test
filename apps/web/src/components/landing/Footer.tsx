import { Phone, Send } from 'lucide-react';
import Link from 'next/link';
import { contactLinks, type ContactLinks } from '@/lib/contact';
import { Brand } from './Brand';

const OUTLINE =
  'inline-flex h-12 items-center gap-2 rounded-xl border border-white/60 px-6 text-base font-semibold text-white hover:bg-white/10';

export function FinalCta({ contact = contactLinks() }: { contact?: ContactLinks }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="rounded-3xl bg-emerald-700 p-8 text-center text-white sm:p-12 dark:bg-emerald-900">
        <h2 className="text-2xl font-bold sm:text-3xl">Daftaringizni telefonga ko&apos;chiring</h2>
        <p className="mx-auto mt-3 max-w-xl text-emerald-50">
          Do&apos;kon oching, savdo va to&apos;lovni yozing: qarz, foyda va ombor o&apos;zi hisoblanadi.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-7 text-base font-semibold text-emerald-800 hover:bg-emerald-50">
            Boshlash
          </Link>
          {contact.telegram && (
            <a href={contact.telegram} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
              <Send className="h-4 w-4" aria-hidden />
              Telegramda yozing
            </a>
          )}
          {contact.phone && (
            <a href={contact.phone} className={OUTLINE}>
              <Phone className="h-4 w-4" aria-hidden />
              Qo&apos;ng&apos;iroq qiling
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function Footer({ contact = contactLinks() }: { contact?: ContactLinks }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Brand />
          <p>«Unikorumlar» jamoasi</p>
        </div>
        <nav aria-label="Pastki" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/maxfiylik" className="hover:text-fg">Maxfiylik</Link>
          <Link href="/login" className="hover:text-fg">Kirish</Link>
          <Link href="/register" className="hover:text-fg">Boshlash</Link>
          {contact.telegram && (
            <a href={contact.telegram} target="_blank" rel="noopener noreferrer" className="hover:text-fg">Telegram</a>
          )}
          {contact.phone && <a href={contact.phone} className="hover:text-fg">Telefon</a>}
        </nav>
      </div>
    </footer>
  );
}
