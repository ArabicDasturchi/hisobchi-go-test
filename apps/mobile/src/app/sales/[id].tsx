import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AlreadyReversedError, SaleValidationError, type SaleDetail } from '../../data/ledger';
import { useAuth } from '../../backend/AuthProvider';
import { isPushed } from '../../backend/sync';
import { useLedger, useSqlDb } from '../../data/LedgerProvider';
import { useSync } from '../../backend/SyncProvider';
import { useFocusData } from '../../features/useAsync';
import { formatDateTime, formatQty, formatSom, shortSaleNumber, UNIT_LABELS } from '../../lib/format';
import { Badge, Banner, Button, Card, EmptyState, Field, Loading, Screen, SectionTitle } from '../../ui/components';
import { colors, font, radius, space, type } from '../../ui/theme';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ledger = useLedger();
  const { data: sale, error, loading, reload } = useFocusData(() => ledger.getSale(id), [ledger, id]);
  const auth = useAuth();
  const sql = useSqlDb();
  const sync = useSync();
  // null — bulut rejimi emas; true/false — server tasdiqlaganmi (sync_log)
  const { data: cloud } = useFocusData(
    async () => (auth.shopId ? isPushed(sql, auth.shopId, 'sale', id) : null),
    [sql, auth.shopId, id, sync.pending],
  );

  if (loading && !sale) return <Loading />;
  if (error) {
    return (
      <Screen>
        <Banner tone="error" title="Savdo yuklanmadi">
          <Text style={type.body}>{error}</Text>
          <Button label="Qayta urinish" variant="secondary" onPress={reload} />
        </Banner>
      </Screen>
    );
  }
  if (!sale) return <EmptyState icon="receipt-outline" title="Savdo topilmadi" />;

  return (
    <Screen>
      <View style={s.totalBox}>
        <View style={s.totalTop}>
          <Text style={s.number}>{shortSaleNumber(sale.id)}</Text>
          <Badge
            label={sale.reversal ? 'Bekor qilingan' : 'Saqlangan'}
            tone={sale.reversal ? 'danger' : 'success'}
          />
        </View>
        <Text style={[s.totalValue, sale.reversal && s.totalReversed]} numberOfLines={1} adjustsFontSizeToFit>
          {formatSom(sale.total)}
        </Text>
        <Text style={s.meta}>
          {formatDateTime(sale.createdAt)} · {sale.customerName ?? 'Umumiy xaridor'}
        </Text>
        {sale.hidden ? <Text style={s.meta}>Tarix ro'yxatidan yashirilgan</Text> : null}
      </View>

      {sale.reversal ? (
        <Banner tone="error" title="Bu savdo bekor qilingan">
          {`${formatDateTime(sale.reversal.createdAt)} — sabab: ${sale.reversal.reason}\nMijoz balansi va savdo summalaridan chiqarilgan. Asl yozuv audit uchun saqlanadi.`}
        </Banner>
      ) : (
        <Text style={s.verified}>
          ✓ Ikki mustaqil hisob mos kelgan (TypeScript {formatSom(sale.tsTotal)}, SQLite {formatSom(sale.sqlTotal)})
        </Text>
      )}

      {cloud === true ? (
        <Text style={s.cloudOk}>Bulutda saqlangan (server tasdiqlagan)</Text>
      ) : cloud === false ? (
        <Text style={s.cloudPending}>Bulutga hali yuborilmagan — internet bo'lganda avtomatik yuboriladi</Text>
      ) : null}

      <Card>
        <SectionTitle>Mahsulotlar ({sale.lines.length})</SectionTitle>
        {sale.lines.map((l) => (
          <View key={l.lineIndex} style={s.line}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{l.productName}</Text>
              <Text style={type.caption}>
                {formatQty(l.qtyMilli)} {UNIT_LABELS[l.unit] ?? l.unit} × {formatSom(l.unitPrice)}
              </Text>
              {l.rawText ? <Text style={s.raw}>«{l.rawText}»</Text> : null}
            </View>
            <Text style={type.money}>{formatSom(l.lineTotal)}</Text>
          </View>
        ))}
        <View style={s.sumRow}>
          <Text style={type.heading}>Jami</Text>
          <Text style={[type.money, { fontSize: font.lg }]}>{formatSom(sale.total)}</Text>
        </View>
      </Card>

      {sale.customerId ? (
        <Button
          label={`Mijoz: ${sale.customerName ?? ''}`}
          variant="secondary"
          onPress={() => router.push(`/customers/${sale.customerId}`)}
        />
      ) : null}

      {sale.rawInput ? (
        <Card>
          <SectionTitle>Kiritilgan asl matn</SectionTitle>
          <Text style={type.body} selectable>
            {sale.rawInput}
          </Text>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Amallar</SectionTitle>
        <HideAction sale={sale} onDone={reload} />
        {sale.reversal ? null : <ReverseSaleCard sale={sale} onDone={reload} />}
      </Card>

      <Text style={s.opId} selectable>
        To'liq ID: {sale.id}
      </Text>
    </Screen>
  );
}

/** Tarixdan yashirish — faqat ro'yxatdagi ko'rinish; moliyaviy ta'siri yo'q, qaytarsa bo'ladi */
function HideAction({ sale, onDone }: { sale: SaleDetail; onDone: () => void }) {
  const ledger = useLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (hidden: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await ledger.setSaleHidden(sale.id, hidden);
      onDone();
    } catch (e) {
      setError(`Amal bajarilmadi. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (sale.hidden) {
      void apply(false);
      return;
    }
    Alert.alert(
      'Tarixdan yashirish',
      "Savdo tarix ro'yxatidan olib tashlanadi. Summalar, mijoz balansi va hisobotlar O'ZGARMAYDI — pulni qaytarish uchun «Savdoni bekor qilish»dan foydalaning. Keyin «Yashirilganlarni ko'rsatish» orqali qaytarish mumkin.",
      [
        { text: 'Bekor qilish', style: 'cancel' },
        { text: 'Yashirish', onPress: () => void apply(true) },
      ],
    );
  };

  return (
    <View style={{ gap: space.xs }}>
      <Button
        label={sale.hidden ? "Tarixda qayta ko'rsatish" : 'Tarixdan yashirish'}
        variant="secondary"
        onPress={onPress}
        loading={busy}
      />
      <Text style={type.caption}>Faqat ko'rinish uchun — moliyaviy yozuvlarga ta'sir qilmaydi.</Text>
      {error ? <Banner tone="error">{error}</Banner> : null}
    </View>
  );
}

/** Savdoni bekor qilish: asl yozuv o'chirilmaydi, qarama-qarshi yozuv qo'shiladi */
function ReverseSaleCard({ sale, onDone }: { sale: SaleDetail; onDone: () => void }) {
  const ledger = useLedger();
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opId = useRef(randomUUID()); // bitta ekran — bitta amal: takroriy bosish ikkinchi yozuv yaratmaydi

  const submit = () => {
    if (reason.trim().length < 3) {
      setError('Sababni yozing (kamida 3 ta belgi).');
      return;
    }
    Alert.alert(
      'Savdoni bekor qilish',
      `${formatSom(sale.total)} — ${sale.customerName ?? 'Umumiy xaridor'}. Summa mijoz balansi va hisobotlardan chiqariladi. Bu amalni qaytarib bo'lmaydi. Davom etasizmi?`,
      [
        { text: "Yo'q", style: 'cancel' },
        {
          text: 'Bekor qilish',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await ledger.reverseSale({ saleId: sale.id, reason, clientOpId: opId.current });
              sync.requestSync();
              onDone();
            } catch (e) {
              setError(
                e instanceof AlreadyReversedError || e instanceof SaleValidationError
                  ? e.message
                  : `Bekor qilinmadi, hech narsa o'zgarmadi. Qayta urinib ko'ring. (${e instanceof Error ? e.message : String(e)})`,
              );
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!open) {
    return (
      <View style={{ gap: space.xs, marginTop: space.md }}>
        <Button label="Savdoni bekor qilish" variant="danger" onPress={() => setOpen(true)} />
        <Text style={type.caption}>Pul/qaytarish holati uchun: summa hisobotlardan chiqariladi, yozuv saqlanadi.</Text>
      </View>
    );
  }
  return (
    <View style={s.reverseBox}>
      <Text style={type.heading}>Savdoni bekor qilish</Text>
      <Text style={type.caption}>Asl savdo tarixda qoladi va «bekor qilingan» deb belgilanadi.</Text>
      <Field
        label="Sabab *"
        value={reason}
        onChangeText={(v) => {
          setReason(v);
          if (error) setError(null);
        }}
        placeholder="masalan: noto'g'ri narx kiritildi"
        error={error ?? undefined}
      />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button label="Yopish" variant="secondary" style={{ flex: 1 }} onPress={() => setOpen(false)} disabled={busy} />
        <Button label="Tasdiqlash" variant="danger" style={{ flex: 1 }} onPress={submit} loading={busy} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  totalBox: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.xl, gap: space.xs },
  totalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { color: colors.onPrimaryMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { ...type.moneyLarge, color: colors.onPrimary },
  totalReversed: { textDecorationLine: 'line-through', opacity: 0.8 },
  meta: { color: colors.onPrimaryMuted, fontSize: font.sm },
  verified: { ...type.caption, color: colors.success },
  cloudOk: { ...type.caption, color: colors.success },
  cloudPending: { ...type.caption, color: colors.warningText },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  raw: { fontSize: font.sm, color: colors.textSubtle, fontStyle: 'italic' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.md },
  reverseBox: { marginTop: space.md, gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  opId: { fontSize: 11, color: colors.textSubtle, textAlign: 'center' },
});
