import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import { LandingPage } from '@/components/landing/LandingPage';
import { FAQ_ITEMS } from '@/components/landing/Sections';

const TITLE = "Hisobchi Go — qarz, foyda va ombor o'zi hisoblanadi";
const DESC =
  "Savdogar daftarini telefonga ko'chiring: qarz, foyda va ombor qoldig'i savdo va to'lovdan o'zi hisoblanadi. Hisob ikki yo'l bilan tekshiriladi.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  ...(SITE_URL ? { alternates: { canonical: '/' } } : {}),
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESC, type: 'website', locale: 'uz_UZ', siteName: 'Hisobchi Go' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

// Kirgan foydalanuvchi proxy.ts da /dashboard ga yo'naltiriladi; bu sahifa faqat kirmaganlarga
export default function Home() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <LandingPage />
    </>
  );
}
