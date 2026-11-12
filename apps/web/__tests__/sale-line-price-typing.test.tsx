// @vitest-environment jsdom
/**
 * Narx kiritishda xato: "70 000" yozishda "7" bosilishi bilan qator yashil bo'lib, narx maydoni
 * yo'qolar va narx "7 so'm" bo'lib qotardi. Maydon fokus ichida ochiq qolishi kerak.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SaleLineCard } from '@/components/sale/SaleLineCard';
import { lineStatus } from '@/lib/lineStatus';
import { patchSaleLine } from '@/lib/productIdentity';
import type { DraftLine } from '@/lib/saleForm';

afterEach(cleanup);

function Harness() {
  const [line, setLine] = useState<DraftLine>({ key: 'k1', productName: 'Чирмок', qty: '1', unit: 'dona', price: '' });
  return (
    <ul>
      <SaleLineCard line={line} status={lineStatus(line, [])} onChange={(p) => setLine((l) => patchSaleLine(l, p))} onRemove={() => {}} />
    </ul>
  );
}

describe('SaleLineCard: narx yozish', () => {
  it("birinchi raqamdan keyin maydon yo'qolmaydi va 70 000 to'liq yoziladi", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/Narx: Чирмок/) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('7');
    const still = screen.getByLabelText(/Narx: Чирмок/) as HTMLInputElement;
    expect(still).toBe(document.activeElement);
    await user.keyboard('0000');
    expect((screen.getByLabelText(/Narx: Чирмок/) as HTMLInputElement).value.replace(/\s/g, '')).toBe('70000');
  });

  it("maydondan chiqilgach (blur) qator jami ko'rsatiladi", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText(/Narx: Чирмок/));
    await user.keyboard('70000');
    await user.tab();
    expect(screen.queryByLabelText(/Narx: Чирмок/)).toBeNull();
    expect(screen.getByTestId('line-total').textContent).toMatch(/70\s?000/);
  });
});
