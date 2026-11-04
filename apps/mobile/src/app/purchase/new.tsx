/**
 * Kirim qilish: ta'minotchi + sana + tovarlar (miqdor, tan narx) + berildi.
 * Ko'rinish: Eski + Tovar = Jami, Berildi, Ostatka. "Saqlash" bosilgunga qadar hech narsa yozilmaydi.
 * Tan narx oxirgi kirimdan oldindan to'ldiriladi (tahrirlanadi). Saqlangan kirim tan narxni yangilaydi.
 */
import { tashkentDate } from '@hisobchi/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS, type PaymentMethod } from '../../data/ledger';
import { usePurchasing } from '../../data/LedgerProvider';
import { parseDateInput } from '../../features/books';
import { catalogRow } from '../../features/catalogView';
import { addPurchaseLine, evaluatePurchase, removePurchaseLine, updatePurchaseLine, type PurchaseFormLine } from '../../features/purchaseForm';
import { describeSaveError } from '../../features/saveErrors';
import { useFocusData } from '../../features/useAsync';
import { formatSom, UNIT_LABELS } from '../../lib/format';
import { Banner, Button, ChipGroup, CompactRow, Field, ListRow, Screen, SectionTitle, SettlementBox } from '../../ui/components';
import { colors, radius, space, type } from '../../ui/theme';

const METHOD_LABELS: Record<PaymentMethod, string> = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };

export default function NewPurchaseScreen() {
  const { supplier: supplierParam } = useLocalSearchParams<{ supplier?: string }>();
  const purchasing = usePurchasing();
  const opId = useRef(randomUUID()).current;
  const [supplierId, setSupplierId] = useState<string | null>(supplierParam ?? null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [dateText, setDateText] = useState('');
  const [lines, setLines] = useState<PurchaseFormLine[]>([]);
  const [paidText, setPaidText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suppliers = useFocusData(() => purchasing.listSuppliers({ search: supplierSearch }), [purchasing, supplierSearch]);
  const selected = useFocusData(() => (supplierId ? purchasing.getSupplier(supplierId) : Promise.resolve(null)), [purchasing, supplierId]);
  const stock = useFocusData(() => purchasing.listStock({ search }), [purchasing, search]);

  const opening = selected.data?.outstanding ?? 0n;
  const ev = evaluatePurchase(lines, opening, paidText);
  const date = parseDateInput(dateText);
  const blocker = !supplierId ? "Ta'minotchini tanlang" : !date.ok ? date.message : ev.blocker;

  const addSupplier = async () => {
    try {
      const id = await purchasing.saveSupplier({ name: newSupplier });
      setNewSupplier('');
      setSupplierId(id);
    } catch (e) {
      setError(describeSaveError(e));
    }
  };

  const save = async () => {
    if (blocker || !supplierId || !date.ok || !ev.settlement || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await purchasing.postPurchase({
        clientOpId: opId,
        supplierId,
        docDate: date.date ?? tashkentDate(new Date().toISOString()),
        lines: ev.lines,
        paid: ev.settlement.paid > 0n ? { method, amount: ev.settlement.paid } : null,
      });
      router.replace(`/purchases/${res.purchaseId}`);
    } catch (e) {
      setError(describeSaveError(e));
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={blocker ? (lines.length === 0 && supplierId ? 'Tovar tanlang' : blocker) : `Saqlash — ${formatSom(ev.goods)}`}
          size="lg"
          disabled={!!blocker}
          loading={saving}
          onPress={save}
          accessibilityHint="Kirimni saqlaydi"
        />
      }
    >
      <SectionTitle>Ta'minotchi</SectionTitle>
      {selected.data ? (
        <ListRow
          title={selected.data.name}
          subtitle={`Hozirgi qoldiq (Eski): ${formatSom(selected.data.outstanding)}`}
          right="O'zgartirish"
          onPress={() => setSupplierId(null)}
        />
      ) : (
        <View style={s.box}>
          <Field label="Qidirish" value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Ta'minotchi nomi" />
          {(suppliers.data ?? []).slice(0, 6).map((x) => (
            <ListRow key={x.id} title={x.name} subtitle={x.outstanding > 0n ? `Qarz: ${formatSom(x.outstanding)}` : "Qarz yo'q"} onPress={() => setSupplierId(x.id)} />
          ))}
          <View style={{ padding: space.md, gap: space.sm }}>
            <Field label="Yangi ta'minotchi" value={newSupplier} onChangeText={setNewSupplier} placeholder="Nomi" />
            <Button label="Qo'shish" variant="secondary" disabled={!newSupplier.trim()} onPress={addSupplier} />
          </View>
        </View>
      )}

      <Field
        label="Sana (bo'sh = bugun)"
        value={dateText}
        onChangeText={setDateText}
        placeholder="kun.oy.yil yoki yil-oy-kun"
        error={!date.ok ? date.message : undefined}
      />

      {lines.length > 0 ? (
        <View style={s.box}>
          {lines.map((l, i) => (
            <View key={l.productId} style={s.line}>
              <View style={s.lineHead}>
                <Text style={type.bodyStrong} numberOfLines={1}>{l.name}</Text>
                <Button label="Olib tashlash" variant="ghost" onPress={() => setLines(removePurchaseLine(lines, l.productId))} />
              </View>
              <View style={s.lineFields}>
                <Field style={{ flex: 1 }} label={`Miqdor (${UNIT_LABELS[l.unit]})`} value={l.qtyText} keyboardType="numbers-and-punctuation" onChangeText={(t) => setLines(updatePurchaseLine(lines, l.productId, { qtyText: t }))} />
                <Field style={{ flex: 1 }} label="Tan narx (so'm)" value={l.costText} keyboardType="numbers-and-punctuation" onChangeText={(t) => setLines(updatePurchaseLine(lines, l.productId, { costText: t }))} />
              </View>
              {ev.lineErrors.get(i) ? <Text style={s.err}>{ev.lineErrors.get(i)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {ev.settlement ? (
        <>
          <SectionTitle>Hisob</SectionTitle>
          <SettlementBox {...ev.settlement} format={formatSom} />
        </>
      ) : null}

      {lines.length > 0 ? (
        <>
          <SectionTitle>To'lov</SectionTitle>
          <Field label="Berildi (so'm, bo'sh = 0)" value={paidText} onChangeText={setPaidText} keyboardType="numbers-and-punctuation" placeholder="masalan 1 000 000" />
          <ChipGroup<PaymentMethod>
            accessibilityLabel="To'lov usuli"
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
            value={method}
            onChange={setMethod}
          />
        </>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

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
              tone={lines.some((l) => l.productId === r.productId) ? 'muted' : 'normal'}
              right={v.costText ? `tan ${v.costText}` : "tan narx yo'q"}
              onPress={() => setLines(addPurchaseLine(lines, r))}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  line: { padding: space.md, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineFields: { flexDirection: 'row', gap: space.md },
  err: { color: colors.danger, fontSize: 12 },
});
