import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../data/LedgerProvider';
import { MinimalDiagnosticScreen, useMinimalDiagnosticScreen } from '../../diagnostics/minimalScreen';
import { startupLog, useStartupMark } from '../../diagnostics/startupLog';
import { useDraft } from '../../features/DraftContext';
import { SyncStatus } from '../../features/SyncStatus';
import { summarizeDraft } from '../../features/draft';
import { useFocusData } from '../../features/useAsync';
import { daysAgoIso, formatDateTime, formatSom, startOfTodayIso } from '../../lib/format';
import { Banner, Button, Card, EmptyState, ListRow, Loading, SectionTitle, StatTile } from '../../ui/components';
import { colors, font, radius, space, type } from '../../ui/theme';

export default function HomeRoute() {
  return useMinimalDiagnosticScreen() ? <MinimalDiagnosticScreen /> : <HomeScreen />;
}

/** Bosh sahifa — barcha ko'rsatkichlar qurilmadagi SQLite'dagi haqiqiy yozuvlardan */
function HomeScreen() {
  useStartupMark('HomeScreen');
  const ledger = useLedger();
  const { data, error, loading, reload } = useFocusData(
    async () => {
      const result = {
        stats: await ledger.dashboard(startOfTodayIso(), daysAgoIso(6)),
        recent: await ledger.listSales({ limit: 5 }),
      };
      startupLog(`HomeScreen: ma'lumot yuklandi (so'nggi savdolar: ${result.recent.length})`);
      return result;
    },
    [ledger],
  );
  const stats = data?.stats;

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.hero}>
        <Text style={s.heroLabel}>Bugungi savdo</Text>
        <Text style={s.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {stats ? formatSom(stats.today.total) : '—'}
        </Text>
        <Text style={s.heroMeta}>
          {stats ? `${stats.today.count} ta savdo · bekor qilinganlar hisobga olinmagan` : ' '}
        </Text>
        <Button
          label="Yangi savdo"
          icon="add"
          size="lg"
          variant="secondary"
          style={s.heroButton}
          onPress={() => router.push('/new')}
          accessibilityHint="Mahsulot ro'yxatini kiritish"
        />
      </View>

      <DraftResumeCard />

      {error ? (
        <Banner tone="error" title="Ma'lumot yuklanmadi">
          <Text style={type.body}>{error}</Text>
          <Button label="Qayta urinish" variant="secondary" onPress={reload} />
        </Banner>
      ) : null}

      <View style={s.row}>
        <StatTile
          style={s.half}
          label="So'nggi 7 kun"
          value={stats ? formatSom(stats.last7Days.total) : '—'}
          hint={stats ? `${stats.last7Days.count} ta savdo` : undefined}
        />
        <StatTile
          style={s.half}
          label="Mijozlar qarzi"
          value={stats ? formatSom(stats.outstandingTotal) : '—'}
          hint={stats ? `${stats.customerCount} ta mijoz` : undefined}
        />
      </View>

      <View style={s.row}>
        <StatTile
          style={s.half}
          label="Bugungi to'lovlar"
          value={stats ? formatSom(stats.paymentsToday.total) : '—'}
          hint={stats ? `${stats.paymentsToday.count} ta to'lov` : undefined}
        />
        <StatTile
          style={s.half}
          label="Savdolar holati"
          value={stats ? `${stats.activeCount} faol` : '—'}
          hint={stats ? `${stats.reversedCount} ta bekor qilingan` : undefined}
        />
      </View>

      <View style={s.row}>
        <Button label="Mijoz qo'shish" variant="secondary" style={s.half} onPress={() => router.push('/customers/form')} />
        <Button label="Hisobotlar" variant="secondary" style={s.half} onPress={() => router.push('/reports')} />
      </View>

      <Card style={s.listCard}>
        <View style={s.listHeader}>
          <SectionTitle
            action={
              data && data.recent.length > 0 ? (
                <Button label="Barchasi" variant="ghost" style={s.linkBtn} onPress={() => router.push('/sales')} />
              ) : undefined
            }
          >
            So'nggi savdolar
          </SectionTitle>
        </View>
        {loading && !data ? (
          <Loading />
        ) : data && data.recent.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Hali savdo yo'q"
            text="«Yangi savdo» tugmasini bosing, mahsulotlarni oddiy matnda yozing — hisobni ilova bajaradi."
          />
        ) : (
          data?.recent.map((sale) => (
            <ListRow
              key={sale.id}
              title={sale.customerName ?? 'Umumiy xaridor'}
              subtitle={`${formatDateTime(sale.createdAt)} · ${sale.lineCount} ta mahsulot`}
              right={formatSom(sale.total)}
              rightMuted={sale.reversal !== null}
              badge={sale.reversal ? { label: 'Bekor qilingan', tone: 'danger' } : undefined}
              onPress={() => router.push(`/sales/${sale.id}`)}
            />
          ))
        )}
      </Card>

      <SyncStatus />
    </ScrollView>
  );
}

