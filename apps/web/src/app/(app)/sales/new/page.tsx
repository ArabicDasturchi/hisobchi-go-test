import { redirect } from 'next/navigation';

/**
 * Eski "Yangi savdo" sahifasi: savdo yozish endi Bosh sahifadagi yagona kiritish oynasida.
 * `?customer=` saqlanadi (mijoz sahifasidagi "Savdo" tugmalari ishlashda qoladi).
 */
export default async function NewSaleRedirect({ searchParams }: { searchParams: Promise<{ customer?: string | string[] }> }) {
  const { customer } = await searchParams;
  const id = Array.isArray(customer) ? customer[0] : customer;
  redirect(id ? `/dashboard?customer=${encodeURIComponent(id)}` : '/dashboard');
}
