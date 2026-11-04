import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { documentVersions } from '../data'
import type { GameState } from '../game/model'
import type { DocMode } from '../types'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'
import { OverlayShell } from '../components/OverlayShell'
import { ActionButton, Chip, Paper, bodyText, smallText } from '../components/ui'

const compareRows = [
  { id: 'cause', label: '渗水因由', initial: '查系连日水涨，堤土未实所致。', final: '闸底情形未明，须探挖勘明。', note: '因由有改，并置两版再记。' },
  { id: 'scope', label: '险工范围', initial: '堤身渗水，约四十步。', final: '渗水四十步，湿痕三处，最大约二尺。', note: '尺寸有增补，不以初稿遮定稿。' },
  { id: 'work', label: '处置工法', initial: '培土帮戗，闸底似可毋庸拆验。', final: '先雇夫抢护；旧闸是否拆修，汛后另案。', note: '工法措辞不同，先查所据。' },
  { id: 'material', label: '拨料数目', initial: '拨料八垛，先行抢修。', final: '先拨料八至十垛，三日内补报。', note: '料数改为区间，仍须到账核对。' },
]
const tabs: Array<{ id: DocMode; label: string }> = [
  { id: 'dossier', label: '卷宗' }, { id: 'original', label: '原件' }, { id: 'reading', label: '释文' }, { id: 'compare', label: '对勘' },
]

interface Props {
  visible: boolean
  onClose: () => void
  state: GameState
  selected: string[]
  onToggle: (id: string) => void
  onRemember: () => void
  openOverlay: (overlay: OpenOverlayId) => void
}

