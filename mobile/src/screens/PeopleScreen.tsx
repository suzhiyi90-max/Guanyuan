import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { people } from '../data'
import { personImages } from '../data/assets'
import { revealDepthOf, sharedHistoryOf, specialtyOf } from '../game/people'
import type { GameState } from '../game/model'
import { colors, fonts } from '../ui/theme'
import { ActionButton, Chip, EmptyState, Paper, Screen, SectionTitle, bodyText, smallText } from '../components/ui'
import { AppIcon } from '../components/AppIcon'

type ViewId = 'roster' | 'network' | 'collection'
const tabs: Array<{ id: ViewId; label: string; note: string }> = [
  { id: 'roster', label: '名册', note: '六人与接触' },
  { id: 'network', label: '关系谱', note: '亲历为界' },
  { id: 'collection', label: '图鉴', note: '两册行状' },
]

export function PeopleScreen({ state, openPerson }: { state: GameState; openPerson: (personId: string) => void }) {
  const [view, setView] = useState<ViewId>('roster')
  const [volume, setVolume] = useState<'contemporary' | 'past'>('contemporary')
  const known = people.filter(person => state.asked.includes(person.id)).length
  const working = people.filter(person => revealDepthOf(person.id, state) === '共事').length
  return <Screen>
    <SectionTitle eyebrow="人情 / 相识与共事 不靠抽卡" title="六人，各有其账。" detail="能不能做、愿不愿做、敢不敢做。名册只记录真正接触过的人与共同经历。" action={<View style={styles.stat}><Text style={styles.statNumber}>{working}</Text><Text style={styles.statLabel}>共事 / {known} 相识</Text></View>} />
    <View style={styles.tabs}>{tabs.map(tab => <Pressable key={tab.id} onPress={() => setView(tab.id)} style={[styles.tab, view === tab.id && styles.tabActive]}><Text style={[styles.tabLabel, view === tab.id && styles.tabLabelActive]}>{tab.label}</Text><Text style={styles.tabNote}>{tab.note}</Text></Pressable>)}</View>

    {view === 'roster' ? <View style={styles.roster}>{people.map(person => {
      const depth = revealDepthOf(person.id, state)
      const veiled = depth === '闻名'
      return <Pressable key={person.id} onPress={() => openPerson(person.id)} style={({ pressed }) => [styles.personPress, pressed && styles.pressed]}><Paper style={styles.personCard}>
        <View style={styles.personHead}><View style={[styles.portraitWrap, veiled && styles.veiled]}><Image source={{ uri: personImages[person.id] }} style={[styles.portrait, veiled && styles.veiledImage]} resizeMode="cover" /></View><View style={styles.personIdentity}><Text style={styles.role}>{person.role}</Text><Text style={styles.name}>{person.name}</Text><Text style={styles.specialty}>{veiled ? '只闻其名' : specialtyOf(person).label}</Text></View><Chip active={depth === '共事'} tone={depth === '共事' ? 'red' : 'ink'}>{depth}</Chip></View>
        <Text style={styles.personCopy}>{veiled ? person.milestones[0] : person.desire}</Text>
        <View style={styles.cardFoot}><Text style={styles.claim} numberOfLines={1}>{state.asked.includes(person.id) ? `${person.claimId} 说法已入台账` : person.status}</Text><AppIcon name="next" size={16} color={colors.cinnabar} /></View>
      </Paper></Pressable>
    })}</View> : null}

    {view === 'network' ? <View style={styles.network}><Paper tone="deep" style={styles.networkIntro}><Text style={styles.networkTitle}>你只站在自己的位置看</Text><Text style={smallText}>线只连你与对方，不推断人物之间的隐藏关系。</Text></Paper>{people.map((person, index) => {
      const depth = revealDepthOf(person.id, state)
      const history = sharedHistoryOf(person.id, state)
      return <View key={person.id} style={styles.pathRow}><View style={styles.pathRail}><View style={[styles.pathDot, depth === '共事' && styles.pathDotActive]} />{index < people.length - 1 ? <View style={styles.pathLine} /> : null}</View><Pressable style={styles.pathContent} onPress={() => openPerson(person.id)}><View style={styles.pathHead}><View><Text style={styles.pathName}>{person.name} · {person.role}</Text><Text style={styles.pathDepth}>{depth} / {depth === '闻名' ? '公开闻名记录' : depth === '相识' ? '正式问话已留痕' : '共同办事已收录'}</Text></View><AppIcon name="next" size={16} /></View>{history?.length ? history.map(row => <Text key={row} style={styles.history}>— {row}</Text>) : <Text style={styles.noHistory}>尚未正式接触，不展开三问、动机或秘密。</Text>}</Pressable></View>
    })}</View> : null}

    {view === 'collection' ? <View><View style={styles.volumeTabs}><Pressable onPress={() => setVolume('contemporary')} style={[styles.volumeTab, volume === 'contemporary' && styles.volumeActive]}><Text style={styles.volumeTitle}>当世人杰册</Text><Text style={styles.volumeNote}>亲历与共事</Text></Pressable><Pressable onPress={() => setVolume('past')} style={[styles.volumeTab, volume === 'past' && styles.volumeActive]}><Text style={styles.volumeTitle}>前代名臣册</Text><Text style={styles.volumeNote}>著作与师承</Text></Pressable></View>{volume === 'past' ? <Paper><EmptyState title="尚无收录" detail="当前没有可核验的前代人物来源，不凭空填入名臣，不伪造史料出处。空白册页也是知情边界。" /></Paper> : <View style={styles.collection}>{people.map(person => { const depth = revealDepthOf(person.id, state); const history = sharedHistoryOf(person.id, state); return <Paper key={person.id} style={styles.folio}><View style={styles.folioHead}><Image source={{ uri: personImages[person.id] }} style={[styles.folioImage, depth === '闻名' && styles.veiledImage]} /><View style={styles.personIdentity}><Text style={styles.role}>{depth} · {person.origin}</Text><Text style={styles.folioName}>{person.name}</Text><Text style={smallText}>{person.rank}</Text></View></View><Text style={bodyText}>{depth === '闻名' ? person.milestones[0] : history?.length ? history[0] : '已经相识，尚无共同办事记录。'}</Text><ActionButton compact variant="ghost" label="展开人物卷" icon="next" onPress={() => openPerson(person.id)} /></Paper> })}</View>}</View> : null}
    <Text style={styles.footnote}>正式问话推进一个时段；查看人物依据不耗时。共事只由真实事件收录。</Text>
  </Screen>
}

