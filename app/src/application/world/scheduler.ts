/**
 * W6-G — deterministic world simulation queue.
 *
 * The scheduler orders trusted rule/schedule commands, commits them through the
 * application command port, and resumes safely through stable request IDs.
 * It never writes the ledger, mutates an aggregate, or promotes AI proposals.
 */
import type { JsonValue, WorldId } from '../../domain/event-ledger'
import type { EventId, ScheduleId } from '../../domain/shared/ids'
import { compareWorldTime, isValidWorldTime, type WorldTime } from '../../domain/shared/world-time'
import type { WorldAggregate } from '../../domain/world/aggregate'
import { createScheduleEntryExecutionRecordedEventInput, toLedgerEventInput } from './event-catalog'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldQueryPort,
  WorldSimulationPort,
  WorldSimulationRequest,
  WorldSimulationResult,
} from './ports'

export interface WorldSimulationTask {
  readonly taskId: string
  readonly requestId: string
  readonly dueAt: WorldTime
  readonly priority: number
  readonly actor: string
  readonly source: 'rule' | 'schedule'
  readonly intentKind: string
  readonly payload: JsonValue
  /** When present, a successful action is followed by its canonical schedule settlement event. */
  readonly scheduleId?: ScheduleId
}

export interface WorldSimulationTaskSourcePort {
  /** Must be deterministic for the same aggregate, interval and LOD. AI output is not accepted here. */
  listDueTasks(
    request: WorldSimulationRequest,
    aggregate: WorldAggregate,
  ): Promise<readonly WorldSimulationTask[]> | readonly WorldSimulationTask[]
}

export interface DeterministicWorldSchedulerOptions {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly tasks: WorldSimulationTaskSourcePort
}

export interface ScheduledActionCommand {
  readonly actor: string
  readonly intentKind: string
  readonly payload: JsonValue
  readonly priority: number
}

/** Maps a planned action to a trusted domain command; null means this LOD defers it. */
export interface WorldScheduledActionResolverPort {
  resolve(
    entry: WorldAggregate['planning']['scheduleEntries'][number],
    aggregate: WorldAggregate,
    lod: WorldSimulationRequest['lod'],
  ): ScheduledActionCommand | null
}

/** Concrete schedule-backed queue. Stable IDs make interrupted action/settlement pairs resumable. */
export function createScheduleTaskSource(
  resolver: WorldScheduledActionResolverPort,
): WorldSimulationTaskSourcePort {
  return Object.freeze({
    listDueTasks(request: WorldSimulationRequest, aggregate: WorldAggregate) {
      return aggregate.planning.scheduleEntries.flatMap(entry => {
        const dueAt: WorldTime = { day: entry.day, period: entry.period }
        if (compareWorldTime(dueAt, request.from) < 0 || compareWorldTime(dueAt, request.to) > 0
          || entry.execution.kind === 'value' || entry.deviation.kind === 'value') return []
        const action = resolver.resolve(entry, aggregate, request.lod)
        if (!action) return []
        return [Object.freeze({
          taskId: `schedule:${entry.id}`,
          requestId: `w6-simulation:${request.worldId}:schedule:${entry.id}:action`,
          dueAt,
          priority: action.priority,
          actor: action.actor,
          source: 'schedule' as const,
          intentKind: action.intentKind,
          payload: action.payload,
          scheduleId: entry.id,
        })]
      })
    },
  })
}

const genesis = Object.freeze({ kind: 'genesis' as const, seq: 0 })

function sameTime(left: WorldTime, right: WorldTime): boolean {
  return left.day === right.day && left.period === right.period
}

function rejected(
  request: WorldSimulationRequest,
  streamHead: WorldAggregate['streamHead'],
  reason: string,
): WorldSimulationResult {
  return { status: 'rejected', worldId: request.worldId, reason, streamHead }
}

function compareTasks(left: WorldSimulationTask, right: WorldSimulationTask): number {
  const time = compareWorldTime(left.dueAt, right.dueAt)
  if (time !== 0) return time
  if (left.priority !== right.priority) return right.priority - left.priority
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0
}

function validTask(task: WorldSimulationTask): boolean {
  return typeof task.taskId === 'string' && task.taskId.trim().length > 0
    && typeof task.requestId === 'string' && task.requestId.trim().length > 0
    && isValidWorldTime(task.dueAt)
    && Number.isFinite(task.priority)
    && Number.isInteger(task.priority)
    && typeof task.actor === 'string' && task.actor.trim().length > 0
    && (task.source === 'rule' || task.source === 'schedule')
    && typeof task.intentKind === 'string' && task.intentKind.trim().length > 0
    && task.payload !== undefined
    && (task.scheduleId === undefined || (typeof task.scheduleId === 'string' && task.scheduleId.length > 0))
}

