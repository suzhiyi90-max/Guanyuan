import { useCallback, useEffect, useRef, useState } from 'react'
import { people } from '../data'
import { type TaskOutcome } from './schedule'
import { advanceDay, advancePeriod, goalReckoningOf, officialAvailableOf, periods, spendAction, verdictOf } from './engine'
import type { Clue, Comparison, GameLog, OfficialActionId, Period, RiverPlan, TaskStage, ToastMessage } from '../types'
import { executeCommand } from './commands'
import type { GeneratedEvent } from '../narrative/types'

export { periods, goalReckoningOf, verdictOf, officialAvailableOf }
export type { ReckoningRow, GoalReckoning, Verdict } from './engine'
const SAVE_KEY = 'guanyuan.save.v1'

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
  outcome: TaskOutcome | null
  handledEvents: string[]
  pendingEvent: string | null
  probeKnown: boolean
  privateFunds: number
  giftEntries: string[]
  log: GameLog
}

const initialState: GameState = {
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

function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (!parsed || typeof parsed.day !== 'number' || !Array.isArray(parsed.clues)) return null
    return { ...initialState, ...parsed }
  } catch {
    return null
  }
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
  if (!state.plan) {
    return state.periodIndex === 3
      ? { when: '即刻', label: '接风宴须作取舍' }
      : { when: '今夜', label: '桑宅接风帖，人情与旧欠同到' }
  }
  if (state.officialActions.includes('commissioner')) return { when: '第十日', label: '委员勘报已入卷 候汛后验收题销' }
  if (state.day === state.plan.day) return { when: '明日午', label: '料场复秤，工头回报夫役点卯' }
  if (state.day === state.plan.day + 1) return { when: '明日', label: '县丞会勘回报，抢护是否合式' }
  return { when: '第十日', label: '汛后验收题销，抢护始末入考语' }
}

