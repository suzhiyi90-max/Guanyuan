import type { AiCandidate, CandidateLog } from '../domain/ai-candidate'
import { createCandidateLog } from '../domain/ai-candidate'
import type { LedgerEvent, WorldId } from '../domain/event-ledger'
import { restoreEventLedgerFromVerifiedEvents } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'
import { validateSavePackageChain, type SavePackageChain } from '../domain/incremental-save-package'
import type { SavePackageVerification } from '../domain/save-package'
import type { StoredWorldSave, SaveRepository, SaveRepositoryIssue } from './save-repository'
import { PREVIEW_RUNTIME_SCHEMA_VERSION, createPreviewRuntimeRegistry, type PreviewRuntimeEventKind } from '../game/runtime-registry'
import { createInitialGameState } from '../game/initial-state'
import { periods } from '../game/engine'
import { reducePreviewRuntimeEvent, rebuildPreviewRuntimeProjection } from '../game/runtime-projection'
import type { PreviewRuntimeSession } from '../game/runtime-orchestrator'
import type { JsonValue } from '../domain/event-ledger'

export type RuntimeRestoreIssue = SaveRepositoryIssue
  | 'runtime-restore-world-mismatch'
  | 'runtime-restore-schema-mismatch'
  | 'runtime-restore-package-invalid'
  | 'runtime-restore-replay-failed'
  | 'runtime-restore-ledger-invalid'

export type RuntimeRestoreResult =
  | { readonly status: 'restored'; readonly session: PreviewRuntimeSession; readonly stored: StoredWorldSave }
  | { readonly status: 'missing' }
  | { readonly status: 'rejected'; readonly issue: RuntimeRestoreIssue }

function cursorAt(chain: SavePackageChain): StreamCursor {
  return chain.snapshot.streamHead
}

function collectEvents(chain: SavePackageChain): readonly LedgerEvent<PreviewRuntimeEventKind>[] {
  if (chain.packageKind === 'full') return chain.events as readonly LedgerEvent<PreviewRuntimeEventKind>[]
  return [...collectEvents(chain.basePackage), ...chain.events as readonly LedgerEvent<PreviewRuntimeEventKind>[]]
}

function verificationFor(): SavePackageVerification<PreviewRuntimeEventKind> {
  return {
    registry: createPreviewRuntimeRegistry(),
    initialState: createInitialGameState() as unknown as JsonValue,
    reduce: (state, event) => reducePreviewRuntimeEvent(
      state as unknown as ReturnType<typeof createInitialGameState>,
      event,
    ) as unknown as JsonValue,
  }
}

function restoreCandidateLog(events: readonly LedgerEvent<PreviewRuntimeEventKind>[]): CandidateLog {
  const receipts = new Map(events
    .filter(event => event.kind === 'candidate.validated')
    .map(event => [event.id, event]))
  const candidates: AiCandidate[] = []
  for (const event of events) {
    if (event.source !== 'ai-candidate' || !event.candidateRef || !event.validationRef) continue
    const receipt = receipts.get(event.validationRef)
    const proof = receipt?.payload
    if (!receipt || !proof || typeof proof !== 'object' || Array.isArray(proof)) continue
    const metadata = proof as Record<string, JsonValue>
    if (metadata.candidate !== event.candidateRef || metadata.targetKind !== event.kind
      || typeof metadata.registryVersion !== 'string') continue
    candidates.push(Object.freeze({
      candidateId: event.candidateRef,
      targetKind: event.kind,
      payload: event.payload,
      registryVersion: metadata.registryVersion,
      status: 'validated',
    }))
  }
  return Object.freeze({
    candidates: Object.freeze(candidates),
    // Pending/rejected model suggestions are deliberately not durable world facts.
    rejections: createCandidateLog().rejections,
  })
}

function requestSequenceOf(events: readonly LedgerEvent[]): number {
  return events.reduce((maximum, event) => {
    const match = /^player-command-(\d+)$/u.exec(event.clientRequestId)
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, 0)
}

/**
 * Pure restore boundary: the caller publishes the returned session only after
 * this function succeeds. Missing/corrupt saves never mutate an active session.
 */
export async function restorePreviewRuntimeSession(
  worldId: WorldId,
  repository: SaveRepository,
): Promise<RuntimeRestoreResult> {
  const loaded = await repository.loadWorld(worldId)
  if (loaded.status === 'rejected') return { status: 'rejected', issue: loaded.issue }
  if (!loaded.value) return { status: 'missing' }
  const stored = loaded.value
  if (stored.worldId !== worldId || stored.packageChain.worldId !== worldId) {
    return { status: 'rejected', issue: 'runtime-restore-world-mismatch' }
  }
  if (stored.packageChain.schemaVersion !== PREVIEW_RUNTIME_SCHEMA_VERSION) {
    return { status: 'rejected', issue: 'runtime-restore-schema-mismatch' }
  }

  const verification = verificationFor()
  const validated = await validateSavePackageChain(stored.packageChain, verification)
  if (validated.status !== 'valid') return { status: 'rejected', issue: 'runtime-restore-package-invalid' }
  const chain = validated.package
  const events = collectEvents(chain)
  const cursor = cursorAt(chain)
  if (events.length !== cursor.seq) return { status: 'rejected', issue: 'runtime-restore-package-invalid' }

  const projection = rebuildPreviewRuntimeProjection({
    worldId,
    toInclusive: cursor,
    events,
    registry: verification.registry,
  })
  if (projection.status !== 'rebuilt' || projection.applied !== events.length) {
    return { status: 'rejected', issue: 'runtime-restore-replay-failed' }
  }

  const ledger = await restoreEventLedgerFromVerifiedEvents(worldId, events, verification.registry)
  if (ledger.status !== 'restored' || ledger.ledger.head !== cursor.seq) {
    return { status: 'rejected', issue: 'runtime-restore-ledger-invalid' }
  }

  const state = projection.state as unknown as ReturnType<typeof createInitialGameState>
  if (!Number.isSafeInteger(state.day) || state.day < 1
    || !Number.isSafeInteger(state.periodIndex) || !periods[state.periodIndex]) {
    return { status: 'rejected', issue: 'runtime-restore-replay-failed' }
  }
  const session: PreviewRuntimeSession = Object.freeze({
    worldId,
    registry: verification.registry,
    ledger: ledger.ledger,
    state,
    requestSequence: requestSequenceOf(events),
    candidateLog: restoreCandidateLog(events),
  })
  return { status: 'restored', session, stored }
}


export type RuntimeStartupRestoreResult =
  | RuntimeRestoreResult
  | { readonly status: 'selection-required'; readonly worlds: readonly import('./save-repository').SaveWorldSummary[] }

/** Auto-selects only when exactly one save exists; multiple lives require an explicit choice. */
export async function restoreSingleSavedRuntimeWorld(
  repository: SaveRepository,
): Promise<RuntimeStartupRestoreResult> {
  const listed = await repository.listWorlds()
  if (listed.status === 'rejected') return { status: 'rejected', issue: listed.issue }
  if (listed.value.length === 0) return { status: 'missing' }
  if (listed.value.length > 1) {
    return { status: 'selection-required', worlds: listed.value }
  }
  return restorePreviewRuntimeSession(listed.value[0].worldId, repository)
}
