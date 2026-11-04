import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { sceneImages } from '../data/assets'
import type { SceneId } from '../types'
import { colors, fonts } from '../ui/theme'
import { AppIcon, BrandMark } from './AppIcon'
import { Chip, PreviewBadge } from './ui'

const sceneNames = { county: '县衙 · 签押房', river: '东堤 · 旧闸', study: '夜书房 · 灯下' } as const

export function SceneHero({ scene, day, period, onScene, onDocument, onProbe, onAudit, onAtlas, onGoal, goalTitle, probeKnown, compact = false }: { scene: SceneId; day: number; period: string; onScene: (scene: SceneId) => void; onDocument: () => void; onProbe: () => void; onAudit: () => void; onAtlas: () => void; onGoal: () => void; goalTitle?: string; probeKnown: boolean; compact?: boolean }) {
  return <View style={[styles.wrap, compact && styles.compact]}>
    <ImageBackground source={{ uri: sceneImages[scene] }} style={styles.image} resizeMode="cover">
      <LinearGradient colors={['#17232655', '#17232605', '#172326d9']} style={StyleSheet.absoluteFill} />
      <View style={styles.top}><Pressable onPress={onGoal} style={styles.brand}><BrandMark size={32} color={colors.paperBright} /><View><Text style={styles.brandName}>观远</Text><Text style={styles.brandSub}>{goalTitle ? `志向 · ${goalTitle}` : '永济县 · 第一汛'}</Text></View></Pressable><Pressable onPress={onAtlas} style={styles.mapButton}><AppIcon name="map" size={18} color={colors.paperBright} /><Text style={styles.mapText}>舆图</Text></Pressable></View>
      <View style={styles.bottom}><Text style={styles.sceneName}>{sceneNames[scene]}</Text><Text style={styles.time}>第{day}日 · {period}</Text><View style={styles.hotspots}>
        {scene === 'county' ? <Pressable style={styles.hotspot} onPress={onDocument}><AppIcon name="cases" size={17} color={colors.paperBright} /><Text style={styles.hotspotText}>案上呈文</Text></Pressable> : null}
        {scene === 'river' ? <Pressable style={styles.hotspot} onPress={onProbe}><AppIcon name="waves" size={17} color={colors.paperBright} /><Text style={styles.hotspotText}>{probeKnown ? '回看探挖' : '亲勘闸底 · 1时段'}</Text></Pressable> : null}
        {scene === 'study' ? <Pressable style={styles.hotspot} onPress={onAudit}><AppIcon name="search" size={17} color={colors.paperBright} /><Text style={styles.hotspotText}>细查旧册 · 1时段</Text></Pressable> : null}
      </View></View>
    </ImageBackground>
    <View style={styles.sceneTabs}>{(['county', 'river', 'study'] as SceneId[]).map(id => <Pressable key={id} onPress={() => onScene(id)} style={[styles.sceneTab, scene === id && styles.sceneTabActive]}><Text style={[styles.sceneTabText, scene === id && styles.sceneTabTextActive]}>{id === 'county' ? '县衙' : id === 'river' ? '东堤' : '夜书房'}</Text></Pressable>)}<PreviewBadge label="触控场景" /></View>
  </View>
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -16, marginTop: -12, marginBottom: 20, backgroundColor: colors.riverDark }, compact: { marginBottom: 12 },
  image: { height: 270, justifyContent: 'space-between' }, top: { padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' }, brandName: { color: colors.paperBright, fontFamily: fonts.serif, fontSize: 24, letterSpacing: 5 }, brandSub: { color: '#eee5d5cc', fontFamily: fonts.sans, fontSize: 10, marginTop: 2 },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#eee5d566', paddingHorizontal: 10, paddingVertical: 8 }, mapText: { color: colors.paperBright, fontSize: 12 },
  bottom: { padding: 18 }, sceneName: { color: colors.paperBright, fontFamily: fonts.serif, fontSize: 25 }, time: { color: '#eee5d5cc', fontSize: 12, marginTop: 4 }, hotspots: { flexDirection: 'row', marginTop: 16 }, hotspot: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#202b30d9', borderWidth: 1, borderColor: '#eee5d555', paddingHorizontal: 12, paddingVertical: 10 }, hotspotText: { color: colors.paperBright, fontSize: 12 },
  sceneTabs: { minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 6 }, sceneTab: { paddingHorizontal: 12, paddingVertical: 8 }, sceneTabActive: { borderBottomWidth: 2, borderBottomColor: colors.paperBright }, sceneTabText: { color: '#eee5d599', fontSize: 12 }, sceneTabTextActive: { color: colors.paperBright },
})
