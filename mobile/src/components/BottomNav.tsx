import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { SectionId } from '../types'
import { colors, fonts } from '../ui/theme'
import { AppIcon, type AppIconName } from './AppIcon'

const items: Array<{ id: SectionId; label: string; icon: AppIconName }> = [
  { id: 'today', label: '今日', icon: 'today' }, { id: 'cases', label: '案卷', icon: 'cases' }, { id: 'affairs', label: '事务', icon: 'affairs' }, { id: 'people', label: '人情', icon: 'people' }, { id: 'ledger', label: '账房', icon: 'ledger' }, { id: 'life', label: '生活', icon: 'life' },
]

export function BottomNav({ current, onNavigate }: { current: SectionId; onNavigate: (section: SectionId) => void }) {
  const insets = useSafeAreaInsets()
  return <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>{items.map(item => { const active = item.id === current; return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={item.id} onPress={() => onNavigate(item.id)} style={styles.item}><AppIcon name={item.icon} size={20} color={active ? colors.cinnabar : colors.muted} /><Text style={[styles.label, active && styles.active]}>{item.label}</Text>{active ? <View style={styles.dot} /> : null}</Pressable> })}</View>
}

const styles = StyleSheet.create({ nav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: colors.paperBright, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8 }, item: { flex: 1, minHeight: 49, alignItems: 'center', gap: 3 }, label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10 }, active: { color: colors.cinnabar, fontWeight: '700' }, dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.cinnabar } })
