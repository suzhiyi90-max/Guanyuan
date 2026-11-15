import type { JsonValue, WorldId } from './event-ledger'
import type { StreamCursor } from './event-replay'
import { isValidWorldTime, type WorldTime } from './shared/world-time'

export interface WorldSnapshot {
  readonly schemaVersion: number
  readonly worldId: WorldId
  readonly streamHead: StreamCursor
  readonly checkpointAt: WorldTime
  readonly materialized: JsonValue
}

export type WorldSnapshotIssue =
  | 'snapshot-schema-version-invalid'
  | 'snapshot-world-id-invalid'
  | 'snapshot-stream-head-invalid'
  | 'snapshot-checkpoint-time-invalid'
  | 'snapshot-materialized-invalid'
  | 'snapshot-expected-world-mismatch'
  | 'snapshot-expected-schema-mismatch'
  | 'snapshot-expected-head-mismatch'

export type WorldSnapshotResult =
  | { readonly status: 'valid'; readonly snapshot: WorldSnapshot }
  | { readonly status: 'rejected'; readonly issue: WorldSnapshotIssue }

export interface WorldSnapshotExpectation {
  readonly worldId: WorldId
  readonly schemaVersion: number
  readonly streamHead: StreamCursor
}

function cloneFreezeJson(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('snapshot-materialized-invalid')
    return value
  }
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('snapshot-materialized-invalid')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return Object.freeze(value.map(item => cloneFreezeJson(item, ancestors)))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('snapshot-materialized-invalid')
    const record = value as Record<string, unknown>
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(record).sort()) result[key] = cloneFreezeJson(record[key], ancestors)
    return Object.freeze(result)
  } finally {
    ancestors.delete(value)
  }
}

function cursorIsValidForWorld(cursor: unknown, worldId: string): cursor is StreamCursor {
  if (cursor === null || typeof cursor !== 'object') return false
  const value = cursor as Record<string, unknown>
  if (value.kind === 'genesis') return value.seq === 0 && Object.keys(value).every(key => key === 'kind' || key === 'seq')
  return value.kind === 'event'
    && Number.isSafeInteger(value.seq) && (value.seq as number) > 0
    && value.eventId === `evt:${worldId}:${String(value.seq)}`
    && Object.keys(value).every(key => key === 'kind' || key === 'seq' || key === 'eventId')
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

/**
 * Validates and normalizes an untrusted snapshot envelope. A snapshot is a
 * derived checkpoint/cache, never an independent source of world facts.
 */
export function validateWorldSnapshot(
  input: unknown,
  expected?: WorldSnapshotExpectation,
): WorldSnapshotResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'rejected', issue: 'snapshot-materialized-invalid' }
  }
  const value = input as Record<string, unknown>
  if (!Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
    return { status: 'rejected', issue: 'snapshot-schema-version-invalid' }
  }
  if (typeof value.worldId !== 'string' || !value.worldId.trim()) {
    return { status: 'rejected', issue: 'snapshot-world-id-invalid' }
  }
  if (!cursorIsValidForWorld(value.streamHead, value.worldId)) {
    return { status: 'rejected', issue: 'snapshot-stream-head-invalid' }
  }
  if (value.checkpointAt === null || typeof value.checkpointAt !== 'object' || Array.isArray(value.checkpointAt)
    || !isValidWorldTime(value.checkpointAt as WorldTime)) {
    return { status: 'rejected', issue: 'snapshot-checkpoint-time-invalid' }
  }
  let materialized: JsonValue
  try { materialized = cloneFreezeJson(value.materialized) } catch {
    return { status: 'rejected', issue: 'snapshot-materialized-invalid' }
  }

  if (expected) {
    if (value.worldId !== expected.worldId) return { status: 'rejected', issue: 'snapshot-expected-world-mismatch' }
    if (value.schemaVersion !== expected.schemaVersion) return { status: 'rejected', issue: 'snapshot-expected-schema-mismatch' }
    if (!cursorIsValidForWorld(expected.streamHead, expected.worldId)
      || !sameCursor(value.streamHead, expected.streamHead)) {
      return { status: 'rejected', issue: 'snapshot-expected-head-mismatch' }
    }
  }

  const streamHead: StreamCursor = Object.freeze(value.streamHead.kind === 'genesis'
    ? { kind: 'genesis', seq: 0 }
    : { kind: 'event', seq: value.streamHead.seq, eventId: value.streamHead.eventId })
  const snapshot: WorldSnapshot = Object.freeze({
    schemaVersion: value.schemaVersion as number,
    worldId: value.worldId as WorldId,
    streamHead,
    checkpointAt: Object.freeze({ day: (value.checkpointAt as WorldTime).day, period: (value.checkpointAt as WorldTime).period }),
    materialized,
  })
  return { status: 'valid', snapshot }
}

export function createWorldSnapshot(input: WorldSnapshot): WorldSnapshotResult {
  return validateWorldSnapshot(input)
}
