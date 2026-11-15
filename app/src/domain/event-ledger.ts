import { brandedId, type EventId, type BrandedId } from './shared/ids'
import { isValidWorldTime, type WorldTime } from './shared/world-time'
import { validateEventPayload, type EventRegistry } from './event-registry'

export type WorldId = BrandedId<'WorldId'>
export type LedgerSource = 'player-command' | 'rule' | 'schedule' | 'ai-candidate'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export interface LedgerEventInput<Kind extends string = string> {
  readonly source: LedgerSource
  readonly kind: Kind
  readonly intentKind: string
  readonly actor: string
  readonly requestWorldTime: WorldTime
  readonly clientRequestId: string
  readonly payload: JsonValue
  readonly candidateRef?: string
  readonly validationRef?: EventId
}

export interface LedgerEvent<Kind extends string = string> extends LedgerEventInput<Kind> {
  readonly worldId: WorldId
  readonly id: EventId
  readonly seq: number
  readonly committedAt: WorldTime
}

export interface LedgerIdempotencyRecord {
  readonly key: string
  readonly eventId: EventId
  readonly fingerprint: string
}

export interface EventLedger<Kind extends string = string> {
  readonly worldId: WorldId
  readonly head: number
  readonly events: readonly LedgerEvent<Kind>[]
  readonly idempotency: readonly LedgerIdempotencyRecord[]
}

export type LedgerIssue =
  | 'ledger-world-id-empty'
  | 'ledger-event-source-invalid'
  | 'ledger-event-kind-empty'
  | 'ledger-intent-kind-empty'
  | 'ledger-actor-empty'
  | 'ledger-client-request-id-empty'
  | 'ledger-request-time-invalid'
  | 'ledger-commit-time-invalid'
  | 'ledger-commit-time-before-request'
  | 'ledger-payload-not-json'
  | 'ledger-state-corrupt'
  | 'ledger-ai-candidate-receipt-invalid'
  | 'ledger-ai-candidate-metadata-invalid'

export type AppendLedgerResult<Kind extends string = string> =
  | { readonly status: 'appended'; readonly ledger: EventLedger<Kind>; readonly event: LedgerEvent<Kind> }
  | { readonly status: 'duplicate'; readonly ledger: EventLedger<Kind>; readonly event: LedgerEvent<Kind> }
  | { readonly status: 'idempotency-conflict'; readonly ledger: EventLedger<Kind>; readonly event: LedgerEvent<Kind> }
  | { readonly status: 'rejected'; readonly ledger: EventLedger<Kind>; readonly issues: readonly LedgerIssue[] }

/**
 * Creates an empty world-scoped ledger. Event IDs and sequence numbers are
 * allocated only by appendLedgerEvent; callers never provide either value.
 */
export function createEventLedger<Kind extends string = string>(worldId: WorldId): EventLedger<Kind> {
  if (!worldId.trim()) throw new Error('ledger-world-id-empty')
  return Object.freeze({
    worldId,
    head: 0,
    events: Object.freeze([]) as readonly LedgerEvent<Kind>[],
    idempotency: Object.freeze([]),
  })
}

/**
 * Canonical JSON encoding is used as a collision-free in-memory identity
 * representation for request tuples and payload comparison. It is deliberately
 * not a persisted digest; W3-D owns the specified SHA-256 payload digest.
 */
