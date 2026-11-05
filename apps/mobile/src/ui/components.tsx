/**
 * Umumiy UI komponentlari — barcha ekranlar shu yerdan foydalanadi (bitta dizayn tizimi).
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HEADER_BAR_HEIGHT } from './AppHeader';
import { Icon, type IconName } from './Icon';
import { colors, font, radius, shadow, space, TOUCH_MIN, type } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { variant = 'primary', disabled, loading, size = 'md' } = props;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        styles[`button_${variant}`],
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        props.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary} />
      ) : (
        <View style={styles.buttonInner}>
          {props.icon ? (
            <Icon
              name={props.icon}
              size={size === 'lg' ? 22 : 20}
              color={variant === 'primary' || variant === 'danger' ? colors.onPrimary : variant === 'ghost' ? colors.blue : colors.text}
            />
          ) : null}
          <Text
            style={[styles.buttonText, size === 'lg' && styles.buttonTextLg, styles[`buttonText_${variant}`]]}
            numberOfLines={2}
          >
            {props.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { label, error, hint, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Banner({ tone, title, children }: { tone: 'error' | 'warning' | 'success' | 'info'; title?: string; children?: ReactNode }) {
  const palette = {
    error: [colors.dangerSoft, colors.danger],
    warning: [colors.warningBg, colors.warningText],
    success: [colors.successSoft, colors.success],
    info: [colors.blueSoft, colors.blue],
  }[tone];
  const icon: IconName = { error: 'close-circle', warning: 'warning', success: 'checkmark-circle', info: 'information-circle' }[
    tone
  ] as IconName;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: palette[0], borderColor: palette[1] }]}>
      {title ? (
        <View style={styles.bannerHead}>
          <Icon name={icon} size={20} color={palette[1]} />
          <Text style={[styles.bannerTitle, { color: palette[1], flex: 1 }]}>{title}</Text>
        </View>
      ) : null}
      {typeof children === 'string' ? <Text style={[styles.bannerText, { color: palette[1] }]}>{children}</Text> : children}
    </View>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const [bg, fg] = {
    neutral: [colors.surfaceAlt, colors.textMuted],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningBg, colors.warningText],
    danger: [colors.dangerSoft, colors.danger],
    info: [colors.blueSoft, colors.blue],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Raqamli ko'rsatkich (dashboard) */
