import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { OverlayShell } from '../components/OverlayShell'
import { ActionButton, Chip, EmptyState, KeyValue, Paper, Seal, bodyText, smallText } from '../components/ui'
import { ledgerRows, people } from '../data'
import type { GameState } from '../game/model'
import type { OfficialActionId, RiverPlan } from '../types'
import { colors, fonts } from '../ui/theme'

const shell = { visible: true }
const leaders = ['xiancheng', 'expert', 'foreman']
const labors = [25, 30, 40]
const officialActions: Array<{ id: OfficialActionId; name: string; cost: string; can: string; cannot: string; effect: string; danger?: boolean }> = [
  { id: 'endorse', name: '批驳', cost: '不耗时段', can: '批示准驳，饬令再核，把「查」字发回县里。', cannot: '替你定下工法，也替不了你签押。', effect: '批语入卷 · 书办先自乱' },
  { id: 'commissioner', name: '委员覆勘', cost: '1 时段', can: '委员赴堤覆勘，把闸底与抢护再看一遍。', cannot: '把覆勘预先写成「合式」。', effect: '工期与定性 · 得勘报 E-008，事务转验' },
  { id: 'files', name: '调卷传询', cost: '1 时段', can: '调河厅旧修造册，传询经手书办。', cannot: '直接革职，也不能越过河厅改委。', effect: '料源与责任 · 得修造册 E-004' },
  { id: 'citation', name: '考语', cost: '不耗时段', can: '据本局实迹拟一句考语，附入册中。', cannot: '保卓异，也不能预知大计。', effect: '考语措辞 · 日后会被人翻出' },
  { id: 'impeach', name: '揭参', cost: '1 时段 · 高风险', can: '具揭参劾书办失察，稿封发河厅。', cannot: '保证揭参必准，也不能不伤县里和气。', effect: '责任与风评 · 清名与刻名并至', danger: true },
  { id: 'suppress', name: '压案', cost: '不耗时段 · 留把柄', can: '把来文压进匣底，暂不应答。', cannot: '让来文消失，幕友已经看见。', effect: '责任 · 把柄留在人手里', danger: true },
]

export function PlanOverlay({ visible, onClose, state, onPreview, onConfirm }: { visible: boolean; onClose: () => void; state: GameState; onPreview: () => void; onConfirm: (plan: Omit<RiverPlan, 'day' | 'period'>) => void }) {
  const [leader, setLeader] = useState('xiancheng')
  const [material, setMaterial] = useState(8)
  const [labor, setLabor] = useState(25)
  const [confirming, setConfirming] = useState(false)
  const person = people.find(item => item.id === leader) ?? people[0]
  const supervisor = leader === 'xiancheng' ? '县丞会勘 · 工头监作 · 保正具结' : '县丞会勘 · 主办勘报 · 保正具结'
  const detail = `先抢护旧闸下游四十步，拨料${material}垛，夫役${labor}人；闸底拆修仍俟汛后另案，夫食二十五两，不得以发起代替验收。`
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="东堤抢护 · 委牌" title={state.plan ? '签押底稿' : confirming ? '复核，再落印' : '预演抢护调度'}>
    {state.plan ? <PlanFacts plan={state.plan} /> : <>
      <Paper><Text style={styles.label}>一 · 托谁主办</Text><View style={styles.choices}>{leaders.map(id => { const item = people.find(p => p.id === id)!; return <Pressable key={id} onPress={() => { setLeader(id); setConfirming(false) }} style={[styles.choice, leader === id && styles.selected]}><Text style={styles.choiceTitle}>{item.name}</Text><Text style={smallText}>{item.role} · 工程{item.capability.工程}</Text></Pressable> })}</View></Paper>
      <Paper><Text style={styles.label}>二 · 拨多少料</Text><View style={styles.choices}>{[8, 10].map(value => <Pressable key={value} onPress={() => setMaterial(value)} style={[styles.choice, material === value && styles.selected]}><Text style={styles.choiceTitle}>{value} 垛</Text><Text style={smallText}>到场三十垛内实拨</Text></Pressable>)}</View><Text style={[styles.label, styles.gap]}>三 · 点多少夫</Text><View style={styles.choices}>{labors.map(value => <Pressable key={value} onPress={() => setLabor(value)} style={[styles.choice, labor === value && styles.selected]}><Text style={styles.choiceTitle}>{value} 人</Text><Text style={smallText}>{value === 25 ? '堡夫二十 · 河兵五' : '余者雇募'}</Text></Pressable>)}</View></Paper>
      <Paper tone="deep"><Seal>{person.monogram}</Seal><Text style={styles.title}>{person.name}主办 · 料{material}垛 · 夫{labor}人</Text><Text style={bodyText}>{detail}</Text><Text style={styles.source}>{supervisor}</Text></Paper>
      {!confirming ? <ActionButton label="复核委牌 · 尚未签押" icon="stamp" onPress={() => { onPreview(); setConfirming(true) }} /> : <><Text style={styles.warning}>签押占用一个时段。抢护须三至四日，结果仍由投入、阻力、覆勘与洪水共同决定。</Text><ActionButton label="确认签押，发起抢护" icon="stamp" onPress={() => onConfirm({ leader, leaderName: person.name, material, labor, supervisor, detail })} /></>}
    </>}
  </OverlayShell>
}

function PlanFacts({ plan }: { plan: RiverPlan }) {
  return <Paper><View style={styles.row}><Seal>{plan.leaderName[0]}</Seal><Chip tone="red">已签押</Chip></View><Text style={styles.title}>{plan.leaderName}主办东堤抢护</Text><KeyValue label="发起" value={`第${plan.day}日 ${plan.period}`} /><KeyValue label="投入" value={`料${plan.material}垛 · 夫${plan.labor}人`} /><KeyValue label="会勘" value={plan.supervisor} /><Text style={[bodyText, styles.gap]}>{plan.detail}</Text><Text style={styles.source}>签押只证明发起，执行与验收分别留痕。</Text></Paper>
}

