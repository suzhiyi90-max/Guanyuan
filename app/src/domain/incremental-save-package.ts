import type { LedgerEvent, WorldId } from './event-ledger'
import { replayEventRange, type StreamCursor } from './event-replay'
import { validateWorldSnapshot, type WorldSnapshot } from './world-snapshot'
import {
  calculateSavePackageChecksum,
  canonicalSavePackageJson,
  cloneFreezeSavePackageJson,
  validateFullSavePackage,
  type FullSavePackage,
  type SavePackageIssue,
  type SavePackageVerification,
} from './save-package'

export interface IncrementalSavePackageInput {
  readonly packageKind: 'incremental'
  readonly worldId: WorldId
  readonly schemaVersion: number
  readonly streamRange: {
    readonly fromExclusive: StreamCursor
    readonly toInclusive: StreamCursor
  }
  readonly events: readonly LedgerEvent[]
  readonly snapshot: WorldSnapshot
  readonly basePackage: SavePackageChain
}

export interface IncrementalSavePackage extends IncrementalSavePackageInput {
  readonly checksum: string
}

export type SavePackageChain = FullSavePackage | IncrementalSavePackage

export type SavePackageChainResult =
  | { readonly status: 'valid'; readonly package: SavePackageChain }
  | { readonly status: 'rejected'; readonly issue: SavePackageIssue }

const fullKeys = ['packageKind', 'worldId', 'schemaVersion', 'streamRange', 'events', 'snapshot', 'checksum']
const incrementalKeys = [...fullKeys, 'basePackage']
const maxChainDepth = 128

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

function tailEventOf(savePackage: SavePackageChain): LedgerEvent | undefined {
  if (savePackage.events.length > 0) return savePackage.events[savePackage.events.length - 1]
  return savePackage.packageKind === 'incremental' ? tailEventOf(savePackage.basePackage) : undefined
}

function collectValidationReceipts(savePackage: SavePackageChain, output: LedgerEvent[] = []): LedgerEvent[] {
  if (savePackage.packageKind === 'incremental') collectValidationReceipts(savePackage.basePackage, output)
  for (const event of savePackage.events) {
    if (event.kind === 'candidate.validated') output.push(event)
  }
  return output
}