export function StatTile(props: { label: string; value: string; hint?: string; style?: StyleProp<ViewStyle>; inverse?: boolean }) {
  return (
    <View
      style={[styles.stat, props.inverse && styles.statInverse, props.style]}
      accessible
      accessibilityLabel={`${props.label}: ${props.value}${props.hint ? `, ${props.hint}` : ''}`}
    >
      <Text style={[type.label, props.inverse && { color: colors.onPrimaryMuted }]}>{props.label}</Text>
      <Text style={[styles.statValue, props.inverse && { color: colors.onPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {props.value}
      </Text>
      {props.hint ? <Text style={[type.caption, props.inverse && { color: colors.onPrimaryMuted }]}>{props.hint}</Text> : null}
    </View>
  );
}

/** Bir nechta variantdan bittasini tanlash (filtrlar) */
export function ChipGroup<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={props.accessibilityLabel}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => props.onChange(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Ekran konteyneri: klaviatura amal tugmalarini berkitmasligi uchun KeyboardAvoidingView,
 * header balandligi (AppHeader + SafeArea) bilan; ixtiyoriy pastki panel (footer).
 */
export function Screen(props: { children: ReactNode; footer?: ReactNode; modal?: boolean; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const offset = HEADER_BAR_HEIGHT + (props.modal ? space.sm : insets.top);
  const body =
    props.scroll === false ? (
      <View style={{ flex: 1 }}>{props.children}</View>
    ) : (
      <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
        {props.children}
      </ScrollView>
    );
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
      {body}
      {props.footer ? <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>{props.footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Loading({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: IconName }) {
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={32} color={colors.textSubtle} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={[styles.muted, { textAlign: 'center' }]}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function ListRow(props: {
  title: string;
  subtitle?: string;
  right?: string;
  rightMuted?: boolean;
  badge?: { label: string; tone: BadgeTone };
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : undefined}
      accessibilityLabel={
        props.accessibilityLabel ??
        `${props.title}${props.right ? `, ${props.right}` : ''}${props.badge ? `, ${props.badge.label}` : ''}`
      }
      onPress={props.onPress}
      disabled={!props.onPress}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={{ flex: 1, paddingRight: space.sm, gap: 2 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={styles.muted} numberOfLines={1}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {props.right ? (
          <Text style={[styles.listRight, props.rightMuted && styles.listRightMuted]}>{props.right}</Text>
        ) : null}
        {props.badge ? <Badge label={props.badge.label} tone={props.badge.tone} /> : null}
      </View>
      {props.onPress ? (
        <View style={styles.chevron}>
          <Icon name="chevron-forward" size={18} color={colors.textSubtle} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Ixcham qator: bitta ekranga kamida 8 ta sig'adi (balandligi ~56).
 * Chap: nom + yordamchi satr; o'ng: asosiy qiymat + kichik izoh. `tone="warning"` — sariq (masalan manfiy qoldiq).
 */
export function CompactRow(props: {
  title: string;
  meta?: string;
  tone?: 'normal' | 'warning' | 'muted';
  right?: string;
  rightSub?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const warn = props.tone === 'warning';
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : undefined}
      accessibilityLabel={props.accessibilityLabel ?? `${props.title}${props.meta ? `, ${props.meta}` : ''}${props.right ? `, ${props.right}` : ''}`}
      onPress={props.onPress}
      disabled={!props.onPress}
      style={({ pressed }) => [
        styles.compactRow,
        warn && { backgroundColor: colors.warningBg },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <View style={{ flex: 1, paddingRight: space.sm }}>
        <Text style={[styles.compactTitle, props.tone === 'muted' && { color: colors.textMuted }]} numberOfLines={1}>
          {props.title}
        </Text>
        {props.meta ? (
          <Text style={[styles.compactMeta, warn && { color: colors.warningText, fontWeight: '700' }]} numberOfLines={1}>
            {props.meta}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {props.right ? <Text style={styles.compactRight}>{props.right}</Text> : null}
        {props.rightSub ? <Text style={styles.compactMeta}>{props.rightSub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Miqdorni -/+ bilan o'zgartirish (katta bosish maydoni) */
export function Stepper(props: { onMinus: () => void; onPlus: () => void; label: string; accessibilityLabel: string; onLabelPress?: () => void }) {
  return (
    <View style={styles.stepper} accessibilityLabel={props.accessibilityLabel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Kamaytirish" onPress={props.onMinus} style={styles.stepBtn}>
        <Icon name="remove" size={20} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Miqdor ${props.label}, aniq kiritish`} onPress={props.onLabelPress} disabled={!props.onLabelPress}>
        <Text style={styles.stepLabel}>{props.label}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Oshirish" onPress={props.onPlus} style={styles.stepBtn}>
        <Icon name="add" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** Oldi-berdi ko'rinishi: Eski + Tovar = Jami, Berildi, Ostatka */
export function SettlementBox(props: { opening: bigint; goods: bigint; total: bigint; paid: bigint; balance: bigint; format: (v: bigint) => string }) {
  const rows: [string, bigint, boolean?][] = [
    ['Eski', props.opening],
    ['Tovar', props.goods],
    ['Jami', props.total, true],
    ['Berildi', props.paid],
    ['Ostatka', props.balance, true],
  ];
  return (
    <View style={styles.settle}>
      {rows.map(([label, value, strong]) => (
        <View key={label} style={styles.settleRow}>
          <Text style={strong ? type.bodyStrong : type.body}>{label}</Text>
          <Text style={strong ? type.money : type.body}>{props.format(value)}</Text>
        </View>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  compactRow: {
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  compactTitle: { fontSize: font.md, fontWeight: '600', color: colors.text },
  compactMeta: { fontSize: font.xs, color: colors.textMuted },
  compactRight: { fontSize: font.md, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stepBtn: {
    width: TOUCH_MIN,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  stepLabel: { minWidth: 44, textAlign: 'center', fontSize: font.md, fontWeight: '700', color: colors.text },
  settle: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: space.md, gap: space.xs },
  settleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: {
    minHeight: TOUCH_MIN + 4,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  buttonLg: { minHeight: 60, borderRadius: radius.lg },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.borderStrong },
  button_danger: { backgroundColor: colors.danger },
  button_ghost: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonText: { fontSize: font.md + 1, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  buttonTextLg: { fontSize: font.lg + 1 },
  buttonText_primary: { color: colors.onPrimary },
  buttonText_secondary: { color: colors.text },
  buttonText_danger: { color: colors.onPrimary },
  buttonText_ghost: { color: colors.blue },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  sectionTitle: { ...type.heading },
  field: { marginBottom: space.md },
  fieldLabel: { fontSize: font.sm, fontWeight: '600', color: colors.textMuted, marginBottom: space.xs },
  fieldError: { fontSize: font.sm, color: colors.danger, marginTop: space.xs },
  fieldHint: { fontSize: font.xs, color: colors.textSubtle, marginTop: space.xs },
  input: {
    minHeight: TOUCH_MIN,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bannerTitle: { fontWeight: '700', fontSize: font.md },
  bannerText: { fontSize: font.md, lineHeight: 21 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
  stat: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, gap: 2, borderWidth: 1, borderColor: colors.border },
  statInverse: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  statValue: { fontSize: font.xl, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  chips: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  muted: { color: colors.textMuted, fontSize: font.sm },
  empty: { alignItems: 'center', padding: space.xl, gap: space.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginBottom: space.xs,
  },
  emptyTitle: { ...type.heading, textAlign: 'center' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  listTitle: { ...type.bodyStrong },
  listRight: { ...type.money },
  listRightMuted: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  chevron: { marginLeft: space.xs },
});
