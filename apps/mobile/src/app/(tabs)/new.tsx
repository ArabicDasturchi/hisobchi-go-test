import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDraft } from '../../features/DraftContext';
import { HEADER_BAR_HEIGHT } from '../../ui/AppHeader';
import { useVoiceInput } from '../../features/useVoiceInput';
import { Banner, Button, Card } from '../../ui/components';
import { colors, font, radius, space } from '../../ui/theme';

const EXAMPLE = "3 ta non 4000 so'mdan\n2 litr sut 12000 so'mdan\n5 kg shakar 15000 so'mdan";

const FORMAT_EXAMPLES = [
  "3 ta non 4000 so'mdan",
  "2 litr sut 12 000 so'm",
  'chirmoq 10 ta 13 ming',
  "go'sht 1,5 kg 90 ming",
  "pishloq yarim kg 60000 so'm",
];

export default function NewCalculationScreen() {
  const insets = useSafeAreaInsets();
  const { draft, startFromText, startManual } = useDraft();
  const [text, setText] = useState(draft?.rawInput ?? '');
  const [error, setError] = useState<string | null>(null);
  // Savdo saqlangan yoki qoralama o'chirilgan bo'lsa — eski matn qolmasin; tiklangan qoralama matni ko'rsatilsin
  useEffect(() => {
    setText(draft?.rawInput ?? '');
  }, [draft?.clientOpId]); // eslint-disable-line react-hooks/exhaustive-deps
  const voice = useVoiceInput((spoken) => setText((t) => (t.trim() ? `${t.trimEnd()}\n${spoken}` : spoken)));

  const submit = () => {
    if (!text.trim()) {
      setError("Ro'yxat bo'sh. Mahsulot, miqdor va narxni yozing.");
      return;
    }
    const parse = () => {
      const count = startFromText(text);
      if (count === 0) {
        setError("Matndan birorta ham qator ajratilmadi. Har bir mahsulotni yangi qatorga yozing.");
        return;
      }
      setError(null);
      router.push('/review');
    };
    // Mavjud qoralamadagi qo'lda qilingan tahrirlar ogohlantirishsiz yo'qolmasin
    if (draft && draft.rows.length > 0) {
      Alert.alert(
        'Qayta tahlil qilinsinmi?',
        "Qatorlar matndan qaytadan tuziladi — qatorlarda qilgan tahrirlaringiz o'chadi.",
        [
          { text: 'Qatorlarga qaytish', onPress: () => router.push('/review') },
          { text: 'Qayta tahlil qilish', style: 'destructive', onPress: parse },
        ],
      );
      return;
    }
    parse();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={HEADER_BAR_HEIGHT + insets.top}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Card style={s.formats}>
          <Text style={s.formatsTitle}>Qanday yozish kerak</Text>
          <Text style={s.help}>Har bir mahsulot — alohida qatorda yoki vergul bilan. Miqdor, birlik, nom va narx:</Text>
          {FORMAT_EXAMPLES.map((ex) => (
            <Text key={ex} style={s.example}>
              • {ex}
            </Text>
          ))}
          <Text style={s.help}>
            Birliklar: ta/dona, kg, g, litr, metr, pachka, qop, karobka, tonna. Narx: 13000, 13 000, 13 ming, 1,5 ming,
            2 mln. Aniqlanmagan qiymat taxmin qilinmaydi — keyingi ekranda sariq bilan belgilanadi.
          </Text>
        </Card>

        <TextInput
          accessibilityLabel="Mahsulot ro'yxati"
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(null);
          }}
          placeholder={EXAMPLE}
          placeholderTextColor={colors.textMuted}
          style={s.input}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {voice.listening ? (
          <Banner tone="info" title="Tinglanmoqda…">
            {voice.partial || "Ro'yxatni ayting"}
          </Banner>
        ) : null}
        {voice.error ? <Banner tone="warning">{voice.error}</Banner> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        <View style={s.row}>
          {voice.supported ? (
            <Button
              label={voice.listening ? "To'xtatish" : 'Ovoz bilan'}
              icon="mic-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={voice.listening ? voice.stop : voice.start}
            />
          ) : null}
          <Button
            label="Tozalash"
            variant="secondary"
            style={{ flex: 1 }}
            disabled={!text}
            onPress={() => {
              setText('');
              setError(null);
            }}
          />
        </View>

        {!voice.supported ? (
          <Card style={{ backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
            <Text style={s.note}>
              Ilova ichidagi ovozli kiritish bu build'da mavjud emas (Expo Go'da ishlamaydi — development build kerak).
              Klaviaturadagi mikrofon tugmasi orqali aytib yozishingiz mumkin.
            </Text>
          </Card>
        ) : null}

        <Button label="Tahlil qilish" size="lg" onPress={submit} disabled={voice.listening} />

        <Button
          label="Qo'lda kiritish (matnsiz)"
          variant="secondary"
          onPress={() => {
            const begin = () => {
              startManual();
              router.push('/review');
            };
            if (draft && draft.rows.length > 0) {
              Alert.alert('Yangi hisob boshlansinmi?', "Tugallanmagan hisob o'rniga yangi bo'sh hisob ochiladi.", [
                { text: 'Joriysiga qaytish', onPress: () => router.push('/review') },
                { text: 'Yangisini boshlash', style: 'destructive', onPress: begin },
              ]);
              return;
            }
            begin();
          }}
        />

        <Button label="Namunani qo'yish" variant="ghost" onPress={() => setText(EXAMPLE)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { padding: space.lg, gap: space.md },
  help: { fontSize: font.sm, color: colors.textMuted },
  formats: { gap: space.xs, backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  formatsTitle: { fontSize: font.md, fontWeight: '700', color: colors.blue },
  example: { fontSize: font.md, color: colors.text },
  input: {
    minHeight: 200,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    fontSize: font.lg,
    lineHeight: 26,
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: space.md },
  note: { color: colors.blue, fontSize: font.sm },
});
