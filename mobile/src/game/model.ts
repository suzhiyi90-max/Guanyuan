import type { Clue, Comparison, GameLog, OfficialActionId, Period, RiverPlan, TaskStage } from '../types'
import { goals } from '../data'

export const periods: Period[] = ['晨', '午', '暮', '夜']
export const SAVE_KEY = 'guanyuan.save.v1'

export interface GameState {
  goalId: string | null
  day: number
  periodIndex: number
  clues: Clue[]
  comparisons: Comparison[]
  unlocked: string[]
  asked: string[]
  completedActions: string[]
  plan: RiverPlan | null
  officialActions: OfficialActionId[]
  officialRead: boolean
  material: { arrived: number; transit: number; unsent: number }
  outcome: import('./schedule').TaskOutcome | null
  handledEvents: string[]
  pendingEvent: string | null
  probeKnown: boolean
  privateFunds: number
  giftEntries: string[]
  log: GameLog
}

export const initialState: GameState = {
  goalId: null,
  day: 1,
  periodIndex: 0,
  clues: [],
  comparisons: [],
  unlocked: ['E-001', 'P-006'],
  asked: [],
  completedActions: [],
  plan: null,
  officialActions: [],
  officialRead: false,
  material: { arrived: 30, transit: 10, unsent: 10 },
  outcome: null,
  handledEvents: [],
  pendingEvent: null,
  probeKnown: false,
  privateFunds: 60,
  giftEntries: [],
  log: {
    done: '接印，收东堤渗水呈文一件',
    stuck: '渗水因由未明，三人口供尚待接触',
    rumor: '茶楼有人说“修衙署”，暂无凭据',
  },
}

const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
const officialIds: OfficialActionId[] = ['endorse', 'commissioner', 'files', 'citation', 'impeach', 'suppress']

export function normalizeGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (typeof value.day !== 'number' || !Number.isFinite(value.day)) return null
  const material = value.material && typeof value.material === 'object' ? value.material as Record<string, unknown> : {}
  const log = value.log && typeof value.log === 'object' ? value.log as Record<string, unknown> : {}
  return {
    ...initialState,
    goalId: typeof value.goalId === 'string' && goals.some(g => g.id === value.goalId) ? value.goalId : null,
    day: Math.max(1, Math.min(10, Math.round(value.day))),
    periodIndex: typeof value.periodIndex === 'number' ? Math.max(0, Math.min(3, Math.round(value.periodIndex))) : 0,
    clues: Array.isArray(value.clues) ? value.clues as Clue[] : [],
    comparisons: Array.isArray(value.comparisons) ? value.comparisons as Comparison[] : [],
    unlocked: stringArray(value.unlocked).length ? stringArray(value.unlocked) : initialState.unlocked,
    asked: stringArray(value.asked),
    completedActions: stringArray(value.completedActions),
    plan: value.plan && typeof value.plan === 'object' ? value.plan as RiverPlan : null,
    officialActions: stringArray(value.officialActions).filter((x): x is OfficialActionId => officialIds.includes(x as OfficialActionId)),
    officialRead: value.officialRead === true,
    material: {
      arrived: typeof material.arrived === 'number' ? material.arrived : initialState.material.arrived,
      transit: typeof material.transit === 'number' ? material.transit : initialState.material.transit,
      unsent: typeof material.unsent === 'number' ? material.unsent : initialState.material.unsent,
    },
    outcome: value.outcome && typeof value.outcome === 'object' ? value.outcome as GameState['outcome'] : null,
    handledEvents: stringArray(value.handledEvents),
    pendingEvent: typeof value.pendingEvent === 'string' ? value.pendingEvent : null,
    probeKnown: value.probeKnown === true,
    privateFunds: typeof value.privateFunds === 'number' ? value.privateFunds : initialState.privateFunds,
    giftEntries: stringArray(value.giftEntries),
    log: {
      done: typeof log.done === 'string' ? log.done : initialState.log.done,
      stuck: typeof log.stuck === 'string' ? log.stuck : initialState.log.stuck,
      rumor: typeof log.rumor === 'string' ? log.rumor : initialState.log.rumor,
    },
  }
}

export function advancePeriod(current: GameState): GameState {
  if (current.periodIndex < 3) return { ...current, periodIndex: current.periodIndex + 1 }
  return { ...current, periodIndex: 0, day: Math.min(10, current.day + 1) }
}

export function spendAction(current: GameState, key: string): GameState | null {
  if (current.completedActions.includes(key)) return null
  return advancePeriod({ ...current, completedActions: [...current.completedActions, key] })
}

export function officialAvailableOf(state: GameState): boolean {
  return state.day >= 2 || state.periodIndex >= 2
}

export function taskStageOf(state: GameState): TaskStage {
  if (state.plan) {
    if (state.day >= 10) return '结'
    if (state.officialActions.includes('commissioner')) return '验'
    if (state.day >= state.plan.day + 2) return '验'
    return '办'
  }
  if (state.completedActions.includes('plan-preview')) return '谋'
  if (state.clues.length > 0 || state.asked.length > 0 || state.probeKnown) return '查'
  return '起'
}

