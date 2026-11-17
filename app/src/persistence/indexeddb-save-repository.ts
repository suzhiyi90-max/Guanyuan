import type { SavePackageChain } from '../domain/incremental-save-package'
import type { WorldId } from '../domain/event-ledger'
import type { StreamCursor } from '../domain/event-replay'
import type {
  CommitWorldSaveInput,
  ImportWorldSaveInput,
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

function isJsonSafe(value: unknown): boolean {
  const ancestors = new WeakSet<object>()
  const stack: Array<{ value: unknown; depth: number; exit?: boolean }> = [{ value, depth: 0 }]
  let visited = 0
  while (stack.length > 0) {
    const item = stack.pop()!
    if (item.exit) {
      ancestors.delete(item.value as object)
      continue
    }
    const current = item.value
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false
      continue
    }
    if (typeof current !== 'object' || item.depth > 256 || ancestors.has(current)) return false
    visited += 1
    if (visited > 1_000_000) return false
    ancestors.add(current)
    stack.push({ value: current, depth: item.depth, exit: true })
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype
        || Reflect.ownKeys(current).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key)))) return false
      for (let index = 0; index < current.length; index += 1) {
        if (!Object.hasOwn(current, index)) return false
        stack.push({ value: current[index], depth: item.depth + 1 })
      }
      continue
    }
    const prototype = Object.getPrototypeOf(current)
    if (prototype !== Object.prototype && prototype !== null) return false
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== 'string' || key === '__proto__') return false
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false
      stack.push({ value: descriptor.value, depth: item.depth + 1 })
    }
  }
  return true
}

function isCursor(value: unknown): value is StreamCursor {
  if (!isRecord(value)) return false
  if (value.kind === 'genesis') return value.seq === 0 && Object.keys(value).every(key => key === 'kind' || key === 'seq')
  return value.kind === 'event' && Number.isSafeInteger(value.seq) && (value.seq as number) > 0
    && typeof value.eventId === 'string' && value.eventId.trim().length > 0 && Object.keys(value).every(key => key === 'kind' || key === 'seq' || key === 'eventId')
}

function packageEnvelope(value: unknown, depth = 0): value is SavePackageChain {
  if (depth > MAX_CHAIN_DEPTH || !isRecord(value)
    || (value.packageKind !== 'full' && value.packageKind !== 'incremental')
    || typeof value.worldId !== 'string' || !value.worldId.trim()
    || !Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 1
    || !isRecord(value.snapshot) || !isRecord(value.streamRange)
    || !isCursor(value.streamRange.fromExclusive) || !isCursor(value.streamRange.toInclusive)
    || !isCursor(value.snapshot.streamHead)
    || !sameCursor(value.snapshot.streamHead, value.streamRange.toInclusive)
    || typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) return false
  if (value.packageKind === 'full') return value.streamRange.fromExclusive.kind === 'genesis'
    && value.basePackage === undefined
  const basePackage = value.basePackage
  if (!packageEnvelope(basePackage, depth + 1)) return false
  return basePackage.worldId === value.worldId
    && sameCursor(basePackage.snapshot.streamHead, value.streamRange.fromExclusive)
}

function rowForPackage(chain: SavePackageChain): PackageRow {
  if (chain.packageKind === 'incremental') {
    const { basePackage, ...body } = chain
    return {
      key: packageKey(chain.worldId, chain.checksum),
      worldId: chain.worldId,
      packageKind: chain.packageKind,
      checksum: chain.checksum,
      body: body as unknown as Record<string, unknown>,
      basePackageKey: packageKey(basePackage.worldId, basePackage.checksum),
    }
  }
  return {
    key: packageKey(chain.worldId, chain.checksum),
    worldId: chain.worldId,
    packageKind: chain.packageKind,
    checksum: chain.checksum,
    body: chain as unknown as Record<string, unknown>,
    basePackageKey: null,
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

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false
  try { return new Date(value).toISOString() === value } catch { return false }
}

function normalizeWorldRow(value: unknown): WorldRow | null {
  if (!isRecord(value)
    || typeof value.worldId !== 'string' || !value.worldId.trim() || value.worldId !== value.worldId.trim()
    || typeof value.latestPackageKey !== 'string'
    || typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)
    || value.latestPackageKey !== packageKey(value.worldId, value.checksum)
    || !isCanonicalIsoTimestamp(value.savedAt)
    || (value.packageKind !== 'full' && value.packageKind !== 'incremental')
    || !isCursor(value.streamHead)) return null
  return value as unknown as WorldRow
}

export class IndexedDbSaveRepository implements SaveRepository {
  private database: Promise<IDBDatabase> | null = null

