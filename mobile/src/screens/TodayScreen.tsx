import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fixedEvents, goals } from '../data'
import { nextCheckpointOf, officialAvailableOf, periods, taskStageOf, type GameState } from '../game/model'
import { worldEvents } from '../game/schedule'
import type { SceneId } from '../types'
import type { OpenOverlayId } from '../ui/contracts'
import { colors, fonts, spacing } from '../ui/theme'
import { AppIcon } from '../components/AppIcon'
import { SceneHero } from '../components/SceneHero'
import { ActionButton, Chip, Paper, Screen, SectionTitle, bodyText, smallText } from '../components/ui'

interface Props {
  state: GameState
  scene: SceneId
  onScene: (scene: SceneId) => void
  openOverlay: (overlay: OpenOverlayId) => void
  onProbe: () => void
  onAudit: () => void
  onContinueDay: () => void
}

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function TodayScreen({ state, scene, onScene, openOverlay, onProbe, onAudit, onContinueDay }: Props) {
  const [inspectedDay, setInspectedDay] = useState(state.day)
  useEffect(() => setInspectedDay(state.day), [state.day])
  const event = fixedEvents.find(item => item.day === inspectedDay) ?? fixedEvents[0]
  const pending = worldEvents.find(item => item.id === state.pendingEvent)
  const stage = taskStageOf(state)
  const checkpoint = nextCheckpointOf(state)
  const goal = goals.find(item => item.id === state.goalId)
  const inspection = inspectedDay < state.day ? '已过' : inspectedDay === state.day ? '今日' : '未到'

  return <Screen>
    <SceneHero scene={scene} day={state.day} period={periods[state.periodIndex]} onScene={onScene} onDocument={() => openOverlay('document')} onProbe={onProbe} onAudit={onAudit} onAtlas={() => openOverlay('atlas')} onGoal={() => openOverlay('goal')} goalTitle={goal?.title} probeKnown={state.probeKnown} />

    <SectionTitle eyebrow="今日案头 / 第一汛" title="东堤，等你落笔。" detail={`第${dayNames[state.day - 1]}日 · ${periods[state.periodIndex]}　事务阶段「${stage}」`} action={<Chip tone="red">汛前急务</Chip>} />
    <Paper style={styles.urgent}>
      <View style={styles.caseHead}><Text style={styles.caseNo}>案 · 001</Text><Text style={styles.caseStage}>{state.plan ? '抢护已发起' : '待查待谋'}</Text></View>
      <Text style={styles.caseTitle}>东堤渗水</Text>
      <Text style={bodyText}>旧闸下游四十步。书办说培土即可，河工幕友却请你看闸底。</Text>
      <View style={styles.checkpoint}><AppIcon name="clock" size={17} color={colors.cinnabar} /><View style={styles.flex}><Text style={styles.checkpointWhen}>下一检查点 · {checkpoint.when}</Text><Text style={styles.checkpointText}>{checkpoint.label}</Text></View></View>
      <View style={styles.actions}><ActionButton label="展开呈文" icon="cases" onPress={() => openOverlay('document')} /><ActionButton label={state.plan ? '查看抢护委托' : '预演抢护调度'} icon="stamp" variant="secondary" onPress={() => openOverlay('plan')} /><ActionButton label="事务 · 执行与检查点" icon="affairs" variant="ghost" onPress={() => openOverlay('summary')} /></View>
    </Paper>

    {pending ? <Pressable onPress={() => openOverlay('world')} style={styles.notice}><View style={styles.noticeSeal}><Text style={styles.noticeSealText}>报</Text></View><View style={styles.flex}><Text style={styles.noticeTitle}>{pending.title}</Text><Text style={styles.noticeDetail}>有一件未决的事，点开再定，不会自动推进。</Text></View><AppIcon name="next" size={18} color={colors.cinnabar} /></Pressable> : null}
    {officialAvailableOf(state) ? <Pressable onPress={() => openOverlay('review')} style={styles.notice}><View style={styles.noticeSeal}><Text style={styles.noticeSealText}>查</Text></View><View style={styles.flex}><Text style={styles.noticeTitle}>上宪来文</Text><Text style={styles.noticeDetail}>知府批 · 委员覆勘，料价再核{!state.officialRead ? ' · 未读' : ''}</Text></View><AppIcon name="next" size={18} color={colors.cinnabar} /></Pressable> : null}
    <Pressable onPress={() => openOverlay('banquet')} style={[styles.notice, styles.invitation]}><View style={[styles.noticeSeal, styles.nightSeal]}><Text style={styles.noticeSealText}>夜</Text></View><View style={styles.flex}><Text style={styles.noticeTitle}>桑宅接风帖</Text><Text style={styles.noticeDetail}>{periods[state.periodIndex] === '夜' ? '灯已点上，今夜须作个取舍' : '今夜 · 私囊、人情与旧欠'}</Text></View><AppIcon name="next" size={18} color={colors.cinnabar} /></Pressable>

    <View style={styles.block}><SectionTitle eyebrow="世界不等你的签押" title="一汛日程" detail={state.day >= 9 ? '洪峰已至' : `距洪峰 ${9 - state.day} 日`} /><Paper>
      <View style={styles.dayRail}>{fixedEvents.map(item => <Pressable key={item.day} onPress={() => setInspectedDay(item.day)} style={[styles.dayButton, inspectedDay === item.day && styles.dayActive]}><Text style={[styles.dayNumber, inspectedDay === item.day && styles.dayTextActive]}>{String(item.day).padStart(2, '0')}</Text><Text style={[styles.dayLabel, inspectedDay === item.day && styles.dayTextActive]}>{item.label}</Text></Pressable>)}</View>
      <View style={styles.dayInspector}><View style={styles.inspectorHead}><Text style={styles.inspectorTitle}>第{dayNames[inspectedDay - 1]}日 · {event.label}</Text><Chip active={inspection === '今日'}>{inspection}</Chip></View><Text style={bodyText}>{event.detail}</Text><Text style={styles.inspectorNote}>{inspection === '已过' ? '只回看公开日程，不补写当日本局结果。' : inspection === '今日' ? '当前节点，事件仍按原流程等待处理。' : '公开日程预告，不提前生成本局事件。'}</Text></View>
    </Paper></View>

    <View style={styles.block}><SectionTitle eyebrow="被世界记住的" title="三行日志" /><Paper style={styles.log}>{([['成', state.log.done], ['卡', state.log.stuck], ['传', state.log.rumor]] as const).map(([label, text]) => <View style={styles.logRow} key={label}><Text style={styles.logLabel}>{label}</Text><Text style={styles.logText}>{text}</Text></View>)}</Paper></View>

    <ActionButton label={state.day >= 10 ? '第十日 · 本汛日程已尽' : `继续至第${state.day + 1}日 · 晨`} icon={state.day >= 10 ? 'check' : 'next'} variant="dark" disabled={state.day >= 10} onPress={onContinueDay} />
    {state.day >= 10 ? <View style={styles.epilogue}><ActionButton label="验收题销 · 展章末尾声" icon="book" onPress={() => openOverlay('epilogue')} /></View> : null}
  </Screen>
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, urgent: { borderTopWidth: 3, borderTopColor: colors.cinnabar }, caseHead: { flexDirection: 'row', justifyContent: 'space-between' }, caseNo: { ...smallText, letterSpacing: 2 }, caseStage: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 11 }, caseTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 32, marginVertical: 8 },
  checkpoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.paper }, checkpointWhen: { color: colors.cinnabar, fontFamily: fonts.sans, fontSize: 11 }, checkpointText: { ...smallText, color: colors.inkSoft, marginTop: 3 }, actions: { gap: spacing.sm, marginTop: spacing.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.paperBright, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.md }, invitation: { backgroundColor: colors.paperDeep }, noticeSeal: { width: 38, height: 38, borderWidth: 1, borderColor: colors.cinnabar, alignItems: 'center', justifyContent: 'center' }, nightSeal: { backgroundColor: colors.riverDark, borderColor: colors.riverDark }, noticeSealText: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 19 }, invitationTitle: { color: colors.ink }, noticeTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 16 }, noticeDetail: { ...smallText, marginTop: 3 },
  block: { marginTop: spacing.xl }, dayRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, dayButton: { width: '18%', minHeight: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, dayActive: { backgroundColor: colors.ink, borderColor: colors.ink }, dayNumber: { color: colors.ink, fontFamily: fonts.mono, fontSize: 14 }, dayLabel: { color: colors.muted, fontSize: 9, marginTop: 3 }, dayTextActive: { color: colors.paperBright }, dayInspector: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }, inspectorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: 8 }, inspectorTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 17, flex: 1 }, inspectorNote: { ...smallText, marginTop: spacing.sm },
  log: { paddingVertical: spacing.sm }, logRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, logLabel: { color: colors.cinnabar, fontFamily: fonts.serif, fontSize: 16 }, logText: { ...bodyText, flex: 1, fontSize: 14 }, epilogue: { marginTop: spacing.sm },
})
