import { appendLedgerEvent, createEventLedger, type EventLedger, type JsonValue, type LedgerEvent, type WorldId } from '../domain/event-ledger'
import {
  appendValidatedAiCandidateFact,
  createCandidateLog,
  rejectAiCandidate,
  submitAiCandidate,
  validateAiCandidate,
  type CandidateLog,
} from '../domain/ai-candidate'
import type { GeneratedEvent } from '../narrative/types'
import { effectById } from '../narrative/effects'
import { validateEventPayload, type EventRegistry } from '../domain/event-registry'
import { evidenceIds } from '../narrative/lexicon'
import { brandedId } from '../domain/shared/ids'
import type { WorldTime } from '../domain/shared/world-time'
import { officialAvailableOf, periods } from './engine'
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
  readonly candidateLog: CandidateLog
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
  return Object.freeze({ worldId, registry, ledger, state, requestSequence: 0, candidateLog: createCandidateLog() })
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
    candidateLog: session.candidateLog,
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


export type PreviewRuntimeCandidateResult =
  | { readonly status: 'appended' | 'duplicate'; readonly session: PreviewRuntimeSession; readonly event: LedgerEvent<PreviewRuntimeEventKind> }
  | { readonly status: 'rejected'; readonly session: PreviewRuntimeSession; readonly reason: string }

/**
 * Validates one selected AI option as an out-of-ledger candidate, appends its
 * trusted receipt, appends the referenced fact, and only then commits a fully
 * replayed session. All ledger changes are prepared off-session.
 */
export async function dispatchPreviewRuntimeCandidate(
  session: PreviewRuntimeSession,
  generated: GeneratedEvent,
  optionId: string,
): Promise<PreviewRuntimeCandidateResult> {
  const unchanged = (candidateLog = session.candidateLog): PreviewRuntimeSession => Object.freeze({
    ...session,
    candidateLog,
    requestSequence: session.requestSequence + 1,
  })
  if (!generated || generated.origin !== 'ai' || typeof generated.id !== 'string'
    || !/^ai-\d+-[a-z0-9]+$/u.test(generated.id) || generated.day !== session.state.day
    || !Number.isSafeInteger(generated.seed) || !Array.isArray(generated.options)
    || generated.options.length !== 2
    || !generated.options.some(item => item.id === 'jia')
    || !generated.options.some(item => item.id === 'yi')) {
    return { status: 'rejected', session: unchanged(), reason: 'not-generated-or-stale' }
  }
  if (session.state.pendingEvent && session.state.pendingEvent !== generated.id) {
    return { status: 'rejected', session: unchanged(), reason: 'world-event-pending' }
  }
  const option = generated.options.find(item => item.id === optionId)
  if (!option) return { status: 'rejected', session: unchanged(), reason: 'unknown-option' }
  const candidateId = `${generated.id}:${option.id}`
  const existing = session.candidateLog.candidates.find(item => item.candidateId === candidateId)
  if (session.state.handledEvents.includes(generated.id) && existing?.status !== 'validated') {
    return { status: 'rejected', session: unchanged(), reason: 'already-handled' }
  }
  const refs = option.refs ?? []
  if (!['jia', 'yi'].includes(option.id) || typeof option.result !== 'string'
    || option.result.trim().length === 0 || option.result.length > 140
    || !Array.isArray(refs) || refs.length > 4
    || refs.some(ref => !evidenceIds.includes(ref))) {
    return { status: 'rejected', session: unchanged(), reason: 'candidate-payload-invalid' }
  }
  const effect = effectById(option.effect)
  if (!effect) return { status: 'rejected', session: unchanged(), reason: 'unknown-effect' }
  const alreadyCommitted = existing?.status === 'validated'
    && session.ledger.events.some(item => item.source === 'ai-candidate' && item.candidateRef === candidateId)
  if (!alreadyCommitted && !effect.available(session.state, officialAvailableOf(session.state))) {
    return { status: 'rejected', session: unchanged(), reason: 'effect-unavailable' }
  }

  const candidatePayload: JsonValue = {
    generatedEventId: generated.id,
    optionId: option.id,
    effect: option.effect,
    result: option.result || option.label,
    refs,
  }
  let log = session.candidateLog
  if (existing && JSON.stringify(existing.payload, ['effect', 'generatedEventId', 'optionId', 'refs', 'result'])
    !== JSON.stringify(candidatePayload, ['effect', 'generatedEventId', 'optionId', 'refs', 'result'])) {
    return { status: 'rejected', session: unchanged(), reason: 'candidate-payload-conflict' }
  }
  if (!existing) {
    const submitted = submitAiCandidate(log, {
      candidateId,
      targetKind: 'ai.generated-event.resolved',
      registryVersion: session.registry.registryVersion,
      payload: candidatePayload,
    })
    if (submitted.status !== 'accepted') return { status: 'rejected', session: unchanged(), reason: 'candidate-submit-rejected' }
    log = submitted.log
  } else if (existing.status === 'rejected') {
    return { status: 'rejected', session: unchanged(), reason: 'candidate-terminal-rejected' }
  }

  const period = periods[session.state.periodIndex]
  if (!period) return { status: 'rejected', session: unchanged(), reason: 'world-time-invalid' }
  const now: WorldTime = Object.freeze({ day: session.state.day, period })
  let validatedLedger = session.ledger
  if (existing?.status !== 'validated') {
    const validation = await validateAiCandidate(
      log, session.ledger, session.registry, candidateId,
      'rule:preview-generated-event', now, now,
    )
    if (validation.status === 'validated') {
      log = validation.log
      validatedLedger = validation.ledger as EventLedger<PreviewRuntimeEventKind>
    } else if (validation.status === 'schema-invalid' || validation.status === 'registry-version-mismatch'
      || validation.status === 'invalid-registry' || validation.status === 'invalid-state') {
      const rejected = rejectAiCandidate(log, candidateId, validation.status, 'rule:preview-generated-event')
      return { status: 'rejected', session: unchanged(rejected.status === 'rejected' ? rejected.log : log), reason: validation.status }
    } else {
      return { status: 'rejected', session: unchanged(), reason: validation.status }
    }
  }

  const validationEvent = validatedLedger.events.find(item => item.kind === 'candidate.validated'
    && item.payload !== null && typeof item.payload === 'object' && !Array.isArray(item.payload)
    && (item.payload as { readonly [key: string]: JsonValue }).candidate === candidateId)
  if (!validationEvent) return { status: 'rejected', session: unchanged(), reason: 'validation-receipt-missing' }
  const fact = await appendValidatedAiCandidateFact(
    log, validatedLedger, session.registry, candidateId, validationEvent.requestWorldTime, now,
  )
  if (fact.status === 'rejected') {
    return { status: 'rejected', session: unchanged(), reason: fact.reason }
  }
  const committedLedger = fact.ledger as EventLedger<PreviewRuntimeEventKind>
  const state = projectionState(session.worldId, committedLedger, session.registry)
  if (!state) return { status: 'rejected', session: unchanged(), reason: 'replay-rejected' }
  const next: PreviewRuntimeSession = Object.freeze({
    ...session,
    ledger: committedLedger,
    state,
    candidateLog: log,
    requestSequence: session.requestSequence + 1,
  })
  return { status: fact.status, session: next, event: fact.event as LedgerEvent<PreviewRuntimeEventKind> }
}
