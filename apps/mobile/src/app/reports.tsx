import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../data/LedgerProvider';
import { useFocusData } from '../features/useAsync';
import { daysAgoIso, formatSom, startOfTodayIso } from '../lib/format';
import { salesByDay } from '../lib/reports';
import { Banner, Card, ChipGroup, ListRow, Loading, SectionTitle, StatTile } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

const WEEKDAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

/** Hisobotlar — barchasi SQLite'dagi haqiqiy yozuvlardan, dashboard bilan bir xil qoidada */
export default function ReportsScreen() {
  const ledger = useLedger();
  const [period, setPeriod] = useState<'1' | '7' | '30'>('7');
  const periodDays = Number(period);
  const { data, error, loading } = useFocusData(async () => {
    const weekFrom = daysAgoIso(periodDays - 1); // bugun bilan `periodDays` kun
    const [stats, weekSales, customers, payments] = await Promise.all([
      ledger.dashboard(startOfTodayIso(), weekFrom),
      ledger.listSales({ from: weekFrom, includeHidden: true, limit: 5000 }),
      ledger.listCustomers(),
      ledger.listPayments({ from: weekFrom }),
    ]);
    return { stats, days: salesByDay(weekSales, periodDays), customers, payments };
  }, [ledger, periodDays]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <Banner tone="error" title="Hisobot yuklanmadi">{error ?? ''}</Banner>;

  const { stats, days, customers, payments } = data;
  const week = days.reduce(
    (a, d) => ({
      active: a.active + d.activeTotal,
      activeCount: a.activeCount + d.activeCount,
      reversed: a.reversed + d.reversedTotal,
      reversedCount: a.reversedCount + d.reversedCount,
    }),
    { active: 0n, activeCount: 0, reversed: 0n, reversedCount: 0 },
  );
  const max = days.reduce((m, d) => (d.activeTotal > m ? d.activeTotal : m), 0n);
  const weekPaid = payments.filter((p) => !p.void).reduce((sum, p) => sum + p.amount, 0n);
  const debtors = customers.filter((c) => c.outstanding > 0n).sort((a, b) => (b.outstanding > a.outstanding ? 1 : -1));

  return (
    <ScrollView contentContainerStyle={s.container}>
      <ChipGroup
        accessibilityLabel="Hisobot davri"
        options={[
          { value: '1', label: 'Bugun' },
          { value: '7', label: '7 kun' },
          { value: '30', label: '30 kun' },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <View style={s.row}>
        <StatTile style={s.half} label="Bugun" value={formatSom(stats.today.total)} hint={`${stats.today.count} ta savdo`} />
        <StatTile style={s.half} label={`${periodDays} kun`} value={formatSom(week.active)} hint={`${week.activeCount} ta savdo`} />
      </View>
      <View style={s.row}>
        <StatTile style={s.half} label={`Bekor qilingan (${periodDays} kun)`} value={formatSom(week.reversed)} hint={`${week.reversedCount} ta savdo`} />
        <StatTile style={s.half} label={`To'lovlar (${periodDays} kun)`} value={formatSom(weekPaid)} hint={`${payments.filter((p) => !p.void).length} ta`} />
      </View>

      <Card>
        <SectionTitle>Kunlar bo'yicha (faol savdolar)</SectionTitle>
        {days.map((d) => {
          const date = new Date(`${d.day}T12:00:00`);
          const width = max > 0n ? Number((d.activeTotal * 100n) / max) : 0;
          return (
            <View key={d.day} style={s.dayRow} accessible accessibilityLabel={`${d.day}: ${formatSom(d.activeTotal)}`}>
              <Text style={s.dayLabel}>
                {WEEKDAYS[date.getDay()]} {d.day.slice(8)}.{d.day.slice(5, 7)}
              </Text>
              <View style={s.barTrack}>
                <View style={[s.bar, { width: `${width}%` }]} />
              </View>
              <Text style={s.dayValue}>{formatSom(d.activeTotal)}</Text>
            </View>
          );
        })}
        <Text style={type.caption}>Bekor qilingan savdolar kiritilmagan. Savdo qilingan kun bo'yicha.</Text>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: space.lg, paddingBottom: space.sm }}>
          <SectionTitle>Qarzdor mijozlar</SectionTitle>
          <Text style={type.caption}>Jami qarz: {formatSom(stats.outstandingTotal)} · qarz = savdo − to'lov</Text>
        </View>
        {debtors.length === 0 ? (
          <Text style={[type.body, { padding: space.lg, paddingTop: 0 }]}>Qarzdor mijoz yo'q.</Text>
        ) : (
          debtors.slice(0, 10).map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`Savdo ${formatSom(c.balance)} · to'langan ${formatSom(c.paid)}`}
              right={formatSom(c.outstanding)}
              onPress={() => router.push(`/customers/${c.id}`)}
            />
          ))
        )}
      </Card>

      <Text style={s.footnote}>Jami: {stats.activeCount} ta faol, {stats.reversedCount} ta bekor qilingan savdo (barcha vaqt).</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  dayLabel: { ...type.caption, width: 72 },
  barTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  dayValue: { ...type.money, fontSize: 13, minWidth: 96, textAlign: 'right' },
  footnote: { ...type.caption, textAlign: 'center' },
});