function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('ledger-payload-not-json')
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  if (typeof value !== 'object') throw new Error('ledger-payload-not-json')
  if (ancestors.has(value)) throw new Error('ledger-payload-not-json')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item, ancestors)).join(',')}]`
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('ledger-payload-not-json')
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function cloneAndFreezeJson(value: JsonValue): JsonValue {
  const encoded = canonicalJson(value)
  const clone = JSON.parse(encoded) as JsonValue
  const freeze = (item: JsonValue): JsonValue => {
    if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) item.forEach(child => freeze(child))
      else Object.values(item).forEach(child => freeze(child))
      Object.freeze(item)
    }
    return item
  }
  return freeze(clone)
}

function idempotencyKey<Kind extends string>(worldId: WorldId, input: LedgerEventInput<Kind>): string {
  return canonicalJson([
    worldId,
    input.source,
    input.intentKind,
    input.actor,
    input.clientRequestId,
  ])
}

function validateInput<Kind extends string>(
  ledger: EventLedger<Kind>,
  input: LedgerEventInput<Kind>,
  committedAt: WorldTime,
): LedgerIssue[] {
  const issues: LedgerIssue[] = []
  if (!ledger.worldId.trim()) issues.push('ledger-world-id-empty')
  if (!['player-command', 'rule', 'schedule', 'ai-candidate'].includes(input.source)) issues.push('ledger-event-source-invalid')
  if (input.source === 'ai-candidate' && (!input.candidateRef?.trim() || !input.validationRef?.trim())) issues.push('ledger-ai-candidate-metadata-invalid')
  if (input.source !== 'ai-candidate' && (input.candidateRef !== undefined || input.validationRef !== undefined)) issues.push('ledger-ai-candidate-metadata-invalid')
  if (!input.kind.trim()) issues.push('ledger-event-kind-empty')
  if (!input.intentKind.trim()) issues.push('ledger-intent-kind-empty')
  if (!input.actor.trim()) issues.push('ledger-actor-empty')
  if (!input.clientRequestId.trim()) issues.push('ledger-client-request-id-empty')
  if (!isValidWorldTime(input.requestWorldTime)) issues.push('ledger-request-time-invalid')
  if (!isValidWorldTime(committedAt)) issues.push('ledger-commit-time-invalid')
  if (isValidWorldTime(input.requestWorldTime) && isValidWorldTime(committedAt)
    && compareTime(committedAt, input.requestWorldTime) < 0) {
    issues.push('ledger-commit-time-before-request')
  }
  try { canonicalJson(input.payload) } catch { issues.push('ledger-payload-not-json') }
  return issues
}

function compareTime(left: WorldTime, right: WorldTime): number {
  const order = ['晨', '午', '暮', '夜'] as const
  if (left.day !== right.day) return left.day < right.day ? -1 : 1
  const l = order.indexOf(left.period)
  const r = order.indexOf(right.period)
  return l === r ? 0 : l < r ? -1 : 1
}

function isLedgerConsistent<Kind extends string>(ledger: EventLedger<Kind>): boolean {
  if (!Number.isInteger(ledger.head) || ledger.head !== ledger.events.length) return false
  if (ledger.idempotency.length !== ledger.events.length) return false
  for (let index = 0; index < ledger.events.length; index += 1) {
    const event = ledger.events[index]
    if (event.worldId !== ledger.worldId || event.seq !== index + 1) return false
    if (event.id !== brandedId<'EventId'>(`evt:${ledger.worldId}:${event.seq}`)) return false
    const record = ledger.idempotency[index]
    if (record.eventId !== event.id) return false
  }
  return true
}

/**
 * Appends one immutable fact envelope. The kernel intentionally has no
 * business EventRegistry and does not accept ai-candidate input; W3-B/W3-D
 * add frozen domain schemas and the validated-candidate submission path.
 */
function appendLedgerEventCore<Kind extends string>(
  ledger: EventLedger<Kind>,
  input: LedgerEventInput<Kind>,
  committedAt: WorldTime,
  allowValidationReceipt = false,
): AppendLedgerResult<Kind> {
  if (!isLedgerConsistent(ledger)) {
    return { status: 'rejected', ledger, issues: ['ledger-state-corrupt'] }
  }
  const issues = validateInput(ledger, input, committedAt)
  if (issues.length > 0) return { status: 'rejected', ledger, issues: [...new Set(issues)] }

  if (input.kind === 'candidate.validated' && !allowValidationReceipt) {
    return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-receipt-invalid'] }
  }
  if (input.source === 'ai-candidate') {
    const validationIndex = ledger.events.findIndex(event => event.id === input.validationRef)
    const receipt = validationIndex >= 0 ? ledger.events[validationIndex] : undefined
    const receiptPayload = receipt?.payload
    if (!receipt || receipt.kind !== 'candidate.validated' || receipt.source !== 'rule'
      || validationIndex >= ledger.events.length
      || receiptPayload === null || typeof receiptPayload !== 'object' || Array.isArray(receiptPayload)
      || (receiptPayload as { readonly [key: string]: JsonValue }).candidate !== input.candidateRef
      || (receiptPayload as { readonly [key: string]: JsonValue }).targetKind !== input.kind
      || (receiptPayload as { readonly [key: string]: JsonValue }).registryVersion === undefined
      || (receiptPayload as { readonly [key: string]: JsonValue }).payloadDigest === undefined
      || (receiptPayload as { readonly [key: string]: JsonValue }).digestAlgorithm !== 'sha-256/canonical-json-v1'
      || canonicalJson((receiptPayload as { readonly [key: string]: JsonValue }).candidatePayload) !== canonicalJson(input.payload)) {
      return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-receipt-invalid'] }
    }
  }

  const key = idempotencyKey(ledger.worldId, input)
  // Request time is part of the request's content, not its identity.
  // A retry after the world clock advances must conflict rather than append a
  // second fact under the same clientRequestId.
  const fingerprint = canonicalJson([
    input.requestWorldTime.day,
    input.requestWorldTime.period,
    input.kind,
    input.payload,
  ])
  const previous = ledger.idempotency.find(record => record.key === key)
  if (previous) {
    const event = ledger.events.find(item => item.id === previous.eventId)
    if (!event) return { status: 'rejected', ledger, issues: ['ledger-state-corrupt'] }
    return previous.fingerprint === fingerprint
      ? { status: 'duplicate', ledger, event }
      : { status: 'idempotency-conflict', ledger, event }
  }

  const seq = ledger.head + 1
  const id = brandedId<'EventId'>(`evt:${ledger.worldId}:${seq}`)
  const event: LedgerEvent<Kind> = Object.freeze({
    ...input,
    worldId: ledger.worldId,
    id,
    seq,
    requestWorldTime: Object.freeze({ ...input.requestWorldTime }),
    committedAt: Object.freeze({ ...committedAt }),
    payload: cloneAndFreezeJson(input.payload),
  })
  const next: EventLedger<Kind> = Object.freeze({
    worldId: ledger.worldId,
    head: seq,
    events: Object.freeze([...ledger.events, event]),
    idempotency: Object.freeze([
      ...ledger.idempotency,
      Object.freeze({ key, eventId: id, fingerprint }),
    ]),
  })
  return { status: 'appended', ledger: next, event }
}

/** Generic append rejects reserved candidate.validated control events. */
export function appendLedgerEvent<Kind extends string>(
  ledger: EventLedger<Kind>,
  input: LedgerEventInput<Kind>,
  committedAt: WorldTime,
): AppendLedgerResult<Kind> {
  return appendLedgerEventCore(ledger, input, committedAt)
}

/**
 * Trusted orchestration entry: emits the reserved validation receipt only after
 * candidate-pipeline schema validation and digest verification have succeeded.
 * AI candidate input must never receive this capability.
 */
export async function appendCandidateValidationReceipt(
  ledger: EventLedger,
  registry: EventRegistry,
  candidate: {
    readonly candidateId: string
    readonly targetKind: string
    readonly candidatePayload: JsonValue
    readonly payloadDigest: string
    readonly registryVersion: string
    readonly validatedBy: string
  },
  requestWorldTime: WorldTime,
  committedAt: WorldTime,
): Promise<AppendLedgerResult> {
  if (!candidate.candidateId.trim() || !candidate.targetKind.trim()
    || !candidate.validatedBy.trim() || !/^sha256:[0-9a-f]{64}$/u.test(candidate.payloadDigest)
    || !registry.frozen || registry.registryVersion !== candidate.registryVersion
    || validateEventPayload(registry, candidate.targetKind, candidate.candidatePayload).status !== 'valid') {
    return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-metadata-invalid'] }
  }
  try {
    const canonical = canonicalJson({
      targetKind: candidate.targetKind,
      registryVersion: candidate.registryVersion,
      payload: candidate.candidatePayload,
    })
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-metadata-invalid'] }
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical))
    const expected = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
    if (expected !== candidate.payloadDigest) {
      return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-metadata-invalid'] }
    }
  } catch {
    return { status: 'rejected', ledger, issues: ['ledger-ai-candidate-metadata-invalid'] }
  }
  return appendLedgerEventCore(ledger, {
    source: 'rule',
    kind: 'candidate.validated',
    intentKind: 'candidate-validation',
    actor: 'system:candidate-validator',
    requestWorldTime,
    clientRequestId: `candidate-validation:${candidate.candidateId}`,
    payload: {
      candidate: candidate.candidateId,
      targetKind: candidate.targetKind,
      candidatePayload: candidate.candidatePayload,
      payloadDigest: candidate.payloadDigest,
      digestAlgorithm: 'sha-256/canonical-json-v1',
      registryVersion: candidate.registryVersion,
      validatedBy: candidate.validatedBy,
    },
  }, committedAt, true)
}

export function readLedgerEvents<Kind extends string>(
  ledger: EventLedger<Kind>,
  fromExclusive = 0,
  toInclusive = ledger.head,
): readonly LedgerEvent<Kind>[] {
  if (!isLedgerConsistent(ledger)
    || !Number.isInteger(fromExclusive)
    || !Number.isInteger(toInclusive)
    || fromExclusive < 0
    || toInclusive < fromExclusive
    || toInclusive > ledger.head) {
    throw new Error('ledger-read-range-invalid')
  }
  return ledger.events.slice(fromExclusive, toInclusive)
}
