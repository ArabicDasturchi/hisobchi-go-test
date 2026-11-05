/**
 * Ombor: har tovar uchun qoldiq (kirim − savdo ± tuzatish), tan narx (oxirgi kirim), sotuv narxi, birlik foydasi.
 * Manfiy qoldiq sariq (bloklamaydi). "Kirim qilish" — yangi kirim hujjati. Tovarga bosish — qoldiqni tuzatish (sabab majburiy).
 */
import { parseQtyMilli } from '@hisobchi/core';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { usePurchasing } from '../data/LedgerProvider';
import { catalogRow, catalogRowLabel } from '../features/catalogView';
import { describeSaveError } from '../features/saveErrors';
import { useFocusData } from '../features/useAsync';
import { formatQty, UNIT_LABELS } from '../lib/format';
import type { StockRow } from '../data/purchasing';
import { Banner, Button, Card, ChipGroup, CompactRow, EmptyState, Field, Loading, SectionTitle } from '../ui/components';
import { space, type } from '../ui/theme';

type Sign = 'plus' | 'minus';

export default function WarehouseScreen() {
  const purchasing = usePurchasing();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adjust, setAdjust] = useState<StockRow | null>(null);
  const { data, error, loading, reload } = useFocusData(
    () => purchasing.listStock({ search, includeArchived: showArchived }),
    [purchasing, search, showArchived],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        <Button label="Kirim qilish" icon="add" onPress={() => router.push('/purchase/new')} />
        {adjust ? (
          <AdjustCard
            row={adjust}
            onDone={() => { setAdjust(null); reload(); }}
            onCancel={() => setAdjust(null)}
          />
        ) : null}
        <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Tovar nomi" />
        <ChipGroup<'active' | 'all'>
          accessibilityLabel="Arxiv"
          options={[{ value: 'active', label: 'Faol tovarlar' }, { value: 'all', label: 'Arxivlanganlar bilan' }]}
          value={showArchived ? 'all' : 'active'}
          onChange={(v) => setShowArchived(v === 'all')}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
      </View>
      {loading && !data ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.productId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const v = catalogRow(item);
            return (
              <CompactRow
                title={item.isActive ? v.name : `${v.name} (arxiv)`}
                tone={v.stockLevel === 'negative' ? 'warning' : item.isActive ? 'normal' : 'muted'}
                meta={`Qoldiq: ${v.stockText}${v.stockLevel === 'negative' ? ' — kirim yozilmagan bo\'lishi mumkin' : ''}`}
                right={v.priceText}
                rightSub={v.costText ? `tan ${v.costText}${v.marginText ? ` · ${v.marginText}` : ''}` : "tan narx yo'q"}
                accessibilityLabel={catalogRowLabel(item)}
                onPress={() => setAdjust(item)}
              />
            );
          }}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="Tovar topilmadi" text="Menyu → Mahsulotlar orqali tovar qo'shing." />}
        />
      )}
    </View>
  );
}

/** Qoldiqni tuzatish: + yoki −, miqdor va sabab. Tuzatish teskari yozuv emas, yangi yozuv (tarix saqlanadi). */
function AdjustCard(props: { row: StockRow; onDone: () => void; onCancel: () => void }) {
  const purchasing = usePurchasing();
  const opId = useRef(randomUUID()).current;
  const [sign, setSign] = useState<Sign>('plus');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = parseQtyMilli(qty);
    if (!q.ok) return setError(q.message);
    if (q.qtyMilli <= 0n) return setError("Miqdor nol bo'lishi mumkin emas");
    setSaving(true);
    setError(null);
    try {
      await purchasing.adjustStock({
        productId: props.row.productId,
        qtyMilli: sign === 'plus' ? q.qtyMilli : -q.qtyMilli,
        reason,
        clientOpId: opId,
      });
      props.onDone();
    } catch (e) {
      setError(describeSaveError(e));
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <SectionTitle>{props.row.name}: qoldiqni tuzatish</SectionTitle>
      <Text style={type.caption}>
        Hozirgi qoldiq: {formatQty(props.row.qtyMilli)} {UNIT_LABELS[props.row.unit]}
      </Text>
      <ChipGroup<Sign>
        accessibilityLabel="Tuzatish yo'nalishi"
        options={[{ value: 'plus', label: "+ Qo'shish" }, { value: 'minus', label: '− Kamaytirish' }]}
        value={sign}
        onChange={setSign}
      />
      <Field label={`Miqdor (${UNIT_LABELS[props.row.unit]})`} value={qty} onChangeText={setQty} keyboardType="numbers-and-punctuation" placeholder="masalan 2 yoki 1,5" />
      <Field label="Sabab *" value={reason} onChangeText={setReason} placeholder="inventarizatsiya, sinish, ..." />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button label="Bekor qilish" variant="secondary" style={{ flex: 1 }} onPress={props.onCancel} disabled={saving} />
        <Button label="Saqlash" style={{ flex: 1 }} onPress={save} loading={saving} />
      </View>
    </Card>
  );
}
