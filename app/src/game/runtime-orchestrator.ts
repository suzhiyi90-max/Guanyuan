import { appendLedgerEvent, createEventLedger, type EventLedger, type JsonValue, type LedgerEvent, type WorldId } from '../domain/event-ledger'
import { validateEventPayload, type EventRegistry } from '../domain/event-registry'
import { brandedId } from '../domain/shared/ids'
import type { WorldTime } from '../domain/shared/world-time'
import { periods } from './engine'
import type { RiverPlan } from '../types'
import { createInitialGameState } from './initial-state'
import type { GameState } from './model'
import { rebuildPreviewRuntimeProjection } from './runtime-projection'
import { createPreviewRuntimeRegistry, type PreviewRuntimeEventKind } from './runtime-registry'

type BusinessEventKind = Exclude<PreviewRuntimeEventKind, 'candidate.validated'>
type RiverPlanInput = Omit<RiverPlan, 'day' | 'period'>

export type PreviewRuntimeIntent =
  | { readonly kind: 'goal.selected'; readonly payload: { readonly goalId: string } }
  | { readonly kind: 'document.remembered'; readonly payload: { readonly selectedIds: readonly string[] } }
  | { readonly kind: 'ledger.remembered'; readonly payload: { readonly selectedIds: readonly string[] } }
  | { readonly kind: 'person.asked'; readonly payload: { readonly personId: string } }
  | { readonly kind: 'records.audited'; readonly payload: Record<string, never> }
  | { readonly kind: 'river.probed'; readonly payload: Record<string, never> }
  | { readonly kind: 'plan.previewed'; readonly payload: Record<string, never> }
  | { readonly kind: 'river.plan.confirmed'; readonly payload: { readonly plan: RiverPlanInput } }
  | { readonly kind: 'banquet.choice'; readonly payload: { readonly choice: 'attend' | 'delegate' | 'audit' } }
  | { readonly kind: 'official.action'; readonly payload: { readonly key: string } }
  | { readonly kind: 'world.event.resolved'; readonly payload: { readonly eventId: string; readonly optionId: string } }
  | { readonly kind: 'day.advanced'; readonly payload: Record<string, never> }

export interface PreviewRuntimeSession {
  readonly worldId: WorldId
  readonly registry: EventRegistry<PreviewRuntimeEventKind>
  readonly ledger: EventLedger<PreviewRuntimeEventKind>
  readonly state: GameState
  readonly requestSequence: number
}

export type PreviewRuntimeDispatchResult =
  | { readonly status: 'appended'; readonly session: PreviewRuntimeSession; readonly event: LedgerEvent<PreviewRuntimeEventKind> }
  | { readonly status: 'duplicate'; readonly session: PreviewRuntimeSession; readonly event: LedgerEvent<PreviewRuntimeEventKind> }
  | { readonly status: 'rejected'; readonly session: PreviewRuntimeSession; readonly reason: string }

function projectionState(sessionWorldId: WorldId, ledger: EventLedger<PreviewRuntimeEventKind>, registry: EventRegistry<PreviewRuntimeEventKind>): GameState | null {
  const tail = ledger.events[ledger.events.length - 1]
  const result = rebuildPreviewRuntimeProjection({
    worldId: sessionWorldId,
    toInclusive: tail
      ? { kind: 'event', seq: tail.seq, eventId: tail.id }
      : { kind: 'genesis', seq: 0 },
    events: ledger.events,
    registry,
  })
  return result.status === 'rebuilt' ? result.state as unknown as GameState : null
}

/** Allocate a new in-memory world. Persistence identity is deliberately owned by W5-D. */
export function createPreviewRuntimeSession(worldIdValue: string): PreviewRuntimeSession {
  const worldId = brandedId<'WorldId'>(worldIdValue) as WorldId
  const registry = createPreviewRuntimeRegistry()
  const ledger = createEventLedger<PreviewRuntimeEventKind>(worldId)
  const state = projectionState(worldId, ledger, registry)
  if (!state) throw new Error('preview-runtime-genesis-projection-failed')
  return Object.freeze({ worldId, registry, ledger, state, requestSequence: 0 })
}

/**
 * The only runtime write boundary for player facts.
 * Append and replay are prepared off-session; the session is replaced only
 * after a valid, complete projection has been rebuilt.
 */
export function dispatchPreviewRuntimeIntent(
  session: PreviewRuntimeSession,
  intent: PreviewRuntimeIntent,
  clientRequestId?: string,
): PreviewRuntimeDispatchResult {
  const requestSequence = session.requestSequence + 1
  const nextSession = (ledger = session.ledger, state = session.state): PreviewRuntimeSession => Object.freeze({
    ...session,
    ledger,
    state,
    requestSequence,
  })
  const requestId = clientRequestId?.trim() || `player-command-${requestSequence}`
  if (!requestId) return { status: 'rejected', session: nextSession(), reason: 'client-request-id-empty' }

  const validation = validateEventPayload(
    session.registry,
    intent.kind as BusinessEventKind,
    intent.payload as unknown as JsonValue,
  )
  if (validation.status !== 'valid') {
    return { status: 'rejected', session: nextSession(), reason: `schema-${validation.status}` }
  }

  const period = periods[session.state.periodIndex]
  if (!period) return { status: 'rejected', session: nextSession(), reason: 'world-time-invalid' }
  const requestWorldTime: WorldTime = Object.freeze({ day: session.state.day, period })
  const appended = appendLedgerEvent(session.ledger, {
    source: 'player-command',
    kind: intent.kind,
    intentKind: intent.kind,
    actor: 'player',
    requestWorldTime,
    clientRequestId: requestId,
    payload: intent.payload as unknown as JsonValue,
  }, requestWorldTime)

  if (appended.status === 'duplicate') {
    return { status: 'duplicate', session: nextSession(), event: appended.event }
  }
  if (appended.status === 'idempotency-conflict') {
    return { status: 'rejected', session: nextSession(), reason: 'idempotency-conflict' }
  }
  if (appended.status === 'rejected') {
    return { status: 'rejected', session: nextSession(), reason: appended.issues.join(',') }
  }

  const state = projectionState(session.worldId, appended.ledger, session.registry)
  if (!state) {
    return { status: 'rejected', session: nextSession(), reason: 'replay-rejected' }
  }
  return {
    status: 'appended',
    session: nextSession(appended.ledger, state),
    event: appended.event,
  }
}
