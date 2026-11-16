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
  dispatchPreviewRuntimeCandidate,
  type PreviewRuntimeDispatchResult,
  type PreviewRuntimeIntent,
  type PreviewRuntimeSession,
} from './runtime-orchestrator'
import { createRuntimeSmokeFixture, type RuntimeSmokeFixture } from './runtime-smoke-fixture'
import { createInitialGameState } from './initial-state'
import { createIndexedDbSaveRepository } from '../persistence/indexeddb-save-repository'
import { restorePreviewRuntimeSession, restoreSingleSavedRuntimeWorld } from '../persistence/runtime-restore-orchestrator'
import { savePreviewRuntimeSession } from '../persistence/runtime-save-orchestrator'
import { exportPortableSave, type PortableSaveExportResult } from '../persistence/portable-save-export'
import { commitPortableSaveFile, preparePortableSaveFile, type PortableSaveImportResult, type PortableSavePrepareResult } from '../persistence/portable-save-import'
import type { SaveRepository, SaveWorldSummary, SaveRepositoryResult } from '../persistence/save-repository'
import type { WorldId } from '../domain/event-ledger'
import type { RuntimeStartupView } from '../persistence/runtime-startup-types'
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

/** Adapter shared by the React hook and its contract test: only committed/duplicate results advance the visible projection. */
export async function dispatchGeneratedEventForGame(
  session: PreviewRuntimeSession,
  event: GeneratedEvent,
  optionId: string,
): Promise<{ readonly session: PreviewRuntimeSession; readonly result: CommandResult; readonly committed: boolean }> {
  const dispatched = await dispatchPreviewRuntimeCandidate(session, event, optionId)
  const projectionChanged = dispatched.status === 'appended'
  return {
    session: dispatched.session,
    result: {
      state: projectionChanged ? dispatched.session.state : session.state,
      ...(dispatched.status === 'rejected' ? { rejected: dispatched.reason } : {}),
    },
    committed: projectionChanged,
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
  type StartupState = RuntimeStartupView | { readonly status: 'ready' }
  const runtimeRef = useRef<PreviewRuntimeSession | null>(null)
  const repositoryRef = useRef<SaveRepository | null>(null)
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountsRef = useRef(new Map<string, number>())
  const persistenceEnabledRef = useRef(false)
  const [state, setState] = useState<GameState>(() => createInitialGameState())
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [restored, setRestored] = useState(false)
  const [resumed, setResumed] = useState(false)
  const [startup, setStartup] = useState<StartupState>({ status: 'loading' })
  const [retryNonce, setRetryNonce] = useState(0)

  // 启动期间不创建可交互的新世界：先列档、验链、重放，再一次性发布 session。
  useEffect(() => {
    let cancelled = false
    const repository = createIndexedDbSaveRepository()
    repositoryRef.current = repository
    setStartup({ status: 'loading' })

    const development = Boolean((import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } }).env?.DEV)
    const requested = development && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('smoke')
      : null
    const fixtures: readonly RuntimeSmokeFixture[] = ['day8', 'day9', 'day10', 'day10-night']
    if (requested && fixtures.includes(requested as RuntimeSmokeFixture)) {
      const session = createInitialRuntimeSession()
      runtimeRef.current = session
      setState(session.state)
      setRestored(false)
      setResumed(false)
      persistenceEnabledRef.current = false
      setStartup({ status: 'ready' })
    } else {
      persistenceEnabledRef.current = true
      void restoreSingleSavedRuntimeWorld(repository).then(result => {
        if (cancelled) return
        if (result.status === 'restored') {
          runtimeRef.current = result.session
          setState(result.session.state)
          setRestored(true)
          setResumed(true)
          setStartup({ status: 'ready' })
        } else if (result.status === 'missing') {
          const session = createInitialRuntimeSession()
          runtimeRef.current = session
          setState(session.state)
          setRestored(false)
          setResumed(false)
          setStartup({ status: 'ready' })
        } else if (result.status === 'selection-required') {
          setStartup(result)
        } else {
          setStartup({ status: 'error', issue: result.issue })
        }
      }).catch(() => {
        if (!cancelled) setStartup({ status: 'error', issue: 'save-repository-storage-error' })
      })
    }

    return () => {
      cancelled = true
      if (repositoryRef.current === repository) repositoryRef.current = null
      ;(repository as SaveRepository & { close?: () => void }).close?.()
    }
  }, [retryNonce])

  const retryStartup = useCallback(() => setRetryNonce(value => value + 1), [])

  const listSavedWorlds = useCallback(async (): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>> => {
    const repository = repositoryRef.current
    if (!repository) return { status: 'rejected', issue: 'save-repository-unavailable' }
    // The index must not race writes already queued by the active runtime.
    let queued = persistenceQueueRef.current
    while (true) {
      await queued
      if (queued === persistenceQueueRef.current) break
      queued = persistenceQueueRef.current
    }
    return repository.listWorlds()
  }, [])

  const exportPortableSavePackage = useCallback(async (): Promise<PortableSaveExportResult> => {
    const session = runtimeRef.current
    const repository = repositoryRef.current
    if (!session || !repository) return { status: 'rejected', issue: 'not-saved-yet' }
    return exportPortableSave(session, repository, {
      pending: (pendingSaveCountsRef.current.get(String(session.worldId)) ?? 0) > 0,
    })
  }, [])

  // Import preflight/commit only touch the repository; they never replace runtimeRef or React world state.
  const preparePortableImport = useCallback((file: File): Promise<PortableSavePrepareResult> => (
    preparePortableSaveFile(file)
  ), [])

  const commitPortableImport = useCallback(async (file: File): Promise<PortableSaveImportResult> => {
    const repository = repositoryRef.current
    if (!repository) return { status: 'rejected', issue: 'storage-error' }
    return commitPortableSaveFile(file, repository)
  }, [])

  const chooseSavedWorld = useCallback(async (worldId: string) => {
    const repository = repositoryRef.current
    if (!repository) return
    const requestedSession = runtimeRef.current
    const preserveActiveSession = requestedSession !== null
    if (!preserveActiveSession) setStartup({ status: 'loading' })
    try {
      // Flush all saves queued before selection. This matters when restoring the
      // currently active WorldId: otherwise an older persisted head could win.
      let queued = persistenceQueueRef.current
      while (true) {
        await queued
        if (queued === persistenceQueueRef.current) break
        queued = persistenceQueueRef.current
      }
      // Do not overwrite player actions made while the save queue was draining.
      if (requestedSession && runtimeRef.current !== requestedSession) {
        setToast({ id: Date.now(), title: '档案恢复已取消', detail: '等待存档写入期间当前人生已有新行动，请刷新档案目录后重试。' })
        return
      }
      const result = await restorePreviewRuntimeSession(worldId as WorldId, repository)
      if (result.status === 'restored') {
        // Restore is asynchronous; guard again so actions made during replay survive.
        if (requestedSession && runtimeRef.current !== requestedSession) {
          setToast({ id: Date.now(), title: '档案恢复已取消', detail: '验卷期间当前人生已有新行动，未替换当前人生。' })
          return
        }
        runtimeRef.current = result.session
        setState(result.session.state)
        setRestored(true)
        setResumed(true)
        setStartup({ status: 'ready' })
      } else {
        const issue = result.status === 'rejected' ? result.issue : 'save-repository-record-corrupt'
        if (preserveActiveSession) {
          setToast({ id: Date.now(), title: '档案未能恢复', detail: `校验未通过（${issue}）。当前人生保持不变，可选择其他档案。` })
        } else {
          setStartup({ status: 'error', issue })
        }
      }
    } catch {
      if (preserveActiveSession) {
        setToast({ id: Date.now(), title: '档案恢复中断', detail: '本机存档读取发生异常；当前人生保持不变。' })
      } else {
        setStartup({ status: 'error', issue: 'save-repository-storage-error' })
      }
    }
  }, [])

  // 成功 append 后按顺序落盘，避免多个异步保存争抢同一 CAS head。
  // 落盘失败只报告持久化故障，不回滚已提交的内存账本，也不伪装为已保存。
  const scheduleSave = useCallback((session: PreviewRuntimeSession) => {
    const repository = repositoryRef.current
    if (!repository || !persistenceEnabledRef.current) return
    const worldKey = String(session.worldId)
    pendingSaveCountsRef.current.set(worldKey, (pendingSaveCountsRef.current.get(worldKey) ?? 0) + 1)
    if (runtimeRef.current?.worldId === session.worldId) setRestored(false)
    persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
      let saved = false
      try {
        const result = await savePreviewRuntimeSession(session, repository)
        saved = result.status === 'saved'
        if (result.status === 'rejected') {
          setToast({ id: Date.now(), title: '本机存档未写成', detail: `事件仍在当前会话中；存档失败：${result.issue}` })
        }
      } catch {
        setToast({ id: Date.now(), title: '本机存档未写成', detail: '事件仍在当前会话中；存储服务发生异常。' })
      }
      const remaining = Math.max(0, (pendingSaveCountsRef.current.get(worldKey) ?? 1) - 1)
      if (remaining === 0) pendingSaveCountsRef.current.delete(worldKey)
      else pendingSaveCountsRef.current.set(worldKey, remaining)
      // A save queued for the previous life must never mark a newly reset life as persisted.
      if (runtimeRef.current?.worldId === session.worldId && remaining === 0) setRestored(saved)
    })
  }, [])

  // 所有世界事实只能通过此入口 append + replay；React state 只接收不可变投影。
  const commitIntent = useCallback((intent: PreviewRuntimeIntent) => {
    const result = dispatchPreviewRuntimeIntent(runtimeRef.current!, intent)
    runtimeRef.current = result.session
    if (result.status !== 'rejected') setState(result.session.state)
    if (result.status === 'appended') scheduleSave(result.session)
    return result
  }, [scheduleSave])

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
    if (current.periodIndex !== 3 || current.handledEvents.includes(`banquet-choice-${current.day}`)) return false
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

  // AI 选项先走账外候选与可信回执，再由运行时原子追加事实并完整重放。
  // 拒绝时只保留候选日志反馈，不更新世界投影；成功/幂等重试才提交 React state。
  const resolveGeneratedEvent = useCallback(async (event: GeneratedEvent, optionId: string): Promise<CommandResult> => {
    const resolution = await dispatchGeneratedEventForGame(runtimeRef.current!, event, optionId)
    runtimeRef.current = resolution.session
    if (resolution.committed) {
      setState(resolution.result.state)
      scheduleSave(resolution.session)
    }
    return resolution.result
  }, [scheduleSave])

  // 重立志是创建新世界，不删除或覆盖 legacy v1 key，也不伪造旧世界的事件历史。
  const resetGame = useCallback(() => {
    runtimeRef.current = createPreviewRuntimeSession(allocatePreviewWorldId())
    setState(runtimeRef.current.state)
    setRestored(false)
    setResumed(false)
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
    restored,
    resumed,
    startup,
    chooseSavedWorld,
    retryStartup,
    listSavedWorlds,
    exportPortableSavePackage,
    preparePortableImport,
    commitPortableImport,
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
