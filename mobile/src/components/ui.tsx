import type { PropsWithChildren, ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts, paperShadow, radius, spacing } from '../ui/theme'
import { AppIcon, type AppIconName } from './AppIcon'

export function Screen({ children, scroll = true, dark = false }: PropsWithChildren<{ scroll?: boolean; dark?: boolean }>) {
  const content = scroll ? <ScrollView style={styles.flex} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>{children}</ScrollView> : <View style={[styles.flex, styles.screenContent]}>{children}</View>
  return <SafeAreaView edges={['top']} style={[styles.safe, dark && styles.dark]}>{content}</SafeAreaView>
}

export function Paper({ children, style, tone = 'light' }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[]; tone?: 'light' | 'deep' | 'dark' }>) {
  return <View style={[styles.paper, tone === 'deep' && styles.paperDeep, tone === 'dark' && styles.paperDark, style]}>{children}</View>
}

export function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <View style={styles.titleRow}><View style={styles.titleText}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View>{action}</View>
}

export function Chip({ children, active = false, tone = 'ink' }: PropsWithChildren<{ active?: boolean; tone?: 'ink' | 'red' | 'river' }>) {
  return <View style={[styles.chip, active && styles.chipActive, tone === 'red' && { borderColor: colors.cinnabar }, tone === 'river' && { borderColor: colors.river }]}><Text style={[styles.chipText, active && styles.chipTextActive, tone === 'red' && { color: colors.cinnabar }, tone === 'river' && { color: colors.river }]}>{children}</Text></View>
}

export function PreviewBadge({ label = 'M2 预览' }: { label?: string }) {
  return <View style={styles.preview}><Text style={styles.previewText}>{label}</Text></View>
}

export function Seal({ children, size = 44 }: PropsWithChildren<{ size?: number }>) {
  return <View style={[styles.seal, { width: size, height: size, borderRadius: size / 2 }]}><Text style={[styles.sealText, { fontSize: size * 0.43 }]}>{children}</Text></View>
}

export function ActionButton({ label, onPress, icon, variant = 'primary', disabled = false, compact = false }: { label: string; onPress: () => void; icon?: AppIconName; variant?: 'primary' | 'secondary' | 'ghost' | 'dark'; disabled?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${variant}`], compact && styles.buttonCompact, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    {icon ? <AppIcon name={icon} size={compact ? 16 : 18} color={variant === 'primary' || variant === 'dark' ? colors.paperBright : colors.inkSoft} /> : null}
    <Text style={[styles.buttonText, (variant === 'primary' || variant === 'dark') && styles.buttonTextLight, compact && styles.buttonTextCompact]}>{label}</Text>
  </Pressable>
}

export function ProgressBar({ value, dark = false }: { value: number; dark?: boolean }) {
  return <View style={[styles.progress, dark && { backgroundColor: '#ffffff24' }]}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} /></View>
}

export function Divider({ label }: { label?: string }) {
  return <View style={styles.divider}><View style={styles.dividerLine} />{label ? <Text style={styles.dividerText}>{label}</Text> : null}<View style={styles.dividerLine} /></View>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.empty}><AppIcon name="book" size={26} color={colors.faint} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>
}

export function KeyValue({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return <View style={styles.kv}><Text style={styles.kvLabel}>{label}</Text><Text style={[styles.kvValue, emphasis && { color: colors.cinnabar }]}>{value}</Text></View>
}

export const bodyText = { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 15, lineHeight: 24 } as const
export const smallText = { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 } as const

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.paper }, dark: { backgroundColor: colors.night },
  screenContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 118 },
  paper: { backgroundColor: colors.paperBright, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.lg, ...paperShadow },
  paperDeep: { backgroundColor: colors.paperDeep }, paperDark: { backgroundColor: colors.riverDark, borderColor: '#62787a' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  titleText: { flex: 1, minWidth: 0 }, eyebrow: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 10, letterSpacing: 2, marginBottom: 5 },
  title: { color: colors.ink, fontFamily: fonts.serif, fontSize: 26, lineHeight: 34, fontWeight: '600' }, detail: { ...smallText, marginTop: 5 },
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipActive: { backgroundColor: colors.ink }, chipText: { color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 11 }, chipTextActive: { color: colors.paperBright },
  preview: { alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cinnabar, paddingHorizontal: 7, paddingVertical: 3 },
  previewText: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 10, letterSpacing: 1 },
  seal: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.cinnabar, backgroundColor: '#963f320d' },
  sealText: { color: colors.cinnabar, fontFamily: fonts.serif, fontWeight: '700' },
  button: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.cinnabar, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  button_primary: { backgroundColor: colors.cinnabar }, button_secondary: { backgroundColor: 'transparent', borderColor: colors.lineStrong }, button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' }, button_dark: { backgroundColor: colors.riverDark, borderColor: colors.riverDark },
  buttonCompact: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 7 }, buttonText: { color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 14, fontWeight: '600' }, buttonTextLight: { color: colors.paperBright }, buttonTextCompact: { fontSize: 12 }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  progress: { height: 4, backgroundColor: colors.paperDeep, overflow: 'hidden', borderRadius: 4 }, progressFill: { height: 4, backgroundColor: colors.cinnabar, borderRadius: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: spacing.lg }, dividerLine: { flex: 1, height: 1, backgroundColor: colors.line }, dividerText: { color: colors.muted, fontFamily: fonts.serif, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 8 }, emptyTitle: { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 17 }, emptyDetail: { ...smallText, textAlign: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, kvLabel: { ...smallText }, kvValue: { color: colors.ink, fontFamily: fonts.serif, fontSize: 15, flexShrink: 1, textAlign: 'right' },
})