function isFailure(receipt: WorldCommandReceipt): receipt is Extract<WorldCommandReceipt, { status: 'rejected' | 'conflict' }> {
  return receipt.status === 'rejected' || receipt.status === 'conflict'
}

export function createDeterministicWorldScheduler(
  options: DeterministicWorldSchedulerOptions,
): WorldSimulationPort {
  return Object.freeze({
    async advance(request: WorldSimulationRequest): Promise<WorldSimulationResult> {
      let initial: WorldAggregate | null
      try {
        initial = await options.queries.read(request.worldId)
      } catch {
        return rejected(request, genesis, 'world-simulation-world-query-failed')
      }
      const initialHead = initial?.streamHead ?? genesis
      if (!initial) return rejected(request, initialHead, 'world-simulation-world-missing')
      if (!isValidWorldTime(request.from) || !isValidWorldTime(request.to)
        || compareWorldTime(request.from, request.to) > 0) {
        return rejected(request, initial.streamHead, 'world-simulation-invalid-interval')
      }
      if (!sameTime(request.from, initial.worldTime)) {
        return rejected(request, initial.streamHead, 'world-simulation-stale-from-time')
      }
      if (!Number.isInteger(request.maxEvents) || request.maxEvents < 1) {
        return rejected(request, initial.streamHead, 'world-simulation-invalid-event-budget')
      }

      let tasks: readonly WorldSimulationTask[]
      try {
        tasks = await options.tasks.listDueTasks(request, initial)
      } catch {
        return rejected(request, initial.streamHead, 'world-simulation-task-source-failed')
      }
      if (!Array.isArray(tasks) || tasks.some(task => !validTask(task))) {
        return rejected(request, initial.streamHead, 'world-simulation-task-invalid')
      }
      const ordered = [...tasks].sort(compareTasks)
      const scheduledIds = ordered.flatMap(task => task.scheduleId === undefined ? [] : [task.scheduleId])
      if (new Set(ordered.map(task => task.taskId)).size !== ordered.length
        || new Set(ordered.map(task => task.requestId)).size !== ordered.length
        || new Set(scheduledIds).size !== scheduledIds.length) {
        return rejected(request, initial.streamHead, 'world-simulation-task-identity-duplicate')
      }
      if (ordered.some(task => compareWorldTime(task.dueAt, request.from) < 0
        || compareWorldTime(task.dueAt, request.to) > 0)) {
        return rejected(request, initial.streamHead, 'world-simulation-task-outside-interval')
      }
      for (const task of ordered) {
        if (task.scheduleId !== undefined) {
          const entry = initial.planning.scheduleEntries.find(item => item.id === task.scheduleId)
          if (!entry || entry.execution.kind === 'value' || entry.deviation.kind === 'value'
            || task.source !== 'schedule'
            || !sameTime(task.dueAt, { day: entry.day, period: entry.period })) {
            return rejected(request, initial.streamHead, 'world-simulation-schedule-task-not-eligible')
          }
        }
      }
      if (ordered.length === 0) {
        return { status: 'unchanged', worldId: request.worldId, streamHead: initial.streamHead }
      }

      let selectedCount = 0
      let budgetUsed = 0
      for (const task of ordered) {
        const eventCost = task.scheduleId === undefined ? 1 : 2
        if (budgetUsed + eventCost > request.maxEvents) break
        budgetUsed += eventCost
        selectedCount += 1
      }
      const selected = ordered.slice(0, selectedCount)
      const emittedEventIds: EventId[] = []
      const pendingTaskIds = ordered.slice(selected.length).map(task => task.taskId)
      let latest = initial

      const submit = async (
        requestId: string,
        actor: string,
        source: 'rule' | 'schedule',
        intentKind: string,
        requestedAt: WorldTime,
        payload: JsonValue,
      ): Promise<{ readonly receipt: WorldCommandReceipt; readonly aggregate: WorldAggregate | null }> => {
        const receipt = await options.commands.submit({
          worldId: request.worldId,
          clientRequestId: requestId,
          actor,
          source,
          intentKind,
          requestedAt,
          expectedHead: latest.streamHead,
          payload,
        })
        const refreshed = await options.queries.read(request.worldId)
        return { receipt, aggregate: refreshed }
      }

      for (let index = 0; index < selected.length; index += 1) {
        const task = selected[index]!
        let action: { readonly receipt: WorldCommandReceipt; readonly aggregate: WorldAggregate | null }
        try {
          action = await submit(task.requestId, task.actor, task.source, task.intentKind, task.dueAt, task.payload)
        } catch {
          pendingTaskIds.unshift(...selected.slice(index).map(item => item.taskId))
          return {
            status: 'partial',
            worldId: request.worldId,
            from: request.from,
            to: latest.worldTime,
            emittedEventIds: Object.freeze(emittedEventIds),
            pendingTaskIds: Object.freeze(pendingTaskIds),
            streamHead: latest.streamHead,
            reason: 'world-simulation-command-port-failed',
          }
        }
        if (!isFailure(action.receipt)
          && (action.receipt.status === 'committed' || action.receipt.status === 'duplicate')) {
          emittedEventIds.push(action.receipt.eventId)
        }
        if (isFailure(action.receipt) || !action.aggregate) {
          pendingTaskIds.unshift(...selected.slice(index).map(item => item.taskId))
          const reason = isFailure(action.receipt) ? action.receipt.reason : 'world-simulation-query-refresh-failed'
          if (emittedEventIds.length === 0) return rejected(request, latest.streamHead, reason)
          return {
            status: 'partial',
            worldId: request.worldId,
            from: request.from,
            to: latest.worldTime,
            emittedEventIds: Object.freeze(emittedEventIds),
            pendingTaskIds: Object.freeze(pendingTaskIds),
            streamHead: latest.streamHead,
            reason,
          }
        }
        latest = action.aggregate

        if (task.scheduleId !== undefined) {
          const settlementInput = toLedgerEventInput(createScheduleEntryExecutionRecordedEventInput(
            task.scheduleId,
            action.receipt.eventId,
            {
              actor: task.actor,
              source: 'schedule',
              requestWorldTime: task.dueAt,
              clientRequestId: `w6-simulation:${request.worldId}:schedule:${task.scheduleId}:settle`,
            },
          ))
          let settlement: { readonly receipt: WorldCommandReceipt; readonly aggregate: WorldAggregate | null }
          try {
            settlement = await submit(
              settlementInput.clientRequestId,
              task.actor,
              'schedule',
              settlementInput.intentKind,
              task.dueAt,
              settlementInput.payload,
            )
          } catch {
            pendingTaskIds.unshift(...selected.slice(index).map(item => item.taskId))
            return {
              status: 'partial',
              worldId: request.worldId,
              from: request.from,
              to: latest.worldTime,
              emittedEventIds: Object.freeze(emittedEventIds),
              pendingTaskIds: Object.freeze(pendingTaskIds),
              streamHead: latest.streamHead,
              reason: 'world-simulation-schedule-settlement-port-failed',
            }
          }
          if (!isFailure(settlement.receipt)
            && (settlement.receipt.status === 'committed' || settlement.receipt.status === 'duplicate')) {
            emittedEventIds.push(settlement.receipt.eventId)
          }
          if (isFailure(settlement.receipt) || !settlement.aggregate) {
            pendingTaskIds.unshift(...selected.slice(index).map(item => item.taskId))
            const reason = isFailure(settlement.receipt) ? settlement.receipt.reason : 'world-simulation-query-refresh-failed'
            return {
              status: 'partial',
              worldId: request.worldId,
              from: request.from,
              to: latest.worldTime,
              emittedEventIds: Object.freeze(emittedEventIds),
              pendingTaskIds: Object.freeze(pendingTaskIds),
              streamHead: latest.streamHead,
              reason,
            }
          }
          latest = settlement.aggregate
        }
      }

      if (pendingTaskIds.length > 0) {
        return {
          status: 'partial',
          worldId: request.worldId,
          from: request.from,
          to: latest.worldTime,
          emittedEventIds: Object.freeze(emittedEventIds),
          pendingTaskIds: Object.freeze(pendingTaskIds),
          streamHead: latest.streamHead,
          reason: 'world-simulation-event-budget-exhausted',
        }
      }
      if (emittedEventIds.length === 0) {
        return { status: 'unchanged', worldId: request.worldId, streamHead: latest.streamHead }
      }
      return {
        status: 'advanced',
        worldId: request.worldId,
        from: request.from,
        to: latest.worldTime,
        emittedEventIds: Object.freeze(emittedEventIds),
        streamHead: latest.streamHead,
      }
    },
  })
}