export function taskProgressOf(state: GameState): number {
  if (!state.plan) return 0
  const elapsed = (state.day - state.plan.day) * 4 + state.periodIndex - periods.indexOf(state.plan.period)
  return Math.max(6, Math.min(96, Math.round((elapsed / 12) * 100)))
}

export function nextCheckpointOf(state: GameState): { when: string; label: string } {
  if (!state.plan) return state.periodIndex === 3
    ? { when: '即刻', label: '接风宴须作取舍' }
    : { when: '今夜', label: '桑宅接风帖，人情与旧欠同到' }
  if (state.officialActions.includes('commissioner')) return { when: '第十日', label: '委员勘报已入卷 候汛后验收题销' }
  if (state.day === state.plan.day) return { when: '明日午', label: '料场复秤，工头回报夫役点卯' }
  if (state.day === state.plan.day + 1) return { when: '明日', label: '县丞会勘回报，抢护是否合式' }
  return { when: '第十日', label: '汛后验收题销，抢护始末入考语' }
}

export interface ReckoningRow { tone: '进' | '改' | '缺'; text: string }
export interface GoalReckoning { goalId: string; title: string; seal: string; rows: ReckoningRow[] }

export function goalReckoningOf(state: GameState): GoalReckoning | null {
  if (!state.goalId) return null
  const goal = goals.find(item => item.id === state.goalId)
  if (!goal) return null
  const rows: ReckoningRow[] = []
  const banquet = state.giftEntries[0] ?? ''
  if (state.goalId === 'achievement') {
    rows.push(state.plan ? { tone: '进', text: `抢护已签押发起 ${state.plan.leaderName}主办 料${state.plan.material}垛夫${state.plan.labor}人 可入考语的实事有了起笔` } : { tone: '缺', text: '东堤仍未有着落 案上只有两版呈文' })
    rows.push(state.probeKnown ? { tone: '进', text: '闸底淘空三尺已亲见 工法不再只听书办一面之词' } : { tone: '改', text: '闸底尚未亲勘 工法仍须托人之言' })
    if (state.officialActions.includes('commissioner')) rows.push({ tone: '进', text: '委员覆勘已至 闸底淘空复核在卷 考语里「河工」二字有着落' })
  }
  if (state.goalId === 'integrity') {
    rows.push(state.unlocked.includes('E-002') ? { tone: '进', text: '主簿借领状已在手 三百两有了第一个可追的名目' } : { tone: '缺', text: '三百两仍只记作运输损耗 未出名目' })
    rows.push(state.unlocked.includes('E-003') ? { tone: '进', text: '粮商旧欠票据已到 可与借领状并置 同一笔账渐清' } : { tone: '改', text: '旧欠只听传闻 尚未见到票据' })
    if (banquet.includes('亲赴')) rows.push({ tone: '改', text: '接风宴亲赴二十两 清名已沾应酬' })
    if (banquet.includes('闭门查旧册')) rows.push({ tone: '进', text: '桑宅之宴未赴 夜里查的是旧册' })
    if (state.officialActions.includes('impeach')) rows.push({ tone: '改', text: '揭参已上 清名与刻名并至 这句考语日后会被人翻出来' })
  }
  if (state.goalId === 'network') {
    rows.push(state.asked.length ? { tone: '进', text: `已正式接触 ${state.asked.length} 人 说法各自入台账 人情有了落点` } : { tone: '缺', text: '尚未正式问人 人情仍停在名帖上' })
    rows.push(state.asked.includes('xiancheng') ? { tone: '进', text: '县丞这条线已接上 会勘与移会有人可托' } : { tone: '改', text: '县丞尚未深谈 会勘仍缺一个肯签押的人' })
    if (banquet.includes('代往')) rows.push({ tone: '进', text: '县丞代赴桑宅 县衙礼数未失 他记下这份托付' })
    if (state.officialActions.includes('files')) rows.push({ tone: '改', text: '调卷传询之后 书办与主簿各自把你记成了一笔账' })
  }
  if (state.goalId === 'survival') {
    rows.push(state.completedActions.includes('doc-remembered') ? { tone: '进', text: '两版对勘已入卷 日后被问起来有据可引' } : { tone: '缺', text: '呈文改动尚未并置 口说无凭' })
    rows.push(state.plan ? { tone: '进', text: '抢护以会勘与保正具结留痕 责任不独在知县一人' } : { tone: '改', text: '尚未签押 也无会勘留痕 堤若出事无从分说' })
    if (state.completedActions.includes('ledger-remembered')) rows.push({ tone: '进', text: '三百两只并置不先定罪 账目这一层没有授人以柄' })
    if (state.officialActions.includes('commissioner')) rows.push({ tone: '进', text: '覆勘留痕已备 上宪之前亦有说辞 不是独自担着' })
  }
  return { goalId: goal.id, title: goal.title, seal: goal.seal, rows: rows.slice(0, 3) }
}
