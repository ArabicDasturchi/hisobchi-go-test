/**
 * Hisobchi Go dizayn tokenlari — barcha ekranlar faqat shu qiymatlardan foydalanadi.
 * Palitra: chuqur yashil (asosiy amal), ko'k (navigatsiya/ma'lumot), sovuq neytral fon.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  primary: '#0B7A5C',
  primaryDark: '#075C45',
  primarySoft: '#E2F3EC',
  blue: '#1F5FAD',
  blueSoft: '#E7EFFA',
  bg: '#F2F4F7',
  card: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  text: '#101828',
  textMuted: '#5D6B7A',
  textSubtle: '#8A96A3',
  border: '#E1E6EC',
  borderStrong: '#C9D1DA',
  warningBg: '#FFF6D6',
  warningBorder: '#E9B500',
  warningText: '#6A4F00',
  danger: '#B42318',
  dangerSoft: '#FDEDEB',
  success: '#127A3E',
  successSoft: '#E5F5EC',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#CBEBDF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xxl: 30 } as const;

/** Matn uslublari — sarlavha, asosiy, yordamchi, pul */
export const type: Record<'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'money' | 'moneyLarge', TextStyle> = {
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  heading: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  body: { fontSize: font.md, color: colors.text },
  bodyStrong: { fontSize: font.md, fontWeight: '600', color: colors.text },
  caption: { fontSize: font.sm, color: colors.textMuted },
  label: { fontSize: font.xs, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  money: { fontSize: font.md, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  moneyLarge: { fontSize: font.xxl, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
};

/** Yengil soya — kartalar uchun (Android'da elevation) */
export const shadow: ViewStyle = Platform.select<ViewStyle>({
  ios: { shadowColor: '#101828', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 1 },
  default: {},
}) as ViewStyle;

/** Barmoq uchun minimal bosish maydoni */
export const TOUCH_MIN = 48;