export function DocumentOverlay({ visible, onClose, state, selected, onToggle, onRemember, openOverlay }: Props) {
  const [mode, setMode] = useState<DocMode>('dossier')
  const remembered = state.completedActions.includes('doc-remembered')
  const selections = selected?.length ? selected : []
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="河工案卷 · 001 / 第一日辰时收件" title={mode === 'dossier' ? '东堤河工卷宗' : '东堤渗水呈文'} footer={mode === 'dossier' ? <ActionButton label="展开东堤呈文" icon="cases" onPress={() => setMode('original')} /> : <ActionButton label={remembered ? '已记入情报台账' : selections.length < 2 ? '选两处，记下疑点' : '记住疑点'} icon="check" disabled={remembered || selections.length < 2} onPress={onRemember} />}>
    <View style={styles.tabs}>{tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: mode === tab.id }} onPress={() => setMode(tab.id)} style={[styles.tab, mode === tab.id && styles.tabActive]}><Text style={[styles.tabText, mode === tab.id && styles.tabTextActive]}>{tab.label}</Text></Pressable>)}</View>
    {mode === 'dossier' ? <View style={styles.dossier}>
      <Paper><Text style={styles.folioTitle}>卷内文书</Text><Text style={styles.folioMeta}>四类归卷 · 只回查，不新立文书</Text>
        <DirectoryRow id="V-001 / V-002" title="东堤渗水呈文" detail="初稿与定稿 · 两版有改" onPress={() => setMode('compare')} />
        <DirectoryRow id="府札" title="上宪来文" detail="委员覆勘 · 料价再核" onPress={() => openOverlay('review')} />
        <DirectoryRow id="E-001—003" title="三百两证据链" detail={`已接触 ${['E-001', 'E-002', 'E-003'].filter(id => state.unlocked.includes(id)).length} / 3`} onPress={() => openOverlay('evidence')} />
        <DirectoryRow id="题销册" title="第一章考语与行状" detail="只收已经发生并能回查的实迹" onPress={() => openOverlay('epilogue')} />
      </Paper>
      <Paper tone="deep"><Text style={styles.noteTitle}>归卷边界</Text><Text style={bodyText}>呈文、府札、账证与题销各自有源。阅卷不等于记疑点，签押发起也不等于工程办成。</Text></Paper>
    </View> : null}
    {mode === 'original' || mode === 'reading' ? <Paper style={styles.original}>
      <Text style={styles.docTitle}>为呈报东堤渗险情事</Text><Text style={styles.version}>{documentVersions.initial.id} · {documentVersions.initial.label} / {documentVersions.initial.author}</Text>
      {documentVersions.initial.paragraphs.map((paragraph, index) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
      <View style={styles.signature}><Text style={styles.signatureText}>河工书办 谨呈</Text><View style={styles.seal}><Text style={styles.sealText}>河工之记</Text></View></View>
      <Text style={styles.redNote}>朱批 / 两版因由、尺寸、工法与料数有改，须逐处对勘。</Text>
      <ActionButton label="去看改动" compact variant="secondary" onPress={() => setMode('compare')} />
      {mode === 'reading' ? <Text style={smallText}>横排释文仅转换版式，不更改原件文字。</Text> : null}
    </Paper> : null}
    {mode === 'compare' ? <View>
      <View style={styles.compareIntro}><Text style={bodyText}>点选两版中的具体文句并置，最多三处。</Text><Chip tone="red">已选 {selections.length} / 3</Chip></View>
      {compareRows.map(row => <Paper key={row.id} style={styles.compareCard}><Text style={styles.compareLabel}>{row.label}</Text><Text style={styles.compareNote}>{row.note}</Text>
        <CompareText id={`${row.id}-initial`} version="V-001 · 初稿" text={row.initial} selected={selections} onToggle={onToggle} />
        <CompareText id={`${row.id}-final`} version="V-002 · 定稿" text={row.final} selected={selections} onToggle={onToggle} />
      </Paper>)}
      <Text style={styles.source}>来源链　V-001 书办呈文　→　V-002 知县／幕友改定</Text>
    </View> : null}
  </OverlayShell>
}

function DirectoryRow({ id, title, detail, onPress }: { id: string; title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.directory}><Text style={styles.directoryId}>{id}</Text><View style={styles.flex}><Text style={styles.directoryTitle}>{title}</Text><Text style={smallText}>{detail}</Text></View><Text style={styles.open}>阅</Text></Pressable>
}

function CompareText({ id, version, text, selected, onToggle }: { id: string; version: string; text: string; selected: string[]; onToggle: (id: string) => void }) {
  const active = selected.includes(id)
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onToggle(id)} style={[styles.compareText, active && styles.compareSelected]}><View style={styles.compareVersion}><Text style={styles.version}>{version}</Text>{active ? <Chip active tone="red">第 {selected.indexOf(id) + 1} 处</Chip> : <Chip>点选</Chip>}</View><Text style={styles.paragraph}>{text}</Text></Pressable>
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }, tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.cinnabar }, tabText: { color: colors.muted, fontFamily: fonts.serif, fontSize: 16 }, tabTextActive: { color: colors.cinnabar, fontWeight: '700' },
  dossier: { gap: 14 }, folioTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 21 }, folioMeta: { ...smallText, marginBottom: 8 }, directory: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, directoryId: { width: 80, color: colors.cinnabar, fontFamily: fonts.mono, fontSize: 10 }, directoryTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16 }, open: { color: colors.cinnabar, borderWidth: 1, borderColor: colors.cinnabar, paddingHorizontal: 9, paddingVertical: 7 }, noteTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 18, marginBottom: 8 },
  original: { gap: 16, padding: 22 }, docTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 23, textAlign: 'center' }, version: { ...smallText }, paragraph: { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 16, lineHeight: 28 }, signature: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 15 }, signatureText: { ...bodyText }, seal: { borderWidth: 2, borderColor: colors.cinnabar, padding: 8 }, sealText: { color: colors.cinnabar, fontFamily: fonts.serif }, redNote: { color: colors.cinnabar, fontFamily: fonts.serif, lineHeight: 23, borderLeftWidth: 2, borderLeftColor: colors.cinnabar, paddingLeft: 10 },
  compareIntro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }, compareCard: { marginBottom: 12, padding: 12 }, compareLabel: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20 }, compareNote: { ...smallText, marginVertical: 5 }, compareText: { minHeight: 44, padding: 12, marginTop: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, compareSelected: { borderColor: colors.cinnabar, backgroundColor: '#963f320d' }, compareVersion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, source: { ...smallText, textAlign: 'center', marginVertical: 10 },
})
