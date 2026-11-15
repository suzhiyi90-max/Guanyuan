import { brandedId, type EventId } from './shared/ids'
import { isValidWorldTime, type WorldTime } from './shared/world-time'
import { validateEventPayload, type EventRegistry } from './event-registry'
import type { JsonValue, LedgerEvent, WorldId } from './event-ledger'

export type StreamCursor =
  | { readonly kind: 'genesis'; readonly seq: 0 }
  | { readonly kind: 'event'; readonly seq: number; readonly eventId: EventId }

export type ReplayIssue =
  | 'replay-world-id-empty'
  | 'replay-registry-not-frozen'
  | 'replay-range-invalid'
  | 'replay-cursor-invalid'
  | 'replay-anchor-mismatch'
  | 'replay-event-count-mismatch'
  | 'replay-event-world-mismatch'
  | 'replay-event-sequence-mismatch'
  | 'replay-event-id-mismatch'
  | 'replay-event-metadata-invalid'
  | 'replay-system-receipt-invalid'
  | 'replay-ai-candidate-receipt-invalid'
  | 'replay-schema-invalid'
  | 'replay-initial-state-invalid'
  | 'replay-reducer-failed'

export interface ReplayFailure {
  readonly status: 'rejected'
  readonly issue: ReplayIssue
  readonly seq?: number
  readonly eventId?: EventId
}

export interface ReplaySuccess {
  readonly status: 'replayed'
  readonly worldId: WorldId
  readonly state: JsonValue
  readonly cursor: StreamCursor
  readonly applied: number
}

export interface ReplayRangeInput<Kind extends string = string> {
  readonly worldId: WorldId
  readonly fromExclusive: StreamCursor
  readonly toInclusive: StreamCursor
  /** Required when fromExclusive is an event cursor; validates its seq/eventId anchor. */
  readonly anchorEvent?: LedgerEvent<Kind>
  /** Earlier candidate.validated receipts needed by an incremental range. */
  readonly priorReceipts?: readonly LedgerEvent<Kind>[]
  /** Must contain exactly the events in (fromExclusive, toInclusive]. */
  readonly events: readonly LedgerEvent<Kind>[]
  readonly registry: EventRegistry<Kind>
  readonly initialState: JsonValue
  readonly reduce: (state: JsonValue, event: LedgerEvent<Kind>) => JsonValue
}

function cloneFreezeJson(value: JsonValue, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('replay-initial-state-invalid')
    return value
  }
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('replay-initial-state-invalid')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return Object.freeze(value.map(item => cloneFreezeJson(item, ancestors)))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('replay-initial-state-invalid')
    const record = value as { readonly [key: string]: JsonValue }
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(record).sort()) result[key] = cloneFreezeJson(record[key], ancestors)
    return Object.freeze(result)
  } finally {
    ancestors.delete(value)
  }
}

function cloneFreezeEvent<Kind extends string>(event: LedgerEvent<Kind>): LedgerEvent<Kind> {
  const payload = cloneFreezeJson(event.payload)
  return Object.freeze({
    ...event,
    requestWorldTime: Object.freeze({ ...event.requestWorldTime }),
    committedAt: Object.freeze({ ...event.committedAt }),
    payload,
  })
}

function cursorIsValid(cursor: StreamCursor): boolean {
  if (cursor === null || typeof cursor !== 'object') return false
  if (cursor.kind === 'genesis') return cursor.seq === 0
  return cursor.kind === 'event' && Number.isSafeInteger(cursor.seq) && cursor.seq > 0
    && typeof cursor.eventId === 'string' && cursor.eventId.trim().length > 0
}

function safeWorldTime(value: unknown): value is WorldTime {
  if (value === null || typeof value !== 'object') return false
  try { return isValidWorldTime(value as WorldTime) } catch { return false }
}

function compareTime(left: WorldTime, right: WorldTime): number {
  const order = ['晨', '午', '暮', '夜'] as const
  if (left.day !== right.day) return left.day < right.day ? -1 : 1
  const l = order.indexOf(left.period)
  const r = order.indexOf(right.period)
  return l === r ? 0 : l < r ? -1 : 1
}

function isSystemReceipt(event: LedgerEvent): boolean {
  if (event.kind !== 'candidate.validated') return false
  if (event.source !== 'rule' || event.candidateRef !== undefined || event.validationRef !== undefined) return false
  const payload = event.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as { readonly [key: string]: JsonValue }
  return typeof value.candidate === 'string' && value.candidate.trim().length > 0
    && typeof value.targetKind === 'string' && value.targetKind.trim().length > 0
    && typeof value.payloadDigest === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value.payloadDigest)
    && value.digestAlgorithm === 'sha-256/canonical-json-v1'
    && typeof value.registryVersion === 'string' && value.registryVersion.trim().length > 0
    && typeof value.validatedBy === 'string' && value.validatedBy.trim().length > 0
}

