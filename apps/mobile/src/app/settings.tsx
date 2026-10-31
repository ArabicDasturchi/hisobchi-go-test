import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import type { SettingKey } from '../data/catalog';
import { useCatalog } from '../data/LedgerProvider';
import { SyncStatus } from '../features/SyncStatus';
import { SCHEMA_VERSION } from '../data/schema';
import { Banner, Button, Card, Field, Loading, Screen, SectionTitle } from '../ui/components';
import { type } from '../ui/theme';

export default function SettingsScreen() {
  const catalog = useCatalog();
  const [values, setValues] = useState<Record<SettingKey, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    catalog
      .getSettings()
      .then(setValues)
      .catch((e: unknown) => setStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) }));
  }, [catalog]);

  if (!values) return status ? <Banner tone="error">{status.text}</Banner> : <Loading />;

  const set = (k: SettingKey) => (v: string) => {
    setValues({ ...values, [k]: v });
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      await catalog.saveSettings(values);
      setStatus({ tone: 'success', text: 'Saqlandi' });
    } catch (e) {
      setStatus({ tone: 'error', text: `Saqlanmadi: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Card>
        <SectionTitle>Do'kon ma'lumotlari</SectionTitle>
        <Field label="Do'kon nomi" value={values.shop_name} onChangeText={set('shop_name')} placeholder="masalan: Akmal savdo" />
        <Field label="Telefon" value={values.shop_phone} onChangeText={set('shop_phone')} keyboardType="phone-pad" placeholder="+998 90 123 45 67" />
        <Field label="Manzil" value={values.shop_address} onChangeText={set('shop_address')} placeholder="masalan: Chorsu bozori, 12-do'kon" />
        {status ? <Banner tone={status.tone}>{status.text}</Banner> : null}
        <Button label="Saqlash" onPress={save} loading={saving} />
      </Card>

      <Card style={{ gap: 8 }}>
        <SectionTitle>Hisob va bulut</SectionTitle>
        <SyncStatus />
        <Text style={type.caption}>Kirish, chiqish (faqat shu qurilmadan) va sinxronlash — «Hisob va bulut» sahifasida.</Text>
      </Card>

      <Card>
        <SectionTitle>Ilova haqida</SectionTitle>
        <Text style={type.body}>Hisobchi Go · versiya {Constants.expoConfig?.version ?? '—'}</Text>
        <Text style={type.caption}>
          Platforma: {Platform.OS} · ma'lumotlar bazasi sxemasi: v{SCHEMA_VERSION}
        </Text>
        <Text style={[type.caption, { marginTop: 8 }]}>
          Ilova internetsiz ham ishlaydi. Hisobga kirilganda yozuvlar bulut bilan avtomatik almashinadi. Saqlangan
          savdo va to'lovlarni o'chirish imkoniyati ataylab yo'q — xato yozuv «bekor qilish» bilan tuzatiladi.
        </Text>
      </Card>
    </Screen>
  );
}
