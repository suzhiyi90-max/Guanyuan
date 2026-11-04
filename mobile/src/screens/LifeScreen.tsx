import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameState } from '../game/model'
import { streetStations } from '../data/city'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'
import { ActionButton, bodyText, Chip, KeyValue, Paper, PreviewBadge, Screen, SectionTitle, smallText } from '../components/ui'

type Space = 'gift' | 'home' | 'street'
const spaces = [{ id: 'gift' as const, name: '礼簿', note: '馈赠 · 应酬' }, { id: 'home' as const, name: '内宅', note: '请求 · 家用' }, { id: 'street' as const, name: '街市', note: '应酬 · 享受' }]
const systems = [{ name: '应酬', accounts: '私囊 · 人情 · 身体 · 风评' }, { name: '馈赠', accounts: '私囊 · 人情 · Hook' }, { name: '内宅', accounts: '私囊 · 身体 · 人情' }, { name: '享受', accounts: '私囊 · 身体 · 风评' }, { name: '贪腐', accounts: '收 · 记 · 用 · 平 · 露' }]
const homes = [
  { name: '上房', label: '家人与请求', status: '候事', title: '请求须写明拒绝的代价', text: '家人到来时只呈现请求、所知与代价，不展示私密细节，不把家人写成可收集的后勤增益。', accounts: '私囊 · 身体 · 人情' },
  { name: '门房', label: '来客与门包', status: '未接触', title: '门外发生的事也会回到案头', text: '来客、门包与泄密只记录有来源的说法；未接触时不显示仆役秘密，不生成未发生的收支。', accounts: '私囊 · 人情 · 风评' },
  { name: '厨房', label: '家用与虚报', status: '账位预留', title: '家用入私囊，大额另记', text: '月度家用与疾病、婚嫁、丧葬各有账位。当前只保留纸面结构，不预设金额，不执行月结。', accounts: '私囊 · 身体' },
]