function validateEvent<Kind extends string>(
  event: LedgerEvent<Kind>,
  worldId: WorldId,
  expectedSeq: number,
  registry: EventRegistry<Kind>,
  receipts: ReadonlyMap<string, LedgerEvent<Kind>>,
): ReplayIssue | null {
  if (!event || typeof event !== 'object') return 'replay-event-metadata-invalid'
  if (event.worldId !== worldId) return 'replay-event-world-mismatch'
  if (event.seq !== expectedSeq) return 'replay-event-sequence-mismatch'
  if (event.id !== brandedId<'EventId'>(`evt:${worldId}:${expectedSeq}`)) return 'replay-event-id-mismatch'
  if (!['player-command', 'rule', 'schedule', 'ai-candidate'].includes(event.source)
    || typeof event.kind !== 'string' || !event.kind.trim()
    || typeof event.intentKind !== 'string' || !event.intentKind.trim()
    || typeof event.actor !== 'string' || !event.actor.trim()
    || typeof event.clientRequestId !== 'string' || !event.clientRequestId.trim()
    || !safeWorldTime(event.requestWorldTime) || !safeWorldTime(event.committedAt)
    || compareTime(event.committedAt, event.requestWorldTime) < 0
    || (event.source === 'ai-candidate' && (typeof event.candidateRef !== 'string' || !event.candidateRef.trim()
      || typeof event.validationRef !== 'string' || !event.validationRef.trim()))
    || (event.source !== 'ai-candidate' && (event.candidateRef !== undefined || event.validationRef !== undefined))) {
    return 'replay-event-metadata-invalid'
  }
  if (event.kind === 'candidate.validated') return isSystemReceipt(event) ? null : 'replay-system-receipt-invalid'
  const validation = validateEventPayload(registry, event.kind as Kind, event.payload)
  if (validation.status !== 'valid') return 'replay-schema-invalid'
  if (event.source === 'ai-candidate') {
    const receipt = event.validationRef ? receipts.get(event.validationRef) : undefined
    const receiptPayload = receipt?.payload
    if (!receipt || receipt.seq >= event.seq || receipt.kind !== 'candidate.validated'
      || receipt.source !== 'rule' || receiptPayload === null || typeof receiptPayload !== 'object'
      || Array.isArray(receiptPayload)) return 'replay-ai-candidate-receipt-invalid'
    const proof = receiptPayload as { readonly [key: string]: JsonValue }
    if (proof.candidate !== event.candidateRef || proof.targetKind !== event.kind
      || proof.registryVersion !== registry.registryVersion
      || proof.digestAlgorithm !== 'sha-256/canonical-json-v1'
      || typeof proof.payloadDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(proof.payloadDigest)) {
      return 'replay-ai-candidate-receipt-invalid'
    }
  }
  return null
}

/**
 * Replays exactly one continuous event interval. All envelope/schema checks run
 * before reducers; reducer failures return no partial state. Reducers must be pure.
 */
