/**
 * W6-I-3B — independent IndexedDB runtime persistence.
 *
 * This adapter owns W6 reservations and canonical event persistence. It does
 * not import or mutate the W5 SavePackage / SaveRepository implementation.
 */
import {
  createEventLedger,
  restoreEventLedgerFromVerifiedEvents,
  type EventLedger,
  type LedgerEvent,
  type LedgerIdempotencyRecord,
  type WorldId,
} from '../domain/event-ledger'
import type { EventRegistry } from '../domain/event-registry'
import { isValidWorldTime, type WorldTime } from '../domain/shared/world-time'
import type { StreamCursor } from '../domain/event-replay'
import type { OwnerId } from '../application/identity/owner'
import type { OwnerWorldReservationPort, DurableWorldLedgerPort } from '../application/world/durable-ports'
import type { WorldAggregate } from '../domain/world/aggregate'
import type { WorldDomainEventKind } from '../application/world/event-catalog'
import { createWorldDomainEventRegistry } from '../application/world/event-catalog'
import { createWorldAggregateProjector } from '../application/world/projector'
import { prepareWorldCommand } from '../application/world/command-processor'
import type { WorldCommandPort, WorldCommandReceipt, WorldProjectionPort, WorldQueryPort } from '../application/world/ports'

const DATABASE_NAME = 'guanyuan-w6-runtime'
const DATABASE_VERSION = 1
const OWNER_RESERVATIONS = 'ownerReservations'
const WORLD_METADATA = 'worldMetadata'
const WORLD_EVENTS = 'worldEvents'
const IDEMPOTENCY_RECORDS = 'idempotencyRecords'
const OWNER_PERSON_BINDINGS = 'ownerPersonBindings'

export type W6ReservationState = 'reserved' | 'genesis-event-committed' | 'binding-finalized'

export interface W6OwnerWorldReservation {
  readonly schemaVersion: 1
  readonly ownerId: OwnerId
  readonly worldId: WorldId
  readonly clientRequestId: string
  readonly worldStartTime: WorldTime
  readonly state: W6ReservationState
}

export interface W6WorldMetadata {
  readonly schemaVersion: 1
  readonly worldId: WorldId
  readonly worldStartTime: WorldTime
  readonly head: number
  readonly streamHead: StreamCursor
}

interface StoredWorldEvent<Kind extends string> {
  readonly worldId: WorldId
  readonly seq: number
  readonly event: LedgerEvent<Kind>
}

interface StoredIdempotencyRecord {
  readonly worldId: WorldId
  readonly key: string
  readonly eventId: string
  readonly fingerprint: string
}

interface StoredOwnerPersonBinding {
  readonly ownerId: OwnerId
  readonly worldId: WorldId
  readonly personId: string
  readonly confirmedHead: StreamCursor
}

export type W6ReservationResult =
  | { readonly status: 'reserved'; readonly reservation: W6OwnerWorldReservation }
  | { readonly status: 'conflict'; readonly reason: 'owner-already-reserved' | 'reservation-request-conflict' | 'world-id-collision' }
  | { readonly status: 'rejected'; readonly reason: string }

export type W6LedgerLoadResult<Kind extends string = WorldDomainEventKind> =
  | { readonly status: 'loaded'; readonly metadata: W6WorldMetadata; readonly ledger: EventLedger<Kind> }
  | { readonly status: 'missing' }
  | { readonly status: 'rejected'; readonly reason: string }

export interface IndexedDbWorldRuntimeOptions {
  readonly factory?: IDBFactory | null
  readonly databaseName?: string
  readonly allocateWorldId?: () => WorldId
  readonly registry?: EventRegistry<WorldDomainEventKind>
  readonly projector?: WorldProjectionPort<WorldDomainEventKind>
}

