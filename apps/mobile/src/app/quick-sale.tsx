/**
 * Tezkor savdo: katalogdan tovarga bosish -> "Sotish". Bir martalik mijoz uchun 2 ta bosish.
 * Hech narsa "Sotish" bosilmaguncha saqlanmaydi; bosilganda core + SQLite ikki hisobi mos kelsagina yoziladi.
 * Takroriy bosish dublikat yaratmaydi (client_op_id ekran ochilganda bir marta yaratiladi).
 */
import { parseUnitPriceText } from '@hisobchi/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS, type PaymentMethod } from '../data/ledger';
import { useLedger, usePurchasing } from '../data/LedgerProvider';
import { catalogRow } from '../features/catalogView';
import { addProduct, evaluateQuickSale, setQtyText, stepQty, toSaleLines, type QuickLine } from '../features/quickSale';
import { describeSaveError } from '../features/saveErrors';
import { useFocusData } from '../features/useAsync';
import { formatQty, formatSom, UNIT_LABELS } from '../lib/format';
import { Banner, Button, ChipGroup, CompactRow, Field, ListRow, Screen, SectionTitle, Stepper } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

const METHOD_LABELS: Record<PaymentMethod, string> = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };
type Who = 'walkin' | 'regular';

export default function QuickSaleScreen() {
  const { product } = useLocalSearchParams<{ product?: string }>();
  const ledger = useLedger();
  const purchasing = usePurchasing();
  const opId = useRef(randomUUID()).current;
  const [lines, setLines] = useState<QuickLine[]>([]);
  const [who, setWho] = useState<Who>('walkin');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [paidText, setPaidText] = useState('');
  const [search, setSearch] = useState('');
  const [qtyEdit, setQtyEdit] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stock = useFocusData(() => purchasing.listStock({ search }), [purchasing, search]);
  const customers = useFocusData(
    () => (who === 'regular' && !customer ? ledger.listCustomers(customerSearch) : Promise.resolve([])),
    [ledger, who, customer, customerSearch],
  );

  // Katalogdan kelgan tovar darhol qo'shiladi (1 ta bosish)
  const applied = useRef(false);
  useEffect(() => {
    if (!product || applied.current) return;
    applied.current = true;
    void purchasing.listStock().then((rows) => {
      const p = rows.find((r) => r.productId === product);
      if (p) setLines((l) => addProduct(l, p));
    });
  }, [product, purchasing]);

  const kind = who === 'walkin' ? 'one_time' : 'regular';
  const paidParsed = who === 'regular' && paidText.trim() !== '' ? parseUnitPriceText(paidText) : null;
  const paidAmount = paidParsed && paidParsed.ok ? paidParsed.unitPrice : null;
  const ev = evaluateQuickSale(lines, kind, paidAmount);
  const paidError = paidParsed && !paidParsed.ok ? paidParsed.message : null;
  const blocker = paidError ?? ev.blocker ?? (who === 'regular' && !customer ? 'Mijozni tanlang' : null);

  const sell = async () => {
    if (blocker || saving) return;
    setSaving(true);
    setError(null);
    try {
      const customerId = who === 'walkin' ? await ledger.ensureWalkinCustomer() : customer!.id;
      const res = await ledger.postSale({
        clientOpId: opId,
        customerId,
        rawInput: null,
        lines: toSaleLines(lines),
        paid: ev.paid > 0n ? { method, amount: ev.paid } : null,
      });
      router.replace(`/sales/${res.saleId}`);
    } catch (e) {
      setError(describeSaveError(e));
      setSaving(false);
    }
  };

  const editQty = (id: string, text: string) => {
    setQtyEdit({ id, text });
    const r = setQtyText(lines, id, text);
    if (!r.error) setLines(r.lines);
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space.sm }}>
          {ev.profit.unknownCostLines.length < lines.length && lines.length > 0 ? (
            <Text style={type.caption}>
              Foyda (tan narxi ma'lum qatorlar): {formatSom(ev.profit.profit)}
            </Text>
          ) : null}
          <Button
            label={blocker ? (lines.length === 0 ? 'Tovar tanlang' : blocker) : `Sotish — ${formatSom(ev.total)}`}
            size="lg"
            disabled={!!blocker}
            loading={saving}
            onPress={sell}
            accessibilityHint="Savdoni saqlaydi"
          />
        </View>
      }
    >
      {lines.length > 0 ? (
        <View style={s.box}>
          {lines.map((l, i) => {
            const editing = qtyEdit?.id === l.productId;
            const qtyError = editing ? setQtyText(lines, l.productId, qtyEdit.text).error : null;
            return (
              <View key={l.productId} style={s.lineWrap}>
                <View style={s.line}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>{l.name}</Text>
                    <Text style={type.caption}>
                      {formatSom(l.unitPrice)} / {UNIT_LABELS[l.unit]} · {formatSom(ev.lineTotals[i])}
                    </Text>
                  </View>
                  <Stepper
                    accessibilityLabel={`${l.name} miqdori`}
                    label={formatQty(l.qtyMilli)}
                    onLabelPress={() => setQtyEdit(editing ? null : { id: l.productId, text: formatQty(l.qtyMilli) })}
                    onMinus={() => { setQtyEdit(null); setLines(stepQty(lines, l.productId, -1000n)); }}
                    onPlus={() => { setQtyEdit(null); setLines(stepQty(lines, l.productId, 1000n)); }}
                  />
                </View>
                {editing ? (
                  <Field
                    label={`Aniq miqdor (${UNIT_LABELS[l.unit]})`}
                    value={qtyEdit.text}
                    onChangeText={(t) => editQty(l.productId, t)}
                    keyboardType="numbers-and-punctuation"
                    placeholder="masalan 1,5"
                    error={qtyError ?? undefined}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {ev.warnings.map((w) => (
        <Banner key={w} tone="warning">{w}</Banner>
      ))}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <SectionTitle>Mijoz</SectionTitle>
      <ChipGroup<Who>
        accessibilityLabel="Mijoz turi"
        options={[{ value: 'walkin', label: 'Bir martalik' }, { value: 'regular', label: 'Doimiy mijoz' }]}
        value={who}
        onChange={(v) => { setWho(v); setError(null); }}
      />
      {who === 'regular' ? (
        customer ? (
          <ListRow title={customer.name} subtitle="Tanlangan mijoz" right="O'zgartirish" onPress={() => setCustomer(null)} />
        ) : (
          <View style={s.box}>
            <Field label="Mijozni qidirish" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Ism yoki telefon" />
            {(customers.data ?? []).slice(0, 5).map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.outstanding > 0n ? `Qarz: ${formatSom(c.outstanding)}` : "Qarzi yo'q"}
                onPress={() => setCustomer({ id: c.id, name: c.name })}
              />
            ))}
          </View>
        )
      ) : null}

      {lines.length > 0 ? (
        <>
          <SectionTitle>To'lov</SectionTitle>
          <ChipGroup<PaymentMethod>
            accessibilityLabel="To'lov usuli"
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
            value={method}
            onChange={setMethod}
          />
          {who === 'regular' ? (
            <>
              <Field
                label="Berildi (so'm)"
                value={paidText}
                onChangeText={setPaidText}
                keyboardType="numbers-and-punctuation"
                placeholder="Bo'sh = hammasi qarzga"
                error={paidError ?? undefined}
              />
              <Button label="Hammasi to'langan" variant="secondary" onPress={() => setPaidText(ev.total.toString())} />
              {!blocker ? <Text style={type.caption}>Qarzga qoladi: {formatSom(ev.debt)}</Text> : null}
            </>
          ) : (
            <Text style={type.caption}>Bir martalik mijoz qarzga olmaydi: to'liq to'lanadi ({formatSom(ev.total)}).</Text>
          )}
        </>
      ) : null}

      <SectionTitle>Tovar qo'shish</SectionTitle>
      <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Tovar nomi" />
      <View style={s.box}>
        {(stock.data ?? []).slice(0, 40).map((r) => {
          const v = catalogRow(r);
          return (
            <CompactRow
              key={r.productId}
              title={v.name}
              meta={`Qoldiq: ${v.stockText}`}
              tone={v.stockLevel === 'negative' ? 'warning' : 'normal'}
              right={v.priceText}
              onPress={() => setLines((l) => addProduct(l, r))}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  lineWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md},
});