export function replayEventRange<Kind extends string>(
  input: ReplayRangeInput<Kind>,
): ReplaySuccess | ReplayFailure {
  if (typeof input.worldId !== 'string' || !input.worldId.trim()) return { status: 'rejected', issue: 'replay-world-id-empty' }
  if (!input.registry || typeof input.registry !== 'object' || input.registry.frozen !== true || !Object.isFrozen(input.registry)) {
    return { status: 'rejected', issue: 'replay-registry-not-frozen' }
  }
  const from = input.fromExclusive
  const to = input.toInclusive
  if (!Array.isArray(input.events) || (input.priorReceipts !== undefined && !Array.isArray(input.priorReceipts))
    || !cursorIsValid(from) || !cursorIsValid(to)
    || (from.kind === 'event' && to.kind === 'genesis')
    || to.seq < from.seq) return { status: 'rejected', issue: 'replay-range-invalid' }

  const receipts = new Map<string, LedgerEvent<Kind>>()
  for (const receipt of input.priorReceipts ?? []) {
    if (!receipt || typeof receipt !== 'object' || from.kind !== 'event' || receipt.worldId !== input.worldId || !Number.isSafeInteger(receipt.seq)
      || receipt.seq <= 0 || receipt.seq >= from.seq
      || receipt.id !== brandedId<'EventId'>('evt:' + input.worldId + ':' + receipt.seq)
      || !isSystemReceipt(receipt) || receipts.has(receipt.id)) {
      return { status: 'rejected', issue: 'replay-ai-candidate-receipt-invalid', seq: receipt?.seq, eventId: receipt?.id }
    }
    let immutableReceipt: LedgerEvent<Kind>
    try { immutableReceipt = cloneFreezeEvent(receipt) } catch {
      return { status: 'rejected', issue: 'replay-ai-candidate-receipt-invalid', seq: receipt.seq, eventId: receipt.id }
    }
    const issue = validateEvent(immutableReceipt, input.worldId, receipt.seq, input.registry, receipts)
    if (issue) return { status: 'rejected', issue, seq: receipt.seq, eventId: receipt.id }
    receipts.set(immutableReceipt.id, immutableReceipt)
  }

  if (from.kind === 'event') {
    const anchor = input.anchorEvent
    if (!anchor || anchor.worldId !== input.worldId || anchor.seq !== from.seq || anchor.id !== from.eventId
      || anchor.id !== brandedId<'EventId'>('evt:' + input.worldId + ':' + from.seq)) {
      return { status: 'rejected', issue: 'replay-anchor-mismatch', seq: from.seq, eventId: from.eventId }
    }
    let immutableAnchor: LedgerEvent<Kind>
    try { immutableAnchor = cloneFreezeEvent(anchor) } catch {
      return { status: 'rejected', issue: 'replay-anchor-mismatch', seq: from.seq, eventId: from.eventId }
    }
    const issue = validateEvent(immutableAnchor, input.worldId, from.seq, input.registry, receipts)
    if (issue) return { status: 'rejected', issue, seq: from.seq, eventId: from.eventId }
    if (immutableAnchor.kind === 'candidate.validated') receipts.set(immutableAnchor.id, immutableAnchor)
  } else if (input.anchorEvent !== undefined || (input.priorReceipts?.length ?? 0) > 0) {
    return { status: 'rejected', issue: 'replay-anchor-mismatch' }
  }

  const expectedCount = to.seq - from.seq
  if (input.events.length !== expectedCount) return { status: 'rejected', issue: 'replay-event-count-mismatch' }
  if (expectedCount === 0 && (from.kind !== to.kind || (from.kind === 'event' && to.kind === 'event' && from.eventId !== to.eventId))) {
    return { status: 'rejected', issue: 'replay-cursor-invalid' }
  }

  const checked: LedgerEvent<Kind>[] = []
  for (let index = 0; index < input.events.length; index += 1) {
    const event = input.events[index]
    const seq = from.seq + index + 1
    if (!Number.isSafeInteger(seq)) return { status: 'rejected', issue: 'replay-range-invalid' }
    if (!event || typeof event !== 'object') return { status: 'rejected', issue: 'replay-event-metadata-invalid', seq }
    let immutableEvent: LedgerEvent<Kind>
    try { immutableEvent = cloneFreezeEvent(event) } catch {
      return { status: 'rejected', issue: 'replay-schema-invalid', seq, eventId: event.id }
    }
    const issue = validateEvent(immutableEvent, input.worldId, seq, input.registry, receipts)
    if (issue) return { status: 'rejected', issue, seq, eventId: event.id }
    checked.push(immutableEvent)
    if (immutableEvent.kind === 'candidate.validated') receipts.set(immutableEvent.id, immutableEvent)
  }
  if (to.kind === 'genesis') {
    if (checked.length !== 0 || from.kind !== 'genesis') return { status: 'rejected', issue: 'replay-cursor-invalid' }
  } else if (checked.length > 0) {
    const last = checked[checked.length - 1]
    if (!last || last.seq !== to.seq || last.id !== to.eventId) {
      return { status: 'rejected', issue: 'replay-cursor-invalid', seq: to.seq, eventId: to.eventId }
    }
  } else if (from.kind !== 'event' || from.seq !== to.seq || from.eventId !== to.eventId) {
    return { status: 'rejected', issue: 'replay-cursor-invalid', seq: to.seq, eventId: to.eventId }
  }

  let state: JsonValue
  try { state = cloneFreezeJson(input.initialState) } catch {
    return { status: 'rejected', issue: 'replay-initial-state-invalid' }
  }
  for (const event of checked) {
    try {
      state = cloneFreezeJson(input.reduce(state, event))
    } catch {
      return { status: 'rejected', issue: 'replay-reducer-failed', seq: event.seq, eventId: event.id }
    }
  }
  const cursor: StreamCursor = Object.freeze(to.kind === 'genesis'
    ? { kind: 'genesis' as const, seq: 0 as const }
    : { kind: 'event' as const, seq: to.seq, eventId: to.eventId })
  return Object.freeze({
    status: 'replayed' as const,
    worldId: input.worldId,
    state,
    cursor,
    applied: checked.length,
  })
}

export interface ReadOnlyProjection {
  readonly status: 'rebuilt'
  readonly worldId: WorldId
  readonly state: JsonValue
  readonly cursor: StreamCursor
  readonly applied: number
}

/** Rebuilds a derived view from a read-only event segment; it has no ledger write capability. */
export function rebuildReadOnlyProjection<Kind extends string>(
  input: ReplayRangeInput<Kind>,
): ReadOnlyProjection | ReplayFailure {
  const result = replayEventRange(input)
  if (result.status === 'rejected') return result
  return Object.freeze({
    status: 'rebuilt' as const,
    worldId: result.worldId,
    state: result.state,
    cursor: result.cursor,
    applied: result.applied,
  })
}
