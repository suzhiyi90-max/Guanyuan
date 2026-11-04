import type { PropsWithChildren, ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../ui/theme'
import { AppIcon } from './AppIcon'

export function OverlayShell({ visible, onClose, eyebrow, title, children, footer, sheet = false }: PropsWithChildren<{ visible: boolean; onClose: () => void; eyebrow: string; title: string; footer?: ReactNode; sheet?: boolean }>) {
  const reduceMotion = useReducedMotion()
  return <Modal visible={visible} transparent={false} animationType="none" onRequestClose={onClose} statusBarTranslucent={false}>
    <SafeAreaView style={[styles.safe, sheet && styles.sheetSafe]} edges={['top', 'bottom']}>
      <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(220)} style={[styles.paper, sheet && styles.sheet]}>
        <View style={styles.handle} />
        <View style={styles.head}><View style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="收起纸页" onPress={onClose} style={styles.close}><AppIcon name="close" size={21} /></Pressable></View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </SafeAreaView>
  </Modal>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, sheetSafe: { backgroundColor: '#202b30', justifyContent: 'flex-end' },
  paper: { flex: 1, backgroundColor: colors.paperBright }, sheet: { flex: 0, maxHeight: '91%', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  handle: { width: 34, height: 3, borderRadius: 2, backgroundColor: colors.lineStrong, alignSelf: 'center', marginTop: 7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  heading: { flex: 1 }, eyebrow: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 10, letterSpacing: 2, marginBottom: 4 }, title: { color: colors.ink, fontFamily: fonts.serif, fontSize: 24, lineHeight: 31 },
  close: { width: 42, height: 42, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, scroll: { flex: 1 }, content: { padding: 18, paddingBottom: 32 }, footer: { padding: 14, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paperBright },
})
