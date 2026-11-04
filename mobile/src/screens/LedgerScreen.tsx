import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ledgerRows } from '../data'
import type { GameState } from '../game/model'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts, spacing } from '../ui/theme'
import { ActionButton, Chip, KeyValue, Paper, Screen, SectionTitle, bodyText, smallText } from '../components/ui'

type MaterialKind = 'arrived' | 'transit' | 'unsent'

export function LedgerScreen({ state, onToggle, selected, onRemember, onAudit, openOverlay }: { state: GameState; onToggle: (id: string) => void; selected: string[]; onRemember: () => void; onAudit: () => void; openOverlay: (overlay: OpenOverlayId) => void }) {
  const [focus, setFocus] = useState<MaterialKind>('arrived')
  const selectedRows = selected.flatMap(id => {
    const row = ledgerRows.find(item => item.id === id)
    return row ? [row] : []
  })
  const materialText = {
    arrived: state.material.transit > 0 ? '料场已有实物，虚松与否仍须复秤，不用账面总数代替点收。' : '在途已经靠岸，到场与复秤记录按原世界事件保留。',
    transit: state.material.transit > 0 ? '只有船票与在途记录，尚未到料场，不能提前写成到场。' : '在途已归零，船已靠岸，不在到场之外重复计算。',
    unsent: '未发料仍系于粮商旧欠，不提前写成已经到场或已经使用。',
  }[focus]
  const previewNote = selected.includes('E-002') && selected.includes('E-003') ? '借领与旧欠数额相同，先核是否同一笔，不相加成六百两。' : selected.includes('P-006') ? '票据与传闻已经分开，无凭据的说法不能顶替账面事实。' : '来源与名目已经并置，先问经手人，不把差异直接写成结论。'
  const remembered = state.completedActions.includes('ledger-remembered')
  const audited = state.completedActions.includes('audit')
  const total = state.material.arrived + state.material.transit + state.material.unsent

  return <Screen>
    <SectionTitle eyebrow="账房 / 银与料分开，事实与说法分开" title="同一笔三百两，四本账。" detail="账面平，不等于事情平。把单据并置，才知道下一个问题该问谁。" />
    <Paper style={styles.equation}>
      <View style={styles.money}><Text style={styles.moneyLabel}>账面领出</Text><Text style={styles.moneyValue}>4,500 <Text style={styles.unit}>两</Text></Text></View>
      <Text style={styles.operator}>=</Text>
      <View style={styles.money}><Text style={styles.moneyLabel}>河工实收</Text><Text style={styles.moneyValue}>4,200 <Text style={styles.unit}>两</Text></Text></View>
      <Text style={styles.operator}>+</Text>
      <Pressable style={styles.money} onPress={() => openOverlay('evidence')}><Text style={[styles.moneyLabel, styles.red]}>差额 · 尚待定性</Text><Text style={[styles.moneyValue, styles.red]}>300 <Text style={styles.unit}>两</Text></Text></Pressable>
      <Text style={styles.equationNote}>只能记「差额三百两」，证据不足时不写成「贪了三百两」。</Text>
    </Paper>

    <View style={styles.sectionHead}><Text style={styles.heading}>四本账</Text><Text style={smallText}>按点选顺序并置 · 最多三项</Text></View>
    {ledgerRows.map(row => {
      const unlocked = row.unlocked || state.unlocked.includes(row.id)
      const order = selected.indexOf(row.id)
      return <Pressable key={row.id} disabled={!unlocked} onPress={() => onToggle(row.id)} style={({ pressed }) => [styles.row, order >= 0 && styles.rowSelected, !unlocked && styles.locked, pressed && styles.pressed]}>
        <View style={[styles.order, order >= 0 && styles.orderActive]}><Text style={[styles.orderText, order >= 0 && styles.orderTextActive]}>{order >= 0 ? order + 1 : unlocked ? '并' : '锁'}</Text></View>
        <View style={styles.rowBody}><View style={styles.rowTitle}><Text style={styles.rowName}>{row.title}</Text><Text style={smallText}>{row.id}</Text></View><Text style={[bodyText, !unlocked && styles.muted]} numberOfLines={unlocked ? 3 : 1}>{unlocked ? row.text : row.source}</Text><View style={styles.rowFoot}><Chip tone={unlocked ? 'ink' : 'red'}>{unlocked ? row.type : '未接触'}</Chip><Text style={styles.amount}>{row.amount}</Text></View></View>
      </Pressable>
    })}

    <Paper tone="deep" style={styles.preview}>
      <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>并置纸 / 随选随看</Text><Text style={styles.heading}>先看差异，再记疑点</Text></View><Chip>{selectedRows.length} / 3</Chip></View>
      {selectedRows.length ? selectedRows.map((row, index) => <View key={row.id} style={styles.previewRow}><Text style={styles.previewIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.rowBody}><Text style={styles.rowName}>{row.title} · {row.amount}</Text><Text style={bodyText}>{row.text}</Text><Text style={smallText}>{row.source}</Text></View></View>) : <Text style={[bodyText, styles.empty]}>先点两本账，此处会按点选顺序展开并置。</Text>}
      {selectedRows.length >= 2 ? <Text style={styles.previewNote}>{previewNote}</Text> : null}
      <ActionButton label={remembered ? '疑点已入台账' : selected.length < 2 ? '再选一项，开始对勘' : '并置所选项，记下疑点'} icon="check" disabled={remembered || selected.length < 2} onPress={onRemember} />
      <View style={styles.actions}><ActionButton compact variant="secondary" label={audited ? '旧册已细查' : '细查旧册 · 1时段'} icon="search" onPress={onAudit} /><ActionButton compact variant="ghost" label="三百两证据链" icon="next" onPress={() => openOverlay('evidence')} /></View>
    </Paper>

    <Paper style={styles.material}>
      <SectionTitle eyebrow="河工料账 / 只读" title="五十垛，究竟在哪？" detail={`应到总数 ${total} 垛 · 在途不等于到场`} />
      <View style={styles.materialBar}><View style={[styles.arrived, { flex: Math.max(0.01, state.material.arrived) }]} /><View style={[styles.transit, { flex: Math.max(0.01, state.material.transit) }]} /><View style={[styles.unsent, { flex: Math.max(0.01, state.material.unsent) }]} /></View>
      <View style={styles.materialTabs}>{(['arrived', 'transit', 'unsent'] as MaterialKind[]).map(kind => <Pressable key={kind} onPress={() => setFocus(kind)} style={[styles.materialTab, focus === kind && styles.materialTabActive]}><Text style={styles.materialNumber}>{state.material[kind]}</Text><Text style={[styles.materialLabel, focus === kind && styles.red]}>{kind === 'arrived' ? '已到场' : kind === 'transit' ? '在途' : '未发'}</Text></Pressable>)}</View>
      <Text style={bodyText}>{materialText}</Text><KeyValue label="来源" value={focus === 'unsent' ? 'E-003 / 粮商旧欠票据' : 'F-005 / 料场与复秤记录'} />
    </Paper>
  </Screen>
}

