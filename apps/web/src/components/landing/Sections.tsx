import { BookOpen, Calculator, CircleHelp, Package, Wallet } from 'lucide-react';
import Image from 'next/image';
import { Section } from './ui';

export function Problem() {
  const items = [
    { icon: Wallet, t: 'Kim qancha qarz?', d: "Daftar varaqlarini titkilab, kim sizga va siz kimga qarzdorligingizni qidirasiz." },
    { icon: Package, t: 'Foyda qancha, tovar qancha qoldi?', d: "Bugun qancha ishlaganingiz va javonda nima qolgani doim ham aniq bo'lmaydi." },
    { icon: Calculator, t: 'Bitta tugma adashsa — kamomad', d: "Kalkulyatorda qo'lda hisoblaganda xato chiqadi, oxirida pul yetmaydi." },
  ];
  return (
    <Section title="Daftar va ruchka bilan shunday bo'ladi" lead="Savdogarlar bilan suhbatlarimizda eng ko'p eshitilgan og'riqlar:">
      <ul className="grid gap-4 sm:grid-cols-3">
        {items.map(({ icon: I, t, d }) => (
          <li key={t} className="rounded-2xl border border-line bg-surface p-5">
            <I className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden />
            <h3 className="mt-3 text-base font-semibold text-fg">{t}</h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{d}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const CARDS = [
  { img: 'qarz', w: 760, h: 496, alt: "Mijozlar ro'yxati: har mijozning qarzi va umumiy qarz", t: 'Qarz', d: "Kim sizga qancha qarz, siz ta'minotchiga qancha qarzdorsiz — bir qarashda." },
  { img: 'foyda', w: 640, h: 427, alt: 'Bugungi savdo va foyda kartalari', t: 'Foyda', d: "Har savdodan foyda tan narx bilan hisoblanadi. Tan narxi noma'lum qatorlar alohida ko'rsatiladi." },
  { img: 'ombor', w: 760, h: 496, alt: 'Ombor jadvali: tovar, qoldiq, tan narx va sotuv narxi', t: 'Ombor', d: "Qoldiq kirim va savdodan o'zi chiqadi. Qo'lda sanash shart emas." },
];

export function Benefits() {
  return (
    <Section id="nima-beradi" title="Sizga nima beradi" tone="alt">
      <ul className="grid gap-5 md:grid-cols-3">
        {CARDS.map((c) => (
          <li key={c.t} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <Image src={`/landing/${c.img}.webp`} alt={c.alt} width={c.w} height={c.h} sizes="(min-width: 768px) 360px, 92vw" className="h-auto w-full border-b border-line" />
            <div className="p-5">
              <h3 className="text-lg font-semibold text-fg">{c.t}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{c.d}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const STEPS: [string, string][] = [
  ["Do'kon oching", "Ro'yxatdan o'tib, do'koningiz nomini yozasiz."],
  ["Tovar va ta'minotchini qo'shing", "Tovarlaringiz, narxlari va kimdan olishingizni kiritasiz."],
  ["Savdo va to'lovni yozing", "Hisob o'zi chiqadi: qarz, foyda va ombor qoldig'i yangilanadi."],
];

export function Steps() {
  return (
    <Section id="qanday-ishlaydi" title="Qanday ishlaydi">
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="rounded-2xl border border-line bg-surface p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-base font-bold text-white dark:bg-emerald-500 dark:text-emerald-950">
              {i + 1}
            </span>
            <h3 className="mt-3 text-base font-semibold text-fg">{t}</h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 rounded-2xl border border-emerald-600/30 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        <strong>Hisob ikki yo&apos;l bilan tekshiriladi.</strong> Summani dastur ikki alohida usulda hisoblaydi. Natija mos kelmasa,
        hech narsa saqlanmaydi va xato ko&apos;rsatiladi.
      </p>
    </Section>
  );
}

const COLS: [string, string][] = [
  ['Eski', 'oldingi qarz'],
  ['Tovar', 'bugungi tovar summasi'],
  ['Berildi', "to'langan pul"],
  ['Ostatka', 'hozirgi qarz'],
];

export function Sheet() {
  return (
    <Section id="daftar" title="Qog'oz daftarga o'xshaydi" lead="Siz o'rgangan ustunlar o'z joyida: har mijoz va ta'minotchi uchun alohida varaq.">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-slate-900/5">
        <Image
          src="/landing/varaq.webp"
          alt="Mijoz varag'i: sana, Eski, Tovar, Jami, Berildi va Ostatka ustunlari"
          width={1100}
          height={563}
          sizes="(min-width: 1152px) 1100px, 92vw"
          className="h-auto w-full"
        />
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COLS.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-line bg-surface p-3">
            <dt className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <BookOpen className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
              {t}
            </dt>
            <dd className="mt-1 text-xs text-slate-600 dark:text-slate-300">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Ostatka = Eski + Tovar − Berildi. Buni siz emas, dastur hisoblaydi.</p>
    </Section>
  );
}

export const FAQ_ITEMS: [string, string][] = [
  ["Ma'lumotim xavfsizmi?", "Ma'lumotingiz do'koningiz hisobida saqlanadi va uni faqat do'kon a'zolari ko'radi. Yozuvlar o'chirilmaydi: xato bo'lsa, teskari yozuv bilan tuzatiladi. Batafsil: «Maxfiylik» sahifasi."],
  ['Telefonda ishlaydimi?', "Ha. Telefon brauzerida ochasiz, alohida o'rnatish shart emas. Kompyuterda ham shunday ishlaydi. Alohida o'rnatiladigan ilova hozircha yo'q."],
  ["Daftarimni ko'chira olamanmi?", "Qog'oz daftarni o'zi avtomatik o'qiydigan imkoniyat hozircha yo'q. Eski qarzlarni mijoz va ta'minotchi varag'iga bir marta o'zingiz kiritasiz, keyin hisob o'zi yuritiladi."],
  ['Nima uchun kerak?', "Qarz, foyda va ombor bir joyda bo'ladi, hisobni kalkulyator o'rniga dastur qiladi. Shunda xato va kamomad kamayadi."],
  ['Hisobni dastur qilsa, xato qilmaydimi?', "Har summa ikki alohida usul bilan hisoblanadi va ikkalasi mos kelmasa saqlanmaydi. Siz tasdiqlamaguncha hech narsa yozilmaydi."],
  ['Narxi qancha?', "Narx haqida tez orada e'lon qilamiz."],
];

export function Faq() {
  return (
    <Section id="savollar" title="Ko'p beriladigan savollar" tone="alt">
      <div className="max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
        {FAQ_ITEMS.map(([q, a]) => (
          <details key={q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <CircleHelp className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {q}
              </span>
              <span aria-hidden className="text-xl text-slate-600 dark:text-slate-300 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