/** Tugallanmagan (saqlanmagan) hisob — ilova qayta ochilganda ham tiklanadi */
function DraftResumeCard() {
  const { draft, ready, savedAt, corrupt, discard } = useDraft();
  const confirmDiscard = () =>
    Alert.alert(
      "Qoralamani o'chirish",
      "Tugallanmagan hisob o'chiriladi. Saqlangan savdolarga ta'sir qilmaydi. Davom etasizmi?",
      [
        { text: 'Bekor qilish', style: 'cancel' },
        { text: "O'chirish", style: 'destructive', onPress: () => void discard() },
      ],
    );

  if (!ready) return null;
  if (corrupt) {
    return (
      <Banner tone="warning" title="Qoralamani tiklab bo'lmadi">
        <Text style={s.draftMeta}>
          {`Saqlangan qoralama o'qilmadi (${corrupt.reason}). Saqlangan savdolar xavfsiz.`}
        </Text>
        <Button label="Qoralamani o'chirish" variant="secondary" onPress={confirmDiscard} />
      </Banner>
    );
  }
  if (!draft) return null;

  const summary = summarizeDraft(draft.rows);
  const unresolved = summary.errorRows + summary.warningRows;
  return (
    <Card style={s.draftCard}>
      <Text style={s.draftTitle}>Tugallanmagan hisob</Text>
      <Text style={s.draftMeta}>
        {`${draft.rows.length} ta qator · taxminiy ${formatSom(summary.previewTotal)}`}
        {unresolved > 0 ? ` · ${unresolved} ta qator tekshirilishi kerak` : ''}
      </Text>
      {savedAt ? <Text style={s.draftMeta}>Avtomatik saqlangan: {formatDateTime(savedAt)}</Text> : null}
      <View style={s.row}>
        <Button
          label="Davom ettirish"
          style={s.half}
          onPress={() => router.push(draft.rows.length > 0 ? '/review' : '/new')}
        />
        <Button label="O'chirish" variant="secondary" style={s.half} onPress={confirmDiscard} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.xl, gap: space.xs },
  heroLabel: { ...type.label, color: colors.onPrimaryMuted },
  heroValue: { ...type.moneyLarge, color: colors.onPrimary, fontSize: 34 },
  heroMeta: { color: colors.onPrimaryMuted, fontSize: font.sm },
  heroButton: { marginTop: space.lg, borderColor: colors.onPrimary },
  draftCard: { borderColor: colors.warningBorder, backgroundColor: colors.warningBg, gap: space.sm },
  draftTitle: { fontSize: font.lg, fontWeight: '700', color: colors.warningText },
  draftMeta: { fontSize: font.sm, color: colors.warningText },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  listCard: { padding: 0, overflow: 'hidden' },
  listHeader: { paddingHorizontal: space.lg, paddingTop: space.md },
  linkBtn: { minHeight: 36, paddingHorizontal: 0 },
});
