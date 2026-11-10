// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableCell } from '@/components/edit/EditableCell';
import { RowActions, RowError } from '@/components/edit/EditableRow';
import { useRowEdit } from '@/components/edit/useRowEdit';
import { isDirty, validateRow, type FieldDef } from '@/lib/rowEdit';

afterEach(cleanup);

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nomi', kind: 'text', required: true, maxLength: 20 },
  { key: 'price', label: 'Sotuv narxi', kind: 'money', allowZero: false },
];
const INITIAL = { name: 'Un', price: '9 000' };

function Harness({ onSave }: { onSave: (v: Readonly<Record<string, string>>) => Promise<void> }) {
  const row = useRowEdit({ fields: FIELDS, initial: INITIAL, onSave });
  return (
    <div>
      <EditableCell field={FIELDS[0]!} row={row} display="Un" />
      <EditableCell field={FIELDS[1]!} row={row} display="9 000 so'm" right />
      <RowActions row={row} label="Un" />
      <RowError row={row} />
    </div>
  );
}

describe('rowEdit tekshiruvi (sof)', () => {
  it('narx: bo‘sh, harf, nol rad etiladi; to‘g‘ri summa o‘tadi', () => {
    expect(validateRow(FIELDS, { name: 'Un', price: '' }).price).toBeTruthy();
    expect(validateRow(FIELDS, { name: 'Un', price: 'abc' }).price).toBeTruthy();
    expect(validateRow(FIELDS, { name: 'Un', price: '0' }).price).toBeTruthy();
    expect(validateRow(FIELDS, { name: 'Un', price: '12 000' })).toEqual({});
  });
  it('nom: bo‘sh va uzun rad etiladi; faqat `only` maydon tekshiriladi', () => {
    expect(validateRow(FIELDS, { name: '  ', price: '1' }).name).toBeTruthy();
    expect(validateRow(FIELDS, { name: 'x'.repeat(21), price: '1' }).name).toBeTruthy();
    expect(validateRow(FIELDS, { name: '', price: '1 000' }, 'price')).toEqual({});
  });
  it('isDirty: bo‘shliq farqi o‘zgarish emas', () => {
    expect(isDirty({ a: 'x' }, { a: ' x ' })).toBe(false);
    expect(isDirty({ a: 'x' }, { a: 'y' })).toBe(true);
  });
});

describe('EditableCell (katak rejimi)', () => {
  it('ikki marta bosish → maydon; Enter saqlaydi; qiymat serverga to‘liq qator bilan ketadi', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.dblClick(screen.getByRole('button', { name: 'Sotuv narxi: tuzatish' }));
    const input = screen.getByRole('textbox', { name: 'Sotuv narxi' });
    await user.clear(input);
    await user.type(input, '12000{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ name: 'Un', price: '12 000' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Sotuv narxi' })).toBeNull());
  });

  it('fokusda Enter va F2 ham tahrirni ochadi', async () => {
    const user = userEvent.setup();
    render(<Harness onSave={vi.fn()} />);
    screen.getByRole('button', { name: 'Nomi: tuzatish' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Nomi' })).toBeTruthy();
    await user.keyboard('{Escape}');
    screen.getByRole('button', { name: 'Sotuv narxi: tuzatish' }).focus();
    await user.keyboard('{F2}');
    expect(screen.getByRole('textbox', { name: 'Sotuv narxi' })).toBeTruthy();
  });

  it('Esc bekor qiladi: saqlanmaydi, eski qiymat qoladi', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.dblClick(screen.getByRole('button', { name: 'Sotuv narxi: tuzatish' }));
    await user.type(screen.getByRole('textbox', { name: 'Sotuv narxi' }), '999{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sotuv narxi: tuzatish' }).textContent).toBe("9 000 so'm");
  });

  it('noto‘g‘ri qiymat: xato katakda ko‘rinadi, qiymat yo‘qolmaydi, saqlanmaydi', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.dblClick(screen.getByRole('button', { name: 'Sotuv narxi: tuzatish' }));
    const input = screen.getByRole('textbox', { name: 'Sotuv narxi' });
    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Sotuv narxi' }) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Sotuv narxi' }).getAttribute('aria-invalid')).toBe('true');
  });

  it('Tab saqlaydi va keyingi katakning tahririni ochadi', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.dblClick(screen.getByRole('button', { name: 'Nomi: tuzatish' }));
    await user.type(screen.getByRole('textbox', { name: 'Nomi' }), '2{Tab}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Un2', price: '9 000' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Sotuv narxi' })).toBeTruthy());
  });
});

describe('Qator rejimi ("Tuzatish" tugmasi)', () => {
  it('hamma maydon ochiladi; Saqlash bir marta chaqiradi (ikki marta bosishdan himoya)', async () => {
    let release: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Unni tuzatish' }));
    expect(screen.getByRole('textbox', { name: 'Nomi' })).toBeTruthy();
    const price = screen.getByRole('textbox', { name: 'Sotuv narxi' });
    await user.clear(price);
    await user.type(price, '15000');
    const save = screen.getByRole('button', { name: 'Un: saqlash' });
    await user.dblClick(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nomi' })).toBeNull());
  });

  it('Bekor: o‘zgarish tashlanadi', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Unni tuzatish' }));
    await user.type(screen.getByRole('textbox', { name: 'Nomi' }), 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Un: bekor qilish' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nomi: tuzatish' }).textContent).toBe('Un');
  });

  it('server xatosi: xabar ko‘rinadi, qiymat saqlanadi, qayta urinish mumkin', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Tarmoq xatosi')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Unni tuzatish' }));
    await user.type(screen.getByRole('textbox', { name: 'Nomi' }), '7');
    await user.click(screen.getByRole('button', { name: 'Un: saqlash' }));
    await waitFor(() => expect(screen.getByText('Tarmoq xatosi')).toBeTruthy());
    expect((screen.getByRole('textbox', { name: 'Nomi' }) as HTMLInputElement).value).toBe('Un7');
    await user.click(screen.getByRole('button', { name: 'Un: saqlash' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('o‘zgarishsiz saqlash serverga bormaydi', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Unni tuzatish' }));
    await user.click(screen.getByRole('button', { name: 'Un: saqlash' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
