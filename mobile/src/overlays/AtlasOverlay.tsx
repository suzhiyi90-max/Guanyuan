import { useState } from 'react'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { OverlayShell } from '../components/OverlayShell'
import { ActionButton, Chip, Paper, PreviewBadge, Seal, bodyText, smallText } from '../components/ui'
import { AppIcon } from '../components/AppIcon'
import { cityLocations, locationScenes } from '../data/city'
import { locationImages } from '../data/assets'
import type { GameState } from '../game/model'
import type { SceneId, SectionId } from '../types'
import type { LocationSceneId, OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'

interface AtlasProps {
  visible: boolean
  onClose: () => void
  state: GameState
  openOverlay: (overlay: OpenOverlayId) => void
  openLocation: (location: LocationSceneId) => void
}

export function AtlasOverlay({ visible, onClose, state, openOverlay, openLocation }: AtlasProps) {
  const [map, setMap] = useState<'county' | 'city'>('county')
  const [cityId, setCityId] = useState<(typeof cityLocations)[number]['id']>('county')
  const city = cityLocations.find(item => item.id === cityId) ?? cityLocations[0]
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="FE-025 / 026 · 一县与城郭" title="行到何处，知到何处。">
    <View style={styles.tabs}><Pressable onPress={() => setMap('county')} style={[styles.tab, map === 'county' && styles.active]}><Text style={[styles.tabText, map === 'county' && styles.activeText]}>一县舆图</Text></Pressable><Pressable onPress={() => setMap('city')} style={[styles.tab, map === 'city' && styles.active]}><Text style={[styles.tabText, map === 'city' && styles.activeText]}>城郭图</Text></Pressable></View>
    <Paper tone="deep" style={styles.mapPaper}>
      <View style={styles.mapHead}><View><Text style={styles.eyebrow}>方位纸图 / 不伪造精确测绘</Text><Text style={styles.mapTitle}>{map === 'county' ? '永济县境 · 四方行程' : '县城内外 · 八处索引'}</Text></View><PreviewBadge /></View>
      <View style={styles.route}><Text style={styles.routeText}>驿铺</Text><View style={styles.routeLine} /><Seal size={38}>县</Seal><View style={styles.routeLine} /><Text style={styles.routeText}>渡口</Text></View>
      {map === 'county' ? <View style={styles.grid}>{locationScenes.map(item => <Pressable key={item.id} onPress={() => openLocation(item.id)} style={({ pressed }) => [styles.place, pressed && styles.pressed]}><View style={styles.placeTop}><Seal size={36}>{item.name[0]}</Seal><AppIcon name="next" size={16} /></View><Text style={styles.placeName}>{item.name}</Text><Text style={styles.placeNote} numberOfLines={2}>{item.subtitle}</Text><Text style={styles.source}>{item.source}</Text></Pressable>)}</View> : <View style={styles.grid}>{cityLocations.map(item => <Pressable key={item.id} onPress={() => setCityId(item.id)} style={[styles.place, city.id === item.id && styles.selected]}><View style={styles.placeTop}><Text style={styles.placeName}>{item.name}</Text><Chip active={city.id === item.id}>{item.knowledge}</Chip></View><Text style={styles.placeNote}>{item.label}</Text></Pressable>)}</View>}
    </Paper>
    {map === 'city' ? <Paper style={styles.inspector}><View style={styles.placeTop}><View><Text style={styles.eyebrow}>{city.knowledge} / 来源边界</Text><Text style={styles.detailTitle}>{city.name} · {city.label}</Text></View><Chip>{city.id === cityId ? '查验中' : '地点'}</Chip></View><Text style={bodyText}>{city.summary}</Text><Text style={styles.sourceBox}>{city.source}</Text><View style={styles.actions}>{city.id === 'county' ? <ActionButton compact label="展开案上呈文" onPress={() => openOverlay('document')} /> : null}{city.id === 'sang' ? <ActionButton compact label="展开桑宅请帖" onPress={() => openOverlay('banquet')} /> : null}{city.id === 'study' ? <ActionButton compact label="回夜书房旧册" variant="secondary" onPress={onClose} /> : null}</View></Paper> : <Paper style={styles.inspector}><Text style={bodyText}>四处地点只承载 M2 场景与来源预览；船期、渡资、行程消耗和镇民消息须另有真实来源，不因点开舆图自动生成。</Text><Text style={[smallText, styles.day]}>本局第 {state.day} 日 · 查阅舆图不推进时段</Text></Paper>}
  </OverlayShell>
}

interface LocationProps {
  visible: boolean
  onClose: () => void
  location: LocationSceneId
  openOverlay: (overlay: OpenOverlayId) => void
  changeScene: (scene: SceneId) => void
  navigate: (section: SectionId) => void
}

export function LocationOverlay({ visible, onClose, location, openOverlay, changeScene, navigate }: LocationProps) {
  const scene = locationScenes.find(item => item.id === location) ?? locationScenes[0]
  const act = () => {
    onClose()
    if (scene.id === 'ferry') { changeScene('county'); navigate('today') }
    else if (scene.id === 'station') openOverlay('review')
    else if (scene.id === 'town') navigate('life')
    else openOverlay('banquet')
  }
  return <OverlayShell visible={visible} onClose={onClose} eyebrow={`${scene.source} · 地点纸`} title={scene.name}>
    <ImageBackground source={{ uri: locationImages[scene.id] }} style={styles.image} resizeMode="cover"><View style={styles.imageShade}><PreviewBadge /><Text style={styles.imageTitle}>{scene.name}</Text><Text style={styles.imageSubtitle}>{scene.subtitle}</Text></View></ImageBackground>
    <Paper style={styles.inspector}><Text style={styles.eyebrow}>此地可知的 / 仅此三项</Text>{scene.facts.map((fact, index) => <View style={styles.fact} key={fact}><Text style={styles.factNumber}>0{index + 1}</Text><Text style={[bodyText, styles.factText]}>{fact}</Text></View>)}</Paper>
    <ActionButton label={scene.action} icon={scene.id === 'ferry' ? 'back' : scene.id === 'station' ? 'cases' : scene.id === 'town' ? 'life' : 'gift'} onPress={act} />
    <Text style={styles.footnote}>M2 预览只回接既有入口，不结算行程，不创建新事件。</Text>
  </OverlayShell>
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, marginBottom: 14 }, tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: colors.paperDeep }, active: { backgroundColor: colors.ink }, tabText: { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 16 }, activeText: { color: colors.paperBright },
  mapPaper: { marginBottom: 14 }, mapHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, eyebrow: { color: colors.cinnabar, fontSize: 10, letterSpacing: 1 }, mapTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 21, marginTop: 5 }, route: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 18 }, routeText: { color: colors.riverDark, fontFamily: fonts.serif }, routeLine: { height: 1, flex: 1, backgroundColor: colors.lineStrong, marginHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, place: { width: '48.5%', minHeight: 116, padding: 12, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paperBright, justifyContent: 'space-between' }, selected: { borderColor: colors.cinnabar, backgroundColor: '#f5e7d5' }, pressed: { opacity: 0.72 }, placeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, placeName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 18 }, placeNote: { ...smallText, marginTop: 7 }, source: { ...smallText, fontSize: 9, marginTop: 8 }, inspector: { marginBottom: 14, gap: 12 }, detailTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20, marginTop: 4 }, sourceBox: { ...smallText, backgroundColor: colors.paperDeep, padding: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap' }, day: { color: colors.cinnabar },
  image: { height: 300, marginBottom: 16, justifyContent: 'flex-end' }, imageShade: { backgroundColor: '#202b30df', padding: 18, gap: 6 }, imageTitle: { color: colors.paperBright, fontFamily: fonts.serif, fontSize: 29 }, imageSubtitle: { color: colors.paperDeep, fontFamily: fonts.serif, fontSize: 14 }, fact: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, factNumber: { color: colors.cinnabar, fontFamily: fonts.mono }, factText: { flex: 1 }, footnote: { ...smallText, textAlign: 'center', marginTop: 14 },
})
