import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useLedger, usePurchasing } from '../../data/LedgerProvider';
import { catalogRow, catalogRowLabel } from '../../features/catalogView';
import { MinimalDiagnosticScreen, useMinimalDiagnosticScreen } from '../../diagnostics/minimalScreen';
import { startupLog, useStartupMark } from '../../diagnostics/startupLog';
import { useDraft } from '../../features/DraftContext';
import { summarizeDraft } from '../../features/draft';
import { useFocusData } from '../../features/useAsync';
import { daysAgoIso, formatDateTime, formatSom, startOfTodayIso } from '../../lib/format';
import { Banner, Button, Card, CompactRow, EmptyState, Field, Loading } from '../../ui/components';
import { colors, font, radius, space, type } from '../../ui/theme';

export default function HomeRoute() {
  return useMinimalDiagnosticScreen() ? <MinimalDiagnosticScreen /> : <HomeScreen />;
}

/**
 * Bosh sahifa = katalog + tezkor savdo tugmasi. Qator: nom, qoldiq (manfiy bo'lsa sariq), narx.
 * Tovarga bosish -> tezkor savdo shu tovar bilan ochiladi (1 ta bosish).
 */
function HomeScreen() {
  useStartupMark('HomeScreen');
  const ledger = useLedger();
  const purchasing = usePurchasing();
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useFocusData(
    async () => {
      const result = {
        today: (await ledger.dashboard(startOfTodayIso(), daysAgoIso(6))).today,
        stock: await purchasing.listStock({ search }),
      };
      startupLog(`HomeScreen: katalog yuklandi (${result.stock.length} ta tovar)`);
      return result;
    },
    [ledger, purchasing, search],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        <Text style={s.todayLine} numberOfLines={1} accessibilityLabel="Bugungi savdo">
          Bugun: {data ? `${formatSom(data.today.total)} · ${data.today.count} ta savdo` : '—'}
        </Text>
        <Field label="Qidirish" value={search} onChangeText={setSearch} placeholder="Tovar nomi" />
        <DraftResumeCard />
        {error ? (
          <Banner tone="error" title="Ma'lumot yuklanmadi">
            <Text style={type.body}>{error}</Text>
            <Button label="Qayta urinish" variant="secondary" onPress={reload} />
          </Banner>
        ) : null}
      </View>
      {loading && !data ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.stock ?? []}
          keyExtractor={(r) => r.productId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => {
            const v = catalogRow(item);
            return (
              <CompactRow
                title={v.name}
                meta={`Qoldiq: ${v.stockText}${v.marginText ? ` · foyda ${v.marginText}` : ''}`}
                tone={v.stockLevel === 'negative' ? 'warning' : 'normal'}
                right={v.priceText}
                rightSub={v.costText ? `tan ${v.costText}` : undefined}
                accessibilityLabel={catalogRowLabel(item)}
                onPress={() => router.push({ pathname: '/quick-sale', params: { product: item.productId } })}
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={search ? 'Tovar topilmadi' : "Katalog bo'sh"}
              text={search ? undefined : "Menyu → Mahsulotlar orqali tovar qo'shing, Ombor → Kirim qilish bilan qoldiq kiriting."}
            />
          }
        />
      )}
      <View style={s.fab}>
        <Button label="Tezkor savdo" icon="add" size="lg" onPress={() => router.push('/quick-sale')} accessibilityHint="Tovar tanlab tez sotish" />
      </View>
    </View>
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
  top: { padding: space.lg, paddingBottom: space.sm, gap: space.sm },
  todayLine: { ...type.bodyStrong, color: colors.primary },
  fab: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg },
  draftCard: { borderColor: colors.warningBorder, backgroundColor: colors.warningBg, gap: space.sm },
  draftTitle: { fontSize: font.lg, fontWeight: '700', color: colors.warningText },
  draftMeta: { fontSize: font.sm, color: colors.warningText },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
});
