// @vitest-environment jsdom
/**
 * Savdolar sahifasi, 013 yo'q server (tanqidchi topilmasi): to'langan savdoni bekor qilishda birinchi urinish
 * `RpcMissingError` beradi. Keyin «to'lovni ham bekor qilish» belgisi QULFDAN CHIQISHI va OLIB TASHLANISHI kerak,
 * aks holda savdogar sahifani yangilamaguncha savdoni bekor qila olmaydi. Ikkinchi urinish to'lovsiz `reverse_sale`.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcMissingError } from '@/lib/errors';
import type { Payment, SaleDoc } from '@/lib/data/types';

const SALE: SaleDoc = { id: 'aaaaaaaa-0000-0000-0000-000000000001', customer_id: 'c1', status: 'posted', subtotal: 100_000n, created_at: '2026-11-11T10:00:00Z', posted_at: '2026-11-11T10:00:00Z', created_by: 'u', client_op_id: 'op-1' };
const PAY: Payment = { id: 'p1', customer_id: 'c1', amount: 100_000n, method: 'naqd', note: null, created_by: 'u', created_at: '2026-11-11T10:00:00Z', void: null, client_op_id: 'sale-pay:op-1' };

const api = vi.hoisted(() => ({ reverseSale: vi.fn() }));
vi.mock('@/lib/data/api', async (orig) => ({ ...(await orig<typeof import('@/lib/data/api')>()), reverseSale: api.reverseSale }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/sales' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/ShopDataProvider', () => ({
  useShop: () => ({
    shopId: 'shop',
    reload: async () => {},
    loading: false,
    error: null,
    customerById: new Map([['c1', { id: 'c1', name: 'Ali', kind: 'regular' }]]),
    data: { sales: [SALE], payments: [PAY], walkin: null, customers: [{ id: 'c1', name: 'Ali' }], products: [], reversals: [], drafts: [], draftsError: null, saleLines: [], stock: null },
  }),
}));

afterEach(cleanup);

describe('Savdolar: 013 yo‘q serverda to‘lovli bekor qilish', async () => {
  const { default: SalesPage } = await import('@/app/(app)/sales/page');

  it('1-urinish xato → belgi ochiladi va olinadi → 2-urinish to‘lovsiz reverse_sale', async () => {
    api.reverseSale.mockRejectedValueOnce(new RpcMissingError('reverse_sale_with_payments', 'serverda hali yoqilmagan, belgisi olib tashlandi')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<SalesPage />);

    await user.click(await screen.findByRole('button', { name: /bekor qilish$/i }));
    const box = within('refund-choice').getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);

    await user.click(screen.getByRole('button', { name: /Bekor qilishni tasdiqlash/ }));
    await waitFor(() => expect(api.reverseSale).toHaveBeenCalledTimes(1));
    expect(api.reverseSale.mock.calls[0]![5]).toEqual(['p1']);
    await screen.findByText(/belgisi olib tashlandi/);

    const after = within('refund-choice').getByRole('checkbox') as HTMLInputElement;
    expect(after.disabled).toBe(false);
    expect(after.checked).toBe(false);

    await user.click(screen.getByRole('button', { name: /Bekor qilishni tasdiqlash/ }));
    await waitFor(() => expect(api.reverseSale).toHaveBeenCalledTimes(2));
    expect(api.reverseSale.mock.calls[1]![5]).toEqual([]);
    expect(api.reverseSale.mock.calls[1]![3]).toBe(api.reverseSale.mock.calls[0]![3]);
  });

  it('boshqa xato (tarmoq): belgi qulflangan qoladi', async () => {
    api.reverseSale.mockReset();
    api.reverseSale.mockRejectedValueOnce(new Error('Failed to fetch'));
    const user = userEvent.setup();
    render(<SalesPage />);
    await user.click(await screen.findByRole('button', { name: /bekor qilish$/i }));
    await user.click(screen.getByRole('button', { name: /Bekor qilishni tasdiqlash/ }));
    await waitFor(() => expect(api.reverseSale).toHaveBeenCalledTimes(1));
    const box = within('refund-choice').getByRole('checkbox') as HTMLInputElement;
    await waitFor(() => expect(box.disabled).toBe(true));
    expect(box.checked).toBe(true);
  });
});

function within(testId: string) {
  const el = screen.getByTestId(testId);
  return { getByRole: (role: string) => el.querySelector(role === 'checkbox' ? 'input[type="checkbox"]' : role)! };
}
