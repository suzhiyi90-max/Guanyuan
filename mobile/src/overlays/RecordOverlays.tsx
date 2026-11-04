import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { OverlayShell } from '../components/OverlayShell'
import { ActionButton, Chip, EmptyState, KeyValue, Paper, ProgressBar, Seal, bodyText, smallText } from '../components/ui'
import { goalReckoningOf, nextCheckpointOf, periods, taskProgressOf, taskStageOf, type GameState } from '../game/model'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'

type BaseProps = { visible: boolean; onClose: () => void; state: GameState }
type SummaryProps = BaseProps & { openOverlay: (overlay: OpenOverlayId) => void }

export function IntelligenceOverlay({ visible, onClose, state }: BaseProps) {
  const clues = state.clues?.length ? state.clues : []
  const comparisons = state.comparisons?.length ? state.comparisons : []
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="副卷 / 来源可追" title="情报台账">
    <Paper><Text style={styles.heading}>已录线索 · {clues.length}</Text>{clues.length ? clues.map(clue => <View key={clue.id} style={styles.record}><View style={styles.recordHead}><Chip tone="red">{clue.id}</Chip><Text style={styles.meta}>第{clue.day}日 · {(clue.refs?.length ? clue.refs : ['来源未标']).join(' / ')}</Text></View><Text style={bodyText}>{clue.text}</Text><Text style={smallText}>来源 / {clue.source === 'document' ? '呈文对勘' : clue.source === 'ledger' ? '账目并置' : '现场探挖'} · 存疑待核</Text></View>) : <EmptyState title="尚无已录线索" detail="读呈、对账或亲勘之后，线索会携来源与当日入卷。" />}</Paper>
    <Paper style={styles.block}><Text style={styles.heading}>并置问题 · {comparisons.length}</Text>{comparisons.length ? comparisons.map(item => <View key={item.id} style={styles.record}><Text style={styles.question}>{item.question}</Text><Text style={smallText}>{item.id} · 第{item.day}日 · {(item.refs?.length ? item.refs : ['来源未标']).join(' / ')}</Text></View>) : <EmptyState title="尚无并置问题" detail="至少并置两版呈文或两项账证，才会留下待核问题。" />}</Paper>
  </OverlayShell>
}

export function SummaryOverlay({ visible, onClose, state, openOverlay }: SummaryProps) {
  const plan = state.plan
  const checkpoint = nextCheckpointOf(state)
  return <OverlayShell visible={visible} onClose={onClose} eyebrow={`第${state.day}日 · ${periods[state.periodIndex]}`} title="今日事务摘要" sheet>
    <Paper><Text style={styles.heading}>三行日志</Text><KeyValue label="成" value={state.log.done} /><KeyValue label="卡" value={state.log.stuck} /><KeyValue label="传" value={state.log.rumor} /></Paper>
    <Paper style={styles.block}><Text style={styles.heading}>东堤抢护 · {taskStageOf(state)}</Text>{plan ? <><Text style={bodyText}>{plan.leaderName}主办 · 料{plan.material}垛 · 夫{plan.labor}人</Text><View style={styles.progress}><ProgressBar value={taskProgressOf(state)} /></View><Text style={smallText}>{checkpoint.when} / {checkpoint.label}</Text></> : <Text style={bodyText}>尚未签押。先读呈、问人、对勘，再预演调度。</Text>}<View style={styles.actions}><ActionButton compact label={plan ? '回看委牌' : '预演抢护'} onPress={() => openOverlay('plan')} /><ActionButton compact variant="secondary" label="打开案卷" onPress={() => openOverlay('document')} /></View></Paper>
    <Paper style={styles.block}><Text style={styles.heading}>河工料账</Text><View style={styles.material}>{([['到场', state.material.arrived], ['在途', state.material.transit], ['未发', state.material.unsent]] as const).map(([label, value]) => <View key={label} style={styles.materialItem}><Text style={styles.materialValue}>{value}</Text><Text style={smallText}>{label} / 垛</Text></View>)}</View><Text style={smallText}>在途不等于到场；复秤才知虚实，未发仍系于旧欠。</Text></Paper>
    <ActionButton label="查阅完整台账" icon="book" variant="secondary" onPress={() => openOverlay('intelligence')} />
  </OverlayShell>
}