const styles = StyleSheet.create({
  equation: { marginBottom: spacing.xl, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, money: { minWidth: 82 }, moneyLabel: { ...smallText }, moneyValue: { color: colors.ink, fontFamily: fonts.serif, fontSize: 25, marginTop: 4 }, unit: { fontSize: 12 }, operator: { color: colors.faint, fontSize: 20 }, red: { color: colors.cinnabar }, equationNote: { ...smallText, width: '100%', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: spacing.md }, heading: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20 }, eyebrow: { color: colors.cinnabar, fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 8, backgroundColor: colors.paperBright, borderWidth: 1, borderColor: colors.line }, rowSelected: { borderColor: colors.cinnabar, backgroundColor: '#f6ecdd' }, locked: { opacity: 0.56 }, pressed: { opacity: 0.75 }, order: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }, orderActive: { backgroundColor: colors.cinnabar, borderColor: colors.cinnabar }, orderText: { color: colors.muted, fontSize: 11 }, orderTextActive: { color: colors.paperBright }, rowBody: { flex: 1, gap: 6 }, rowTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }, rowName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16, fontWeight: '600' }, rowFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, amount: { color: colors.inkSoft, fontFamily: fonts.serif }, muted: { color: colors.muted },
  preview: { marginTop: spacing.lg, gap: spacing.md }, previewRow: { flexDirection: 'row', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 10 }, previewIndex: { color: colors.cinnabar, fontFamily: fonts.mono, fontSize: 12 }, previewNote: { ...bodyText, color: colors.cinnabarDark, padding: 10, backgroundColor: '#963f320d' }, empty: { textAlign: 'center', padding: 12 }, actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  material: { marginTop: spacing.xl }, materialBar: { height: 9, flexDirection: 'row', overflow: 'hidden', marginBottom: 16 }, arrived: { backgroundColor: colors.river }, transit: { backgroundColor: colors.gold }, unsent: { backgroundColor: colors.lineStrong }, materialTabs: { flexDirection: 'row', marginBottom: 16 }, materialTab: { flex: 1, alignItems: 'center', padding: 8, borderBottomWidth: 2, borderBottomColor: colors.line }, materialTabActive: { borderBottomColor: colors.cinnabar }, materialNumber: { color: colors.ink, fontFamily: fonts.serif, fontSize: 24 }, materialLabel: { ...smallText },
})
