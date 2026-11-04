import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { OverlayShell } from '../components/OverlayShell'
import { ActionButton, Chip, KeyValue, Paper, Seal, bodyText, smallText } from '../components/ui'
import { goals } from '../data'
import { personImages } from '../data/assets'
import { capabilityKeys, capabilityTitleOf, needKeys, revealDepthOf, sharedHistoryOf, specialtyOf, topNeedsOf } from '../game/people'
import type { GameState } from '../game/model'
import { worldEvents } from '../game/schedule'
import type { Person } from '../types'
import { colors, fonts } from '../ui/theme'

export function PersonOverlay({ visible, onClose, person, state, onAsk }: { visible: boolean; onClose: () => void; person: Person; state: GameState; onAsk: () => void }) {
  const [folio, setFolio] = useState<'profile' | 'questions' | 'history'>('profile')
  const depth = revealDepthOf(person.id, state)
  const known = depth !== '闻名'
  const asked = state.asked?.includes(person.id) ?? false
  const history = sharedHistoryOf(person.id, state)
  const specialty = specialtyOf(person)
  const ask = () => { setFolio('questions'); onAsk() }
  return <OverlayShell visible={visible} onClose={onClose} eyebrow={person.rank} title={`${person.name} · ${person.role}`} sheet footer={<View><ActionButton label={asked ? '复述口供 · 不耗时' : `正式问${person.role} · 1时段`} icon="person" onPress={ask} /><Text style={styles.footerNote}>{asked ? '重复已得口供不再推进时间，也不会产生新证据。' : '一次社交动作包含同场景的一轮交谈。'}</Text></View>}>
    <View style={styles.personHero}><Image source={{ uri: personImages[person.id] }} style={[styles.portrait, !known && styles.veiled]} /><View style={styles.personIdentity}><Text style={styles.name}>{person.name}<Text style={styles.styleName}>　{person.style}</Text></Text><View style={styles.tagRow}><Chip tone="red">{person.seal}</Chip><Chip active={depth === '共事'}>{depth}</Chip></View><Text style={styles.specialty}>{specialty.label} · {person.reputation.join(' · ')}</Text><Text style={smallText}>{person.origin}</Text></View></View>
    <Paper tone="deep" style={styles.contact}><Text style={styles.sectionLabel}>接触路径 / {depth}</Text>{history?.length ? history.slice(0, 2).map(row => <Text key={row} style={styles.history}>— {row}</Text>) : <Text style={smallText}>尚未正式接触，只保留公开名录与闻名记录。</Text>}<Text style={styles.boundary}>只记你与对方的来路，不换算好感，不推出未知秘密。</Text></Paper>
    {!known ? <><Text style={styles.quote}>{person.quote}</Text><Paper><Text style={styles.lockedTitle}>只闻其名</Text><Text style={bodyText}>能力、动机与三问须正式接触后才可见；人物不靠抽卡获得。</Text><Text style={[smallText, styles.spaced]}>公开行状 / {person.milestones[0]}</Text></Paper></> : <>
      <View style={styles.tabs}>{([['profile', '形与能'], ['questions', '三问'], ['history', '行状']] as const).map(([id, label]) => <Pressable key={id} onPress={() => setFolio(id)} style={[styles.tab, folio === id && styles.tabActive]}><Text style={[styles.tabText, folio === id && styles.tabTextActive]}>{label}</Text></Pressable>)}</View>
      {folio === 'profile' ? <Paper><Text style={styles.sectionTitle}>能力</Text>{capabilityKeys.map(key => <Meter key={key} label={`${key} · ${capabilityTitleOf(person.capability[key])}`} value={person.capability[key]} max={5} />)}<Text style={[styles.sectionTitle, styles.spaced]}>动机</Text>{needKeys.map(key => <Meter key={key} label={key} value={person.needs[key]} max={3} />)}<Text style={[styles.sectionTitle, styles.spaced]}>往来筹码</Text><KeyValue label="他欠你 / 你把柄 / 你欠他" value={`${person.tokens.owesYou} / ${person.tokens.hook} / ${person.tokens.youOwe}`} /><Text style={[bodyText, styles.spaced]}>{person.hookNote}</Text></Paper> : null}
      {folio === 'questions' ? <><Paper><Text style={styles.sectionTitle}>看人三问</Text><Text style={smallText}>不是好感，是判断依据。</Text>{person.questions.map((question, index) => <View key={question.label} style={styles.question}><Seal size={34}>{index === 0 ? '能' : index === 1 ? '愿' : '敢'}</Seal><View style={styles.questionBody}><Text style={styles.questionTitle}>{question.label}</Text><Text style={bodyText}>{question.answer}</Text><Text style={smallText}>依据 / {question.basis}</Text></View></View>)}</Paper>{asked ? <Paper tone="deep" style={styles.block}><Text style={styles.sectionLabel}>已取得说法 · {person.claimId}</Text><Text style={bodyText}>{person.claim}</Text><Text style={styles.boundary}>口供仍为存疑，不自动视为事实。</Text></Paper> : null}<Paper style={styles.block}><Text style={styles.sectionLabel}>忌讳</Text><Text style={bodyText}>{person.fear}</Text></Paper></> : null}
      {folio === 'history' ? <Paper><Text style={styles.sectionTitle}>{history?.length ? '你与共同经历' : '他的行状'}</Text>{(history?.length ? history : person.milestones).map((row, index) => <View key={row} style={styles.historyRow}><Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text><Text style={[bodyText, styles.questionBody]}>{row}</Text></View>)}{depth === '共事' ? <Text style={styles.boundary}>共事已收录当世人杰册，行状由真实事件生成。</Text> : null}</Paper> : null}
    </>}
  </OverlayShell>
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return <View style={styles.meter}><Text style={styles.meterLabel}>{label}</Text><View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, value / max * 100))}%` }]} /></View><Text style={styles.meterValue}>{value}</Text></View>
}

export function BanquetOverlay({ visible, onClose, state, onChoose }: { visible: boolean; onClose: () => void; state: GameState; onChoose: (choice: 'attend' | 'delegate' | 'audit') => void }) {
  const night = state.periodIndex === 3
  const chosen = state.giftEntries?.length ? state.giftEntries : []
  const options = [
    { id: 'attend' as const, name: '亲赴桑宅', seal: '赴', cost: '私囊 −20 两', text: '得粮商旧欠票据 E-003，与粮商、士绅正式接触；清名沾应酬。' },
    { id: 'delegate' as const, name: '请县丞代往', seal: '托', cost: '私囊 −6 两', text: '县衙礼数未失，县丞记下托付；旧欠只听转述。' },
    { id: 'audit' as const, name: '闭门查旧册', seal: '查', cost: '不赴宴', text: '得主簿借领状 E-002；桑宅面上无光，主簿连夜打听。' },
  ]
  const choose = (id: 'attend' | 'delegate' | 'audit') => { if (onChoose.length >= 0) { onChoose(id); onClose() } }
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="桑宅请帖 · 第一日夜" title="接风宴，三本账同到。" sheet>
    <Paper tone="deep"><Text style={styles.invitation}>桑鹤龄 敬备薄酌{'\n'}恭候县尊光临</Text><Text style={smallText}>帖中另附坟图一页。旧欠、土源与接风礼数，今夜须作取舍。</Text></Paper>
    {chosen.length ? <Paper style={styles.block}><Text style={styles.sectionLabel}>已入礼簿</Text>{chosen.map(entry => <Text key={entry} style={[bodyText, styles.spaced]}>{entry}</Text>)}</Paper> : null}
    {!night ? <Text style={styles.notice}>此刻尚未入夜。可先查看三项取舍，入夜后才能决定。</Text> : null}
    {options.map(option => <Paper key={option.id} style={styles.option}><View style={styles.optionHead}><Seal>{option.seal}</Seal><View style={styles.questionBody}><Text style={styles.optionTitle}>{option.name}</Text><Text style={styles.cost}>{option.cost}</Text></View></View><Text style={bodyText}>{option.text}</Text><ActionButton label={chosen.length ? '本夜取舍已记' : night ? `依此办理 · ${option.name}` : '待入夜'} disabled={!night || chosen.length > 0} variant={option.id === 'attend' ? 'primary' : 'secondary'} onPress={() => choose(option.id)} /></Paper>)}
  </OverlayShell>
}

export function WorldOverlay({ visible, onClose, state, onResolve }: { visible: boolean; onClose: () => void; state: GameState; onResolve: (eventId: string, optionId: string) => void }) {
  const event = worldEvents.find(item => item.id === state.pendingEvent)
  return <OverlayShell visible={visible} onClose={onClose} eyebrow={event?.scene ?? '世界日程'} title={event?.title ?? '当前无未决事件'} sheet>
    {event ? <><Paper tone="deep"><KeyValue label="在场" value={event.present} /><Text style={[smallText, styles.spaced]}>已知 / {event.known}</Text></Paper><Text style={[bodyText, styles.eventBody]}>{event.body}</Text>{event.options.map((option, index) => <Paper key={option.id} style={styles.option}><Text style={styles.optionTitle}>{String(index + 1).padStart(2, '0')} · {option.label}</Text><Text style={[smallText, styles.spaced]}>{option.hint}</Text><ActionButton label="依此落笔" variant={index === 0 ? 'primary' : 'secondary'} onPress={() => { onResolve(event.id, option.id); onClose() }} /></Paper>)}</> : <Paper><Text style={bodyText}>已经处理过的事不会自动重来。可回到今日案头继续日程。</Text></Paper>}
  </OverlayShell>
}

export function GoalOverlay({ visible, onClose, state, onSetGoal, onReset }: { visible: boolean; onClose: () => void; state: GameState; onSetGoal: (goalId: string) => void; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="到任立志 · 随时回查" title="这一任，你先求什么？" sheet>
    <Text style={[bodyText, styles.goalIntro]}>志向不是阵营，也不是永久增益。它只决定章末如何与你自己的初衷对账。</Text>
    {goals.map(goal => <Pressable key={goal.id} onPress={() => onSetGoal(goal.id)} style={[styles.goal, state.goalId === goal.id && styles.goalActive]}><Seal>{goal.seal}</Seal><View style={styles.questionBody}><View style={styles.optionHead}><Text style={styles.optionTitle}>{goal.title}</Text>{state.goalId === goal.id ? <Chip tone="red">已立</Chip> : null}</View><Text style={bodyText}>{goal.statement}</Text><Text style={smallText}>{goal.hint}</Text></View></Pressable>)}
    <Paper tone="deep" style={styles.block}>{!confirming ? <ActionButton label="重开第一汛 · 清除本机存档" icon="refresh" variant="secondary" onPress={() => setConfirming(true)} /> : <><Text style={styles.optionTitle}>确定重开？</Text><Text style={[bodyText, styles.spaced]}>当前日程、证据、人情与礼簿都会清除，此操作不能撤回。</Text><View style={styles.confirmActions}><ActionButton compact label="保留此局" variant="secondary" onPress={() => setConfirming(false)} /><ActionButton compact label="确认重开" onPress={() => { onReset(); setConfirming(false); onClose() }} /></View></>}</Paper>
  </OverlayShell>
}

const styles = StyleSheet.create({
  personHero: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 16 }, portrait: { width: 112, height: 140, backgroundColor: colors.paperDeep }, veiled: { opacity: 0.28 }, personIdentity: { flex: 1, gap: 7 }, name: { color: colors.ink, fontFamily: fonts.serif, fontSize: 28 }, styleName: { color: colors.muted, fontSize: 13 }, tagRow: { flexDirection: 'row', gap: 6 }, specialty: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 14 },
  contact: { marginBottom: 14, gap: 5 }, sectionLabel: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1, marginBottom: 5 }, history: { ...bodyText, fontSize: 13 }, boundary: { ...smallText, marginTop: 10 }, quote: { color: colors.ink, fontFamily: fonts.serif, fontSize: 19, lineHeight: 30, padding: 18 }, lockedTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20, marginBottom: 8 },
  tabs: { flexDirection: 'row', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, tab: { flex: 1, paddingVertical: 11, alignItems: 'center' }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.cinnabar }, tabText: { color: colors.muted, fontSize: 13 }, tabTextActive: { color: colors.cinnabar, fontWeight: '700' }, sectionTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 19, marginBottom: 8 }, spaced: { marginTop: 10 }, block: { marginTop: 12 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }, meterLabel: { ...smallText, width: 91 }, meterTrack: { flex: 1, height: 4, backgroundColor: colors.paperDeep }, meterFill: { height: 4, backgroundColor: colors.river }, meterValue: { ...smallText, width: 15, textAlign: 'right' },
  question: { flexDirection: 'row', gap: 11, marginTop: 16 }, questionBody: { flex: 1, gap: 5, minWidth: 0 }, questionTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16 }, historyRow: { flexDirection: 'row', gap: 10, marginVertical: 10 }, index: { color: colors.cinnabar, fontFamily: fonts.mono }, footerNote: { ...smallText, textAlign: 'center', marginTop: 7 },
  invitation: { color: colors.ink, fontFamily: fonts.serif, fontSize: 24, lineHeight: 38, textAlign: 'center', marginBottom: 16 }, notice: { color: colors.cinnabarDark, backgroundColor: '#963f3212', padding: 12, marginVertical: 12, lineHeight: 20 }, option: { marginTop: 12, gap: 12 }, optionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, optionTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 19 }, cost: { color: colors.cinnabar, fontSize: 12 }, eventBody: { fontSize: 17, lineHeight: 29, marginVertical: 20 },
  goalIntro: { marginBottom: 14 }, goal: { flexDirection: 'row', gap: 13, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperBright, marginBottom: 10 }, goalActive: { borderColor: colors.cinnabar, backgroundColor: '#963f320b' }, confirmActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 14 },
})
