import type { JsonValue, WorldId } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'
import { validateSavePackageChain, type SavePackageChain } from '../domain/incremental-save-package'
import type { SavePackageVerification } from '../domain/save-package'
import { createInitialGameState } from '../game/initial-state'
import { reducePreviewRuntimeEvent } from '../game/runtime-projection'
import { createPreviewRuntimeRegistry, PREVIEW_RUNTIME_SCHEMA_VERSION, type PreviewRuntimeEventKind } from '../game/runtime-registry'
import type { SaveRepository, SaveRepositoryIssue, StoredWorldSave } from './save-repository'
import {
  validatePortableSaveEnvelope,
  type PortableSaveEnvelope,
} from './portable-save-export'
import { parseStrictJsonBytes, PORTABLE_SAVE_MAX_BYTES, StrictJsonParseError } from './strict-json'

export type PortableSaveImportIssue =
  | 'file-too-large'
  | 'file-read-failed'
  | 'json-invalid'
  | 'envelope-invalid'
  | 'format-unsupported'
  | 'envelope-checksum-failed'
  | 'world-mismatch'
  | 'schema-unsupported'
  | 'chain-corrupt'
  | 'checksum-failed'
  | 'world-exists'
  | 'storage-error'
  | 'storage-quota-exceeded'
  | 'storage-conflict'

export type PortableSaveImportResult =
  | { readonly status: 'imported'; readonly value: StoredWorldSave; readonly envelope: PortableSaveEnvelope }
  | { readonly status: 'rejected'; readonly issue: PortableSaveImportIssue }

export interface PortableSavePreview {
  readonly status: 'prepared'
  readonly worldId: string
  readonly exportedAt: string
  readonly streamHead: StreamCursor
  readonly chainNodeCount: number
}

export type PortableSavePrepareResult =
  | PortableSavePreview
  | { readonly status: 'rejected'; readonly issue: PortableSaveImportIssue }

interface ValidatedPortableSave {
  readonly envelope: PortableSaveEnvelope
  readonly packageChain: SavePackageChain
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameCursor(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  return a.kind === b.kind && a.seq === b.seq
    && (a.kind === 'genesis' || (b.kind === 'event' && a.eventId === b.eventId))
}

function countAndCheckChain(input: unknown, worldId: string): input is SavePackageChain {
  let current = input
  let count = 0
  const keys = new Set<string>()
  while (current && typeof current === 'object' && !Array.isArray(current)) {
    const value = current as Record<string, unknown>
    count += 1
    if (count > 128 || value.worldId !== worldId
      || typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) return false
    const key = `${worldId}::${value.checksum}`
    if (keys.has(key)) return false
    keys.add(key)
    if (value.packageKind === 'full') return !Object.hasOwn(value, 'basePackage')
    if (value.packageKind !== 'incremental' || !Object.hasOwn(value, 'basePackage')) return false
    current = value.basePackage
  }
  return false
}

function countChainNodes(input: SavePackageChain): number {
  let current: unknown = input
  let count = 0
  while (isRecord(current)) {
    count += 1
    current = current.packageKind === 'incremental' ? current.basePackage : null
  }
  return count
}

function mapRepositoryIssue(issue: SaveRepositoryIssue): PortableSaveImportIssue {
  switch (issue) {
    case 'save-repository-world-exists': return 'world-exists'
    case 'save-repository-quota-exceeded': return 'storage-quota-exceeded'
    case 'save-repository-storage-conflict': return 'storage-conflict'
    case 'save-repository-unavailable': return 'storage-error'
    default: return 'storage-error'
  }
}

/** Strictly parses and replays an untrusted package without touching persistence. */
async function validatePortableSaveBytes(bytes: Uint8Array): Promise<
  | { readonly status: 'valid'; readonly value: ValidatedPortableSave }
  | { readonly status: 'rejected'; readonly issue: PortableSaveImportIssue }
> {
  let parsed: unknown
  try {
    parsed = parseStrictJsonBytes(bytes)
  } catch (error) {
    if (error instanceof StrictJsonParseError) {
      return { status: 'rejected', issue: error.issue === 'file-too-large' ? 'file-too-large' : 'json-invalid' }
    }
    return { status: 'rejected', issue: 'json-invalid' }
  }

  if (!isRecord(parsed)) return { status: 'rejected', issue: 'envelope-invalid' }
  const raw = parsed
  if (raw.format !== 'guanyuan.portable-save' || raw.formatVersion !== 1) {
    return { status: 'rejected', issue: 'format-unsupported' }
  }
  const expectedKeys = ['format', 'formatVersion', 'exportedAt', 'worldId', 'streamHead', 'packageChain', 'envelopeChecksum']
  if (Object.keys(raw).length !== expectedKeys.length || Object.keys(raw).some(key => !expectedKeys.includes(key))) {
    return { status: 'rejected', issue: 'envelope-invalid' }
  }
  if (typeof raw.worldId !== 'string' || !raw.worldId.trim()
    || typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt))) {
    return { status: 'rejected', issue: 'envelope-invalid' }
  }
  if (!countAndCheckChain(raw.packageChain, raw.worldId)) {
    return { status: 'rejected', issue: 'chain-corrupt' }
  }
  const chainRecord = raw.packageChain as unknown as Record<string, unknown>
  const snapshot = chainRecord.snapshot
  const streamRange = chainRecord.streamRange
  if (!isRecord(snapshot) || !isRecord(streamRange)
    || !sameCursor(raw.streamHead, snapshot.streamHead)
    || !sameCursor(raw.streamHead, streamRange.toInclusive)) {
    return { status: 'rejected', issue: 'world-mismatch' }
  }
  if (!await validatePortableSaveEnvelope(raw)) {
    return { status: 'rejected', issue: 'envelope-checksum-failed' }
  }
  if (raw.packageChain.schemaVersion !== PREVIEW_RUNTIME_SCHEMA_VERSION) {
    return { status: 'rejected', issue: 'schema-unsupported' }
  }

  let validated
  try {
    validated = await validateSavePackageChain(raw.packageChain, verificationFor())
  } catch {
    return { status: 'rejected', issue: 'chain-corrupt' }
  }
  if (validated.status !== 'valid') {
    const issue = validated.issue.includes('schema') ? 'schema-unsupported'
      : validated.issue.includes('checksum') ? 'checksum-failed' : 'chain-corrupt'
    return { status: 'rejected', issue }
  }
  if (validated.package.worldId !== raw.worldId
    || !sameCursor(raw.streamHead, validated.package.snapshot.streamHead)
    || !sameCursor(raw.streamHead, validated.package.streamRange.toInclusive)) {
    return { status: 'rejected', issue: 'world-mismatch' }
  }
  return {
    status: 'valid',
    value: {
      envelope: raw as unknown as PortableSaveEnvelope,
      packageChain: validated.package,
    },
  }
}