export function LifeScreen({ state, openOverlay }: { state: GameState; openOverlay: (overlay: OpenOverlayId) => void }) {
  const [space, setSpace] = useState<Space>('gift')
  const [homeIndex, setHomeIndex] = useState(0)
  const [streetIndex, setStreetIndex] = useState(0)
  const entries = state.giftEntries?.length ? state.giftEntries : []
  const home = homes[homeIndex] ?? homes[0]
  const street = streetStations[streetIndex] ?? streetStations[0]
  const accounts = [
    { name: '公帑', value: '4,200 实收', note: '差额三百尚未定性' },
    { name: '私囊', value: `${state.privateFunds} 两`, note: '俸禄、宴席、家用皆由此出' },
    { name: '人情', value: `${entries.length} 笔新账`, note: '承诺与旧欠没有好感条' },
    { name: '身体', value: entries.length ? '略显困倦' : '尚可', note: '疲劳影响信息质量，不扣行动点' },
    { name: '风评', value: entries.length ? '初见应酬' : '新到任', note: '只记录依据，不折算单一分数' },
  ]
  return <Screen>
    <SectionTitle eyebrow="生活 / 权力如何渗进生活" title="一顿饭，也会进账。" detail="清名不是口号，人情也不是免费资源。生活纸页只呈现已有事实，不生成新消费。" action={<PreviewBadge />} />
    <View style={styles.purse}><Text style={styles.purseLabel}>私囊现银</Text><Text style={styles.purseValue}>{state.privateFunds}<Text style={styles.purseUnit}> 两</Text></Text></View>
    <View style={styles.tabs}>{spaces.map(item => <Pressable key={item.id} onPress={() => setSpace(item.id)} style={[styles.tab, space === item.id && styles.tabActive]}><Text style={[styles.tabName, space === item.id && styles.tabNameActive]}>{item.name}</Text><Text style={[styles.tabNote, space === item.id && styles.tabNoteActive]}>{item.note}</Text></Pressable>)}</View>
    <Paper style={styles.systemPaper}><Text style={styles.systemTitle}>五事同账</Text><View style={styles.systemList}>{systems.map(system => <View key={system.name} style={styles.systemRow}><Chip active={space === 'gift' ? ['应酬', '馈赠'].includes(system.name) : space === 'home' ? system.name === '内宅' : ['应酬', '享受'].includes(system.name)} tone={system.name === '贪腐' ? 'red' : 'ink'}>{system.name}</Chip><Text style={styles.systemAccounts}>{system.accounts}</Text></View>)}</View><Text style={styles.boundary}>贪腐只列风险链，不作善恶评分。</Text></Paper>
    {space === 'gift' ? <>
      <Paper><SectionTitle eyebrow="S-07 / 夜事件记录" title="礼簿" detail="记与不记，也是选择。" />{entries.length ? entries.map((entry, index) => <View style={styles.giftRow} key={`${entry}-${index}`}><Text style={styles.giftIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={styles.giftText}>{entry}</Text><Text style={smallText}>夜事件 / 已留生活记录</Text></View><Chip>已记</Chip></View>) : <View style={styles.empty}><Text style={styles.emptyTitle}>今夜之前，簿上尚无一笔。</Text><Text style={bodyText}>接风宴的帖子已送到。去不去、谁去、花多少，都会留下不同的账。</Text></View>}<View style={styles.buttonSpace}><ActionButton label={entries.length ? '回看接风宴' : '展开桑宅请帖'} icon="gift" onPress={() => openOverlay('banquet')} /></View></Paper>
      <Paper style={styles.block}><SectionTitle eyebrow="五本生活账" title="看得见的花费，看不见的代价。" />{accounts.map(item => <KeyValue key={item.name} label={`${item.name} · ${item.note}`} value={item.value} emphasis={item.name === '私囊'} />)}</Paper>
    </> : null}
    {space === 'home' ? <Paper><SectionTitle eyebrow="S-08 / 内宅门簿" title="镜头停在门外" detail="请求、家用、仆役各有纸位，不展示私密细节。" /><View style={styles.indexRow}>{homes.map((item, index) => <Pressable key={item.name} onPress={() => setHomeIndex(index)} style={[styles.indexButton, homeIndex === index && styles.indexActive]}><Text style={[styles.indexName, homeIndex === index && styles.indexNameActive]}>{item.name}</Text><Text style={styles.indexNote}>{item.status}</Text></Pressable>)}</View><View style={styles.inspector}><Text style={styles.inspectorLabel}>{home.label}</Text><Text style={styles.inspectorTitle}>{home.title}</Text><Text style={bodyText}>{home.text}</Text><KeyValue label="关联网账" value={home.accounts} /><Text style={styles.source}>事件接口 / 请求到来时仍由夜事件承载，不在这里直接结算。</Text></View></Paper> : null}
    {space === 'street' ? <Paper><SectionTitle eyebrow="S-09 / 街市与城郭同源" title="六处地点索引" detail="地点可先读，接触与消费仍须真实事件。" />{streetStations.map((item, index) => <Pressable key={item.id} onPress={() => setStreetIndex(index)} style={[styles.stationRow, streetIndex === index && styles.stationActive]}><View style={styles.flex}><Text style={styles.stationName}>{item.name} · {item.label}</Text><Text style={smallText}>{item.status}</Text></View><Chip active={streetIndex === index}>{streetIndex === index ? '查验中' : '查验'}</Chip></Pressable>)}<View style={styles.inspector}><Text style={styles.inspectorTitle}>{street.recordId ? '传闻只按原文留档' : '尚无可查验的话'}</Text><Text style={bodyText}>{street.text}</Text><KeyValue label="关联网账" value={street.accounts.join(' · ')} /><Text style={styles.source}>{street.recordId || '来源边界'} / {street.source}</Text><View style={styles.buttonSpace}><ActionButton label="抽阅城郭图" icon="map" variant="secondary" onPress={() => openOverlay('atlas')} /></View></View></Paper> : null}
    <Paper tone="deep" style={styles.block}><Text style={styles.logTitle}>今日三行</Text><Text style={smallText}>成 / {state.log.done}</Text><Text style={smallText}>卡 / {state.log.stuck}</Text><Text style={smallText}>传 / {state.log.rumor}</Text></Paper>
  </Screen>
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, block: { marginTop: 14 }, purse: { alignSelf: 'flex-end', alignItems: 'flex-end', marginTop: -66, marginBottom: 22, paddingRight: 4 }, purseLabel: { ...smallText }, purseValue: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 31 }, purseUnit: { fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 }, tab: { flex: 1, borderWidth: 1, borderColor: colors.lineStrong, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.paperBright }, tabActive: { backgroundColor: colors.ink, borderColor: colors.ink }, tabName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 17 }, tabNameActive: { color: colors.paperBright }, tabNote: { color: colors.muted, fontSize: 9, marginTop: 3 }, tabNoteActive: { color: colors.paperDeep },
  systemPaper: { marginBottom: 14, paddingVertical: 12 }, systemTitle: { color: colors.cinnabar, fontSize: 10, letterSpacing: 2, marginBottom: 8 }, systemList: { gap: 6 }, systemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, systemAccounts: { ...smallText, flex: 1 }, boundary: { ...smallText, marginTop: 10 },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, giftIndex: { color: colors.cinnabar, fontFamily: fonts.mono, fontSize: 12 }, giftText: { ...bodyText, marginBottom: 3 }, empty: { gap: 10, paddingVertical: 8 }, emptyTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 18 }, buttonSpace: { marginTop: 16 },
  indexRow: { flexDirection: 'row', gap: 7 }, indexButton: { flex: 1, alignItems: 'center', padding: 10, borderWidth: 1, borderColor: colors.line }, indexActive: { borderColor: colors.cinnabar, backgroundColor: '#963f320c' }, indexName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16 }, indexNameActive: { color: colors.cinnabar }, indexNote: { ...smallText, fontSize: 10, marginTop: 4 },
  inspector: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 16, paddingTop: 16, gap: 10 }, inspectorLabel: { ...smallText, color: colors.cinnabar }, inspectorTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 19, lineHeight: 27 }, source: { ...smallText, padding: 10, backgroundColor: colors.paperDeep },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, stationActive: { backgroundColor: '#963f320a' }, stationName: { color: colors.ink, fontFamily: fonts.serif, fontSize: 15 },
  logTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 17, marginBottom: 8 },
})