const styles = StyleSheet.create({
  stat: { alignItems: 'flex-end' }, statNumber: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 30 }, statLabel: { ...smallText, fontSize: 10 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }, tab: { flex: 1, paddingVertical: 10, alignItems: 'center' }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.cinnabar }, tabLabel: { color: colors.muted, fontFamily: fonts.serif, fontSize: 16 }, tabLabelActive: { color: colors.cinnabar, fontWeight: '700' }, tabNote: { ...smallText, fontSize: 9, marginTop: 2 },
  roster: { gap: 12 }, personPress: { borderRadius: 7 }, pressed: { opacity: 0.75 }, personCard: { padding: 13 }, personHead: { flexDirection: 'row', alignItems: 'center', gap: 11 }, portraitWrap: { width: 64, height: 76, backgroundColor: colors.paperDeep, overflow: 'hidden' }, portrait: { width: '100%', height: '100%' }, veiled: { backgroundColor: colors.inkSoft }, veiledImage: { opacity: 0.25 }, personIdentity: { flex: 1, minWidth: 0 }, role: { ...smallText, color: colors.cinnabar, fontSize: 10 }, name: { color: colors.ink, fontFamily: fonts.serif, fontSize: 23, marginVertical: 2 }, specialty: { ...smallText }, personCopy: { ...bodyText, fontSize: 13, lineHeight: 20, marginVertical: 12 }, cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 }, claim: { ...smallText, flex: 1, fontSize: 10 },
  network: { gap: 0 }, networkIntro: { marginBottom: 16 }, networkTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 18, marginBottom: 4 }, pathRow: { flexDirection: 'row', minHeight: 112 }, pathRail: { width: 24, alignItems: 'center' }, pathDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.river, marginTop: 7 }, pathDotActive: { backgroundColor: colors.cinnabar }, pathLine: { width: 1, flex: 1, backgroundColor: colors.lineStrong }, pathContent: { flex: 1, paddingBottom: 18, paddingLeft: 7 }, pathHead: { flexDirection: 'row', justifyContent: 'space-between' }, pathName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 17 }, pathDepth: { ...smallText, marginVertical: 4 }, history: { ...bodyText, fontSize: 12, lineHeight: 19, marginTop: 4 }, noHistory: { ...smallText, marginTop: 6 },
  volumeTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 }, volumeTab: { flex: 1, borderWidth: 1, borderColor: colors.line, padding: 12, backgroundColor: colors.paperDeep }, volumeActive: { borderColor: colors.cinnabar, backgroundColor: colors.paperBright }, volumeTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16 }, volumeNote: { ...smallText, marginTop: 3 }, collection: { gap: 12 }, folio: { gap: 12 }, folioHead: { flexDirection: 'row', gap: 14, alignItems: 'center' }, folioImage: { width: 70, height: 88, backgroundColor: colors.paperDeep }, folioName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 25, marginVertical: 3 }, footnote: { ...smallText, textAlign: 'center', marginTop: 20 },
})
