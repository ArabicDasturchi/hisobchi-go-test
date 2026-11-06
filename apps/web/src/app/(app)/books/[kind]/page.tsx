import { redirect } from 'next/navigation';

/**
 * Eski Kirim daftari (/books/in) va Chiqim daftari (/books/out) — endi Ombor ichidagi tablar.
 * Eski havolalar 404 bermaydi: yangi joyga yo'naltiriladi.
 */
export default async function LegacyBookPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  redirect(kind === 'out' ? '/warehouse?tab=out' : '/warehouse?tab=in');
}
