/**
 * Qoralamalar (telefonda): tugallanmagan hisob. Saqlanmagan narsa moliyaviy yozuv emas.
 * Agent (AI) qoralamalari veb panelda ko'riladi va tasdiqlanadi — mobil ularni o'zgartirmaydi.
 */
import { router } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useDraft } from '../features/DraftContext';
import { summarizeDraft } from '../features/draft';
import { formatDateTime, formatSom } from '../lib/format';
import { Banner, Button, Card, EmptyState, Loading, Screen } from '../ui/components';
import { space, type } from '../ui/theme';

export default function DraftsScreen() {
  const { draft, ready, savedAt, corrupt, discard } = useDraft();
  if (!ready) return <Loading />;

  const confirmDiscard = () =>
    Alert.alert("Qoralamani o'chirish", "Tugallanmagan hisob o'chiriladi. Saqlangan savdolarga ta'sir qilmaydi. Davom etasizmi?", [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void discard() },
    ]);

  return (
    <Screen>
      {corrupt ? (
        <Banner tone="warning" title="Qoralamani tiklab bo'lmadi">
          <Text style={type.body}>{`Saqlangan qoralama o'qilmadi (${corrupt.reason}). Saqlangan savdolar xavfsiz.`}</Text>
          <Button label="Qoralamani o'chirish" variant="secondary" onPress={confirmDiscard} />
        </Banner>
      ) : null}
      {draft ? (
        <Card style={{ gap: space.sm }}>
          {(() => {
            const sum = summarizeDraft(draft.rows);
            return (
              <>
                <Text style={type.heading}>Tugallanmagan hisob</Text>
                <Text style={type.caption}>{`${draft.rows.length} ta qator · taxminiy ${formatSom(sum.previewTotal)}`}</Text>
                {savedAt ? <Text style={type.caption}>Avtomatik saqlangan: {formatDateTime(savedAt)}</Text> : null}
              </>
            );
          })()}
          <Button label="Davom ettirish" onPress={() => router.push(draft.rows.length > 0 ? '/review' : '/new')} />
          <Button label="O'chirish" variant="secondary" onPress={confirmDiscard} />
        </Card>
      ) : !corrupt ? (
        <EmptyState icon="receipt-outline" title="Qoralama yo'q" text="Tugallanmagan hisob bo'lsa, shu yerda ko'rinadi. AI yordamchi qoralamalari veb panelda." />
      ) : null}
    </Screen>
  );
}