export function useGuanyuanGame() {
  const [state, setState] = useState<GameState>(() => loadSave() ?? initialState)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const restored = useRef(Boolean(loadSave()))

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {
      /* 存储不可用时静默降级为单次会话 */
    }
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = useCallback((title: string, detail: string) => {
    setToast({ id: Date.now(), title, detail })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const setGoal = useCallback((goalId: string) => {
    setState(current => ({ ...current, goalId }))
  }, [])

  const rememberDocument = useCallback((selected: string[]) => {
    let result: 'ok' | 'need-more' | 'done' = 'ok'
    setState(current => {
      if (current.completedActions.includes('doc-remembered')) {
        result = 'done'
        return current
      }
      if (selected.length < 2) {
        result = 'need-more'
        return current
      }
      const hasCause = selected.some(id => id.startsWith('cause'))
      const text = hasCause
        ? '初稿断言“堤土未实”，定稿改称“闸底未明”：渗水因由并无勘查依据，书办为何先下结论？'
        : '东堤呈文两版在范围、料数或工法上有改动：改动依据未附，须找经手人问明。'
      const question = hasCause
        ? '未经探挖，初稿凭什么先定“堤土未实”？谁让书办这样写？'
        : '两版之间改了什么、谁来改、依据附在哪一页？'
      return {
        ...current,
        completedActions: [...current.completedActions, 'doc-remembered'],
        clues: [...current.clues, { id: `C-${current.clues.length + 1}`, text, source: 'document' as const, refs: selected, day: current.day }],
        comparisons: [...current.comparisons, { id: `B-${current.comparisons.length + 1}`, source: 'document' as const, refs: selected, question, day: current.day }],
        log: { ...current.log, stuck: '呈文因由有改，书办与闸底工法须再核' },
      }
    })
    return result
  }, [])

  const rememberLedger = useCallback((selected: string[]) => {
    let result: 'ok' | 'need-more' | 'done' = 'ok'
    setState(current => {
      if (current.completedActions.includes('ledger-remembered')) {
        result = 'done'
        return current
      }
      if (selected.length < 2) {
        result = 'need-more'
        return current
      }
      const ids = selected.join(' / ')
      return {
        ...current,
        completedActions: [...current.completedActions, 'ledger-remembered'],
        clues: [...current.clues, { id: `C-${current.clues.length + 1}`, text: `并置 ${ids}：三百两在库账、借领与旧欠中的名义不同，须核是否同一笔，不得重复计成六百两。`, source: 'ledger' as const, refs: selected, day: current.day }],
        comparisons: [...current.comparisons, { id: `B-${current.comparisons.length + 1}`, source: 'ledger' as const, refs: selected, question: '同一笔三百两，在几本账里各叫什么名字？经手人分别是谁？', day: current.day }],
        log: { ...current.log, stuck: '三百两名义不一，须核同一笔账的流转与责任' },
      }
    })
    return result
  }, [])

  const askPerson = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return 'missing' as const
    let repeated = false
    setState(current => {
      if (current.asked.includes(personId)) {
        repeated = true
        return current
      }
      const spent = spendAction(current, `ask-${personId}`)
      if (!spent) return current
      return {
        ...spent,
        asked: [...spent.asked, personId],
        unlocked: personId === 'liangshang' ? [...new Set([...spent.unlocked, 'E-003'])] : spent.unlocked,
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const audit = useCallback(() => {
    let repeated = false
    setState(current => {
      if (current.completedActions.includes('audit')) {
        repeated = true
        return current
      }
      const spent = spendAction(current, 'audit')
      if (!spent) return current
      return {
        ...spent,
        unlocked: [...new Set([...spent.unlocked, 'E-002'])],
        log: { ...spent.log, done: '细查旧册，找出主簿三百两借领状', stuck: '借领状与粮商旧欠是否同一笔，尚待互证' },
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const probe = useCallback(() => {
    let repeated = false
    setState(current => {
      if (current.probeKnown) {
        repeated = true
        return current
      }
      const spent = spendAction(current, 'probe')
      if (!spent) return current
      return {
        ...spent,
        probeKnown: true,
        unlocked: [...new Set([...spent.unlocked, 'E-007'])],
        clues: [...spent.clues, { id: `C-${spent.clues.length + 1}`, text: 'E-007 探挖记录：旧闸底淘空三尺。书办“毋庸拆验”与现场记录不符，但其动机尚不能据此断定。', source: 'river' as const, refs: ['E-007'], day: spent.day }],
        log: { ...spent.log, done: '亲勘东堤，探挖见闸底淘空三尺', stuck: '抢护可先行，拆修须汛后另案；料与夫仍有缺口' },
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const markPlanPreview = useCallback(() => {
    setState(current => current.completedActions.includes('plan-preview')
      ? current
      : { ...current, completedActions: [...current.completedActions, 'plan-preview'] })
  }, [])

  const confirmPlan = useCallback((plan: Omit<RiverPlan, 'day' | 'period'>) => {
    let accepted = false
    setState(current => {
      if (current.plan) return current
      const spent = spendAction(current, 'plan-river')
      if (!spent) return current
      accepted = true
      return {
        ...spent,
        plan: { ...plan, day: current.day, period: periods[current.periodIndex] },
        log: { ...spent.log, done: '东堤抢护已签押发起，县丞会勘、工头监作', stuck: '抢护需三至四日；在途十垛与旧欠仍可能生变' },
      }
    })
    return accepted
  }, [])

  const chooseBanquet = useCallback((choice: 'attend' | 'delegate' | 'audit') => {
    let accepted = false
    setState(current => {
      if (current.periodIndex !== 3) return current
      accepted = true
      if (choice === 'attend') {
        return {
          ...current,
          privateFunds: current.privateFunds - 20,
          giftEntries: [...current.giftEntries, '桑宅接风宴 · 亲赴，花费二十两'],
          unlocked: [...new Set([...current.unlocked, 'E-003'])],
          asked: [...new Set([...current.asked, 'liangshang', 'gentry'])],
          log: { done: '赴桑宅接风宴，取得旧欠票据与坟图线索', stuck: '三百两旧欠已有票据，偿还安排与坟地土源未定', rumor: '桑宅赞你通达；主簿整夜未发一言' },
        }
      }
      if (choice === 'delegate') {
        return {
          ...current,
          privateFunds: current.privateFunds - 6,
          giftEntries: [...current.giftEntries, '桑宅接风宴 · 县丞代往，备礼六两'],
          asked: [...new Set([...current.asked, 'xiancheng'])],
          log: { done: '请县丞代赴桑宅宴，县衙礼数未失', stuck: '旧欠只听转述，坟地仍须亲自说合', rumor: '桑士绅嫌你生分；县丞却记下这份托付' },
        }
      }
      return {
        ...current,
        unlocked: [...new Set([...current.unlocked, 'E-002'])],
        giftEntries: [...current.giftEntries, '桑宅接风宴 · 未赴，闭门查旧册'],
        log: { done: '闭门查旧册，取得主簿三百两借领状', stuck: '借领用途已见，粮商旧欠与现场抢护仍待核', rumor: '桑宅面上无光；主簿连夜打听谁动过旧册' },
      }
    })
    return accepted
  }, [])

  // FE-161：三入口统一「组装 command → executeCommand」；UI 只提示，不持有结算。
  // 返回契约 'ok' | 'repeated' 保持不变（rejected 一律映射为 repeated）。
  const runOfficialAction = useCallback((key: OfficialActionId) => {
    let rejected = false
    setState(current => {
      const result = executeCommand(current, { kind: 'official', key })
      if (result.rejected) {
        rejected = true
        return current
      }
      return result.state
    })
    return rejected ? 'repeated' : 'ok'
  }, [])

  const continueNextDay = useCallback(() => {
    setState(advanceDay)
  }, [])

  const resolveWorldOption = useCallback((eventId: string, optionId: string) => {
    setState(current => {
      const result = executeCommand(current, { kind: 'event', eventId, optionId })
      return result.rejected ? current : result.state
    })
  }, [])

  // FE-157 / FE-161 / FE-162：生成事件走同一命令层。模型只给措辞与 effect id，
  // 成本与判定全在本地；只借既有 handledEvents 记已决，不新增存档字段、不改存档结构。
  const resolveGeneratedEvent = useCallback((event: GeneratedEvent, optionId: string) => {
    setState(current => {
      const result = executeCommand(current, { kind: 'generated', event, optionId })
      return result.rejected ? current : result.state
    })
  }, [])

  const resetGame = useCallback(() => {
    localStorage.removeItem(SAVE_KEY)
    setState({ ...initialState })
  }, [])

  return {
    state,
    toast,
    notify,
    dismissToast,
    restored: restored.current,
    setGoal,
    rememberDocument,
    rememberLedger,
    askPerson,
    audit,
    probe,
    markPlanPreview,
    confirmPlan,
    runOfficialAction,
    chooseBanquet,
    continueNextDay,
    resolveWorldOption,
    resolveGeneratedEvent,
    resetGame,
  }
}
