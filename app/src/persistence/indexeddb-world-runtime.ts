/**
 * W6-I-3B — independent IndexedDB runtime persistence.
 *
 * This adapter owns W6 reservations and canonical event persistence. It does
 * not import or mutate the W5 SavePackage / SaveRepository implementation.
 */
import {
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
import type {
  OwnerWorldReservationPort, DurableWorldLedgerPort, OwnerWorldGenesisCheckpoint,
  OwnerPersonBinding, GenesisCheckpointResult, OwnerPersonBindingResult,
} from '../application/world/durable-ports'
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
  readonly genesis?: OwnerWorldGenesisCheckpoint
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
    && (row.genesis === undefined ? row.state === 'reserved' : isGenesisCheckpoint(row.genesis))
    && (row.state === 'reserved' ? row.genesis === undefined : row.genesis !== undefined)
}

function isGenesisCheckpoint(value: unknown): value is OwnerWorldGenesisCheckpoint {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.personId === 'string' && row.personId.trim().length > 0
    && typeof row.eventId === 'string' && row.eventId.trim().length > 0
    && validCursor(row.streamHead) && row.streamHead.kind === 'event'
}

function isOwnerPersonBinding(value: unknown): value is OwnerPersonBinding {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.schemaVersion === 1
    && typeof row.ownerId === 'string' && row.ownerId.trim().length > 0
    && typeof row.worldId === 'string' && row.worldId.trim().length > 0
    && typeof row.personId === 'string' && row.personId.trim().length > 0
    && typeof row.genesisEventId === 'string' && row.genesisEventId.trim().length > 0
    && validCursor(row.verifiedStreamHead) && row.verifiedStreamHead.kind === 'event'
}

