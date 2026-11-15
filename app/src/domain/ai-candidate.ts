import {
  appendCandidateValidationReceipt,
  appendLedgerEvent,
  type EventLedger,
  type JsonValue,
  type LedgerEvent,
  type AppendLedgerResult,
} from './event-ledger'
import { validateEventPayload, type EventRegistry } from './event-registry'
import type { WorldTime } from './shared/world-time'

export type CandidateId = string
export type CandidateStatus = 'pending' | 'validated' | 'rejected'
export type CandidateDigestAlgorithm = 'sha-256/canonical-json-v1'

export interface AiCandidate {
  readonly candidateId: CandidateId
  readonly targetKind: string
  readonly payload: JsonValue
  readonly registryVersion: string
  readonly status: CandidateStatus
}

export interface CandidateRejectionRecord {
  readonly candidateId: CandidateId
  readonly reason: string
  readonly rejectedBy: string
}

export interface CandidateLog {
  readonly candidates: readonly AiCandidate[]
  readonly rejections: readonly CandidateRejectionRecord[]
}

export interface CandidateValidationReceipt {
  readonly candidateId: CandidateId
  readonly targetKind: string
  readonly payloadDigest: string
  readonly digestAlgorithm: CandidateDigestAlgorithm
  readonly registryVersion: string
  readonly validatedBy: string
  readonly validationEventId: string
}

