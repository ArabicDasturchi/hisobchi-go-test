import { ALLOWED_UNITS, parseUnitPriceText, type AllowedUnit } from '@hisobchi/core';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Product } from '../data/catalog';
import { useCatalog } from '../data/LedgerProvider';
import { useFocusData } from '../features/useAsync';
import { formatSom, UNIT_LABELS } from '../lib/format';
import { Banner, Button, Card, EmptyState, Field, ListRow, Loading, Screen, SectionTitle } from '../ui/components';
import { colors, font, radius, space, type } from '../ui/theme';

interface FormState {
  id?: string;
  name: string;
  unit: AllowedUnit;
  priceText: string;
}

const EMPTY: FormState = { name: '', unit: 'dona', priceText: '' };

/** Mahsulot katalogi: savdo kiritishda tez tanlash uchun. Saqlangan savdolar narxi o'zgarmaydi. */
export default function ProductsScreen() {
  const catalog = useCatalog();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, error: loadError, loading, reload } = useFocusData(() => catalog.listProducts(search), [catalog, search]);

  const save = async () => {
    if (!form) return;
    const price = parseUnitPriceText(form.priceText);
    if (!form.name.trim()) return setError('Mahsulot nomini kiriting');
    if (!price.ok) return setError(price.message);
    setSaving(true);
    setError(null);
    try {
      await catalog.saveProduct({ name: form.name, unit: form.unit, unitPrice: price.unitPrice }, form.id);
      setForm(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: Product) =>
    Alert.alert("Mahsulotni o'chirish", `"${p.name}" katalogdan o'chiriladi. Saqlangan savdolar o'zgarmaydi.`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          await catalog.deleteProduct(p.id);
          setForm(null);
          reload();
        },
      },
    ]);

  return (
    <Screen>
      {form ? (
        <Card style={{ gap: space.xs }}>
          <SectionTitle>{form.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</SectionTitle>
          <Field label="Nomi *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="masalan: Oq non" />
          <Text style={s.label}>Birlik</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {ALLOWED_UNITS.map((u) => (
              <Pressable
                key={u}
                accessibilityRole="radio"
                accessibilityState={{ selected: form.unit === u }}
                onPress={() => setForm({ ...form, unit: u })}
                style={[s.chip, form.unit === u && s.chipOn]}
              >
                <Text style={[s.chipText, form.unit === u && s.chipTextOn]}>{UNIT_LABELS[u]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Field
            label="Narx (so'm) *"
            value={form.priceText}
            onChangeText={(v) => setForm({ ...form, priceText: v })}
            keyboardType="numbers-and-punctuation"
            placeholder="4000 yoki 4 ming"
            hint="Narxni o'zgartirish faqat yangi savdolarga ta'sir qiladi"
          />
          {error ? <Banner tone="error">{error}</Banner> : null}
          <View style={s.row}>
            <Button label="Bekor qilish" variant="secondary" style={{ flex: 1 }} onPress={() => setForm(null)} disabled={saving} />
            <Button label="Saqlash" style={{ flex: 1 }} onPress={save} loading={saving} />
          </View>
          {form.id ? (
            <Button
              label="Katalogdan o'chirish"
              variant="ghost"
              onPress={() => {
                const p = data?.find((x) => x.id === form.id);
                if (p) remove(p);
              }}
            />
          ) : null}
        </Card>
      ) : (
        <Button label="Yangi mahsulot" icon="add" onPress={() => { setError(null); setForm(EMPTY); }} />
      )}

      <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Mahsulot nomi" />
      {loadError ? <Banner tone="error">{loadError}</Banner> : null}

      <View style={s.list}>
        {loading && !data ? (
          <Loading />
        ) : data && data.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title={search ? 'Mahsulot topilmadi' : "Katalog bo'sh"}
            text="Ko'p sotiladigan mahsulotlarni qo'shing — savdo kiritishda nom va narx avtomatik to'ldiriladi."
          />
        ) : (
          data?.map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={`1 ${UNIT_LABELS[p.unit]} uchun`}
              right={formatSom(p.unitPrice)}
              onPress={() => {
                setError(null);
                setForm({ id: p.id, name: p.name, unit: p.unit, priceText: p.unitPrice.toString() });
              }}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  chips: { gap: space.sm, paddingBottom: space.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { ...type.body },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', gap: space.md },
  list: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
});
