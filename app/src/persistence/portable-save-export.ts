import type { JsonValue, WorldId } from '../domain/event-ledger'
import { validateSavePackageChain, type SavePackageChain } from '../domain/incremental-save-package'
import { calculateSavePackageChecksum, canonicalSavePackageJson, type SavePackageVerification } from '../domain/save-package'
import { createInitialGameState } from '../game/initial-state'
import type { PreviewRuntimeSession } from '../game/runtime-orchestrator'
import { periods } from '../game/engine'
import { reducePreviewRuntimeEvent } from '../game/runtime-projection'
import { PREVIEW_RUNTIME_SCHEMA_VERSION, type PreviewRuntimeEventKind } from '../game/runtime-registry'
import type { SaveRepository, SaveRepositoryIssue } from './save-repository'

export interface PortableSaveEnvelope {
  readonly format: 'guanyuan.portable-save'
  readonly formatVersion: 1
  readonly exportedAt: string
  readonly worldId: WorldId
  readonly streamHead: SavePackageChain['snapshot']['streamHead']
  readonly packageChain: SavePackageChain
  readonly envelopeChecksum: string
}

export type PortableSaveExportIssue =
  | 'not-saved-yet'
  | 'save-pending'
  | 'world-mismatch'
  | 'chain-corrupt'
  | 'schema-unsupported'
  | 'checksum-failed'
  | 'storage-error'
  | SaveRepositoryIssue

export type PortableSaveExportResult =
  | { readonly status: 'exported'; readonly envelope: PortableSaveEnvelope }
  | { readonly status: 'rejected'; readonly issue: PortableSaveExportIssue }

function verificationFor(session: PreviewRuntimeSession): SavePackageVerification<PreviewRuntimeEventKind> {
  return {
    registry: session.registry,
    initialState: createInitialGameState() as unknown as JsonValue,
    reduce: (state, event) => reducePreviewRuntimeEvent(
      state as unknown as ReturnType<typeof createInitialGameState>,
      event,
    ) as unknown as JsonValue,
  }
}

function sameCursor(left: PortableSaveEnvelope['streamHead'], right: PortableSaveEnvelope['streamHead']): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function envelopePayload(input: Omit<PortableSaveEnvelope, 'envelopeChecksum'>) {
  return {
    format: input.format,
    formatVersion: input.formatVersion,
    exportedAt: input.exportedAt,
    worldId: input.worldId,
    streamHead: input.streamHead,
    packageChain: input.packageChain,
  }
}

/** Build a portable envelope only from the complete, persisted and re-verified package chain. */
export async function exportPortableSave(
  session: PreviewRuntimeSession,
  repository: SaveRepository,
  options: { readonly pending?: boolean; readonly now?: () => string } = {},
): Promise<PortableSaveExportResult> {
  if (options.pending) return { status: 'rejected', issue: 'save-pending' }
  if (!session.worldId || session.ledger.worldId !== session.worldId
    || session.ledger.head !== session.ledger.events.length
    || !Number.isSafeInteger(session.state.day) || session.state.day < 1
    || !Number.isSafeInteger(session.state.periodIndex) || !periods[session.state.periodIndex]) {
    return { status: 'rejected', issue: 'world-mismatch' }
  }
  let loaded
  try { loaded = await repository.loadWorld(session.worldId) } catch {
    return { status: 'rejected', issue: 'storage-error' }
  }
  if (loaded.status === 'rejected') return { status: 'rejected', issue: loaded.issue }
  if (!loaded.value) return { status: 'rejected', issue: 'not-saved-yet' }
  const stored = loaded.value
  if (stored.worldId !== session.worldId || stored.packageChain.worldId !== session.worldId) {
    return { status: 'rejected', issue: 'world-mismatch' }
  }
  if (stored.packageChain.schemaVersion !== PREVIEW_RUNTIME_SCHEMA_VERSION) return { status: 'rejected', issue: 'schema-unsupported' }
  const tail = session.ledger.events[session.ledger.events.length - 1]
  const sessionHead = tail
    ? { kind: 'event' as const, seq: tail.seq, eventId: tail.id }
    : { kind: 'genesis' as const, seq: 0 }
  if (!sameCursor(stored.streamHead, stored.packageChain.snapshot.streamHead)
    || !sameCursor(stored.streamHead, sessionHead)) {
    return { status: 'rejected', issue: 'world-mismatch' }
  }
  let validated
  try { validated = await validateSavePackageChain(stored.packageChain, verificationFor(session)) } catch {
    return { status: 'rejected', issue: 'chain-corrupt' }
  }
  if (validated.status !== 'valid') {
    const issue = validated.issue.includes('schema') ? 'schema-unsupported'
      : validated.issue.includes('checksum') ? 'checksum-failed' : 'chain-corrupt'
    return { status: 'rejected', issue }
  }
  const exportedAt = (options.now ?? (() => new Date().toISOString()))()
  if (!Number.isFinite(Date.parse(exportedAt))) return { status: 'rejected', issue: 'storage-error' }
  const payload = {
    format: 'guanyuan.portable-save' as const,
    formatVersion: 1 as const,
    exportedAt,
    worldId: session.worldId,
    streamHead: stored.streamHead,
    packageChain: validated.package,
  }
  try {
    const envelopeChecksum = await calculateSavePackageChecksum(envelopePayload(payload))
    if (!envelopeChecksum) return { status: 'rejected', issue: 'checksum-failed' }
    return { status: 'exported', envelope: Object.freeze({ ...payload, envelopeChecksum }) }
  } catch {
    return { status: 'rejected', issue: 'checksum-failed' }
  }
}

/** Independent envelope integrity check; it does not restore or publish a runtime session. */
export async function validatePortableSaveEnvelope(input: unknown): Promise<boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as Record<string, unknown>
  const expectedKeys = ['format', 'formatVersion', 'exportedAt', 'worldId', 'streamHead', 'packageChain', 'envelopeChecksum']
  if (Object.keys(value).length !== expectedKeys.length || Object.keys(value).some(key => !expectedKeys.includes(key))
    || value.format !== 'guanyuan.portable-save' || value.formatVersion !== 1
    || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))
    || typeof value.worldId !== 'string' || !value.worldId.trim()
    || typeof value.envelopeChecksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.envelopeChecksum)
    || !value.streamHead || typeof value.streamHead !== 'object'
    || !value.packageChain || typeof value.packageChain !== 'object') return false
  try {
    const chain = value.packageChain as Record<string, unknown>
    if (chain.worldId !== value.worldId || !chain.snapshot || typeof chain.snapshot !== 'object'
      || canonicalSavePackageJson((chain.snapshot as Record<string, unknown>).streamHead) !== canonicalSavePackageJson(value.streamHead)) return false
    const payload = {
      format: value.format,
      formatVersion: value.formatVersion,
      exportedAt: value.exportedAt,
      worldId: value.worldId,
      streamHead: value.streamHead,
      packageChain: value.packageChain,
    }
    const checksum = await calculateSavePackageChecksum(payload)
    return checksum !== null && checksum === value.envelopeChecksum
      && canonicalSavePackageJson(value.packageChain).length > 0
  } catch { return false }
}
