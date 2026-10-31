import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SaleSort, SaleStatusFilter } from '../../data/ledger';
import { useLedger } from '../../data/LedgerProvider';
import { useFocusData } from '../../features/useAsync';
import { daysAgoIso, formatDateTime, formatSom, shortSaleNumber, startOfTodayIso } from '../../lib/format';
import { Banner, Button, ChipGroup, EmptyState, Field, ListRow, Loading } from '../../ui/components';
import { colors, space, type } from '../../ui/theme';

type Period = 'today' | '7d' | '30d' | 'all';

const PERIODS = [
  { value: 'today', label: 'Bugun' },
  { value: '7d', label: '7 kun' },
  { value: '30d', label: '30 kun' },
  { value: 'all', label: 'Hammasi' },
] as const;
const STATUSES = [
  { value: 'all', label: 'Barcha holat' },
  { value: 'active', label: 'Faol' },
  { value: 'reversed', label: 'Bekor qilingan' },
] as const;
const SORTS = [
  { value: 'newest', label: 'Yangi avval' },
  { value: 'oldest', label: 'Eski avval' },
  { value: 'amount_desc', label: 'Katta summa' },
] as const;

function periodFrom(p: Period): string | undefined {
  if (p === 'today') return startOfTodayIso();
  if (p === '7d') return daysAgoIso(6); // bugun bilan 7 kun — dashboard va hisobot bilan bir xil
  if (p === '30d') return daysAgoIso(30);
  return undefined;
}

export default function SalesHistoryScreen() {
  const ledger = useLedger();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [status, setStatus] = useState<SaleStatusFilter>('all');
  const [sort, setSort] = useState<SaleSort>('newest');
  const [showHidden, setShowHidden] = useState(false);

  const { data, error, loading, reload } = useFocusData(
    () => ledger.listSales({ search, from: periodFrom(period), status, sort, includeHidden: showHidden, limit: 500 }),
    [ledger, search, period, status, sort, showHidden],
  );

  const active = (data ?? []).filter((s) => !s.reversal);
  const activeTotal = active.reduce((sum, s) => sum + s.total, 0n);
  const filtered = search.trim() !== '' || period !== 'all' || status !== 'all';

  const header = (
    <View style={s.filters}>
      <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Mijoz yoki mahsulot nomi" />
      <ChipGroup accessibilityLabel="Davr" options={PERIODS} value={period} onChange={setPeriod} />
      <ChipGroup accessibilityLabel="Holat" options={STATUSES} value={status} onChange={setStatus} />
      <ChipGroup accessibilityLabel="Saralash" options={SORTS} value={sort} onChange={setSort} />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: showHidden }}
        onPress={() => setShowHidden((v) => !v)}
        style={s.toggle}
      >
        <View style={[s.toggleBox, showHidden && s.toggleBoxOn]}>{showHidden ? <Text style={s.toggleMark}>✓</Text> : null}</View>
        <Text style={type.body}>Yashirilgan savdolarni ham ko'rsatish</Text>
      </Pressable>
      {data ? (
        <Text style={type.caption}>
          {`${data.length} ta savdo · faollari jami ${formatSom(activeTotal)}`}
          {data.length >= 500 ? ' · faqat oxirgi 500 tasi' : ''}
        </Text>
      ) : null}
      {error ? (
        <Banner tone="error" title="Tarix yuklanmadi">
          <Text style={type.body}>{error}</Text>
          <Button label="Qayta urinish" variant="secondary" onPress={reload} />
        </Banner>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(x) => x.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ListRow
          title={item.customerName ?? 'Umumiy xaridor'}
          subtitle={`${formatDateTime(item.createdAt)} · ${shortSaleNumber(item.id)} · ${item.lineCount} ta mahsulot`}
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
      )}
      ListEmptyComponent={
        loading && !data ? (
          <Loading />
        ) : error ? undefined : filtered ? (
          <EmptyState icon="search" title="Mos savdo topilmadi" text="Qidiruv yoki filtrlarni o'zgartirib ko'ring." />
        ) : (
          <EmptyState
            icon="receipt-outline"
            title="Saqlangan savdolar yo'q"
            text="Tasdiqlangan savdolar shu yerda sana bo'yicha ko'rinadi."
            action={<Button label="Yangi savdo" onPress={() => router.push('/new')} />}
          />
        )
      }
    />
  );
}

const s = StyleSheet.create({
  filters: { padding: space.lg, paddingBottom: space.sm, gap: space.xs, backgroundColor: colors.bg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  toggleBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  toggleBoxOn: { backgroundColor: colors.blue },
  toggleMark: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
