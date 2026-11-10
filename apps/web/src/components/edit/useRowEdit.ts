'use client';
/**
 * Qatorni joyida tuzatish (hamma jadvalda bir xil). Ikki usul bitta holat mashinasida:
 * - katak rejimi (`start(key)`): faqat shu katak; Enter saqlaydi, Esc bekor, Tab saqlab keyingi katakka;
 * - qator rejimi (`start()`): qatordagi hamma tahrirlanadigan qiymat maydonga aylanadi, "Saqlash"/"Bekor".
 * Tekshiruv `lib/rowEdit.ts` (parseMoneyInput/parseQtyInput); xato qiymatni yo'qotmaydi; saqlash `await`;
 * ikki marta bosishdan himoya (`busy`).
 */
import { useCallback, useRef, useState } from 'react';
import { isDirty, validateRow, type FieldDef, type RowErrors, type RowValues } from '@/lib/rowEdit';

export interface RowEditApi {
  fields: readonly FieldDef[];
  /** null — tahrir yo'q; `only` — katak rejimida shu katak, aks holda butun qator */
  mode: { only: string | null } | null;
  editing: boolean;
  /** Berilgan maydon hozir tahrirlanyaptimi */
  isEditing: (key: string) => boolean;
  values: RowValues;
  errors: RowErrors;
  formError: string | null;
  busy: boolean;
  /** Qiymat boshlang'ichdan farq qiladimi */
  dirty: boolean;
  start: (only?: string) => void;
  cancel: () => void;
  set: (key: string, value: string) => void;
  /** true: saqlandi (yoki o'zgarish yo'q) */
  save: () => Promise<boolean>;
}

export function useRowEdit(opts: { fields: readonly FieldDef[]; initial: RowValues; onSave: (values: RowValues) => Promise<void> }): RowEditApi {
  const { fields, initial, onSave } = opts;
  const [mode, setMode] = useState<RowEditApi['mode']>(null);
  const [values, setValues] = useState<RowValues>(initial);
  const [errors, setErrors] = useState<RowErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const start = useCallback(
    (only?: string) => {
      setValues(initial);
      setErrors({});
      setFormError(null);
      setMode({ only: only ?? null });
    },
    [initial],
  );
  const cancel = useCallback(() => {
    if (busyRef.current) return;
    setMode(null);
    setErrors({});
    setFormError(null);
  }, []);
  const set = useCallback((key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const { [key]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
    setFormError(null);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!mode || busyRef.current) return false;
    const errs = validateRow(fields, values, mode.only ?? undefined);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return false;
    }
    if (!isDirty(initial, values, mode.only ?? undefined)) {
      setMode(null);
      return true;
    }
    busyRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await onSave(values);
      setMode(null);
      return true;
    } catch (e) {
      // qiymat saqlanib qoladi: foydalanuvchi tuzatib qayta urinadi
      setFormError(e instanceof Error ? e.message : 'Saqlab bo‘lmadi.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [mode, fields, values, initial, onSave]);

  return {
    fields,
    mode,
    editing: mode !== null,
    isEditing: (key) => mode !== null && (mode.only === null || mode.only === key),
    values,
    errors,
    formError,
    busy,
    dirty: mode !== null && isDirty(initial, values, mode.only ?? undefined),
    start,
    cancel,
    set,
    save,
  };
}