type RecordTab = 'citation' | 'deeds' | 'reckoning' | 'legacy'
const tabs: Array<{ id: RecordTab; label: string }> = [{ id: 'citation', label: '考语' }, { id: 'deeds', label: '行状' }, { id: 'reckoning', label: '志向对账' }, { id: 'legacy', label: '留下的账' }]
const officialNames: Record<string, string> = { endorse: '批回上宪来文', commissioner: '委员覆勘东堤', files: '调卷传询', citation: '拟考语入册', impeach: '具揭参劾', suppress: '压下来文' }

function citationOf(state: GameState) {
  if (state.outcome?.grade === '合龙') return '才具开展 河工尚能集事'
  if (state.outcome?.grade === '合式' || (state.plan && state.officialActions.includes('commissioner'))) return '办事勤勉 调度有征'
  if (state.outcome) return '抢护未固 担当与工法俱须再议'
  return state.plan ? '办事勤勉 调度未纯' : '河工未举 考语无实迹可附'
}

export function EpilogueOverlay({ visible, onClose, state }: BaseProps) {
  const [tab, setTab] = useState<RecordTab>('citation')
  const reckoning = goalReckoningOf(state)
  const outcome = state.outcome
  const failed = outcome?.grade === '失事' || outcome?.grade === '溃口'
  const deeds = [{ id: 'arrival', title: '接印视事', source: '县衙到任簿 / 东堤呈文', text: '收东堤渗水呈文一件，河工案由此起。' }]
  if (state.completedActions.includes('doc-remembered')) deeds.push({ id: 'doc', title: '并置两版呈文', source: 'V-001 / V-002', text: state.comparisons.find(item => item.source === 'document')?.question ?? '改动与疑点已入册，未凭版本差异直接定罪。' })
  if (state.unlocked.includes('E-002')) deeds.push({ id: 'ledger', title: '查旧册得借领状', source: 'E-002 主簿借领状', text: '三百两有了借领名目，旧欠与损耗可以互核。' })
  if (state.asked.length) deeds.push({ id: 'people', title: '问人留词', source: '人情接触记录', text: `正式接触 ${state.asked.length} 人，各自说法分别入册。` })
  state.giftEntries.forEach((entry, index) => deeds.push({ id: `gift-${index}`, title: '接风宴取舍', source: '礼簿 / 私囊账', text: entry }))
  if (state.probeKnown) deeds.push({ id: 'probe', title: '亲勘闸底', source: 'E-007 探挖记录', text: '探挖见淘空三尺；十日窗口只能抢护，拆修仍须汛后另案。' })
  if (state.plan) deeds.push({ id: 'plan', title: '签押发起抢护', source: '东堤抢护签押底稿', text: `${state.plan.leaderName}主办，拨料${state.plan.material}垛，夫役${state.plan.labor}人；发起与完成分别记录。` })
  state.officialActions.forEach(id => deeds.push({ id: `official-${id}`, title: officialNames[id] ?? id, source: '知府审查卷', text: '动作与批语已经留痕，能力边界与后果不以一句考语抹平。' }))
  if (outcome) deeds.push({ id: 'outcome', title: `抢护验收 ${outcome.grade}`, source: '东堤抢护题销册', text: `${outcome.symptom} ${outcome.factors.map(item => item.detail).join('；')}` })
  const grades = [
    { id: '守', text: state.officialActions.includes('suppress') ? '压文留隙 守字难称' : state.officialActions.includes('impeach') ? '持守过峻 清刻并见' : '簿册自警 未敢遽断' },
    { id: '才', text: state.plan ? '临事有举 调度可征' : '临事未定 抢护未举' },
    { id: '政', text: outcome ? `东堤验收 ${outcome.grade}` : state.plan ? '抢护已举 成效待验' : '河工未举 政声无附' },
    { id: '年', text: '年力未载 无据不填' },
  ]
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="永济县知县 · 第一章行状" title="一任如何，要看做过什么。">
    <View style={styles.tabs}>{tabs.map(item => <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}><Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text></Pressable>)}</View>
    {tab === 'citation' ? <><View style={styles.grades}>{grades.map(item => <Paper key={item.id} style={styles.grade}><Seal>{item.id}</Seal><Text style={styles.gradeText}>{item.text}</Text></Paper>)}</View><Paper tone="deep"><Text style={styles.eyebrow}>一句考语 / 不评分</Text><Text style={styles.citation}>“{citationOf(state)}”</Text><Text style={smallText}>措辞只据这一任已经发生的事，不预写大计与卓异。</Text></Paper></> : null}
    {tab === 'deeds' ? <Paper><Text style={styles.heading}>实迹编年 · {deeds.length} 件</Text>{deeds.map((deed, index) => <View key={deed.id} style={styles.deed}><Text style={styles.deedIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={styles.deedTitle}>{deed.title}</Text><Text style={bodyText}>{deed.text}</Text><Text style={smallText}>据 / {deed.source}</Text></View></View>)}</Paper> : null}
    {tab === 'reckoning' ? <><Paper><Text style={styles.heading}>当初想要的，后来剩下什么</Text>{reckoning ? <><View style={styles.reckoningHead}><Seal>{reckoning.seal}</Seal><Text style={styles.deedTitle}>志向 · {reckoning.title}</Text></View>{reckoning.rows.map(row => <View key={row.text} style={styles.reckoningRow}><Chip tone={row.tone === '进' ? 'river' : 'red'}>{row.tone}</Chip><Text style={[bodyText, styles.flex]}>{row.text}</Text></View>)}</> : <EmptyState title="章首未立志" detail="此处不留空泛评语。" />}</Paper><Paper style={styles.block}><Text style={styles.heading}>东堤抢护题销册</Text><Text style={bodyText}>{state.plan ? `${state.plan.leaderName}主办 · 料${state.plan.material}垛 · 夫${state.plan.labor}人 · 夫食25两` : '未发起抢护，题销册上无工可题。'}</Text>{outcome ? <Text style={styles.citation}>{outcome.grade} / {outcome.symptom}</Text> : null}</Paper></> : null}
    {tab === 'legacy' ? <><Paper><Text style={styles.heading}>册子合上以后，账还在走</Text><KeyValue label="风评仍在" value={state.log.rumor} /><KeyValue label="私囊余数" value={`${state.privateFunds} 两 / 礼簿${state.giftEntries.length}笔`} /><KeyValue label="未结线索" value={`${state.clues.length} 条，来源仍留台账`} /></Paper>{failed ? <Paper style={styles.block}><Text style={styles.heading}>失败不是终局 · 三条退路</Text>{[['改任幕友', '留住工法与案卷判断，失去签押之权。'], ['回乡为绅', '留住私囊与地方人情，失去仕途与未结旧欠。'], ['书院教读', '留住清名与后续援引，失去河工与县衙日程。']].map(([name, text]) => <View key={name} style={styles.retreat}><Text style={styles.deedTitle}>{name}</Text><Text style={bodyText}>{text}</Text></View>)}</Paper> : <Paper style={styles.block}><Text style={bodyText}>下一章不替这一章洗净代价。只记已经发生事，不预写身后名。</Text></Paper>}</> : null}
    <View style={styles.next}>{tab !== 'legacy' ? <ActionButton label={`续读 ${tabs[tabs.findIndex(item => item.id === tab) + 1].label}`} onPress={() => setTab(tabs[tabs.findIndex(item => item.id === tab) + 1].id)} /> : <ActionButton label="合上册子，回到案头" onPress={onClose} />}</View>
  </OverlayShell>
}