async function validateAtDepth<Kind extends string>(
  input: unknown,
  verification: SavePackageVerification<Kind>,
  depth: number,
): Promise<SavePackageChainResult> {
  if (depth > maxChainDepth) return { status: 'rejected', issue: 'save-package-chain-too-deep' }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  const value = input as Record<string, unknown>
  if (value.packageKind === 'full') {
    const full = await validateFullSavePackage(value, verification)
    return full.status === 'valid'
      ? { status: 'valid', package: full.package }
      : full
  }
  if (value.packageKind !== 'incremental') return { status: 'rejected', issue: 'save-package-kind-invalid' }
  if (Object.keys(value).some(key => !incrementalKeys.includes(key))
    || incrementalKeys.some(key => !Object.hasOwn(value, key))) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  if (typeof value.worldId !== 'string' || !value.worldId.trim()) {
    return { status: 'rejected', issue: 'save-package-world-id-invalid' }
  }
  if (!Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
    return { status: 'rejected', issue: 'save-package-schema-version-invalid' }
  }
  if (value.streamRange === null || typeof value.streamRange !== 'object' || Array.isArray(value.streamRange)
    || !Array.isArray(value.events)) {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  const range = value.streamRange as Record<string, unknown>
  if (Object.keys(range).some(key => key !== 'fromExclusive' && key !== 'toInclusive')
    || !cursorIsValidForWorld(range.fromExclusive, value.worldId)
    || !cursorIsValidForWorld(range.toInclusive, value.worldId)) {
    return { status: 'rejected', issue: 'save-package-incremental-range-invalid' }
  }
  const from = range.fromExclusive
  const to = range.toInclusive
  if (to.seq < from.seq) return { status: 'rejected', issue: 'save-package-incremental-range-invalid' }
  if (value.events.length !== to.seq - from.seq) {
    return { status: 'rejected', issue: 'save-package-incremental-event-count-mismatch' }
  }
  if (from.seq === to.seq && !sameCursor(from, to)) {
    return { status: 'rejected', issue: 'save-package-incremental-range-invalid' }
  }

  const baseResult = await validateAtDepth(value.basePackage, verification, depth + 1)
  if (baseResult.status !== 'valid') return { status: 'rejected', issue: 'save-package-base-invalid' }
  const basePackage = baseResult.package
  if (basePackage.worldId !== value.worldId) return { status: 'rejected', issue: 'save-package-base-world-mismatch' }
  if (basePackage.schemaVersion !== value.schemaVersion) return { status: 'rejected', issue: 'save-package-base-schema-mismatch' }
  if (!sameCursor(basePackage.snapshot.streamHead, from)) {
    return { status: 'rejected', issue: 'save-package-base-head-mismatch' }
  }

  const snapshotResult = validateWorldSnapshot(value.snapshot, {
    worldId: value.worldId as WorldId,
    schemaVersion: value.schemaVersion as number,
    streamHead: to,
  })
  if (snapshotResult.status !== 'valid') return { status: 'rejected', issue: 'save-package-snapshot-invalid' }
  if (typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) {
    return { status: 'rejected', issue: 'save-package-checksum-invalid' }
  }

  const checksumPayload = {
    packageKind: 'incremental' as const,
    worldId: value.worldId as WorldId,
    schemaVersion: value.schemaVersion as number,
    streamRange: { fromExclusive: from, toInclusive: to },
    events: value.events,
    snapshot: snapshotResult.snapshot,
    basePackage,
  }
  let computed: string | null
  try { computed = await calculateSavePackageChecksum(checksumPayload) } catch {
    return { status: 'rejected', issue: 'save-package-checksum-invalid' }
  }
  if (computed === null) return { status: 'rejected', issue: 'save-package-checksum-unavailable' }
  if (computed !== value.checksum) return { status: 'rejected', issue: 'save-package-checksum-invalid' }

  const anchorEvent = from.kind === 'event' ? tailEventOf(basePackage) : undefined
  if (from.kind === 'event' && (!anchorEvent || anchorEvent.seq !== from.seq || anchorEvent.id !== from.eventId)) {
    return { status: 'rejected', issue: 'save-package-base-head-mismatch' }
  }
  const priorReceipts = collectValidationReceipts(basePackage).filter(event => event.seq < from.seq)
  const replay = replayEventRange({
    worldId: value.worldId as WorldId,
    fromExclusive: from,
    toInclusive: to,
    anchorEvent: anchorEvent as LedgerEvent<Kind> | undefined,
    priorReceipts: priorReceipts as readonly LedgerEvent<Kind>[],
    events: value.events as readonly LedgerEvent<Kind>[],
    registry: verification.registry,
    initialState: basePackage.snapshot.materialized,
    reduce: verification.reduce,
  })
  if (replay.status !== 'replayed') {
    return { status: 'rejected', issue: 'save-package-incremental-replay-rejected' }
  }
  try {
    if (canonicalSavePackageJson(replay.state) !== canonicalSavePackageJson(snapshotResult.snapshot.materialized)) {
      return { status: 'rejected', issue: 'save-package-incremental-snapshot-state-mismatch' }
    }
  } catch {
    return { status: 'rejected', issue: 'save-package-incremental-snapshot-state-mismatch' }
  }

  const normalized: IncrementalSavePackage = Object.freeze({
    packageKind: 'incremental',
    worldId: value.worldId as WorldId,
    schemaVersion: value.schemaVersion as number,
    streamRange: Object.freeze({
      fromExclusive: Object.freeze(from.kind === 'genesis'
        ? { kind: 'genesis' as const, seq: 0 as const }
        : { kind: 'event' as const, seq: from.seq, eventId: from.eventId }),
      toInclusive: Object.freeze(to.kind === 'genesis'
        ? { kind: 'genesis' as const, seq: 0 as const }
        : { kind: 'event' as const, seq: to.seq, eventId: to.eventId }),
    }),
    events: Object.freeze(value.events.map(event => cloneFreezeSavePackageJson(event) as unknown as LedgerEvent)),
    snapshot: snapshotResult.snapshot,
    basePackage,
    checksum: value.checksum,
  })
  return { status: 'valid', package: normalized }
}

export async function validateSavePackageChain<Kind extends string>(
  input: unknown,
  verification: SavePackageVerification<Kind>,
): Promise<SavePackageChainResult> {
  return validateAtDepth(input, verification, 0)
}

export async function validateIncrementalSavePackage<Kind extends string>(
  input: unknown,
  verification: SavePackageVerification<Kind>,
): Promise<SavePackageChainResult> {
  if (input === null || typeof input !== 'object' || (input as Record<string, unknown>).packageKind !== 'incremental') {
    return { status: 'rejected', issue: 'save-package-kind-invalid' }
  }
  return validateAtDepth(input, verification, 0)
}

export async function createIncrementalSavePackage<Kind extends string>(
  input: Omit<IncrementalSavePackage, 'checksum'>,
  verification: SavePackageVerification<Kind>,
): Promise<SavePackageChainResult> {
  const base = await validateSavePackageChain(input.basePackage, verification)
  if (base.status !== 'valid') return { status: 'rejected', issue: 'save-package-base-invalid' }
  const snapshot = validateWorldSnapshot(input.snapshot, {
    worldId: input.worldId,
    schemaVersion: input.schemaVersion,
    streamHead: input.streamRange.toInclusive,
  })
  if (snapshot.status !== 'valid') return { status: 'rejected', issue: 'save-package-snapshot-invalid' }
  const normalizedInput = {
    ...input,
    snapshot: snapshot.snapshot,
    basePackage: base.package,
  }
  let checksum: string | null
  try {
    checksum = await calculateSavePackageChecksum({
      packageKind: 'incremental',
      worldId: normalizedInput.worldId,
      schemaVersion: normalizedInput.schemaVersion,
      streamRange: normalizedInput.streamRange,
      events: normalizedInput.events,
      snapshot: normalizedInput.snapshot,
      basePackage: normalizedInput.basePackage,
    })
  } catch {
    return { status: 'rejected', issue: 'save-package-envelope-invalid' }
  }
  if (checksum === null) return { status: 'rejected', issue: 'save-package-checksum-unavailable' }
  return validateIncrementalSavePackage({ ...normalizedInput, checksum }, verification)
}
