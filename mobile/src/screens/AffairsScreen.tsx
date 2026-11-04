import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameState } from '../game/model'
import { nextCheckpointOf, taskProgressOf, taskStageOf } from '../game/model'
import type { SceneId, SectionId, TaskStage } from '../types'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'
import { ActionButton, Chip, KeyValue, Paper, PreviewBadge, ProgressBar, Screen, SectionTitle, Seal, bodyText, smallText } from '../components/ui'

const stages: Array<{ id: TaskStage; note: string }> = [{ id: '起', note: '接呈立案' }, { id: '查', note: '问人看账' }, { id: '谋', note: '预演调度' }, { id: '办', note: '签押执行' }, { id: '验', note: '会勘复核' }, { id: '结', note: '验收题销' }]
const tokens = [
  { id: 'relief', name: '以工代赈', seal: '赈', type: '赈济', action: '把赈济与河工编入同一件执行事务。', expiry: '随章立期，逾期须重新核验。', cost: '粮料、夫役与后续验收责任。' },
  { id: 'survey', name: '清丈', seal: '丈', type: '钱粮', action: '另起清丈核查事务，不以牌面直接改账。', expiry: '按核查期限生效，不永久留存。', cost: '人手、文书与地方解释成本。' },
  { id: 'baojia', name: '保甲', seal: '甲', type: '治安', action: '进入编查与执行事务，仍须逐项验收。', expiry: '按章或季限时，逾期失效。', cost: '编查人力、风评与执行风险。' },
]
const offices = [
  { name: '吏房', note: '考课与委牌', detail: '人事实迹仍回到抢护委托与考语，不另造品级数值。', overlay: 'plan' as const },
  { name: '户房', note: '钱粮与旧欠', detail: '同一笔三百两只按现有证据链并置，不预先定罪。', overlay: 'evidence' as const },
  { name: '礼房', note: '仪注与应酬', detail: '接风、程仪与礼簿沿用夜事件及生活记录。', overlay: 'banquet' as const },
  { name: '兵房', note: '河兵与夫役', detail: '堡夫二十、河兵五，余者雇募，按委牌与名册核查。', overlay: 'plan' as const },
  { name: '刑房', note: '传询与揭参', detail: '调卷、传询、揭参仍由上宪回文动作承载。', overlay: 'review' as const },
  { name: '工房', note: '河工与覆勘', detail: '闸底探挖、工法与委员覆勘回到东堤及上宪来文。', overlay: 'review' as const },
]