function validCursor(value: unknown): value is StreamCursor {
  if (!value || typeof value !== 'object') return false
  const cursor = value as Record<string, unknown>
  if (cursor.kind === 'genesis') return cursor.seq === 0 && Object.keys(cursor).every(key => key === 'kind' || key === 'seq')
  return cursor.kind === 'event' && Number.isSafeInteger(cursor.seq) && Number(cursor.seq) > 0
    && typeof cursor.eventId === 'string' && cursor.eventId.trim().length > 0
    && Object.keys(cursor).every(key => key === 'kind' || key === 'seq' || key === 'eventId')
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function sameTime(left: WorldTime, right: WorldTime): boolean {
  return left.day === right.day && left.period === right.period
}

function cursorFor(head: number, events: readonly LedgerEvent[]): StreamCursor {
  if (head === 0) return Object.freeze({ kind: 'genesis', seq: 0 })
  const event = events[head - 1]
  if (!event || event.seq !== head) throw new Error('w6-runtime-event-head-invalid')
  return Object.freeze({ kind: 'event', seq: head, eventId: event.id })
}

function isReservation(value: unknown): value is W6OwnerWorldReservation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.schemaVersion === 1
    && typeof row.ownerId === 'string' && row.ownerId.trim().length > 0
    && typeof row.worldId === 'string' && row.worldId.trim().length > 0
    && typeof row.clientRequestId === 'string' && row.clientRequestId.trim().length > 0
    && isValidWorldTime(row.worldStartTime as WorldTime)
    && ['reserved', 'genesis-event-committed', 'binding-finalized'].includes(String(row.state))
}

function isWorldMetadata(value: unknown): value is W6WorldMetadata {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.schemaVersion === 1
    && typeof row.worldId === 'string' && row.worldId.trim().length > 0
    && isValidWorldTime(row.worldStartTime as WorldTime)
    && Number.isSafeInteger(row.head) && Number(row.head) >= 0
    && validCursor(row.streamHead)
    && Number(row.head) === (row.streamHead as StreamCursor).seq
}

function canonicalComparable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalComparable).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalComparable(record[key])}`).join(',')}}`
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('w6-indexeddb-request-failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('w6-indexeddb-transaction-aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('w6-indexeddb-transaction-failed'))
  })
}

function defaultWorldId(): WorldId {
  if (!globalThis.crypto?.randomUUID) throw new Error('w6-world-id-allocator-unavailable')
  return `world:w6:${globalThis.crypto.randomUUID()}` as WorldId
}

export class IndexedDbWorldRuntime implements OwnerWorldReservationPort, DurableWorldLedgerPort {
  private database: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory | null
  private readonly databaseName: string
  private readonly allocateWorldId: () => WorldId
  readonly registry: EventRegistry<WorldDomainEventKind>
  private readonly configuredProjector: WorldProjectionPort<WorldDomainEventKind> | null