  constructor(
    private readonly factory: IDBFactory | null = globalThis.indexedDB,
    private readonly databaseName = DATABASE_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('indexeddb-unavailable'))
    if (this.database) return this.database
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
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
    this.database = opening
    return opening
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
      const raw = await requestValue(tx.objectStore(WORLD_STORE).get(worldId))
      await done
      if (raw === undefined) return { status: 'success', value: null }
      const row = normalizeWorldRow(raw)
      if (!row || row.worldId !== worldId) return { status: 'rejected', issue: 'save-repository-record-corrupt' }
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
      || !isCanonicalIsoTimestamp(input.savedAt)) {
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
      const currentRaw = await requestValue(worlds.get(input.worldId))
      const current = currentRaw === undefined ? null : normalizeWorldRow(currentRaw)
      if (currentRaw !== undefined && !current) {
        tx.abort()
        try { await done } catch { /* expected corrupt record abort */ }
        return { status: 'rejected', issue: 'save-repository-record-corrupt' }
      }
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

  /**
   * Imports a fully verified foreign chain into an empty WorldId. All rows are
   * queued synchronously in one readwrite transaction; the world primary key
   * is the concurrency authority and any failure rolls the complete write back.
   */
  async importWorld(input: ImportWorldSaveInput): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (!isJsonSafe(input.packageChain) || !isCanonicalIsoTimestamp(input.savedAt)) {
      return { status: 'rejected', issue: 'save-repository-package-invalid' }
    }

    const newestFirst: SavePackageChain[] = []
    const seenKeys = new Set<string>()
    let candidate: unknown = input.packageChain
    while (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const value = candidate as Record<string, unknown>
      if (newestFirst.length >= MAX_CHAIN_DEPTH || value.worldId !== input.worldId
        || typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.checksum)) {
        return { status: 'rejected', issue: 'save-repository-package-invalid' }
      }
      const key = packageKey(input.worldId, value.checksum)
      if (seenKeys.has(key)) return { status: 'rejected', issue: 'save-repository-package-invalid' }
      seenKeys.add(key)
      if (value.packageKind !== 'full' && value.packageKind !== 'incremental') {
        return { status: 'rejected', issue: 'save-repository-package-invalid' }
      }
      newestFirst.push(candidate as SavePackageChain)
      if (value.packageKind === 'full') break
      candidate = value.basePackage
    }
    if (newestFirst.length === 0 || newestFirst[newestFirst.length - 1].packageKind !== 'full'
      || !packageEnvelope(input.packageChain) || input.packageChain.worldId !== input.worldId
      || !sameCursor(input.packageChain.snapshot.streamHead, input.streamHead)
      || !sameCursor(input.packageChain.streamRange.toInclusive, input.streamHead)) {
      return { status: 'rejected', issue: 'save-repository-package-invalid' }
    }
    const rootFirst = newestFirst.reverse()
    const rows = rootFirst.map(rowForPackage)
    for (let index = 0; index < rows.length; index += 1) {
      const expectedBase = index === 0 ? null : rows[index - 1].key
      if (rows[index].basePackageKey !== expectedBase) {
        return { status: 'rejected', issue: 'save-repository-package-invalid' }
      }
    }

    let db: IDBDatabase
    try { db = await this.open() } catch {
      return { status: 'rejected', issue: 'save-repository-unavailable' }
    }

    let worldConflict = false
    let packageConflict = false
    try {
      const tx = db.transaction([WORLD_STORE, PACKAGE_STORE], 'readwrite')
      const done = transactionDone(tx)
      const worlds = tx.objectStore(WORLD_STORE)
      const packages = tx.objectStore(PACKAGE_STORE)
      const worldRow: WorldRow = {
        worldId: input.worldId,
        latestPackageKey: rows[rows.length - 1].key,
        streamHead: input.streamHead,
        savedAt: input.savedAt,
        packageKind: input.packageChain.packageKind,
        checksum: input.packageChain.checksum,
      }
      try {
        const worldRequest = worlds.add(worldRow)
        worldRequest.onerror = () => { worldConflict = true }
        for (const row of rows) {
          const request = packages.add(row)
          request.onerror = () => { packageConflict = true }
        }
      } catch (error) {
        // Synchronous structured-clone / request-construction failures must
        // abort the already-queued world pointer as well.
        try { tx.abort() } catch { /* transaction may already be inactive */ }
        throw error
      }
      await done
      return { status: 'success', value: Object.freeze({
        worldId: input.worldId,
        packageChain: input.packageChain,
        streamHead: input.streamHead,
        savedAt: input.savedAt,
      }) }
    } catch (error) {
      if (worldConflict) return { status: 'rejected', issue: 'save-repository-world-exists' }
      if (packageConflict) return { status: 'rejected', issue: 'save-repository-storage-conflict' }
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
      const ordered = [...normalized].sort((left, right) => {
        if (left!.savedAt !== right!.savedAt) return left!.savedAt < right!.savedAt ? 1 : -1
        if (left!.worldId === right!.worldId) return 0
        return left!.worldId < right!.worldId ? -1 : 1
      })
      return { status: 'success', value: Object.freeze(ordered.map(row => Object.freeze({
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
      const currentRaw = await requestValue(worlds.get(worldId))
      const current = currentRaw === undefined ? null : normalizeWorldRow(currentRaw)
      if (currentRaw !== undefined && !current) {
        tx.abort()
        try { await done } catch { /* expected corrupt record abort */ }
        return { status: 'rejected', issue: 'save-repository-record-corrupt' }
      }
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