/** Preview API: complete validation/replay, guaranteed no repository write. */
export async function preparePortableSaveBytes(bytes: Uint8Array): Promise<PortableSavePrepareResult> {
  const checked = await validatePortableSaveBytes(bytes)
  if (checked.status === 'rejected') return checked
  return {
    status: 'prepared',
    worldId: checked.value.envelope.worldId,
    exportedAt: checked.value.envelope.exportedAt,
    streamHead: checked.value.packageChain.snapshot.streamHead,
    chainNodeCount: countChainNodes(checked.value.packageChain),
  }
}

/** File adapter checks File.size before reading any untrusted bytes. */
export async function preparePortableSaveFile(file: File): Promise<PortableSavePrepareResult> {
  if (file.size > PORTABLE_SAVE_MAX_BYTES) return { status: 'rejected', issue: 'file-too-large' }
  let bytes: ArrayBuffer
  try { bytes = await file.arrayBuffer() } catch {
    return { status: 'rejected', issue: 'file-read-failed' }
  }
  return preparePortableSaveBytes(new Uint8Array(bytes))
}

/** Commit API deliberately re-reads and re-validates the file after user confirmation. */
export async function commitPortableSaveFile(
  file: File,
  repository: SaveRepository,
  options: { readonly now?: () => string } = {},
): Promise<PortableSaveImportResult> {
  if (file.size > PORTABLE_SAVE_MAX_BYTES) return { status: 'rejected', issue: 'file-too-large' }
  let bytes: ArrayBuffer
  try { bytes = await file.arrayBuffer() } catch {
    return { status: 'rejected', issue: 'file-read-failed' }
  }
  const checked = await validatePortableSaveBytes(new Uint8Array(bytes))
  if (checked.status === 'rejected') return checked
  const savedAt = (options.now ?? (() => new Date().toISOString()))()
  if (!Number.isFinite(Date.parse(savedAt))) return { status: 'rejected', issue: 'storage-error' }
  let imported
  try {
    imported = await repository.importWorld({
      worldId: checked.value.envelope.worldId as WorldId,
      packageChain: checked.value.packageChain,
      streamHead: checked.value.packageChain.snapshot.streamHead,
      savedAt,
    })
  } catch {
    return { status: 'rejected', issue: 'storage-error' }
  }
  if (imported.status === 'rejected') {
    return { status: 'rejected', issue: mapRepositoryIssue(imported.issue) }
  }
  return { status: 'imported', value: imported.value, envelope: checked.value.envelope }
}

/** Backward-compatible one-step API for non-interactive callers and existing contracts. */
export async function importPortableSaveBytes(
  bytes: Uint8Array,
  repository: SaveRepository,
  options: { readonly now?: () => string } = {},
): Promise<PortableSaveImportResult> {
  const checked = await validatePortableSaveBytes(bytes)
  if (checked.status === 'rejected') return checked
  const savedAt = (options.now ?? (() => new Date().toISOString()))()
  if (!Number.isFinite(Date.parse(savedAt))) return { status: 'rejected', issue: 'storage-error' }
  let imported
  try {
    imported = await repository.importWorld({
      worldId: checked.value.envelope.worldId as WorldId,
      packageChain: checked.value.packageChain,
      streamHead: checked.value.packageChain.snapshot.streamHead,
      savedAt,
    })
  } catch {
    return { status: 'rejected', issue: 'storage-error' }
  }
  if (imported.status === 'rejected') {
    return { status: 'rejected', issue: mapRepositoryIssue(imported.issue) }
  }
  return { status: 'imported', value: imported.value, envelope: checked.value.envelope }
}

/** Legacy File adapter remains an explicit immediate-import operation. */
export async function importPortableSaveFile(
  file: File,
  repository: SaveRepository,
  options: { readonly now?: () => string } = {},
): Promise<PortableSaveImportResult> {
  return commitPortableSaveFile(file, repository, options)
}