export function ReviewOverlay({ visible, onClose, state, onAction }: { visible: boolean; onClose: () => void; state: GameState; onAction: (id: OfficialActionId) => void }) {
  const [selected, setSelected] = useState<OfficialActionId>('commissioner')
  const [confirming, setConfirming] = useState<OfficialActionId | null>(null)
  const action = officialActions.find(item => item.id === selected) ?? officialActions[0]
  const done = state.officialActions.includes(action.id)
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="上宪来文 · 知府批" title="委员覆勘，料价再核">
    <Paper><Text style={bodyText}>据永济县呈报东堤渗水并抢护缘由前来。堤工关系汛务，未便仅凭县呈遽准。仰即委员覆勘闸底情形，并将拨料数目、旧欠流转一并核查，限三日内详报，毋得粉饰。</Text><Text style={[bodyText, styles.gap]}>先行抢护准其先办后报；雇募夫役须具结存案，不得派累。</Text><Text style={styles.source}>知府只知县呈与河厅册所载 · 不能批银、改委河厅或直接革职</Text></Paper>
    <Text style={styles.label}>批答六法 · 已入卷 {state.officialActions.length}/6</Text>
    {officialActions.map(item => <Pressable key={item.id} onPress={() => { setSelected(item.id); setConfirming(null) }} style={[styles.actionRow, selected === item.id && styles.selected]}><Text style={styles.choiceTitle}>{item.name}</Text><Text style={smallText}>{state.officialActions.includes(item.id) ? '朱印 · 已入卷' : item.cost}</Text></Pressable>)}
    <Paper tone={action.danger ? 'deep' : 'light'}><Text style={styles.title}>{action.name}</Text><KeyValue label="能" value={action.can} /><KeyValue label="否" value={action.cannot} /><KeyValue label="变" value={action.effect} />{action.id === 'citation' && done ? <Text style={styles.source}>考语 · {state.plan && state.officialActions.includes('commissioner') ? '才具开展 河工尚能集事' : state.plan ? '办事勤勉 调度未纯' : '到任伊始 河工未固'}</Text> : null}{confirming === action.id ? <><Text style={styles.warning}>{action.id === 'impeach' ? '揭参一出，县里再无回旋。仍要封发？' : '压案会留把柄，日后无从分辩。仍要压下？'}</Text><ActionButton label={`仍要${action.name}`} onPress={() => { onAction(action.id); setConfirming(null) }} /></> : <ActionButton disabled={done} label={done ? '已入卷' : action.name} icon="stamp" onPress={() => action.danger ? setConfirming(action.id) : onAction(action.id)} />}</Paper>
  </OverlayShell>
}

export function EvidenceOverlay({ visible, onClose, state }: { visible: boolean; onClose: () => void; state: GameState }) {
  return <OverlayShell visible={visible} onClose={onClose} eyebrow="案 002 · 钱谷" title="同一笔三百两">
    <Paper tone="deep"><Text style={styles.title}>只并置，不抢先定罪</Text><Text style={bodyText}>三百两在库账、借领与旧欠中的名义不同；先核是否同一笔，不得重复计成六百两。</Text></Paper>
    {ledgerRows.filter(row => ['E-001', 'E-002', 'E-003'].includes(row.id)).map(row => { const known = row.unlocked || state.unlocked.includes(row.id); return <Paper key={row.id}><View style={styles.row}><Text style={styles.title}>{row.title}</Text><Chip tone={known ? 'river' : 'red'}>{known ? '已接触' : '未接触'}</Chip></View><Text style={[bodyText, styles.gap]}>{known ? row.text : row.source}</Text><Text style={styles.source}>{row.id} · {row.amount} · {row.source}</Text></Paper> })}
    <Paper><Text style={styles.title}>待核问题</Text><Text style={bodyText}>同一笔三百两，在几本账里各叫什么名字？经手人分别是谁？借领状与粮商旧欠是否指向同一笔额度？</Text><Text style={styles.source}>未接触的票据保持锁定，此处不解锁事实。</Text></Paper>
  </OverlayShell>
}

export function SigningOverlay({ visible, onClose, state, onOpenPlan }: { visible: boolean; onClose: () => void; state: GameState; onOpenPlan: () => void }) {
  return <OverlayShell {...shell} visible={visible} onClose={onClose} eyebrow="签押房 · 留档" title="东堤抢护底稿">{state.plan ? <PlanFacts plan={state.plan} /> : <Paper><EmptyState title="尚未签押" detail="主办、料数、夫役与会勘须先预演；此处不补写未发生的委牌。" /><ActionButton label="预演抢护调度" icon="stamp" onPress={onOpenPlan} /></Paper>}</OverlayShell>
}

const styles = StyleSheet.create({
  label: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1, marginVertical: 12 }, title: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20, lineHeight: 28, marginVertical: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { flexGrow: 1, minWidth: 88, padding: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperBright }, selected: { borderColor: colors.cinnabar, backgroundColor: '#963f320d' }, choiceTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16, marginBottom: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, gap: { marginTop: 12 }, source: { ...smallText, marginTop: 12 }, warning: { color: colors.cinnabarDark, fontFamily: fonts.serif, fontSize: 14, lineHeight: 22, padding: 12, backgroundColor: '#963f3212', marginVertical: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderWidth: 1, borderColor: colors.line, marginBottom: 7, backgroundColor: colors.paperBright },
})
