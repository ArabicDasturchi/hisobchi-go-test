import { parseUnitPriceText } from '@hisobchi/core';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS, PaymentError, type CustomerWithBalance, type Payment, type PaymentMethod } from '../../data/ledger';
import { useLedger } from '../../data/LedgerProvider';
import { useSync } from '../../backend/SyncProvider';
import { useFocusData } from '../../features/useAsync';
import { formatDateTime, formatSom } from '../../lib/format';
import { Badge, Banner, Button, Card, ChipGroup, EmptyState, Field, ListRow, Loading, Screen, SectionTitle } from '../../ui/components';
import { colors, font, radius, space, type } from '../../ui/theme';

const METHOD_LABELS: Record<PaymentMethod, string> = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ledger = useLedger();
  const { data, error, loading, reload } = useFocusData(
    async () => ({
      customer: await ledger.getCustomer(id),
      sales: await ledger.listSales({ customerId: id, includeHidden: true }),
      payments: await ledger.listPayments({ customerId: id }),
    }),
    [ledger, id],
  );

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <Screen>
        <Banner tone="error" title="Mijoz yuklanmadi">
          <Text style={type.body}>{error}</Text>
          <Button label="Qayta urinish" variant="secondary" onPress={reload} />
        </Banner>
      </Screen>
    );
  }
  if (!data?.customer) return <EmptyState icon="person-outline" title="Mijoz topilmadi" />;
  const { customer, sales, payments } = data;

  return (
    <Screen>
      <Stack.Screen options={{ title: customer.name }} />
      <Card style={{ gap: space.xs }}>
        <Text style={type.title}>{customer.name}</Text>
        {customer.phone ? <Text style={type.caption}>Tel: {customer.phone}</Text> : null}
        {customer.note ? <Text style={type.caption}>{customer.note}</Text> : null}
        <View style={s.summary}>
          <SummaryCell label="Savdo" value={formatSom(customer.balance)} hint={`${customer.saleCount} ta`} />
          <SummaryCell label="To'langan" value={formatSom(customer.paid)} />
          <SummaryCell
            label={customer.outstanding < 0n ? 'Ortiqcha to\'lov' : 'Qarz'}
            value={formatSom(customer.outstanding < 0n ? -customer.outstanding : customer.outstanding)}
            strong
            tone={customer.outstanding > 0n ? 'danger' : 'success'}
          />
        </View>
        <Text style={type.caption}>Qarz = savdo (bekor qilinganlarsiz) − to'lovlar (bekor qilinganlarsiz).</Text>
      </Card>

      <View style={s.row}>
        <Button
          label="Tahrirlash"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/customers/form', params: { id: customer.id } })}
        />
        <Button label="Yangi savdo" style={{ flex: 1 }} onPress={() => router.push('/new')} />
      </View>

      <PaymentForm customer={customer} onDone={reload} />

      <View style={s.section}>
        <SectionTitle>To'lovlar ({payments.length})</SectionTitle>
        <View style={s.list}>
          {payments.length === 0 ? (
            <Text style={[type.caption, { padding: space.lg }]}>Hali to'lov qabul qilinmagan.</Text>
          ) : (
            payments.map((p) => <PaymentRow key={p.id} payment={p} onDone={reload} />)
          )}
        </View>
      </View>

      <View style={s.section}>
        <SectionTitle>Savdolar ({sales.length})</SectionTitle>
        <View style={s.list}>
          {sales.length === 0 ? (
            <EmptyState icon="receipt-outline" title="Bu mijozga hali savdo biriktirilmagan" />
          ) : (
            sales.map((item) => (
              <ListRow
                key={item.id}
                title={formatDateTime(item.createdAt)}
                subtitle={`${item.lineCount} ta mahsulot`}
                right={formatSom(item.total)}
                rightMuted={item.reversal !== null}
                badge={
                  item.reversal
                    ? { label: 'Bekor qilingan', tone: 'danger' }
                    : item.hidden
                      ? { label: 'Yashirilgan', tone: 'neutral' }
                      : undefined
                }
                onPress={() => router.push(`/sales/${item.id}`)}
              />
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

function SummaryCell(props: { label: string; value: string; hint?: string; strong?: boolean; tone?: 'danger' | 'success' }) {
  const color = props.tone === 'danger' ? colors.danger : props.tone === 'success' ? colors.success : colors.text;
  return (
    <View style={s.cell} accessible accessibilityLabel={`${props.label}: ${props.value}`}>
      <Text style={type.label}>{props.label}</Text>
      <Text style={[s.cellValue, props.strong && { fontSize: font.lg }, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {props.value}
      </Text>
      {props.hint ? <Text style={type.caption}>{props.hint}</Text> : null}
    </View>
  );
}

/** To'lov qabul qilish — qarzdan oshmaydi; takroriy bosish ikkinchi to'lov yaratmaydi */
function PaymentForm({ customer, onDone }: { customer: CustomerWithBalance; onDone: () => void }) {
  const ledger = useLedger();
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opId = useRef(randomUUID());

  if (customer.outstanding <= 0n) {
    return <Text style={type.caption}>Qarz yo'q — to'lov qabul qilish shart emas.</Text>;
  }
  if (!open) {
    return <Button label="To'lov qabul qilish" icon="add" onPress={() => setOpen(true)} />;
  }

  const submit = () => {
    const parsed = parseUnitPriceText(amountText);
    if (!parsed.ok) return setError(parsed.message);
    if (parsed.unitPrice <= 0n) return setError("Summa musbat bo'lishi kerak");
    if (parsed.unitPrice > customer.outstanding) return setError(`Summa qarzdan katta (qarz: ${formatSom(customer.outstanding)})`);
    const amount = parsed.unitPrice;
    Alert.alert("To'lovni tasdiqlash", `${customer.name}: ${formatSom(amount)} (${METHOD_LABELS[method]})`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'Qabul qilish',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await ledger.recordPayment({ customerId: customer.id, amount, method, note, clientOpId: opId.current });
            opId.current = randomUUID();
            sync.requestSync();
            setOpen(false);
            setAmountText('');
            setNote('');
            onDone();
          } catch (e) {
            setError(e instanceof PaymentError ? e.message : `To'lov saqlanmadi, hech narsa yozilmadi. (${e instanceof Error ? e.message : String(e)})`);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Card style={{ gap: space.xs }}>
      <SectionTitle>To'lov qabul qilish</SectionTitle>
      <Field
        label="Summa (so'm) *"
        value={amountText}
        onChangeText={(v) => {
          setAmountText(v);
          setError(null);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder="masalan: 50000 yoki 50 ming"
        hint={`Qarz: ${formatSom(customer.outstanding)}`}
        error={error ?? undefined}
      />
      <Button label="To'liq qarz summasi" variant="ghost" onPress={() => setAmountText(customer.outstanding.toString())} />
      <Text style={type.caption}>To'lov usuli</Text>
      <ChipGroup
        accessibilityLabel="To'lov usuli"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        value={method}
        onChange={setMethod}
      />
      <Field label="Izoh" value={note} onChangeText={setNote} placeholder="ixtiyoriy" />
      <View style={s.row}>
        <Button label="Yopish" variant="secondary" style={{ flex: 1 }} onPress={() => setOpen(false)} disabled={busy} />
        <Button label="Saqlash" style={{ flex: 1 }} onPress={submit} loading={busy} />
      </View>
    </Card>
  );
}

/** To'lov qatori; xato to'lovni sabab bilan bekor qilish (yozuv o'chirilmaydi) */
function PaymentRow({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const ledger = useLedger();
  const sync = useSync();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmVoid = () => {
    if (reason.trim().length < 3) return setError('Sababni yozing (kamida 3 ta belgi)');
    Alert.alert("To'lovni bekor qilish", `${formatSom(payment.amount)} qarzga qaytariladi. Davom etasizmi?`, [
      { text: "Yo'q", style: 'cancel' },
      {
        text: 'Bekor qilish',
        style: 'destructive',
        onPress: async () => {
          try {
            await ledger.voidPayment({ paymentId: payment.id, reason });
            sync.requestSync();
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <View style={s.payRow}>
      <View style={s.payTop}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{METHOD_LABELS[payment.method]}</Text>
          <Text style={type.caption}>
            {formatDateTime(payment.createdAt)}
            {payment.note ? ` · ${payment.note}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[type.money, payment.void && s.struck]}>{formatSom(payment.amount)}</Text>
          {payment.void ? <Badge label="Bekor qilingan" tone="danger" /> : null}
        </View>
      </View>
      {payment.void ? (
        <Text style={type.caption}>Sabab: {payment.void.reason}</Text>
      ) : voiding ? (
        <View style={{ gap: space.xs }}>
          <Field label="Bekor qilish sababi *" value={reason} onChangeText={setReason} error={error ?? undefined} />
          <View style={s.row}>
            <Button label="Yopish" variant="secondary" style={{ flex: 1 }} onPress={() => setVoiding(false)} />
            <Button label="Tasdiqlash" variant="danger" style={{ flex: 1 }} onPress={confirmVoid} />
          </View>
        </View>
      ) : (
        <Button label="To'lovni bekor qilish" variant="ghost" style={s.smallBtn} onPress={() => setVoiding(true)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  summary: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cell: { flex: 1, gap: 2 },
  cellValue: { fontSize: font.md, fontWeight: '800', fontVariant: ['tabular-nums'] },
  section: { gap: space.xs },
  list: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  payRow: { padding: space.md, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  payTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  struck: { textDecorationLine: 'line-through', color: colors.textSubtle },
  smallBtn: { minHeight: 40, alignSelf: 'flex-start', paddingHorizontal: 0 },
});
