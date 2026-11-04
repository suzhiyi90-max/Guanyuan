import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameState } from '../game/model'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'
import { ActionButton, Chip, EmptyState, Paper, Screen, SectionTitle } from '../components/ui'

export function CasesScreen({ state, openOverlay }: { state: GameState; openOverlay: (overlay: OpenOverlayId) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const clues = state.clues?.length ? state.clues : []
  const comparisons = state.comparisons?.length ? state.comparisons : []
  const evidenceCount = ['E-001', 'E-002', 'E-003'].filter(id => state.unlocked?.includes(id)).length
  const toggle = (id: string) => setExpanded(current => current === id ? null : id)

  return <Screen>
    <SectionTitle eyebrow="案卷 / 一事一卷，来源可追" title="纸上所记，须有来路。" detail="呈文、账目、说法与签押底稿分别入卷；未接触的事实不提前补写。" />
    <View style={styles.stats}>
      <Paper style={styles.stat}><Text style={styles.statValue}>02</Text><Text style={styles.statLabel}>在办卷宗</Text></Paper>
      <Paper style={styles.stat}><Text style={styles.statValue}>{String(clues.length).padStart(2, '0')}</Text><Text style={styles.statLabel}>已录线索</Text></Paper>
      <Paper style={styles.stat}><Text style={styles.statValue}>{String(comparisons.length).padStart(2, '0')}</Text><Text style={styles.statLabel}>并置问题</Text></Paper>
    </View>

    <Paper style={styles.caseCard}>
      <View style={styles.caseHead}><View><Text style={styles.eyebrow}>案 · 001 / 河工</Text><Text style={styles.caseTitle}>东堤渗水呈文</Text></View><Chip tone="red">汛前急务</Chip></View>
      <Text style={styles.meta}>河工书办 → 知县签押房 · 第一日</Text>
      <Text style={styles.body}>初稿与定稿俱在。范围、料数、工法与渗水因由可逐句对勘，已读不代替已记疑点。</Text>
      <View style={styles.tags}><Chip>{state.completedActions.includes('doc-remembered') ? '疑点已录' : '两版待对勘'}</Chip><Chip tone="river">V-001 / V-002</Chip></View>
      <ActionButton label="展开呈文对勘" icon="cases" onPress={() => openOverlay('document')} />
    </Paper>

    <Paper style={styles.caseCard}>
      <View style={styles.caseHead}><View><Text style={styles.eyebrow}>案 · 002 / 钱谷</Text><Text style={styles.caseTitle}>同一笔三百两</Text></View><Chip>{evidenceCount} / 3</Chip></View>
      <Text style={styles.meta}>库房账册 · 借领状 · 粮商票据 · 第一日起</Text>
      <Text style={styles.body}>目前只能记作差额三百两。库账、借领与旧欠须并置核问，不能重复计成六百两，也不能直接定罪。</Text>
      <ActionButton label="查验证据链" icon="search" variant="secondary" onPress={() => openOverlay('evidence')} />
    </Paper>

    <Paper style={styles.ledgerCard}>
      <View style={styles.caseHead}><View><Text style={styles.eyebrow}>副卷 / 亲历留痕</Text><Text style={styles.subTitle}>情报台账</Text></View><Chip>{clues.length} 条</Chip></View>
      {clues.length ? clues.map(clue => <View key={clue.id} style={styles.record}>
        <Pressable onPress={() => toggle(clue.id)} style={styles.recordHead}><Text style={styles.recordId}>{clue.id}</Text><View style={styles.recordTitle}><Text style={styles.recordName}>{clue.source === 'document' ? '呈文对勘' : clue.source === 'ledger' ? '账目并置' : '现场探挖'}</Text><Text style={styles.meta}>第{clue.day}日 · {clue.refs?.join(' / ') || '来源未标'}</Text></View><Text style={styles.expand}>{expanded === clue.id ? '收' : '阅'}</Text></Pressable>
        {expanded === clue.id ? <Text style={styles.recordBody}>{clue.text}</Text> : null}
      </View>) : <EmptyState title="尚无可入台账的线索" detail="读呈并置、账房对勘或亲勘东堤后，事实会按当日与来源归入此处。" />}
      <ActionButton label="展开完整情报台账" variant="ghost" compact onPress={() => openOverlay('intelligence')} />
    </Paper>

    <Paper style={styles.ledgerCard}>
      <View style={styles.caseHead}><View><Text style={styles.eyebrow}>副卷 / 问而不判</Text><Text style={styles.subTitle}>并置问题</Text></View><Chip>{comparisons.length} 问</Chip></View>
      {comparisons.length ? comparisons.map(item => <Pressable key={item.id} onPress={() => toggle(item.id)} style={styles.question}><Text style={styles.recordId}>{item.id}</Text><View style={styles.recordTitle}><Text style={styles.recordName}>第{item.day}日 · {item.refs?.join(' / ')}</Text>{expanded === item.id ? <Text style={styles.recordBody}>{item.question}</Text> : <Text style={styles.collapsed}>点按展开待核问题</Text>}</View></Pressable>) : <EmptyState title="尚未形成并置问题" detail="至少选择两版呈文或两项账证，才会生成待核问题。" />}
    </Paper>

    <Paper style={styles.caseCard}>
      <View style={styles.caseHead}><View><Text style={styles.eyebrow}>签押房 / 底稿</Text><Text style={styles.subTitle}>东堤抢护委牌</Text></View><Chip tone={state.plan ? 'red' : 'ink'}>{state.plan ? '已签押' : '未签押'}</Chip></View>
      <Text style={styles.meta}>{state.plan ? `${state.plan.leaderName}主办 · 第${state.plan.day}日${state.plan.period}` : '主办、料数、夫役与会勘尚待预演'}</Text>
      <ActionButton label={state.plan ? '回看签押底稿' : '预演抢护调度'} icon="stamp" variant="secondary" onPress={() => openOverlay(state.plan ? 'signing' : 'plan')} />
    </Paper>
  </Screen>
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginBottom: 14 }, stat: { flex: 1, padding: 12, alignItems: 'center' }, statValue: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 24 }, statLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
  caseCard: { marginBottom: 14, gap: 12 }, ledgerCard: { marginBottom: 14 }, caseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, eyebrow: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 10, letterSpacing: 1 }, caseTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 23, marginTop: 5 }, subTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20, marginTop: 4 },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 }, body: { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 14, lineHeight: 23 }, tags: { flexDirection: 'row', gap: 7 },
  record: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingVertical: 10 }, recordHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, recordId: { color: colors.cinnabar, fontFamily: fonts.mono, fontSize: 11 }, recordTitle: { flex: 1, minWidth: 0 }, recordName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 15 }, expand: { color: colors.muted, fontSize: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 5 },
  recordBody: { color: colors.inkSoft, fontFamily: fonts.serif, fontSize: 14, lineHeight: 23, marginTop: 9 }, question: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, collapsed: { color: colors.muted, fontSize: 11, marginTop: 5 },
})
