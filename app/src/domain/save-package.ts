import type { EventRegistry } from './event-registry'
import type { JsonValue, LedgerEvent, WorldId } from './event-ledger'
import { replayEventRange, type StreamCursor } from './event-replay'
import { validateWorldSnapshot, type WorldSnapshot } from './world-snapshot'

export interface SaveStreamRange {
  readonly fromExclusive: StreamCursor
  readonly toInclusive: StreamCursor
}

export interface FullSavePackageInput {
  readonly packageKind: 'full'
  readonly worldId: WorldId
  readonly schemaVersion: number
  readonly streamRange: SaveStreamRange
  readonly events: readonly LedgerEvent[]
  readonly snapshot: WorldSnapshot
  readonly basePackage?: never
}

export interface FullSavePackage extends FullSavePackageInput {
  readonly checksum: string
}

export type SavePackageIssue =
  | 'save-package-envelope-invalid'
  | 'save-package-kind-invalid'
  | 'save-package-world-id-invalid'
  | 'save-package-schema-version-invalid'
  | 'save-package-full-range-invalid'
  | 'save-package-event-count-mismatch'
  | 'save-package-snapshot-invalid'
  | 'save-package-checksum-invalid'
  | 'save-package-checksum-unavailable'
  | 'save-package-event-replay-rejected'
  | 'save-package-snapshot-state-mismatch'

export type SavePackageResult =
  | { readonly status: 'valid'; readonly package: FullSavePackage }
  | { readonly status: 'rejected'; readonly issue: SavePackageIssue }

export interface SavePackageVerification<Kind extends string = string> {
  readonly registry: EventRegistry<Kind>
  readonly initialState: JsonValue
  readonly reduce: (state: JsonValue, event: LedgerEvent<Kind>) => JsonValue
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('save-package-envelope-invalid')
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('save-package-envelope-invalid')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error('save-package-envelope-invalid')
      }
      if (Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) {
        throw new Error('save-package-envelope-invalid')
      }
      return `[${value.map(item => canonicalJson(item, ancestors)).join(',')}]`
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('save-package-envelope-invalid')
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function cloneFreezeJson(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('save-package-envelope-invalid')
    return value
  }
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('save-package-envelope-invalid')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return Object.freeze(value.map(item => cloneFreezeJson(item, ancestors)))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('save-package-envelope-invalid')
    const record = value as Record<string, unknown>
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(record).sort()) result[key] = cloneFreezeJson(record[key], ancestors)
    return Object.freeze(result)
  } finally {
    ancestors.delete(value)
  }
}

