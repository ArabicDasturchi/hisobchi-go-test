/**
 * Kirim tafsiloti. Tahrirlab bo'lmaydi: xato bo'lsa teskari yozuv bilan bekor qilinadi (sabab majburiy).
 * Bekor qilinsa ombor qoldig'i va ta'minotchi qarzi qaytadi, tan narx oldingi kirimga qaytadi.
 */
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePurchasing } from '../../data/LedgerProvider';
import { displayDate } from '../../features/books';
import { describeSaveError } from '../../features/saveErrors';
import { useFocusData } from '../../features/useAsync';
import { formatDateTime, formatQty, formatSom, shortSaleNumber, UNIT_LABELS } from '../../lib/format';
import { Badge, Banner, Button, Card, EmptyState, Field, Loading, Screen, SectionTitle } from '../../ui/components';
import { colors, space, type } from '../../ui/theme';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const purchasing = usePurchasing();
  const opId = useRef(randomUUID()).current;
  const { data: p, error, loading, reload } = useFocusData(() => purchasing.getPurchase(id), [purchasing, id]);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading && !p) return <Loading />;
  if (error) {
    return (
      <Screen>
        <Banner tone="error" title="Kirim yuklanmadi">
          <Text style={type.body}>{error}</Text>
          <Button label="Qayta urinish" variant="secondary" onPress={reload} />
        </Banner>
      </Screen>
    );
  }
  if (!p) return <EmptyState icon="cube-outline" title="Kirim topilmadi" />;

  const reverse = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await purchasing.reversePurchase({ purchaseId: p.id, reason, clientOpId: opId });
      setAsking(false);
      reload();
    } catch (e) {
      setFormError(describeSaveError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={s.head}>
        <View style={s.headTop}>
          <Text style={type.heading}>{shortSaleNumber(p.id)}</Text>
          <Badge label={p.reversal ? 'Bekor qilingan' : 'Saqlangan'} tone={p.reversal ? 'danger' : 'success'} />
        </View>
        <Text style={[type.moneyLarge, p.reversal && { color: colors.textSubtle }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatSom(p.total)}
        </Text>
        <Text style={type.caption}>
          {p.supplierName} · {displayDate(p.docDate)}
        </Text>
      </View>

      {p.reversal ? (
        <Banner tone="warning" title="Bu kirim bekor qilingan">
          <Text style={type.body}>{p.reversal.reason}</Text>
          <Text style={type.caption}>{formatDateTime(p.reversal.createdAt)}</Text>
        </Banner>
      ) : null}

      <SectionTitle>Tovarlar</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {p.lines.map((l) => (
          <View key={l.lineIndex} style={s.line}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>{l.productName}</Text>
              <Text style={type.caption}>
                {formatQty(l.qtyMilli)} {UNIT_LABELS[l.unit]} × {formatSom(l.unitCost)}
              </Text>
            </View>
            <Text style={type.money}>{formatSom(l.lineTotal)}</Text>
          </View>
        ))}
      </Card>

      {!p.reversal ? (
        asking ? (
          <Card style={{ gap: space.sm }}>
            <SectionTitle>Kirimni bekor qilish</SectionTitle>
            <Text style={type.caption}>Yozuv o'chirilmaydi: teskari yozuv qo'shiladi. Qoldiq va qarz qaytadi.</Text>
            <Field label="Sabab *" value={reason} onChangeText={setReason} placeholder="Nega bekor qilinmoqda" />
            {formError ? <Banner tone="error">{formError}</Banner> : null}
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button label="Orqaga" variant="secondary" style={{ flex: 1 }} onPress={() => setAsking(false)} disabled={saving} />
              <Button label="Bekor qilish" variant="danger" style={{ flex: 1 }} onPress={reverse} loading={saving} />
            </View>
          </Card>
        ) : (
          <Button label="Kirimni bekor qilish" variant="secondary" onPress={() => setAsking(true)} />
        )
      ) : null}
      <Button label="Ta'minotchi" variant="ghost" onPress={() => router.push(`/suppliers/${p.supplierId}`)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { backgroundColor: colors.card, borderRadius: 16, padding: space.lg, gap: space.xs, borderWidth: 1, borderColor: colors.border },
  headTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
