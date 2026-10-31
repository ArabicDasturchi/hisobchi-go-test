import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLedger } from '../../data/LedgerProvider';
import { Banner, Button, Field, Loading, Screen } from '../../ui/components';

/** Mijoz yaratish (id yo'q) yoki tahrirlash (id bor) */
export default function CustomerFormScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const ledger = useLedger();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const initial = useRef({ name: '', phone: '', note: '' });
  const dirty = name !== initial.current.name || phone !== initial.current.phone || note !== initial.current.note;

  // Saqlanmagan o'zgarishlar bilan chiqishda ogohlantirish (orqaga, swipe, Android back)
  const allowLeave = usePreventRemove(dirty && !saving, ({ repeat }) => {
    Alert.alert("Saqlanmagan o'zgarishlar", "Kiritilgan ma'lumotlar saqlanmaydi. Chiqasizmi?", [
      { text: 'Qolish', style: 'cancel' },
      { text: 'Chiqish', style: 'destructive', onPress: repeat },
    ]);
  });

  useEffect(() => {
    if (!id) return;
    ledger
      .getCustomer(id)
      .then((c) => {
        if (c) {
          initial.current = { name: c.name, phone: c.phone ?? '', note: c.note ?? '' };
          setName(c.name);
          setPhone(c.phone ?? '');
          setNote(c.note ?? '');
        } else {
          setError('Mijoz topilmadi');
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, ledger]);

  const save = async () => {
    if (!name.trim()) {
      setNameError('Ism kiritilishi shart');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (id) {
        await ledger.updateCustomer(id, { name, phone, note });
        allowLeave();
        router.back();
      } else {
        const newId = await ledger.createCustomer({ name, phone, note });
        allowLeave();
        if (returnTo === 'confirm') {
          router.dismissTo({ pathname: '/confirm', params: { customerId: newId } });
        } else {
          router.replace(`/customers/${newId}`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <Screen modal>
      <Stack.Screen options={{ title: id ? 'Mijozni tahrirlash' : 'Yangi mijoz' }} />
        <Field
          label="Ism *"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameError(undefined);
          }}
          placeholder="masalan: Akmal aka"
          error={nameError}
          autoFocus={!id}
        />
        <Field label="Telefon" value={phone} onChangeText={setPhone} placeholder="+998 90 123 45 67" keyboardType="phone-pad" hint="Ixtiyoriy" />
        <Field label="Izoh" value={note} onChangeText={setNote} placeholder="masalan: Chorsu bozori, 12-do'kon" />
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button label="Saqlash" onPress={save} loading={saving} />
        <Button label="Bekor qilish" variant="ghost" onPress={() => router.back()} disabled={saving} />
        {id ? (
          <Button
            label="Mijozni o'chirish"
            variant="ghost"
            icon="trash-outline"
            disabled={saving}
            onPress={() =>
              Alert.alert(
                "Mijozni o'chirish",
                `"${name}" o'chiriladi. Faqat savdo va to'lov tarixi bo'lmagan mijozni o'chirish mumkin. Davom etasizmi?`,
                [
                  { text: 'Bekor qilish', style: 'cancel' },
                  {
                    text: "O'chirish",
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await ledger.deleteCustomer(id);
                        allowLeave();
                        router.dismissTo('/customers');
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    },
                  },
                ],
              )
            }
          />
        ) : null}
    </Screen>
  );
}
