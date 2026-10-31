/**
 * Bulut holati — haqiqiy ma'lumotdan: bulut sozlanganmi, kirilganmi, nechta moliyaviy yozuv yuborilmagan.
 * Soxta "sinxronlandi" yozuvi yo'q: son sync_log (muvaffaqiyatli server javoblari) asosida hisoblanadi.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../backend/AuthProvider';
import { useSync } from '../backend/SyncProvider';
import { Icon, type IconName } from '../ui/Icon';
import { colors, font, radius, space } from '../ui/theme';

export function SyncStatus() {
  const auth = useAuth();
  const sync = useSync();
  const shopId = auth.shopId;
  const pending = sync.pending;

  let icon: IconName = 'cloud-offline-outline';
  let tone: string = colors.textMuted;
  let text = 'Bulut ulanmagan · lokal rejim';
  if (auth.status === 'loading') text = 'Bulut: sessiya tiklanmoqda…';
  else if (auth.status === 'signed-out') text = 'Bulut: hisobga kirilmagan';
  else if (auth.status === 'signed-in' && !shopId) text = auth.shopLoading ? "Bulut: do'kon yuklanmoqda…" : "Bulut: do'kon yaratilmagan";
  else if (sync.running) {
    icon = 'cloud-upload-outline';
    text = 'Bulut: sinxronlanmoqda…';
  } else if (sync.lastError && sync.lastError.kind !== 'network') {
    icon = 'alert-circle';
    tone = colors.danger;
    text = `Bulut: xato — ${sync.lastError.message}`;
  } else if (auth.status === 'signed-in' && pending === 0 && (sync.lastPull?.rejected.length ?? 0) > 0) {
    // Yuborish to'liq, lekin bulutdagi ba'zi yozuvlar telefonga olinmagan — muvaffaqiyat deb ko'rsatilmaydi
    icon = 'warning';
    tone = colors.warningText;
    text = `Bulut: ${sync.lastPull!.rejected.length} ta yozuv telefonga olinmadi`;
  } else if (auth.status === 'signed-in' && pending !== null) {
    if (pending === 0) {
      icon = 'checkmark-circle';
      tone = colors.success;
      text = 'Bulut: barcha yozuvlar yuborilgan';
    } else {
      icon = 'cloud-upload-outline';
      tone = colors.warningText;
      text = sync.lastError ? `Bulut: internet yo'q · ${pending} ta yozuv kutmoqda` : `Bulut: ${pending} ta yozuv yuborilmagan`;
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}. Hisob va bulut sahifasini ochish`}
      onPress={() => router.push('/account')}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={18} color={tone} />
      <Text style={[s.text, { color: tone }]} numberOfLines={1}>
        {text}
      </Text>
      <View style={{ flex: 1 }} />
      <Icon name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { fontSize: font.sm, fontWeight: '600', flexShrink: 1 },
});
