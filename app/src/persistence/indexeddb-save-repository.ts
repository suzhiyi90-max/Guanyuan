import type { SavePackageChain } from '../domain/incremental-save-package'
import type { WorldId } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'
import type {
  CommitWorldSaveInput,
  SaveRepository,
  SaveRepositoryIssue,
  SaveRepositoryResult,
  SaveWorldSummary,
  StoredWorldSave,
} from './save-repository'

const DATABASE_NAME = 'guanyuan-world-saves'
const DATABASE_VERSION = 1
const WORLD_STORE = 'worlds'
const PACKAGE_STORE = 'packages'
const MAX_CHAIN_DEPTH = 128

interface WorldRow {
  readonly worldId: string
  readonly latestPackageKey: string
  readonly streamHead: StreamCursor
  readonly savedAt: string
  readonly packageKind: SavePackageChain['packageKind']
  readonly checksum: string
}

interface PackageRow {
  readonly key: string
  readonly worldId: string
  readonly packageKind: SavePackageChain['packageKind']
  readonly checksum: string
  readonly body: Record<string, unknown>
  readonly basePackageKey: string | null
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function packageKey(worldId: string, checksum: string): string {
  return `${worldId}::${checksum}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function packageEnvelope(value: unknown): value is SavePackageChain {
  if (!isRecord(value) || (value.packageKind !== 'full' && value.packageKind !== 'incremental')
    || typeof value.worldId !== 'string' || !Number.isSafeInteger(value.schemaVersion)
    || !isRecord(value.snapshot) || !isRecord(value.streamRange)
    || typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) return false
  const cursor = value.snapshot.streamHead
  return isRecord(cursor) && (cursor.kind === 'genesis' && cursor.seq === 0
    || cursor.kind === 'event' && Number.isSafeInteger(cursor.seq) && (cursor.seq as number) > 0
      && typeof cursor.eventId === 'string')
}

function rowForPackage(chain: SavePackageChain): PackageRow {
  const { basePackage, ...body } = chain.packageKind === 'incremental'
    ? chain as Extract<SavePackageChain, { packageKind: 'incremental' }>
    : { ...chain, basePackage: undefined }
  return {
    key: packageKey(chain.worldId, chain.checksum),
    worldId: chain.worldId,
    packageKind: chain.packageKind,
    checksum: chain.checksum,
    body: body as unknown as Record<string, unknown>,
    basePackageKey: chain.packageKind === 'incremental'
      ? packageKey(basePackage.worldId, basePackage.checksum)
      : null,
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-request-failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb-transaction-aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb-transaction-failed'))
  })
}

function issueFrom(error: unknown): SaveRepositoryIssue {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return 'save-repository-quota-exceeded'
  }
  return 'save-repository-storage-error'
}

function normalizeWorldRow(value: unknown): WorldRow | null {
  if (!isRecord(value) || typeof value.worldId !== 'string' || typeof value.latestPackageKey !== 'string'
    || typeof value.savedAt !== 'string' || typeof value.checksum !== 'string'
    || (value.packageKind !== 'full' && value.packageKind !== 'incremental')
    || !isRecord(value.streamHead)) return null
  return value as unknown as WorldRow
}

export class IndexedDbSaveRepository implements SaveRepository {
  private database: Promise<IDBDatabase> | null = null

  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    private readonly databaseName = DATABASE_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('indexeddb-unavailable'))
    if (this.database) return this.database
    this.database = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(WORLD_STORE)) db.createObjectStore(WORLD_STORE, { keyPath: 'worldId' })
        if (!db.objectStoreNames.contains(PACKAGE_STORE)) {
          const store = db.createObjectStore(PACKAGE_STORE, { keyPath: 'key' })
          store.createIndex('worldId', 'worldId', { unique: false })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          this.database = null
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'))
      request.onblocked = () => reject(new Error('indexeddb-open-blocked'))
    }).catch(error => {
      this.database = null
      throw error
    })
    return this.database
  }

  private async hydratePackage(db: IDBDatabase, key: string, worldId: string, seen = new Set<string>()): Promise<SavePackageChain | null> {
    if (seen.has(key) || seen.size >= MAX_CHAIN_DEPTH) return null
    seen.add(key)
    const tx = db.transaction(PACKAGE_STORE, 'readonly')
    const done = transactionDone(tx)
    const row = await requestValue(tx.objectStore(PACKAGE_STORE).get(key)) as PackageRow | undefined
    await done
    if (!row || row.worldId !== worldId || row.key !== key || !isRecord(row.body)
      || row.packageKind !== row.body.packageKind || row.checksum !== row.body.checksum) return null
    let chain: Record<string, unknown> = { ...row.body }
    if (row.packageKind === 'incremental') {
      if (!row.basePackageKey) return null
      const base = await this.hydratePackage(db, row.basePackageKey, worldId, seen)
      if (!base) return null
      chain = { ...chain, basePackage: base }
    } else if (row.basePackageKey !== null) return null
    return packageEnvelope(chain) ? chain : null
  }

  async loadWorld(worldId: WorldId): Promise<SaveRepositoryResult<StoredWorldSave | null>> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', issue: 'save-repository-unavailable' } }
    try {
      const tx = db.transaction(WORLD_STORE, 'readonly')
      const done = transactionDone(tx)
      const row = normalizeWorldRow(await requestValue(tx.objectStore(WORLD_STORE).get(worldId)))
      await done
      if (!row) return { status: 'success', value: null }
      if (row.worldId !== worldId) return { status: 'rejected', issue: 'save-repository-record-corrupt' }
      const packageChain = await this.hydratePackage(db, row.latestPackageKey, worldId)
      if (!packageChain || packageChain.checksum !== row.checksum || packageChain.packageKind !== row.packageKind
        || !sameCursor(packageChain.snapshot.streamHead, row.streamHead)) {
        return { status: 'rejected', issue: 'save-repository-record-corrupt' }
      }
      return { status: 'success', value: Object.freeze({
        worldId, packageChain, streamHead: row.streamHead, savedAt: row.savedAt,
      }) }
    } catch (error) {
      return { status: 'rejected', issue: issueFrom(error) }
    }
  }

  async commitWorld(input: CommitWorldSaveInput): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (!packageEnvelope(input.packageChain) || input.packageChain.worldId !== input.worldId
      || !sameCursor(input.packageChain.snapshot.streamHead, input.packageChain.streamRange.toInclusive)
      || !Number.isFinite(Date.parse(input.savedAt))) {
      return { status: 'rejected', issue: 'save-repository-package-invalid' }
    }
    if (input.packageChain.packageKind === 'incremental'
      && !sameCursor(input.packageChain.basePackage.snapshot.streamHead, input.expectedHead ?? { kind: 'genesis', seq: 0 })) {
      return { status: 'rejected', issue: 'save-repository-head-conflict' }
    }
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', issue: 'save-repository-unavailable' } }
    try {
      const tx = db.transaction([WORLD_STORE, PACKAGE_STORE], 'readwrite')
      const done = transactionDone(tx)
      const worlds = tx.objectStore(WORLD_STORE)
      const packages = tx.objectStore(PACKAGE_STORE)
      const current = normalizeWorldRow(await requestValue(worlds.get(input.worldId)))
      const actualHead = current?.streamHead ?? null
      if ((input.expectedHead === null && actualHead !== null)
        || (input.expectedHead !== null && (actualHead === null || !sameCursor(actualHead, input.expectedHead)))) {
        tx.abort()
        try { await done } catch { /* expected compare-and-swap abort */ }
        return { status: 'rejected', issue: 'save-repository-head-conflict' }
      }
      const stored = rowForPackage(input.packageChain)
      if (stored.basePackageKey) {
        const base = await requestValue(packages.get(stored.basePackageKey))
        if (!base) {
          tx.abort()
          try { await done } catch { /* expected missing-base abort */ }
          return { status: 'rejected', issue: 'save-repository-base-missing' }
        }
      }
      packages.put(stored)
      const worldRow: WorldRow = {
        worldId: input.worldId,
        latestPackageKey: stored.key,
        streamHead: input.packageChain.snapshot.streamHead,
        savedAt: input.savedAt,
        packageKind: input.packageChain.packageKind,
        checksum: input.packageChain.checksum,
      }
      worlds.put(worldRow)
      await done
      return { status: 'success', value: Object.freeze({
        worldId: input.worldId,
        packageChain: input.packageChain,
        streamHead: worldRow.streamHead,
        savedAt: worldRow.savedAt,
      }) }
    } catch (error) {
      return { status: 'rejected', issue: issueFrom(error) }
    }
  }

  async listWorlds(): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', issue: 'save-repository-unavailable' } }
    try {
      const tx = db.transaction(WORLD_STORE, 'readonly')
      const done = transactionDone(tx)
      const rows = await requestValue(tx.objectStore(WORLD_STORE).getAll()) as unknown[]
      await done
      const normalized = rows.map(normalizeWorldRow)
      if (normalized.some(row => row === null)) return { status: 'rejected', issue: 'save-repository-record-corrupt' }
      return { status: 'success', value: Object.freeze(normalized.map(row => Object.freeze({
        worldId: row!.worldId as WorldId,
        streamHead: row!.streamHead,
        savedAt: row!.savedAt,
        packageKind: row!.packageKind,
        checksum: row!.checksum,
      }))) }
    } catch (error) {
      return { status: 'rejected', issue: issueFrom(error) }
    }
  }

  async deleteWorld(worldId: WorldId, expectedHead: StreamCursor): Promise<SaveRepositoryResult<boolean>> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', issue: 'save-repository-unavailable' } }
    try {
      const tx = db.transaction([WORLD_STORE, PACKAGE_STORE], 'readwrite')
      const done = transactionDone(tx)
      const worlds = tx.objectStore(WORLD_STORE)
      const current = normalizeWorldRow(await requestValue(worlds.get(worldId)))
      if (!current) {
        tx.abort()
        try { await done } catch { /* expected missing record */ }
        return { status: 'success', value: false }
      }
      if (!sameCursor(current.streamHead, expectedHead)) {
        tx.abort()
        try { await done } catch { /* expected compare-and-swap abort */ }
        return { status: 'rejected', issue: 'save-repository-head-conflict' }
      }
      worlds.delete(worldId)
      const packageStore = tx.objectStore(PACKAGE_STORE)
      const cursor = packageStore.index('worldId').openCursor(worldId)
      cursor.onsuccess = () => {
        const item = cursor.result
        if (item) { item.delete(); item.continue() }
      }
      await done
      return { status: 'success', value: true }
    } catch (error) {
      return { status: 'rejected', issue: issueFrom(error) }
    }
  }

  close(): void {
    void this.database?.then(db => db.close()).catch(() => undefined)
    this.database = null
  }
}

export function createIndexedDbSaveRepository(
  factory?: IDBFactory,
  databaseName?: string,
): SaveRepository {
  return new IndexedDbSaveRepository(factory, databaseName)
}