function cursorIsValidForWorld(cursor: unknown, worldId: string): cursor is StreamCursor {
  if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return false
  const prototype = Object.getPrototypeOf(cursor)
  if (prototype !== Object.prototype && prototype !== null) return false
  const value = cursor as Record<string, unknown>
  if (value.kind === 'genesis') return value.seq === 0
    && Object.keys(value).every(key => key === 'kind' || key === 'seq')
  return value.kind === 'event'
    && Number.isSafeInteger(value.seq) && (value.seq as number) > 0
    && value.eventId === `evt:${worldId}:${String(value.seq)}`
    && Object.keys(value).every(key => key === 'kind' || key === 'seq' || key === 'eventId')
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function checksumPayload(input: Omit<FullSavePackage, 'checksum'>): Omit<FullSavePackage, 'checksum'> {
  return {
    packageKind: 'full',
    worldId: input.worldId,
    schemaVersion: input.schemaVersion,
    streamRange: {
      fromExclusive: input.streamRange.fromExclusive,
      toInclusive: input.streamRange.toInclusive,
    },
    events: input.events,
    snapshot: input.snapshot,
  }
}

async function checksumOf(input: Omit<FullSavePackage, 'checksum'>): Promise<string | null> {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) return null
  const bytes = new TextEncoder().encode(canonicalJson(checksumPayload(input)))
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

const topLevelKeys = ['packageKind', 'worldId', 'schemaVersion', 'streamRange', 'events', 'snapshot', 'checksum']

/**
 * Validates a full package from genesis through its declared stream head.
 * The package is accepted only when its checksum, snapshot anchor, event range,
 * registry checks, replay result and materialized snapshot all agree.
 */
export async function validateFullSavePackage<Kind extends string>(
  input: unknown,
  verification: SavePackageVerification<Kind>,
): Promise<SavePackageResult> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !topLevelKeys.includes(key))
    || topLevelKeys.some(key => !Object.hasOwn(value, key))) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  if (value.packageKind !== 'full') return { status: 'rejected', issue: 'save-package-kind-invalid' }
  if (typeof value.worldId !== 'string' || !value.worldId.trim()) {
    return { status: 'rejected', issue: 'save-package-world-id-invalid' }
  }
  if (!Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
    return { status: 'rejected', issue: 'save-package-schema-version-invalid' }
  }
  if (value.basePackage !== undefined) return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  if (value.streamRange === null || typeof value.streamRange !== 'object' || Array.isArray(value.streamRange)
    || value.events === null || !Array.isArray(value.events)) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  const range = value.streamRange as Record<string, unknown>
  const genesis: StreamCursor = { kind: 'genesis', seq: 0 }
  if (Object.keys(range).some(key => key !== 'fromExclusive' && key !== 'toInclusive')
    || !cursorIsValidForWorld(range.fromExclusive, value.worldId)
    || range.fromExclusive.kind !== 'genesis'
    || !cursorIsValidForWorld(range.toInclusive, value.worldId)) {
    return { status: 'rejected', issue: 'save-package-full-range-invalid' }
  }
  const to = range.toInclusive as StreamCursor
  if (value.events.length !== to.seq) return { status: 'rejected', issue: 'save-package-event-count-mismatch' }

  const snapshotResult = validateWorldSnapshot(value.snapshot, {
    worldId: value.worldId as WorldId,
    schemaVersion: value.schemaVersion as number,
    streamHead: to,
  })
  if (snapshotResult.status !== 'valid') return { status: 'rejected', issue: 'save-package-snapshot-invalid' }

  if (typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) {
    return { status: 'rejected', issue: 'save-package-checksum-invalid' }
  }
  let computed: string | null
  try {
    computed = await checksumOf({
      packageKind: 'full',
      worldId: value.worldId as WorldId,
      schemaVersion: value.schemaVersion as number,
      streamRange: { fromExclusive: genesis, toInclusive: to },
      events: value.events as readonly LedgerEvent[],
      snapshot: snapshotResult.snapshot,
    })
  } catch {
    return { status: 'rejected', issue: 'save-package-checksum-invalid' }
  }
  if (computed === null) return { status: 'rejected', issue: 'save-package-checksum-unavailable' }
  if (computed !== value.checksum) return { status: 'rejected', issue: 'save-package-checksum-invalid' }

  const replay = replayEventRange({
    worldId: value.worldId as WorldId,
    fromExclusive: genesis,
    toInclusive: to,
    events: value.events as readonly LedgerEvent<Kind>[],
    registry: verification.registry,
    initialState: verification.initialState,
    reduce: verification.reduce,
  })
  if (replay.status !== 'replayed') return { status: 'rejected', issue: 'save-package-event-replay-rejected' }
  try {
    if (canonicalJson(replay.state) !== canonicalJson(snapshotResult.snapshot.materialized)) {
      return { status: 'rejected', issue: 'save-package-snapshot-state-mismatch' }
    }
  } catch {
    return { status: 'rejected', issue: 'save-package-snapshot-state-mismatch' }
  }

  const normalized: FullSavePackage = Object.freeze({
    packageKind: 'full',
    worldId: value.worldId as WorldId,
    schemaVersion: value.schemaVersion as number,
    streamRange: Object.freeze({
      fromExclusive: genesis,
      toInclusive: Object.freeze(to.kind === 'genesis'
        ? { kind: 'genesis' as const, seq: 0 as const }
        : { kind: 'event' as const, seq: to.seq, eventId: to.eventId }),
    }),
    events: Object.freeze(value.events.map(event => cloneFreezeJson(event) as unknown as LedgerEvent)),
    snapshot: snapshotResult.snapshot,
    checksum: value.checksum,
  })
  return { status: 'valid', package: normalized }
}

export async function createFullSavePackage<Kind extends string>(
  input: Omit<FullSavePackage, 'checksum'>,
  verification: SavePackageVerification<Kind>,
): Promise<SavePackageResult> {
  const snapshot = validateWorldSnapshot(input.snapshot, {
    worldId: input.worldId,
    schemaVersion: input.schemaVersion,
    streamHead: input.streamRange.toInclusive,
  })
  if (snapshot.status !== 'valid') return { status: 'rejected', issue: 'save-package-snapshot-invalid' }
  const normalizedInput = { ...input, snapshot: snapshot.snapshot }
  let checksum: string | null
  try { checksum = await checksumOf(normalizedInput) } catch {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  if (checksum === null) return { status: 'rejected', issue: 'save-package-checksum-unavailable' }
  return validateFullSavePackage({ ...normalizedInput, checksum }, verification)
}
