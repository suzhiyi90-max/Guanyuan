import { useCallback, useEffect, useRef, useState } from 'react'
import { people } from '../data'
import { goalReckoningOf, officialAvailableOf, periods, verdictOf } from './engine'
import type { OfficialActionId, RiverPlan, TaskStage, ToastMessage } from '../types'
import type { GameState } from './model'
export type { GameState } from './model'
import type { CommandResult } from './commands'
import {
  createPreviewRuntimeSession,
  dispatchPreviewRuntimeIntent,
  type PreviewRuntimeDispatchResult,
  type PreviewRuntimeIntent,
  type PreviewRuntimeSession,
} from './runtime-orchestrator'
import { createRuntimeSmokeFixture, type RuntimeSmokeFixture } from './runtime-smoke-fixture'
import type { GeneratedEvent } from '../narrative/types'

export { periods, goalReckoningOf, verdictOf, officialAvailableOf }
export type { ReckoningRow, GoalReckoning, Verdict } from './engine'

let worldAllocationSequence = 0
function allocatePreviewWorldId(): string {
  worldAllocationSequence += 1
  return `preview-world-${Date.now().toString(36)}-${worldAllocationSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createInitialRuntimeSession(): PreviewRuntimeSession {
  const development = Boolean((import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } }).env?.DEV)
  if (development && typeof window !== 'undefined') {
    const requested = new URLSearchParams(window.location.search).get('smoke')
    const fixtures: readonly RuntimeSmokeFixture[] = ['day8', 'day9', 'day10', 'day10-night']
    if (requested && fixtures.includes(requested as RuntimeSmokeFixture)) {
      return createRuntimeSmokeFixture(requested as RuntimeSmokeFixture)
    }
  }
  return createPreviewRuntimeSession(allocatePreviewWorldId())
}

function asCommandResult(result: PreviewRuntimeDispatchResult): CommandResult {
  return {
    state: result.session.state,
    ...(result.status === 'rejected' ? { rejected: result.reason } : {}),
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
  const runtimeRef = useRef<PreviewRuntimeSession | null>(null)
  if (!runtimeRef.current) runtimeRef.current = createInitialRuntimeSession()
  const [state, setState] = useState<GameState>(() => runtimeRef.current!.state)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const restored = useRef(false)

  // 所有世界事实只能通过此入口 append + replay；React state 只接收不可变投影。
  const commitIntent = useCallback((intent: PreviewRuntimeIntent) => {
    const result = dispatchPreviewRuntimeIntent(runtimeRef.current!, intent)
    runtimeRef.current = result.session
    if (result.status !== 'rejected') setState(result.session.state)
    return result
  }, [])

  const notify = useCallback((title: string, detail: string) => {
    setToast({ id: Date.now(), title, detail })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const setGoal = useCallback((goalId: string) => {
    return commitIntent({ kind: 'goal.selected', payload: { goalId } })
  }, [commitIntent])

  const rememberDocument = useCallback((selected: string[]) => {
    const current = runtimeRef.current!.state
    if (current.completedActions.includes('doc-remembered')) return 'done' as const
    if (selected.length < 2) return 'need-more' as const
    const result = commitIntent({ kind: 'document.remembered', payload: { selectedIds: selected } })
    return result.status === 'rejected' ? 'done' as const : 'ok' as const
  }, [commitIntent])

  const rememberLedger = useCallback((selected: string[]) => {
    const current = runtimeRef.current!.state
    if (current.completedActions.includes('ledger-remembered')) return 'done' as const
    if (selected.length < 2) return 'need-more' as const
    const result = commitIntent({ kind: 'ledger.remembered', payload: { selectedIds: selected } })
    return result.status === 'rejected' ? 'done' as const : 'ok' as const
  }, [commitIntent])

  const askPerson = useCallback((personId: string) => {
    const current = runtimeRef.current!.state
    if (!people.some(person => person.id === personId)) return 'missing' as const
    if (current.asked.includes(personId) || current.completedActions.includes(`ask-${personId}`)) return 'repeated' as const
    const result = commitIntent({ kind: 'person.asked', payload: { personId } })
    return result.status === 'rejected' ? 'repeated' as const : 'ok' as const
  }, [commitIntent])

  const audit = useCallback(() => {
    const current = runtimeRef.current!.state
    if (current.completedActions.includes('audit')) return 'repeated' as const
    const result = commitIntent({ kind: 'records.audited', payload: {} })
    return result.status === 'rejected' ? 'repeated' as const : 'ok' as const
  }, [commitIntent])

  const probe = useCallback(() => {
    const current = runtimeRef.current!.state
    if (current.probeKnown || current.completedActions.includes('probe')) return 'repeated' as const
    const result = commitIntent({ kind: 'river.probed', payload: {} })
    return result.status === 'rejected' ? 'repeated' as const : 'ok' as const
  }, [commitIntent])

  const markPlanPreview = useCallback(() => {
    if (runtimeRef.current!.state.completedActions.includes('plan-preview')) return
    commitIntent({ kind: 'plan.previewed', payload: {} })
  }, [commitIntent])

  const confirmPlan = useCallback((plan: Omit<RiverPlan, 'day' | 'period'>) => {
    const current = runtimeRef.current!.state
    if (current.plan || current.completedActions.includes('plan-river')) return false
    const result = commitIntent({ kind: 'river.plan.confirmed', payload: { plan } })
    return result.status !== 'rejected'
  }, [commitIntent])

  const chooseBanquet = useCallback((choice: 'attend' | 'delegate' | 'audit') => {
    const current = runtimeRef.current!.state
    if (current.periodIndex !== 3 || current.completedActions.includes(`banquet-${current.day}`)) return false
    const result = commitIntent({ kind: 'banquet.choice', payload: { choice } })
    return result.status !== 'rejected'
  }, [commitIntent])

  const runOfficialAction = useCallback((key: OfficialActionId) => (
    asCommandResult(commitIntent({ kind: 'official.action', payload: { key } }))
  ), [commitIntent])

  const continueNextDay = useCallback(() => {
    commitIntent({ kind: 'day.advanced', payload: {} })
  }, [commitIntent])

  const resolveWorldOption = useCallback((eventId: string, optionId: string) => (
    asCommandResult(commitIntent({ kind: 'world.event.resolved', payload: { eventId, optionId } }))
  ), [commitIntent])

  // AI 候选回执与 ai-candidate 事实提交在 W5-C2 接入；此处严禁旧式直接 setState。
  const resolveGeneratedEvent = useCallback((_event: GeneratedEvent, _optionId: string): CommandResult => ({
    state: runtimeRef.current!.state,
    rejected: 'ai-candidate-flow-not-integrated',
  }), [])

  // 重立志是创建新世界，不删除或覆盖 legacy v1 key，也不伪造旧世界的事件历史。
  const resetGame = useCallback(() => {
    runtimeRef.current = createPreviewRuntimeSession(allocatePreviewWorldId())
    setState(runtimeRef.current.state)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

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
