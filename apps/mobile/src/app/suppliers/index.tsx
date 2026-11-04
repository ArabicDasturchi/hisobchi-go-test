/** Ta'minotchilar: ro'yxat, qarz (biz ularga), yangi ta'minotchi qo'shish. */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { usePurchasing } from '../../data/LedgerProvider';
import { describeSaveError } from '../../features/saveErrors';
import { useFocusData } from '../../features/useAsync';
import { formatSom } from '../../lib/format';
import { Banner, Button, Card, ChipGroup, EmptyState, Field, ListRow, Loading, SectionTitle } from '../../ui/components';
import { space } from '../../ui/theme';

export default function SuppliersScreen() {
  const purchasing = usePurchasing();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<{ name: string; phone: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, loading, reload } = useFocusData(
    () => purchasing.listSuppliers({ search, includeArchived: archived }),
    [purchasing, search, archived],
  );

  const save = async () => {
    if (!form) return;
    try {
      await purchasing.saveSupplier(form);
      setForm(null);
      setError(null);
      reload();
    } catch (e) {
      setError(describeSaveError(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        {form ? (
          <Card style={{ gap: space.sm }}>
            <SectionTitle>Yangi ta'minotchi</SectionTitle>
            <Field label="Nomi *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <Field label="Telefon" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <Field label="Izoh" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} />
            {error ? <Banner tone="error">{error}</Banner> : null}
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button label="Bekor qilish" variant="secondary" style={{ flex: 1 }} onPress={() => setForm(null)} />
              <Button label="Saqlash" style={{ flex: 1 }} onPress={save} />
            </View>
          </Card>
        ) : (
          <Button label="Yangi ta'minotchi" icon="add" onPress={() => { setError(null); setForm({ name: '', phone: '', note: '' }); }} />
        )}
        <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Nom yoki telefon" />
        <ChipGroup<'active' | 'all'>
          accessibilityLabel="Arxiv"
          options={[{ value: 'active', label: 'Faol' }, { value: 'all', label: 'Arxivlanganlar bilan' }]}
          value={archived ? 'all' : 'active'}
          onChange={(v) => setArchived(v === 'all')}
        />
        {loadError ? <Banner tone="error">{loadError}</Banner> : null}
      </View>
      {loading && !data ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListRow
              title={item.isActive ? item.name : `${item.name} (arxiv)`}
              subtitle={`${item.phone ? `${item.phone} · ` : ''}${item.purchaseCount} ta kirim · jami ${formatSom(item.goods)}`}
              right={formatSom(item.outstanding > 0n ? item.outstanding : 0n)}
              badge={
                item.outstanding > 0n
                  ? { label: 'Qarzimiz', tone: 'danger' }
                  : item.outstanding < 0n
                    ? { label: 'Ortiqcha to\'langan', tone: 'info' }
                    : { label: "Qarz yo'q", tone: 'success' }
              }
              onPress={() => router.push(`/suppliers/${item.id}`)}
            />
          )}
          ListEmptyComponent={<EmptyState icon="people-outline" title={search ? "Ta'minotchi topilmadi" : "Ta'minotchilar yo'q"} text={search ? undefined : "Kirim qilish uchun avval ta'minotchi qo'shing."} />}
        />
      )}
    </View>
  );
}
