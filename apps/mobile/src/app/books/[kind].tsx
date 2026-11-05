/**
 * Kirim daftari (kind=in) va Chiqim daftari (kind=out). Ikki ko'rinish:
 *  - Sana bo'yicha: kun guruhlari, har kun jami, hujjatga bosilsa tafsilot (bekor qilish shu yerdan).
 *  - Hamkor bo'yicha: Eski / Tovar / Jami / Berildi / Ostatka (tanlangan davr uchun).
 * Qidiruv va sana filtri. Tahrirlash yo'q; xato bo'lsa hujjat tafsilotida teskari yozuv bilan bekor qilinadi.
 */
import { sumAmounts, tashkentDate } from '@hisobchi/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { partnerBook } from '../../data/books';
import { useLedger, usePurchasing } from '../../data/LedgerProvider';
import { displayDate, groupByDate, inRange, parseDateInput, presetRange, validRange, type DatePreset, type DateRange } from '../../features/books';
import { useFocusData } from '../../features/useAsync';
import { formatDateTime, formatSom } from '../../lib/format';
import { Banner, Card, ChipGroup, CompactRow, EmptyState, Field, Loading, SectionTitle, SettlementBox } from '../../ui/components';
import { colors, radius, space, type } from '../../ui/theme';

type View_ = 'date' | 'partner';
type Item = { id: string; date: string; title: string; meta: string; amount: bigint; reversed: boolean };

export default function BookScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind: string }>();
  const kind = kindParam === 'out' ? 'out' : 'in';
  const ledger = useLedger();
  const purchasing = usePurchasing();
  const [view, setView] = useState<View_>('date');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [search, setSearch] = useState('');

  const from = parseDateInput(fromText);
  const to = parseDateInput(toText);
  const nowIso = new Date().toISOString();
  const range: DateRange =
    preset === 'custom'
      ? { from: from.ok ? from.date : null, to: to.ok ? to.date : null }
      : presetRange(preset, nowIso);
  const rangeError = (preset === 'custom' && (!from.ok ? from.message : !to.ok ? to.message : null)) || validRange(range);

  const { data, error, loading } = useFocusData(async () => {
    if (rangeError) return null;
    if (view === 'partner') return { partners: await partnerBook(kind, range, search, { ledger, purchasing }), items: [] as Item[] };
    const q = search.trim().toLowerCase();
    let items: Item[];
    if (kind === 'in') {
      items = (await purchasing.listPurchases({ fromDate: range.from ?? undefined, toDate: range.to ?? undefined, limit: 2000 }))
        .map((p) => ({ id: p.id, date: p.docDate, title: p.supplierName, meta: `${p.lineCount} ta tovar`, amount: p.total, reversed: p.reversal !== null }));
    } else {
      items = (await ledger.listSales({ limit: 5000 }))
        .map((x) => ({ id: x.id, date: tashkentDate(x.createdAt), title: x.customerName ?? 'Umumiy xaridor', meta: `${formatDateTime(x.createdAt)} · ${x.lineCount} ta tovar`, amount: x.total, reversed: x.reversal !== null }))
        .filter((x) => inRange(x.date, range));
    }
    if (q) items = items.filter((x) => x.title.toLowerCase().includes(q));
    return { partners: [], items };
  }, [ledger, purchasing, kind, view, search, range.from, range.to, rangeError]);

  const groups = groupByDate(data?.items ?? []);
  const title = kind === 'in' ? 'Kirim daftari' : 'Chiqim daftari';

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>{title}</Text>
      <ChipGroup<View_>
        accessibilityLabel="Ko'rinish"
        options={[{ value: 'date', label: 'Sana bo\'yicha' }, { value: 'partner', label: kind === 'in' ? "Ta'minotchi bo'yicha" : "Mijoz bo'yicha" }]}
        value={view}
        onChange={setView}
      />
      <ChipGroup<DatePreset>
        accessibilityLabel="Davr"
        options={[
          { value: 'today', label: 'Bugun' },
          { value: 'week', label: '7 kun' },
          { value: 'month', label: 'Shu oy' },
          { value: 'all', label: 'Hammasi' },
          { value: 'custom', label: 'Sana tanlash' },
        ]}
        value={preset}
        onChange={setPreset}
      />
      {preset === 'custom' ? (
        <View style={s.dates}>
          <Field style={{ flex: 1 }} label="Dan" value={fromText} onChangeText={setFromText} placeholder="kun.oy.yil" />
          <Field style={{ flex: 1 }} label="Gacha" value={toText} onChangeText={setToText} placeholder="kun.oy.yil" />
        </View>
      ) : null}
      {rangeError ? <Banner tone="error">{rangeError}</Banner> : null}
      <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder={kind === 'in' ? "Ta'minotchi nomi" : 'Mijoz nomi'} />
      <Text style={type.caption}>
        Davr: {range.from ? displayDate(range.from) : 'boshidan'} — {range.to ? displayDate(range.to) : 'hozirgacha'}. Bekor qilingan hujjatlar jamiga kirmaydi.
      </Text>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading && !data ? (
        <Loading />
      ) : view === 'date' ? (
        groups.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Hujjat topilmadi" text="Davrni yoki qidiruvni o'zgartiring." />
        ) : (
          groups.map((g) => {
            const dayTotal = sumAmounts(g.items.filter((x) => !x.reversed).map((x) => x.amount));
            return (
              <View key={g.date} style={{ gap: space.xs }}>
                <SectionTitle action={<Text style={type.money}>{formatSom(dayTotal)}</Text>}>{displayDate(g.date)}</SectionTitle>
                <View style={s.box}>
                  {g.items.map((x) => (
                    <CompactRow
                      key={x.id}
                      title={x.title}
                      meta={x.reversed ? `${x.meta} · bekor qilingan` : x.meta}
                      tone={x.reversed ? 'muted' : 'normal'}
                      right={formatSom(x.amount)}
                      onPress={() => router.push(kind === 'in' ? `/purchases/${x.id}` : `/sales/${x.id}`)}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )
      ) : (data?.partners ?? []).length === 0 ? (
        <EmptyState icon="people-outline" title="Harakat topilmadi" text="Tanlangan davrda hamkor bo'yicha yozuv yo'q." />
      ) : (
        data!.partners.map((r) => (
          <Card key={r.partnerId} style={{ gap: space.sm }}>
            <Text
              style={type.heading}
              onPress={() => router.push(kind === 'in' ? `/suppliers/${r.partnerId}` : `/customers/${r.partnerId}`)}
              accessibilityRole="button"
            >
              {r.name}
            </Text>
            <SettlementBox {...r.settlement} format={formatSom} />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  dates: { flexDirection: 'row', gap: space.md },
  box: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
});