export type CandidateOperationResult =
  | { readonly status: 'accepted'; readonly log: CandidateLog; readonly candidate: AiCandidate }
  | { readonly status: 'validated'; readonly log: CandidateLog; readonly candidate: AiCandidate; readonly ledger: EventLedger; readonly receipt: CandidateValidationReceipt }
  | { readonly status: 'rejected'; readonly log: CandidateLog; readonly candidateId: CandidateId; readonly reason: string }
  | { readonly status: 'invalid-state'; readonly log: CandidateLog }
  | { readonly status: 'invalid-registry' | 'registry-version-mismatch' | 'schema-invalid' | 'digest-unavailable'; readonly log: CandidateLog }
  | { readonly status: 'ledger-rejected'; readonly log: CandidateLog; readonly ledger: EventLedger; readonly append: AppendLedgerResult }

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('candidate-payload-not-json')
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('candidate-payload-not-json')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item, ancestors)).join(',')}]`
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('candidate-payload-not-json')
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function freezeJson(value: JsonValue): JsonValue {
  const clone = JSON.parse(canonicalJson(value)) as JsonValue
  const freeze = (item: JsonValue): JsonValue => {
    if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) item.forEach(freeze)
      else Object.values(item).forEach(freeze)
      Object.freeze(item)
    }
    return item
  }
  return freeze(clone)
}

export async function candidatePayloadDigest(
  targetKind: string,
  registryVersion: string,
  payload: JsonValue,
): Promise<string> {
  const canonical = canonicalJson({ targetKind, registryVersion, payload })
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('candidate-digest-unavailable')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export function createCandidateLog(): CandidateLog {
  return Object.freeze({ candidates: Object.freeze([]), rejections: Object.freeze([]) })
}

export function submitAiCandidate(
  log: CandidateLog,
  input: Omit<AiCandidate, 'status'>,
): CandidateOperationResult {
  if (!input.candidateId.trim() || !input.targetKind.trim() || !input.registryVersion.trim()
    || log.candidates.some(candidate => candidate.candidateId === input.candidateId)
    || log.rejections.some(rejection => rejection.candidateId === input.candidateId)) {
    return { status: 'invalid-state', log }
  }
  let payload: JsonValue
  try { payload = freezeJson(input.payload) } catch { return { status: 'invalid-state', log } }
  const candidate: AiCandidate = Object.freeze({ ...input, payload, status: 'pending' })
  return {
    status: 'accepted',
    log: Object.freeze({ candidates: Object.freeze([...log.candidates, candidate]), rejections: log.rejections }),
    candidate,
  }
}

export function rejectAiCandidate(
  log: CandidateLog,
  candidateId: CandidateId,
  reason: string,
  rejectedBy: string,
): CandidateOperationResult {
  const candidate = log.candidates.find(item => item.candidateId === candidateId)
  if (!candidate || candidate.status !== 'pending' || !reason.trim() || !rejectedBy.trim()) {
    return { status: 'invalid-state', log }
  }
  const rejected = Object.freeze({ candidateId, reason, rejectedBy })
  const nextCandidate = Object.freeze({ ...candidate, status: 'rejected' as const })
  return {
    status: 'rejected',
    log: Object.freeze({
      candidates: Object.freeze(log.candidates.map(item => item.candidateId === candidateId ? nextCandidate : item)),
      rejections: Object.freeze([...log.rejections, rejected]),
    }),
    candidateId,
    reason,
  }
}

export async function validateAiCandidate(
  log: CandidateLog,
  ledger: EventLedger,
  registry: EventRegistry,
  candidateId: CandidateId,
  validatedBy: string,
  requestWorldTime: WorldTime,
  committedAt: WorldTime,
): Promise<CandidateOperationResult> {
  const candidate = log.candidates.find(item => item.candidateId === candidateId)
  if (!candidate || candidate.status !== 'pending' || !validatedBy.trim()) return { status: 'invalid-state', log }
  if (!registry.frozen) return { status: 'invalid-registry', log }
  if (registry.registryVersion !== candidate.registryVersion) return { status: 'registry-version-mismatch', log }
  if (validateEventPayload(registry, candidate.targetKind, candidate.payload).status !== 'valid') {
    return { status: 'schema-invalid', log }
  }
  let payloadDigest: string
  try {
    payloadDigest = await candidatePayloadDigest(candidate.targetKind, candidate.registryVersion, candidate.payload)
  } catch {
    return { status: 'digest-unavailable', log }
  }
  const append = appendCandidateValidationReceipt(ledger, {
    candidateId,
    targetKind: candidate.targetKind,
    candidatePayload: candidate.payload,
    payloadDigest,
    registryVersion: candidate.registryVersion,
    validatedBy,
  }, requestWorldTime, committedAt)
  if (append.status !== 'appended') return { status: 'ledger-rejected', log, ledger, append }
  const nextCandidate = Object.freeze({ ...candidate, status: 'validated' as const })
  const nextLog = Object.freeze({
    candidates: Object.freeze(log.candidates.map(item => item.candidateId === candidateId ? nextCandidate : item)),
    rejections: log.rejections,
  })
  const receipt: CandidateValidationReceipt = Object.freeze({
    candidateId,
    targetKind: candidate.targetKind,
    payloadDigest,
    digestAlgorithm: 'sha-256/canonical-json-v1',
    registryVersion: candidate.registryVersion,
    validatedBy,
    validationEventId: append.event.id,
  })
  return { status: 'validated', log: nextLog, candidate: nextCandidate, ledger: append.ledger, receipt }
}

export async function appendValidatedAiCandidateFact(
  log: CandidateLog,
  ledger: EventLedger,
  registry: EventRegistry,
  candidateId: CandidateId,
  requestWorldTime: WorldTime,
  committedAt: WorldTime,
): Promise<{ readonly status: 'appended'; readonly ledger: EventLedger; readonly event: LedgerEvent } | { readonly status: 'rejected'; readonly ledger: EventLedger; readonly reason: string }> {
  const candidate = log.candidates.find(item => item.candidateId === candidateId)
  if (!candidate || candidate.status !== 'validated') return { status: 'rejected', ledger, reason: 'candidate-not-validated' }
  if (!registry.frozen || registry.registryVersion !== candidate.registryVersion) {
    return { status: 'rejected', ledger, reason: 'registry-not-authorized' }
  }
  if (validateEventPayload(registry, candidate.targetKind, candidate.payload).status !== 'valid') {
    return { status: 'rejected', ledger, reason: 'candidate-schema-invalid' }
  }
  const validationEvent = ledger.events.find(event => event.kind === 'candidate.validated'
    && event.source === 'rule'
    && event.payload !== null && typeof event.payload === 'object' && !Array.isArray(event.payload)
    && event.payload.candidate === candidateId)
  if (!validationEvent || validationEvent.seq >= ledger.head + 1) {
    return { status: 'rejected', ledger, reason: 'validation-receipt-missing' }
  }
  const payload = validationEvent.payload as { readonly [key: string]: JsonValue }
  let digest: string
  try { digest = await candidatePayloadDigest(candidate.targetKind, candidate.registryVersion, candidate.payload) }
  catch { return { status: 'rejected', ledger, reason: 'digest-unavailable' } }
  if (payload.targetKind !== candidate.targetKind
    || payload.registryVersion !== candidate.registryVersion
    || payload.payloadDigest !== digest
    || payload.digestAlgorithm !== 'sha-256/canonical-json-v1'
    || canonicalJson(payload.candidatePayload) !== canonicalJson(candidate.payload)) {
    return { status: 'rejected', ledger, reason: 'validation-receipt-mismatch' }
  }
  const append = appendLedgerEvent(ledger, {
    source: 'ai-candidate',
    kind: candidate.targetKind,
    intentKind: 'ai-candidate-fact',
    actor: 'ai-candidate',
    requestWorldTime,
    clientRequestId: `ai-candidate:${candidateId}`,
    candidateRef: candidateId,
    validationRef: validationEvent.id,
    payload: candidate.payload,
  }, committedAt)
  return append.status === 'appended'
    ? { status: 'appended', ledger: append.ledger, event: append.event }
    : { status: 'rejected', ledger, reason: append.status }
}
