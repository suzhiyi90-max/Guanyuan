import type { JsonValue, LedgerEvent, WorldId } from '../domain/event-ledger'
import { readLedgerEvents } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'
import {
  createFullSavePackage,
  type SavePackageVerification,
} from '../domain/save-package'
import {
  createIncrementalSavePackage,
  type SavePackageChain,
} from '../domain/incremental-save-package'
import { createWorldSnapshot } from '../domain/world-snapshot'
import { createInitialGameState } from '../game/initial-state'
import { periods } from '../game/engine'
import { reducePreviewRuntimeEvent } from '../game/runtime-projection'
import {
  PREVIEW_RUNTIME_SCHEMA_VERSION,
  type PreviewRuntimeEventKind,
} from '../game/runtime-registry'
import type { PreviewRuntimeSession } from '../game/runtime-orchestrator'
import type {
  SaveRepository,
  SaveRepositoryIssue,
  StoredWorldSave,
} from './save-repository'

/** Keep package-chain storage within the adapter's existing 128-node hydration limit. */
export const SAVE_PACKAGE_CHAIN_NODE_LIMIT = 128

export type RuntimeSaveIssue =
  | SaveRepositoryIssue
  | 'runtime-save-world-mismatch'
  | 'runtime-save-session-invalid'
  | 'runtime-save-time-invalid'
  | 'runtime-save-base-ahead'
  | 'runtime-save-base-diverged'
  | 'runtime-save-package-invalid'
  | 'runtime-save-commit-result-invalid'

export type RuntimeSaveResult =
  | {
      readonly status: 'saved'
      readonly packageKind: SavePackageChain['packageKind']
      readonly streamHead: StreamCursor
      readonly stored: StoredWorldSave
    }
  | { readonly status: 'rejected'; readonly issue: RuntimeSaveIssue }

