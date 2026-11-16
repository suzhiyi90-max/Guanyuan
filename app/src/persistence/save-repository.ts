import type { SavePackageChain } from '../domain/incremental-save-package'
import type { WorldId } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'

export interface StoredWorldSave {
  readonly worldId: WorldId
  readonly packageChain: SavePackageChain
  readonly streamHead: StreamCursor
  readonly savedAt: string
}

export interface SaveWorldSummary {
  readonly worldId: WorldId
  readonly streamHead: StreamCursor
  readonly savedAt: string
  readonly packageKind: SavePackageChain['packageKind']
  readonly checksum: string
}

export type SaveRepositoryIssue =
  | 'save-repository-unavailable'
  | 'save-repository-storage-error'
  | 'save-repository-quota-exceeded'
  | 'save-repository-record-corrupt'
  | 'save-repository-world-mismatch'
  | 'save-repository-head-conflict'
  | 'save-repository-package-invalid'
  | 'save-repository-base-missing'

export type SaveRepositoryResult<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'rejected'; readonly issue: SaveRepositoryIssue }

export interface CommitWorldSaveInput {
  readonly worldId: WorldId
  readonly packageChain: SavePackageChain
  /** null means this world must not exist yet; otherwise compare-and-swap against this exact head. */
  readonly expectedHead: StreamCursor | null
  readonly savedAt: string
}

/**
 * Storage port only. Callers must fully validate checksum, registry, event range,
 * base chain and replay projection before commit; adapters never bless a package.
 */
export interface SaveRepository {
  loadWorld(worldId: WorldId): Promise<SaveRepositoryResult<StoredWorldSave | null>>
  commitWorld(input: CommitWorldSaveInput): Promise<SaveRepositoryResult<StoredWorldSave>>
  listWorlds(): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>>
  deleteWorld(worldId: WorldId, expectedHead: StreamCursor): Promise<SaveRepositoryResult<boolean>>
}