  constructor(options: IndexedDbWorldRuntimeOptions = {}) {
    this.factory = options.factory === undefined ? globalThis.indexedDB ?? null : options.factory
    this.databaseName = options.databaseName ?? DATABASE_NAME
    this.allocateWorldId = options.allocateWorldId ?? defaultWorldId
    this.registry = options.registry ?? createWorldDomainEventRegistry()
    if (!this.registry.frozen || !Object.isFrozen(this.registry)) throw new Error('w6-runtime-registry-not-frozen')
    this.configuredProjector = options.projector ?? null
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('w6-indexeddb-unavailable'))
    if (this.database) return this.database
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(OWNER_RESERVATIONS)) {
          const store = db.createObjectStore(OWNER_RESERVATIONS, { keyPath: 'ownerId' })
          store.createIndex('worldId', 'worldId', { unique: true })
          store.createIndex('ownerRequest', ['ownerId', 'clientRequestId'], { unique: true })
        }
        if (!db.objectStoreNames.contains(WORLD_METADATA)) db.createObjectStore(WORLD_METADATA, { keyPath: 'worldId' })
        if (!db.objectStoreNames.contains(WORLD_EVENTS)) {
          const store = db.createObjectStore(WORLD_EVENTS, { keyPath: ['worldId', 'seq'] })
          store.createIndex('worldId', 'worldId', { unique: false })
        }
        if (!db.objectStoreNames.contains(IDEMPOTENCY_RECORDS)) {
          const store = db.createObjectStore(IDEMPOTENCY_RECORDS, { keyPath: ['worldId', 'key'] })
          store.createIndex('worldId', 'worldId', { unique: false })
          store.createIndex('worldEvent', ['worldId', 'eventId'], { unique: true })
        }
        if (!db.objectStoreNames.contains(OWNER_PERSON_BINDINGS)) {
          const store = db.createObjectStore(OWNER_PERSON_BINDINGS, { keyPath: 'ownerId' })
          store.createIndex('worldId', 'worldId', { unique: true })
          store.createIndex('worldPerson', ['worldId', 'personId'], { unique: true })
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
      request.onerror = () => reject(request.error ?? new Error('w6-indexeddb-open-failed'))
      request.onblocked = () => reject(new Error('w6-indexeddb-open-blocked'))
    }).catch(error => {
      this.database = null
      throw error
    })
    this.database = opening
    return opening
  }

  async reserveWorld(
    ownerId: OwnerId,
    clientRequestId: string,
    worldStartTime: WorldTime,
  ): Promise<W6ReservationResult> {
    if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.length > 256
      || typeof clientRequestId !== 'string' || !clientRequestId.trim() || clientRequestId.length > 256
      || !isValidWorldTime(worldStartTime)) return { status: 'rejected', reason: 'w6-reservation-input-invalid' }
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', reason: 'w6-indexeddb-unavailable' } }

    return new Promise(resolve => {
      let result: W6ReservationResult = { status: 'rejected', reason: 'w6-reservation-transaction-failed' }
      let abortReason: W6ReservationResult | null = null
      let tx: IDBTransaction
      try { tx = db.transaction([OWNER_RESERVATIONS, WORLD_METADATA], 'readwrite') } catch {
        resolve({ status: 'rejected', reason: 'w6-reservation-transaction-unavailable' })
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => resolve(abortReason ?? { status: 'rejected', reason: 'w6-reservation-transaction-aborted' })
      tx.onerror = () => { /* onabort resolves the fail-closed result */ }

      const owners = tx.objectStore(OWNER_RESERVATIONS)
      const worlds = tx.objectStore(WORLD_METADATA)
      const ownerRead = owners.get(ownerId)
      ownerRead.onerror = () => { abortReason = { status: 'rejected', reason: 'w6-reservation-owner-read-failed' }; try { tx.abort() } catch {} }
      ownerRead.onsuccess = () => {
        const existing = ownerRead.result as unknown
        if (existing !== undefined) {
          if (!isReservation(existing)) {
            abortReason = { status: 'rejected', reason: 'w6-reservation-record-corrupt' }
            try { tx.abort() } catch {}
            return
          }
          result = existing.clientRequestId === clientRequestId && sameTime(existing.worldStartTime, worldStartTime)
            ? { status: 'reserved', reservation: existing }
            : { status: 'conflict', reason: existing.clientRequestId === clientRequestId
              ? 'reservation-request-conflict'
              : 'owner-already-reserved' }
          return
        }

        let worldId: WorldId
        try {
          worldId = this.allocateWorldId()
          if (typeof worldId !== 'string' || !worldId.trim() || worldId.length > 256) throw new Error('world-id-invalid')
        } catch {
          abortReason = { status: 'rejected', reason: 'w6-world-id-allocation-failed' }
          try { tx.abort() } catch {}
          return
        }
        const metadataRead = worlds.get(worldId)
        metadataRead.onerror = () => { abortReason = { status: 'rejected', reason: 'w6-reservation-world-read-failed' }; try { tx.abort() } catch {} }
        metadataRead.onsuccess = () => {
          if (metadataRead.result !== undefined) {
            abortReason = { status: 'conflict', reason: 'world-id-collision' }
            try { tx.abort() } catch {}
            return
          }
          const reservation: W6OwnerWorldReservation = Object.freeze({
            schemaVersion: 1,
            ownerId,
            worldId,
            clientRequestId,
            worldStartTime: Object.freeze({ ...worldStartTime }),
            state: 'reserved',
          })
          const metadata: W6WorldMetadata = Object.freeze({
            schemaVersion: 1,
            worldId,
            worldStartTime: Object.freeze({ ...worldStartTime }),
            head: 0,
            streamHead: Object.freeze({ kind: 'genesis', seq: 0 }),
          })
          result = { status: 'reserved', reservation }
          owners.add(reservation)
          worlds.add(metadata)
        }
      }
    })
  }

  async readReservation(ownerId: OwnerId): Promise<W6OwnerWorldReservation | null> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return null }
    try {
      const tx = db.transaction(OWNER_RESERVATIONS, 'readonly')
      const done = transactionDone(tx)
      const raw = await requestValue(tx.objectStore(OWNER_RESERVATIONS).get(ownerId))
      await done
      if (raw === undefined) return null
      return isReservation(raw) ? raw : null
    } catch { return null }
  }

  async loadLedger(
    worldId: WorldId,
  ): Promise<W6LedgerLoadResult<WorldDomainEventKind>> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', reason: 'w6-indexeddb-unavailable' } }
    try {
      const tx = db.transaction([WORLD_METADATA, WORLD_EVENTS, IDEMPOTENCY_RECORDS], 'readonly')
      const done = transactionDone(tx)
      const metaRequest = tx.objectStore(WORLD_METADATA).get(worldId)
      const eventsRequest = tx.objectStore(WORLD_EVENTS).index('worldId').getAll(worldId)
      const idempotencyRequest = tx.objectStore(IDEMPOTENCY_RECORDS).index('worldId').getAll(worldId)
      const [rawMetadata, rawEvents, rawIdempotency] = await Promise.all([
        requestValue(metaRequest), requestValue(eventsRequest), requestValue(idempotencyRequest),
      ])
      await done
      if (rawMetadata === undefined) return { status: 'missing' }
      if (!isWorldMetadata(rawMetadata) || rawMetadata.worldId !== worldId) {
        return { status: 'rejected', reason: 'w6-world-metadata-corrupt' }
      }
      const metadata = rawMetadata
      const eventRows = (rawEvents as unknown[]).sort((left, right) => {
        const a = left as Record<string, unknown>, b = right as Record<string, unknown>
        return Number(a.seq) - Number(b.seq)
      })
      const events: LedgerEvent<WorldDomainEventKind>[] = []
      for (let index = 0; index < eventRows.length; index += 1) {
        const row = eventRows[index] as Record<string, unknown>
        if (row.worldId !== worldId || row.seq !== index + 1 || !row.event || typeof row.event !== 'object') {
          return { status: 'rejected', reason: 'w6-world-event-sequence-corrupt' }
        }
        const event = row.event as LedgerEvent<Kind>
        if (event.worldId !== worldId || event.seq !== row.seq || event.id !== `evt:${worldId}:${row.seq}`) {
          return { status: 'rejected', reason: 'w6-world-event-envelope-corrupt' }
        }
        events.push(event)
      }
      if (events.length !== metadata.head || !sameCursor(metadata.streamHead, cursorFor(metadata.head, events))) {
        return { status: 'rejected', reason: 'w6-world-head-mismatch' }
      }
      const restored = await restoreEventLedgerFromVerifiedEvents<WorldDomainEventKind>(worldId, events, this.registry)
      if (restored.status !== 'restored') return { status: 'rejected', reason: restored.issue }
      const persistedRecords = rawIdempotency as StoredIdempotencyRecord[]
      if (persistedRecords.length !== restored.ledger.idempotency.length) {
        return { status: 'rejected', reason: 'w6-idempotency-count-mismatch' }
      }
      const byEvent = new Map(persistedRecords.map(record => [record.eventId, record]))
      for (const record of restored.ledger.idempotency) {
        const stored = byEvent.get(record.eventId)
        if (!stored || stored.worldId !== worldId || stored.key !== record.key || stored.fingerprint !== record.fingerprint) {
          return { status: 'rejected', reason: 'w6-idempotency-record-mismatch' }
        }
      }
      return { status: 'loaded', metadata, ledger: restored.ledger }
    } catch {
      return { status: 'rejected', reason: 'w6-ledger-load-failed' }
    }
  }

  createWorldAdapter(worldId: WorldId, worldStartTime: WorldTime): {
    readonly commands: WorldCommandPort
    readonly queries: WorldQueryPort
    readonly projector: WorldProjectionPort<WorldDomainEventKind>
    readLedger(): Promise<EventLedger<WorldDomainEventKind> | null>
  } {
    if (!isValidWorldTime(worldStartTime)) throw new Error('w6-runtime-start-time-invalid')
    const projector = this.configuredProjector ?? createWorldAggregateProjector({
      registry: this.registry,
      worldStartTime,
    })
    const listeners = new Set<(aggregate: WorldAggregate) => void>()
    const readAggregate = async (): Promise<WorldAggregate | null> => {
      const loaded = await this.loadLedger(worldId)
      if (loaded.status !== 'loaded' || !sameTime(loaded.metadata.worldStartTime, worldStartTime)) return null
      const projected = await projector.rebuild({
        ledger: loaded.ledger,
        target: loaded.metadata.streamHead,
      })
      return projected.status === 'valid' ? projected.aggregate : null
    }
    const submit = async (request: Parameters<WorldCommandPort['submit']>[0]): Promise<WorldCommandReceipt> => {
      const loaded = await this.loadLedger(worldId)
      if (loaded.status !== 'loaded' || !sameTime(loaded.metadata.worldStartTime, worldStartTime)) {
        return {
          status: 'rejected', worldId: request.worldId, clientRequestId: request.clientRequestId,
          reason: loaded.status === 'missing' ? 'w6-world-not-found'
            : loaded.status === 'rejected' ? loaded.reason : 'w6-world-start-time-mismatch',
          streamHead: { kind: 'genesis', seq: 0 },
        }
      }
      const projected = await projector.rebuild({ ledger: loaded.ledger, target: loaded.metadata.streamHead })
      if (projected.status !== 'valid') {
        return {
          status: 'rejected', worldId: request.worldId, clientRequestId: request.clientRequestId,
          reason: projected.issues.map(issue => issue.code).join(','),
          streamHead: loaded.metadata.streamHead,
        }
      }
      const prepared = await prepareWorldCommand({
        ledger: loaded.ledger, aggregate: projected.aggregate, request,
        registry: this.registry, projector,
      })
      if (prepared.status !== 'prepared') return prepared.receipt
      const commit = await this.commitPrepared(prepared.event, prepared.idempotencyRecord, request.expectedHead)
      if (commit === 'committed') {
        for (const listener of listeners) {
          try { listener(prepared.aggregate) } catch { /* committed facts cannot be rolled back by listeners */ }
        }
        return { status: 'committed', ...prepared.receipt }
      }
      if (commit === 'retry') {
        const refreshed = await this.loadLedger(worldId)
        if (refreshed.status !== 'loaded') {
          return { status: 'rejected', worldId, clientRequestId: request.clientRequestId,
            reason: refreshed.status === 'missing' ? 'w6-world-not-found' : refreshed.reason,
            streamHead: loaded.metadata.streamHead }
        }
        const refreshedProjection = await projector.rebuild({
          ledger: refreshed.ledger, target: refreshed.metadata.streamHead,
        })
        if (refreshedProjection.status !== 'valid') {
          return { status: 'rejected', worldId, clientRequestId: request.clientRequestId,
            reason: refreshedProjection.issues.map(issue => issue.code).join(','),
            streamHead: refreshed.metadata.streamHead }
        }
        const retried = await prepareWorldCommand({
          ledger: refreshed.ledger, aggregate: refreshedProjection.aggregate, request,
          registry: this.registry, projector,
        })
        if (retried.status !== 'prepared') return retried.receipt
        return {
          status: 'conflict', worldId, clientRequestId: request.clientRequestId,
          reason: 'w6-world-head-conflict', streamHead: refreshed.metadata.streamHead,
        }
      }
      return {
        status: 'rejected', worldId, clientRequestId: request.clientRequestId,
        reason: 'w6-ledger-commit-failed', streamHead: loaded.metadata.streamHead,
      }
    }
    const commandQueue: WorldCommandPort = { submit }
    const queries: WorldQueryPort = {
      read: async targetWorldId => targetWorldId === worldId ? readAggregate() : null,
      subscribe: (targetWorldId, listener) => {
        if (targetWorldId !== worldId) return () => undefined
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    return Object.freeze({
      commands: commandQueue,
      queries,
      projector,
      readLedger: async () => {
        const loaded = await this.loadLedger(worldId)
        return loaded.status === 'loaded' ? loaded.ledger : null
      },
    })
  }

  private async commitPrepared(
    event: LedgerEvent<WorldDomainEventKind>,
    idempotency: LedgerIdempotencyRecord,
    expectedHead: StreamCursor,
  ): Promise<'committed' | 'retry' | 'rejected'> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return 'rejected' }
    return new Promise(resolve => {
      let outcome: 'committed' | 'retry' | 'rejected' = 'rejected'
      let tx: IDBTransaction
      try { tx = db.transaction([WORLD_METADATA, WORLD_EVENTS, IDEMPOTENCY_RECORDS], 'readwrite') } catch {
        resolve('rejected')
        return
      }
      tx.oncomplete = () => resolve('committed')
      tx.onabort = () => resolve(outcome)
      tx.onerror = () => { /* onabort resolves */ }
      let metadataReady = false
      let idempotencyReady = false
      let metadata: unknown
      let existingIdempotency: unknown
      const tryCommit = () => {
        if (!metadataReady || !idempotencyReady) return
        if (!isWorldMetadata(metadata) || metadata.worldId !== event.worldId) {
          outcome = 'rejected'
          try { tx.abort() } catch {}
          return
        }
        if (existingIdempotency !== undefined || metadata.head !== event.seq - 1
          || !sameCursor(metadata.streamHead, expectedHead)) {
          outcome = 'retry'
          try { tx.abort() } catch {}
          return
        }
        try {
          tx.objectStore(WORLD_EVENTS).add({ worldId: event.worldId, seq: event.seq, event } satisfies StoredWorldEvent<WorldDomainEventKind>)
          tx.objectStore(IDEMPOTENCY_RECORDS).add({
            worldId: event.worldId, key: idempotency.key,
            eventId: idempotency.eventId, fingerprint: idempotency.fingerprint,
          } satisfies StoredIdempotencyRecord)
          const nextMetadata: W6WorldMetadata = Object.freeze({
            ...metadata,
            head: event.seq,
            streamHead: Object.freeze({ kind: 'event', seq: event.seq, eventId: event.id }),
          })
          tx.objectStore(WORLD_METADATA).put(nextMetadata)
        } catch {
          outcome = 'rejected'
          try { tx.abort() } catch {}
        }
      }
      const metaRequest = tx.objectStore(WORLD_METADATA).get(event.worldId)
      const idempotencyRequest = tx.objectStore(IDEMPOTENCY_RECORDS).get([event.worldId, idempotency.key])
      metaRequest.onsuccess = () => { metadata = metaRequest.result; metadataReady = true; tryCommit() }
      idempotencyRequest.onsuccess = () => { existingIdempotency = idempotencyRequest.result; idempotencyReady = true; tryCommit() }
      metaRequest.onerror = () => { outcome = 'rejected'; try { tx.abort() } catch {} }
      idempotencyRequest.onerror = () => { outcome = 'rejected'; try { tx.abort() } catch {} }
    })
  }
}