function sameGenesisCheckpoint(left: OwnerWorldGenesisCheckpoint | undefined, right: OwnerWorldGenesisCheckpoint): boolean {
  return !!left && left.personId === right.personId && left.eventId === right.eventId
    && sameCursor(left.streamHead, right.streamHead)
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
          const metadataRead = worlds.get(existing.worldId)
          metadataRead.onerror = () => { abortReason = { status: 'rejected', reason: 'w6-reservation-world-read-failed' }; try { tx.abort() } catch {} }
          metadataRead.onsuccess = () => {
            if (!isWorldMetadata(metadataRead.result) || metadataRead.result.worldId !== existing.worldId
              || !sameTime(metadataRead.result.worldStartTime, existing.worldStartTime)) {
              abortReason = { status: 'rejected', reason: 'w6-reservation-world-metadata-corrupt' }
              try { tx.abort() } catch {}
              return
            }
            result = existing.clientRequestId === clientRequestId && sameTime(existing.worldStartTime, worldStartTime)
              ? { status: 'reserved', reservation: existing }
              : { status: 'conflict', reason: existing.clientRequestId === clientRequestId
                ? 'reservation-request-conflict'
                : 'owner-already-reserved' }
          }
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
    return new Promise(resolve => {
      let result: W6OwnerWorldReservation | null = null
      let tx: IDBTransaction
      try { tx = db.transaction([OWNER_RESERVATIONS, WORLD_METADATA], 'readonly') } catch {
        resolve(null)
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => resolve(null)
      tx.onerror = () => { /* onabort resolves */ }
      const ownerRequest = tx.objectStore(OWNER_RESERVATIONS).get(ownerId)
      ownerRequest.onsuccess = () => {
        const raw = ownerRequest.result as unknown
        if (!isReservation(raw)) return
        const metadataRequest = tx.objectStore(WORLD_METADATA).get(raw.worldId)
        metadataRequest.onsuccess = () => {
          result = isWorldMetadata(metadataRequest.result)
            && metadataRequest.result.worldId === raw.worldId
            && sameTime(metadataRequest.result.worldStartTime, raw.worldStartTime)
            ? raw : null
        }
        metadataRequest.onerror = () => { result = null }
      }
      ownerRequest.onerror = () => { result = null }
    })
  }

  private async verifyGenesisCheckpoint(
    ownerId: OwnerId,
    clientRequestId: string,
    checkpoint: OwnerWorldGenesisCheckpoint,
  ): Promise<W6OwnerWorldReservation | null> {
    if (!isGenesisCheckpoint(checkpoint)) return null
    const reservation = await this.readReservation(ownerId)
    if (!reservation || reservation.clientRequestId !== clientRequestId
      || (reservation.state !== 'reserved' && !sameGenesisCheckpoint(reservation.genesis, checkpoint))) return null
    const loaded = await this.loadLedger(reservation.worldId)
    if (loaded.status !== 'loaded') return null
    const event = loaded.ledger.events.find(item => item.id === checkpoint.eventId)
    if (!event || event.worldId !== reservation.worldId || event.seq !== checkpoint.streamHead.seq
      || event.source !== 'player-command' || event.actor !== ownerId
      || event.intentKind !== 'person.create' || event.kind !== 'person.created'
      || event.clientRequestId !== reservation.clientRequestId
      || !sameTime(event.requestWorldTime, reservation.worldStartTime)) return null
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return null
    const payload = event.payload as Record<string, unknown>
    if (!payload.person || typeof payload.person !== 'object' || Array.isArray(payload.person)
      || !payload.origin || typeof payload.origin !== 'object' || Array.isArray(payload.origin)) return null
    const person = payload.person as Record<string, unknown>
    const origin = payload.origin as Record<string, unknown>
    if (person.id !== checkpoint.personId || origin.kind !== 'player-character') return null
    const target: StreamCursor = Object.freeze({ kind: 'event', seq: event.seq, eventId: event.id })
    if (!sameCursor(target, checkpoint.streamHead)) return null
    const projector = this.configuredProjector ?? createWorldAggregateProjector({
      registry: this.registry, worldStartTime: reservation.worldStartTime,
    })
    const projected = await projector.rebuild({ ledger: loaded.ledger, target })
    if (projected.status !== 'valid' || projected.aggregate.playerPersonId !== checkpoint.personId
      || !projected.aggregate.persons.some(item => item.id === checkpoint.personId)) return null
    const playerOrigins = projected.aggregate.personOrigins.filter(item => item.origin.kind === 'player-character')
    if (playerOrigins.length !== 1 || playerOrigins[0]?.person !== checkpoint.personId) return null
    return reservation
  }

  async markGenesisEventCommitted(
    ownerId: OwnerId,
    clientRequestId: string,
    checkpoint: OwnerWorldGenesisCheckpoint,
  ): Promise<GenesisCheckpointResult> {
    const verified = await this.verifyGenesisCheckpoint(ownerId, clientRequestId, checkpoint)
    if (!verified) return { status: 'rejected', reason: 'w6-genesis-checkpoint-not-canonical' }
    let db: IDBDatabase
    try { db = await this.open() } catch {
      return { status: 'rejected', reason: 'w6-indexeddb-unavailable' }
    }
    return new Promise(resolve => {
      let result: GenesisCheckpointResult = { status: 'rejected', reason: 'w6-genesis-checkpoint-transaction-failed' }
      let tx: IDBTransaction
      try { tx = db.transaction([OWNER_RESERVATIONS, WORLD_METADATA], 'readwrite') } catch {
        resolve({ status: 'rejected', reason: 'w6-genesis-checkpoint-transaction-unavailable' })
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => resolve(result)
      tx.onerror = () => { /* onabort resolves */ }
      const owners = tx.objectStore(OWNER_RESERVATIONS)
      const worlds = tx.objectStore(WORLD_METADATA)
      let ownerReady = false
      let worldReady = false
      let current: unknown
      let metadata: unknown
      const commit = () => {
        if (!ownerReady || !worldReady) return
        if (!isReservation(current) || !isWorldMetadata(metadata)
          || current.ownerId !== ownerId || current.worldId !== verified.worldId
          || current.clientRequestId !== clientRequestId || metadata.worldId !== current.worldId
          || !sameTime(metadata.worldStartTime, current.worldStartTime)
          || metadata.head < checkpoint.streamHead.seq) {
          result = { status: 'rejected', reason: 'w6-genesis-reservation-mismatch' }
          try { tx.abort() } catch {}
          return
        }
        if (current.state !== 'reserved') {
          result = sameGenesisCheckpoint(current.genesis, checkpoint)
            ? { status: 'already-committed', reservation: current }
            : { status: 'rejected', reason: 'w6-genesis-checkpoint-conflict' }
          if (result.status === 'rejected') { try { tx.abort() } catch {} }
          return
        }
        const next: W6OwnerWorldReservation = Object.freeze({
          ...current, state: 'genesis-event-committed', genesis: Object.freeze({
            personId: checkpoint.personId, eventId: checkpoint.eventId,
            streamHead: Object.freeze({ ...checkpoint.streamHead }),
          }),
        })
        owners.put(next)
        result = { status: 'committed', reservation: next }
      }
      const ownerRequest = owners.get(ownerId)
      const worldRequest = worlds.get(verified.worldId)
      ownerRequest.onsuccess = () => { current = ownerRequest.result; ownerReady = true; commit() }
      worldRequest.onsuccess = () => { metadata = worldRequest.result; worldReady = true; commit() }
      ownerRequest.onerror = () => { result = { status: 'rejected', reason: 'w6-genesis-owner-read-failed' }; try { tx.abort() } catch {} }
      worldRequest.onerror = () => { result = { status: 'rejected', reason: 'w6-genesis-world-read-failed' }; try { tx.abort() } catch {} }
    })
  }

  async finalizeOwnerPersonBinding(
    ownerId: OwnerId,
    clientRequestId: string,
    checkpoint: OwnerWorldGenesisCheckpoint,
  ): Promise<OwnerPersonBindingResult> {
    const verified = await this.verifyGenesisCheckpoint(ownerId, clientRequestId, checkpoint)
    if (!verified || verified.state === 'reserved') {
      return { status: 'rejected', reason: 'w6-genesis-checkpoint-not-committed' }
    }
    let db: IDBDatabase
    try { db = await this.open() } catch {
      return { status: 'rejected', reason: 'w6-indexeddb-unavailable' }
    }
    return new Promise(resolve => {
      let result: OwnerPersonBindingResult = { status: 'rejected', reason: 'w6-owner-person-binding-transaction-failed' }
      let tx: IDBTransaction
      try { tx = db.transaction([OWNER_RESERVATIONS, OWNER_PERSON_BINDINGS], 'readwrite') } catch {
        resolve({ status: 'rejected', reason: 'w6-owner-person-binding-transaction-unavailable' })
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => resolve(result)
      tx.onerror = () => { /* onabort resolves */ }
      const owners = tx.objectStore(OWNER_RESERVATIONS)
      const bindings = tx.objectStore(OWNER_PERSON_BINDINGS)
      let ownerReady = false
      let bindingReady = false
      let current: unknown
      let existing: unknown
      const commit = () => {
        if (!ownerReady || !bindingReady) return
        if (!isReservation(current) || current.ownerId !== ownerId
          || current.clientRequestId !== clientRequestId || current.worldId !== verified.worldId
          || !sameGenesisCheckpoint(current.genesis, checkpoint)) {
          result = { status: 'rejected', reason: 'w6-owner-person-reservation-mismatch' }
          try { tx.abort() } catch {}
          return
        }
        if (existing !== undefined) {
          if (isOwnerPersonBinding(existing) && existing.ownerId === ownerId
            && existing.worldId === current.worldId && existing.personId === checkpoint.personId
            && existing.genesisEventId === checkpoint.eventId
            && sameCursor(existing.verifiedStreamHead, checkpoint.streamHead)
            && current.state === 'binding-finalized') {
            result = { status: 'already-finalized', binding: existing }
            return
          }
          result = { status: 'rejected', reason: 'w6-owner-person-binding-conflict' }
          try { tx.abort() } catch {}
          return
        }
        if (current.state !== 'genesis-event-committed') {
          result = { status: 'rejected', reason: 'w6-owner-person-state-not-ready' }
          try { tx.abort() } catch {}
          return
        }
        const binding: OwnerPersonBinding = Object.freeze({
          schemaVersion: 1, ownerId, worldId: current.worldId,
          personId: checkpoint.personId, genesisEventId: checkpoint.eventId,
          verifiedStreamHead: Object.freeze({ ...checkpoint.streamHead }),
        })
        const next: W6OwnerWorldReservation = Object.freeze({ ...current, state: 'binding-finalized' })
        bindings.add(binding)
        owners.put(next)
        result = { status: 'finalized', binding }
      }
      const ownerRequest = owners.get(ownerId)
      const bindingRequest = bindings.get(ownerId)
      ownerRequest.onsuccess = () => { current = ownerRequest.result; ownerReady = true; commit() }
      bindingRequest.onsuccess = () => { existing = bindingRequest.result; bindingReady = true; commit() }
      ownerRequest.onerror = () => { result = { status: 'rejected', reason: 'w6-owner-person-owner-read-failed' }; try { tx.abort() } catch {} }
      bindingRequest.onerror = () => { result = { status: 'rejected', reason: 'w6-owner-person-binding-read-failed' }; try { tx.abort() } catch {} }
    })
  }

  async readOwnerPersonBinding(ownerId: OwnerId): Promise<OwnerPersonBinding | null> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return null }
    return new Promise(resolve => {
      let binding: unknown
      let reservation: unknown
      let tx: IDBTransaction
      try { tx = db.transaction([OWNER_RESERVATIONS, OWNER_PERSON_BINDINGS], 'readonly') } catch {
        resolve(null)
        return
      }
      tx.oncomplete = () => {
        if (!isOwnerPersonBinding(binding) || !isReservation(reservation)
          || reservation.state !== 'binding-finalized' || reservation.ownerId !== ownerId
          || reservation.worldId !== binding.worldId || !sameGenesisCheckpoint(reservation.genesis, {
            personId: binding.personId, eventId: binding.genesisEventId,
            streamHead: binding.verifiedStreamHead,
          })) { resolve(null); return }
        resolve(binding)
      }
      tx.onabort = () => resolve(null)
      tx.onerror = () => { /* onabort resolves */ }
      const bindingRequest = tx.objectStore(OWNER_PERSON_BINDINGS).get(ownerId)
      const reservationRequest = tx.objectStore(OWNER_RESERVATIONS).get(ownerId)
      bindingRequest.onsuccess = () => { binding = bindingRequest.result }
      reservationRequest.onsuccess = () => { reservation = reservationRequest.result }
      bindingRequest.onerror = () => { binding = null }
      reservationRequest.onerror = () => { reservation = null }
    })
  }

  async loadLedger(
    worldId: WorldId,
  ): Promise<W6LedgerLoadResult<WorldDomainEventKind>> {
    let db: IDBDatabase
    try { db = await this.open() } catch { return { status: 'rejected', reason: 'w6-indexeddb-unavailable' } }
    try {
      const tx = db.transaction([OWNER_RESERVATIONS, WORLD_METADATA, WORLD_EVENTS, IDEMPOTENCY_RECORDS], 'readonly')
      const done = transactionDone(tx)
      const ownerReservationsRequest = tx.objectStore(OWNER_RESERVATIONS).index('worldId').getAll(worldId)
      const metaRequest = tx.objectStore(WORLD_METADATA).get(worldId)
      const eventsRequest = tx.objectStore(WORLD_EVENTS).index('worldId').getAll(worldId)
      const idempotencyRequest = tx.objectStore(IDEMPOTENCY_RECORDS).index('worldId').getAll(worldId)
      const [rawOwnerReservations, rawMetadata, rawEvents, rawIdempotency] = await Promise.all([
        requestValue(ownerReservationsRequest), requestValue(metaRequest), requestValue(eventsRequest), requestValue(idempotencyRequest),
      ])
      await done
      if (rawMetadata === undefined) {
        return rawOwnerReservations.length === 0 && rawEvents.length === 0 && rawIdempotency.length === 0
          ? { status: 'missing' }
          : { status: 'rejected', reason: 'w6-world-metadata-missing-with-residual-records' }
      }
      if (!isWorldMetadata(rawMetadata) || rawMetadata.worldId !== worldId) {
        return { status: 'rejected', reason: 'w6-world-metadata-corrupt' }
      }
      const metadata = rawMetadata
      if (rawOwnerReservations.length !== 1 || !isReservation(rawOwnerReservations[0])
        || rawOwnerReservations[0].worldId !== worldId
        || !sameTime(rawOwnerReservations[0].worldStartTime, metadata.worldStartTime)) {
        return { status: 'rejected', reason: 'w6-owner-reservation-world-mismatch' }
      }
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
        const event = row.event as LedgerEvent<WorldDomainEventKind>
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
      const projector = this.configuredProjector ?? createWorldAggregateProjector({
        registry: this.registry,
        worldStartTime: metadata.worldStartTime,
      })
      const projected = await projector.rebuild({ ledger: restored.ledger, target: metadata.streamHead })
      if (projected.status !== 'valid') {
        return { status: 'rejected', reason: projected.issues.map(issue => issue.code).join(',') }
      }
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
      try { tx = db.transaction([OWNER_RESERVATIONS, WORLD_METADATA, WORLD_EVENTS, IDEMPOTENCY_RECORDS], 'readwrite') } catch {
        resolve('rejected')
        return
      }
      tx.oncomplete = () => resolve('committed')
      tx.onabort = () => resolve(outcome)
      tx.onerror = () => { /* onabort resolves */ }
      let metadataReady = false
      let idempotencyReady = false
      let ownerReservationReady = false
      let metadata: unknown
      let existingIdempotency: unknown
      let ownerReservations: unknown
      const tryCommit = () => {
        if (!metadataReady || !idempotencyReady || !ownerReservationReady) return
        if (!isWorldMetadata(metadata) || metadata.worldId !== event.worldId
          || !Array.isArray(ownerReservations) || ownerReservations.length !== 1
          || !isReservation(ownerReservations[0]) || ownerReservations[0].worldId !== event.worldId
          || !sameTime(ownerReservations[0].worldStartTime, metadata.worldStartTime)) {
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
      const ownerRequest = tx.objectStore(OWNER_RESERVATIONS).index('worldId').getAll(event.worldId)
      metaRequest.onsuccess = () => { metadata = metaRequest.result; metadataReady = true; tryCommit() }
      idempotencyRequest.onsuccess = () => { existingIdempotency = idempotencyRequest.result; idempotencyReady = true; tryCommit() }
      ownerRequest.onsuccess = () => { ownerReservations = ownerRequest.result; ownerReservationReady = true; tryCommit() }
      metaRequest.onerror = () => { outcome = 'rejected'; try { tx.abort() } catch {} }
      idempotencyRequest.onerror = () => { outcome = 'rejected'; try { tx.abort() } catch {} }
      ownerRequest.onerror = () => { outcome = 'rejected'; try { tx.abort() } catch {} }
    })
  }
}
