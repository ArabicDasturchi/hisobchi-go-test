/**
 * Ta'minotchi: qarz (biz ularga), oldi-berdi (Eski/Tovar/Jami/Berildi/Ostatka), kirimlar va to'lovlar.
 * To'lov berish: qarzdan oshmaydi; xato to'lov teskari yozuv (void) bilan bekor qilinadi.
 */
import { parseUnitPriceText } from '@hisobchi/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS, type PaymentMethod } from '../../data/ledger';
import { usePurchasing } from '../../data/LedgerProvider';
import { displayDate, presetRange } from '../../features/books';
import { describeSaveError } from '../../features/saveErrors';
import { useFocusData } from '../../features/useAsync';
import { formatDateTime, formatSom } from '../../lib/format';
import { Badge, Banner, Button, Card, ChipGroup, EmptyState, Field, ListRow, Loading, Screen, SectionTitle, SettlementBox } from '../../ui/components';
import { space, type } from '../../ui/theme';

const METHOD_LABELS: Record<PaymentMethod, string> = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const purchasing = usePurchasing();
  const { data, error, loading, reload } = useFocusData(async () => {
    const supplier = await purchasing.getSupplier(id);
    if (!supplier) return null;
    return {
      supplier,
      all: await purchasing.supplierStatement(id, '2000-01-01', '2999-12-31'),
      purchases: await purchasing.listPurchases({ supplierId: id, limit: 50 }),
      payments: await purchasing.listSupplierPayments({ supplierId: id, limit: 50 }),
    };
  }, [purchasing, id]);
  const [paying, setPaying] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Screen><Banner tone="error">{error}</Banner></Screen>;
  if (!data) return <EmptyState icon="people-outline" title="Ta'minotchi topilmadi" />;
  const { supplier, all, purchases, payments } = data;

  return (
    <Screen>
      <Card style={{ gap: space.xs }}>
        <Text style={type.title}>{supplier.name}</Text>
        {supplier.phone ? <Text style={type.caption}>{supplier.phone}</Text> : null}
        {supplier.note ? <Text style={type.caption}>{supplier.note}</Text> : null}
        {!supplier.isActive ? <Badge label="Arxivlangan" tone="neutral" /> : null}
      </Card>

      <SectionTitle>Oldi-berdi (butun davr)</SectionTitle>
      <SettlementBox {...all} format={formatSom} />
      <Text style={type.caption}>
        Ostatka {formatSom(supplier.outstanding)}: {supplier.outstanding > 0n ? 'biz ta\'minotchiga qarzmiz' : supplier.outstanding < 0n ? 'ortiqcha to\'langan' : "qarz yo'q"}.
      </Text>

      <View style={s.row}>
        <Button label="Kirim qilish" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/purchase/new', params: { supplier: supplier.id } })} disabled={!supplier.isActive} />
        <Button label="To'lov berish" variant="secondary" style={{ flex: 1 }} onPress={() => setPaying(true)} disabled={supplier.outstanding <= 0n} />
      </View>
      {paying ? <PayCard supplierId={supplier.id} outstanding={supplier.outstanding} onDone={() => { setPaying(false); reload(); }} onCancel={() => setPaying(false)} /> : null}

      <SectionTitle>Kirimlar</SectionTitle>
      {purchases.length === 0 ? (
        <Text style={type.caption}>Kirim yo'q</Text>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {purchases.map((p) => (
            <ListRow
              key={p.id}
              title={displayDate(p.docDate)}
              subtitle={`${p.lineCount} ta tovar`}
              right={formatSom(p.total)}
              rightMuted={p.reversal !== null}
              badge={p.reversal ? { label: 'Bekor qilingan', tone: 'danger' } : undefined}
              onPress={() => router.push(`/purchases/${p.id}`)}
            />
          ))}
        </Card>
      )}

      <SectionTitle>To'lovlar</SectionTitle>
      {payments.length === 0 ? (
        <Text style={type.caption}>To'lov yo'q</Text>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {payments.map((p) => (
            <ListRow
              key={p.id}
              title={`${formatSom(p.amount)} · ${METHOD_LABELS[p.method]}`}
              subtitle={`${formatDateTime(p.createdAt)}${p.note ? ` · ${p.note}` : ''}`}
              rightMuted={p.void !== null}
              badge={p.void ? { label: 'Bekor qilingan', tone: 'danger' } : undefined}
              onPress={
                p.void
                  ? undefined
                  : () =>
                      Alert.alert("To'lovni bekor qilish", "Yozuv o'chirilmaydi: teskari yozuv qo'shiladi va qarz qaytadi.", [
                        { text: 'Orqaga', style: 'cancel' },
                        {
                          text: 'Bekor qilish',
                          style: 'destructive',
                          onPress: () => {
                            void purchasing
                              .voidSupplierPayment({ paymentId: p.id, reason: "xato kiritilgan to'lov" })
                              .then(reload)
                              .catch((e: unknown) => Alert.alert('Bekor qilinmadi', describeSaveError(e)));
                          },
                        },
                      ])
              }
            />
          ))}
        </Card>
      )}

      <Button
        label={supplier.isActive ? 'Arxivlash' : 'Arxivdan chiqarish'}
        variant="ghost"
        onPress={() => void purchasing.setSupplierActive(supplier.id, !supplier.isActive).then(reload)}
      />
    </Screen>
  );
}

function PayCard(props: { supplierId: string; outstanding: bigint; onDone: () => void; onCancel: () => void }) {
  const purchasing = usePurchasing();
  const opId = useRef(randomUUID()).current;
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const a = parseUnitPriceText(amountText);
    if (!a.ok) return setError(a.message);
    setSaving(true);
    setError(null);
    try {
      await purchasing.recordSupplierPayment({ supplierId: props.supplierId, amount: a.unitPrice, method, clientOpId: opId });
      props.onDone();
    } catch (e) {
      setError(describeSaveError(e));
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <SectionTitle>To'lov berish</SectionTitle>
      <Text style={type.caption}>Qarz: {formatSom(props.outstanding)}. To'lov qarzdan oshmaydi.</Text>
      <Field label="Summa (so'm)" value={amountText} onChangeText={setAmountText} keyboardType="numbers-and-punctuation" />
      <Button label="Hammasini to'lash" variant="secondary" onPress={() => setAmountText(props.outstanding.toString())} />
      <ChipGroup<PaymentMethod>
        accessibilityLabel="To'lov usuli"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        value={method}
        onChange={setMethod}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <View style={s.row}>
        <Button label="Bekor qilish" variant="secondary" style={{ flex: 1 }} onPress={props.onCancel} disabled={saving} />
        <Button label="Saqlash" style={{ flex: 1 }} onPress={save} loading={saving} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', gap: space.md } });