export function AffairsScreen({ state, navigate, changeScene, openOverlay }: { state: GameState; navigate: (section: SectionId) => void; changeScene: (scene: SceneId) => void; openOverlay: (overlay: OpenOverlayId) => void }) {
  const [view, setView] = useState<'tasks' | 'tokens' | 'offices'>('tasks')
  const [tokenId, setTokenId] = useState(tokens[0].id)
  const [back, setBack] = useState(false)
  const [compared, setCompared] = useState<string[]>([])
  const stage = taskStageOf(state)
  const stageIndex = stages.findIndex(item => item.id === stage)
  const checkpoint = nextCheckpointOf(state)
  const token = tokens.find(item => item.id === tokenId) ?? tokens[0]
  const toggleCompare = (id: string) => setCompared(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 2 ? [...current, id] : current)

  return <Screen><SectionTitle eyebrow="事务 / 发起不是办成" title="你签过字的，都在往前走。" detail="阶段、执行人与世界时钟分别留痕；进度不代替验收。" action={<PreviewBadge />} />
    <View style={styles.tabs}>{([['tasks', '事务盘'], ['tokens', '政令牌'], ['offices', '六房值房']] as const).map(([id, label]) => <Pressable key={id} onPress={() => setView(id)} style={[styles.tab, view === id && styles.tabActive]}><Text style={[styles.tabText, view === id && styles.tabTextActive]}>{label}</Text></Pressable>)}</View>
    {view === 'tasks' ? <>
      <Paper><View style={styles.row}><View><Text style={styles.eyebrow}>案 001 · 东堤险工</Text><Text style={styles.cardTitle}>东堤抢护</Text></View><Chip active={Boolean(state.plan)} tone="red">{state.plan ? '执行中' : '未发起'}</Chip></View>
        <View style={styles.stages}>{stages.map((item, index) => <View key={item.id} style={styles.stageItem}><View style={[styles.stageSeal, index <= stageIndex && styles.stagePassed]}><Text style={[styles.stageText, index <= stageIndex && styles.stageTextPassed]}>{item.id}</Text></View><Text style={styles.stageNote}>{item.note}</Text></View>)}</View>
        {state.plan ? <><View style={styles.progressHead}><Text style={smallText}>据回报估算</Text><Text style={styles.percent}>{taskProgressOf(state)}%</Text></View><ProgressBar value={taskProgressOf(state)} /><View style={styles.facts}><KeyValue label="主办" value={state.plan.leaderName} /><KeyValue label="拨料 / 夫役" value={`${state.plan.material} 垛 / ${state.plan.labor} 人`} /><KeyValue label="会勘" value={state.plan.supervisor} /><KeyValue label="发起" value={`第${state.plan.day}日 ${state.plan.period}`} /></View><View style={styles.checkpoint}><Text style={styles.checkpointLabel}>下一检查点 · {checkpoint.when}</Text><Text style={bodyText}>{checkpoint.label}</Text></View></> : <Text style={[bodyText, styles.idle]}>尚未签押。先读呈、问人、对勘，再预演抢护调度。</Text>}
        <View style={styles.actions}><ActionButton compact label={state.plan ? '回看签押底稿' : '预演抢护调度'} onPress={() => openOverlay('plan')} /><ActionButton compact variant="secondary" label="去东堤" onPress={() => changeScene('river')} /></View>
      </Paper>
      {state.outcome ? <Paper><SectionTitle eyebrow={`第${state.outcome.day}日 · 验收`} title={state.outcome.grade} detail={state.outcome.symptom} />{state.outcome.factors.map((factor, index) => <Text key={`${factor.label}-${index}`} style={[bodyText, styles.factor]}>{factor.label}｜{factor.detail}</Text>)}</Paper> : null}
      <Paper><SectionTitle eyebrow="十日世界时钟" title={`当前第 ${state.day} 日`} detail="在途到岸、主簿誊册、委员到县、上游暴雨均按原日程等待处理。" />{state.pendingEvent ? <ActionButton label="处理当前世界事件" onPress={() => openOverlay('world')} /> : null}{state.day >= 10 ? <ActionButton label="验收题销 · 章末尾声" onPress={() => openOverlay('epilogue')} /> : null}</Paper>
      <Paper><SectionTitle title="同时在走的几条线" /><ActionButton compact variant="secondary" label="东堤呈文两版对勘" onPress={() => navigate('cases')} /><View style={styles.gap} /><ActionButton compact variant="secondary" label="同一笔三百两 · 证据链" onPress={() => openOverlay('evidence')} /><View style={styles.gap} /><ActionButton compact variant="secondary" label="桑宅人情与私囊" onPress={() => navigate('life')} /></Paper>
    </> : null}
    {view === 'tokens' ? <><View style={styles.tokenRow}>{tokens.map(item => <Pressable key={item.id} onPress={() => { setTokenId(item.id); setBack(false) }} style={[styles.woodToken, token.id === item.id && styles.tokenActive]}><Text style={styles.tokenType}>{item.type}</Text><Text style={styles.tokenName}>{item.name}</Text><Seal size={38}>{item.seal}</Seal></Pressable>)}</View><Paper><SectionTitle eyebrow={`${token.name} / ${back ? '背面' : '正面'}`} title={back ? '执行边界' : '牌票而非稀有卡'} />{back ? <><KeyValue label="能做什么" value={token.action} /><KeyValue label="何时失效" value={token.expiry} /><KeyValue label="代价" value={token.cost} /></> : <Text style={bodyText}>只能挣得，不抽取、不购买。打出后仍须进入执行事务；当前仅展示牌式与查验方式。</Text>}<View style={styles.actions}><ActionButton compact variant="secondary" label={back ? '翻回牌面' : '翻面查验'} onPress={() => setBack(!back)} /><ActionButton compact label={compared.includes(token.id) ? '移出并置' : '收入并置'} disabled={compared.length >= 2 && !compared.includes(token.id)} onPress={() => toggleCompare(token.id)} /></View></Paper><Paper><SectionTitle title={`并置牌案 · ${compared.length}/2`} detail="只核对先后与代价，不合成增益。" />{compared.length ? compared.map(id => <Chip key={id}>{tokens.find(item => item.id === id)?.name}</Chip>) : <Text style={smallText}>从牌架选择一样牌收入并置。</Text>}<Text style={[smallText, styles.previewNote]}>M2 预览：不打牌、不耗时、不发起政令、不写入事务存档。</Text></Paper></> : null}
    {view === 'offices' ? <View style={styles.officeGrid}>{offices.map(office => <Paper key={office.name} style={styles.office}><View style={styles.row}><Seal size={36}>{office.name[0]}</Seal><PreviewBadge label="M2 案台" /></View><Text style={styles.cardTitle}>{office.name}</Text><Text style={styles.officeNote}>{office.note}</Text><Text style={[bodyText, styles.officeDetail]}>{office.detail}</Text><ActionButton compact variant="secondary" label="回到已有事务" onPress={() => openOverlay(office.overlay)} /></Paper>)}</View> : null}
  </Screen>
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }, tab: { flex: 1, paddingVertical: 12, alignItems: 'center' }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.cinnabar }, tabText: { color: colors.muted, fontSize: 13 }, tabTextActive: { color: colors.cinnabar, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, eyebrow: { color: colors.cinnabar, fontSize: 10, letterSpacing: 1 }, cardTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 22, marginTop: 5 }, stages: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 22 }, stageItem: { alignItems: 'center', flex: 1 }, stageSeal: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }, stagePassed: { backgroundColor: colors.cinnabar, borderColor: colors.cinnabar }, stageText: { color: colors.muted, fontFamily: fonts.serif }, stageTextPassed: { color: colors.paperBright }, stageNote: { color: colors.muted, fontSize: 8, marginTop: 6 }, progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, percent: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 20 }, facts: { marginTop: 14 }, checkpoint: { borderLeftWidth: 2, borderLeftColor: colors.cinnabar, paddingLeft: 12, marginTop: 16 }, checkpointLabel: { color: colors.cinnabar, fontSize: 11, marginBottom: 4 }, idle: { marginVertical: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }, factor: { fontSize: 12, lineHeight: 19, marginBottom: 6 }, gap: { height: 8 }, tokenRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, woodToken: { flex: 1, minHeight: 145, backgroundColor: '#64503a', padding: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: '#806b50' }, tokenActive: { borderColor: colors.cinnabar, transform: [{ translateY: -4 }] }, tokenType: { color: '#eee5d5bb', fontSize: 10 }, tokenName: { color: colors.paperBright, fontFamily: fonts.serif, fontSize: 17, writingDirection: 'rtl' }, previewNote: { marginTop: 14 }, officeGrid: { gap: 12 }, office: { marginBottom: 0 }, officeNote: { color: colors.cinnabar, fontSize: 12, marginTop: 3 }, officeDetail: { fontSize: 13, marginVertical: 12 },
})
