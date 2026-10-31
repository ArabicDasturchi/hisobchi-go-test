/**
 * Ilova sarlavhasi — React Native komponentlari bilan chiziladi.
 *
 * Nega native header emas: iPhone (iOS 27) + Expo Go'da native Stack header'i
 * yoqilganda ilova yopilishi diagnostikada aniqlandi (4b yopildi, 4c/4a ishladi).
 * Native Stack'ga `header` funksiyasi berilsa, u native header'ni o'chiradi
 * (headerShown: false) va shu komponentni oddiy View ichida ko'rsatadi.
 */
import type { NativeStackHeaderProps } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { colors, font, space } from './theme';

/** Sarlavha qatori balandligi (SafeArea'siz) — klaviatura offset'i uchun ham ishlatiladi */
export const HEADER_BAR_HEIGHT = 52;

export function AppHeader({ back, options, route, navigation }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const isModal =
    options.presentation === 'modal' ||
    options.presentation === 'formSheet' ||
    options.presentation === 'pageSheet';
  const title = typeof options.title === 'string' ? options.title : route.name;
  const canGoBack = back !== undefined && navigation.canGoBack();

  return (
    <View style={[s.bar, { paddingTop: isModal ? space.sm : insets.top }]}>
      <View style={s.row}>
        <View style={s.side}>
          {canGoBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isModal ? 'Yopish' : 'Orqaga'}
              hitSlop={12}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            >
              <View style={s.backInner}>
                <Icon name={isModal ? 'close' : 'chevron-back'} size={22} color="#fff" />
                <Text style={s.backText}>{isModal ? 'Yopish' : 'Orqaga'}</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
          {title}
        </Text>
        <View style={s.side} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: colors.primary },
  row: { minHeight: HEADER_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  side: { width: 96, justifyContent: 'center' },
  backBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  backInner: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: '#fff', fontSize: font.md, fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: font.lg, fontWeight: '700' },
});

/** Asosiy bo'lim (tab) sarlavhasi — orqaga tugmasisiz, SafeArea bilan */
export function TabHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top }]}>
      <View style={[s.row, { paddingHorizontal: space.lg }]}>
        <Text accessibilityRole="header" numberOfLines={1} style={[s.title, { textAlign: 'left' }]}>
          {title}
        </Text>
      </View>
    </View>
  );
}