const styles = StyleSheet.create({
  block: { marginTop: 14 }, heading: { color: colors.ink, fontFamily: fonts.serif, fontSize: 21, marginBottom: 14 }, record: { paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: 8 }, recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, meta: { ...smallText, flex: 1, textAlign: 'right' }, question: { ...bodyText, color: colors.cinnabarDark, fontSize: 17 }, actions: { flexDirection: 'row', gap: 8, marginVertical: 14 }, progress: { marginVertical: 14 },
  material: { flexDirection: 'row', marginBottom: 14 }, materialItem: { flex: 1, alignItems: 'center' }, materialValue: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 28 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }, tab: { flex: 1, paddingVertical: 11, alignItems: 'center' }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.cinnabar }, tabText: { color: colors.muted, fontSize: 12 }, tabTextActive: { color: colors.cinnabar, fontWeight: '700' },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, grade: { width: '48%', alignItems: 'center', gap: 9 }, gradeText: { ...bodyText, textAlign: 'center', fontSize: 13 }, eyebrow: { ...smallText, color: colors.cinnabar }, citation: { color: colors.ink, fontFamily: fonts.serif, fontSize: 23, lineHeight: 34, marginVertical: 12 },
  deed: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, deedIndex: { color: colors.cinnabar, fontFamily: fonts.mono }, deedTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 17, marginBottom: 5 }, flex: { flex: 1 }, reckoningHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }, reckoningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 }, retreat: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, next: { marginTop: 18 },
})