function cursorAt(session: PreviewRuntimeSession): StreamCursor {
  const tail = session.ledger.events[session.ledger.events.length - 1]
  return tail
    ? Object.freeze({ kind: 'event', seq: tail.seq, eventId: tail.id })
    : Object.freeze({ kind: 'genesis', seq: 0 })
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function chainNodeCount(chain: SavePackageChain): number {
  let count = 1
  let current = chain
  while (current.packageKind === 'incremental') {
    count += 1
    current = current.basePackage
    if (count > SAVE_PACKAGE_CHAIN_NODE_LIMIT) return count
  }
  return count
}

function verificationFor(session: PreviewRuntimeSession): SavePackageVerification<PreviewRuntimeEventKind> {
  return {
    registry: session.registry,
    initialState: createInitialGameState() as unknown as JsonValue,
    reduce: (state, event) => reducePreviewRuntimeEvent(
      state as unknown as ReturnType<typeof createInitialGameState>,
      event as LedgerEvent<PreviewRuntimeEventKind>,
    ) as unknown as JsonValue,
  }
}

/**
 * Creates and verifies a full or incremental package from the current immutable
 * runtime ledger, then commits it with the repository's expected-head CAS.
 * It never mutates or replaces the supplied runtime session.
 */
export async function savePreviewRuntimeSession(
  session: PreviewRuntimeSession,
  repository: SaveRepository,
  options: { readonly now?: () => string } = {},
): Promise<RuntimeSaveResult> {
  if (!session.worldId || session.ledger.worldId !== session.worldId
    || session.ledger.head !== session.ledger.events.length
    || !Number.isSafeInteger(session.state.day) || session.state.day < 1
    || !Number.isSafeInteger(session.state.periodIndex)
    || !periods[session.state.periodIndex]) {
    return { status: 'rejected', issue: 'runtime-save-session-invalid' }
  }

  const savedAt = (options.now ?? (() => new Date().toISOString()))()
  if (!Number.isFinite(Date.parse(savedAt))) return { status: 'rejected', issue: 'runtime-save-time-invalid' }

  const loaded = await repository.loadWorld(session.worldId)
  if (loaded.status === 'rejected') return { status: 'rejected', issue: loaded.issue }
  const existing = loaded.value
  if (existing && existing.worldId !== session.worldId) {
    return { status: 'rejected', issue: 'runtime-save-world-mismatch' }
  }

  const toInclusive = cursorAt(session)
  if (existing) {
    if (!sameCursor(existing.streamHead, existing.packageChain.snapshot.streamHead)) {
      return { status: 'rejected', issue: 'runtime-save-package-invalid' }
    }
    if (existing.streamHead.seq > toInclusive.seq) {
      return { status: 'rejected', issue: 'runtime-save-base-ahead' }
    }
    if (existing.streamHead.seq === toInclusive.seq && !sameCursor(existing.streamHead, toInclusive)) {
      return { status: 'rejected', issue: 'runtime-save-base-diverged' }
    }
    if (existing.streamHead.seq > 0) {
      const localAnchor = session.ledger.events[existing.streamHead.seq - 1]
      if (!localAnchor || localAnchor.id !== (existing.streamHead.kind === 'event' ? existing.streamHead.eventId : '')) {
        return { status: 'rejected', issue: 'runtime-save-base-diverged' }
      }
    }
  }

  const period = periods[session.state.periodIndex]
  const snapshotResult = createWorldSnapshot({
    schemaVersion: PREVIEW_RUNTIME_SCHEMA_VERSION,
    worldId: session.worldId,
    streamHead: toInclusive,
    checkpointAt: { day: session.state.day, period },
    materialized: session.state as unknown as JsonValue,
  })
  if (snapshotResult.status !== 'valid') {
    return { status: 'rejected', issue: 'runtime-save-package-invalid' }
  }

  const verification = verificationFor(session)
  let packageChain: SavePackageChain
  const mustCheckpoint = !existing
    || existing.packageChain.schemaVersion !== PREVIEW_RUNTIME_SCHEMA_VERSION
    || chainNodeCount(existing.packageChain) >= SAVE_PACKAGE_CHAIN_NODE_LIMIT

  if (mustCheckpoint) {
    const full = await createFullSavePackage({
      packageKind: 'full',
      worldId: session.worldId,
      schemaVersion: PREVIEW_RUNTIME_SCHEMA_VERSION,
      streamRange: {
        fromExclusive: { kind: 'genesis', seq: 0 },
        toInclusive,
      },
      events: readLedgerEvents(session.ledger, 0, session.ledger.head),
      snapshot: snapshotResult.snapshot,
    }, verification)
    if (full.status !== 'valid') return { status: 'rejected', issue: 'runtime-save-package-invalid' }
    packageChain = full.package
  } else {
    const base = existing!.packageChain
    const incremental = await createIncrementalSavePackage({
      packageKind: 'incremental',
      worldId: session.worldId,
      schemaVersion: PREVIEW_RUNTIME_SCHEMA_VERSION,
      streamRange: {
        fromExclusive: existing!.streamHead,
        toInclusive,
      },
      events: readLedgerEvents(session.ledger, existing!.streamHead.seq, session.ledger.head),
      snapshot: snapshotResult.snapshot,
      basePackage: base,
    }, verification)
    if (incremental.status !== 'valid') {
      return { status: 'rejected', issue: 'runtime-save-package-invalid' }
    }
    packageChain = incremental.package
  }

  const committed = await repository.commitWorld({
    worldId: session.worldId as WorldId,
    packageChain,
    expectedHead: existing?.streamHead ?? null,
    savedAt,
  })
  if (committed.status === 'rejected') return { status: 'rejected', issue: committed.issue }
  if (committed.value.worldId !== session.worldId
    || !sameCursor(committed.value.streamHead, toInclusive)
    || !sameCursor(committed.value.packageChain.snapshot.streamHead, toInclusive)) {
    return { status: 'rejected', issue: 'runtime-save-commit-result-invalid' }
  }
  return {
    status: 'saved',
    packageKind: packageChain.packageKind,
    streamHead: toInclusive,
    stored: committed.value,
  }
}
