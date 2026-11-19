import { brandedId } from '../domain/shared/ids'
import type { WorldId } from '../domain/event-ledger'
import type { WorldTime } from '../domain/shared/world-time'
import { ownerIdFromTrustedValue } from '../application/identity/owner'
import { initializeWorldThroughPorts } from '../application/world/initialize'
import type { WorldBootstrapRequest } from '../application/world/bootstrap'
import {
  createWorldTimeAdvancedEventInput,
  toLedgerEventInput,
} from '../application/world/event-catalog'
import { IndexedDbWorldRuntime } from './indexeddb-world-runtime'

function check(name: string, condition: boolean, passed: string[]): void {
  if (!condition) throw new Error(`FAIL ${name}`)
  passed.push(name)
}

function requestFor(worldId: WorldId, start: WorldTime): WorldBootstrapRequest {
  return {
    worldId,
    seed: 'w6-idb-contract-seed',
    scenarioPackId: 'scenario:w6-idb-contract',
    rulesetVersion: 'ruleset:w6-idb-contract-v1',
    contentPackVersion: 'content:w6-idb-contract-v1',
    worldTime: start,
    locationCode: 'fixture-location-only',
    roleSlots: [{ roleCode: 'county-runner', tier: 'county', minCount: 1, maxCount: 1 }],
    namePool: { surnames: ['王'], givenNames: ['守仁'] },
    historicalMinisters: [],
  }
}

export async function runIndexedDbWorldRuntimeContractTests(): Promise<readonly string[]> {
  const passed: string[] = []
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const databaseName = `guanyuan-w6-runtime-contract-${suffix}`
  const start = { day: 1, period: '晨' } as const
  const owner = ownerIdFromTrustedValue(`owner:local:contract-${suffix}`)
  const otherOwner = ownerIdFromTrustedValue(`owner:local:other-${suffix}`)
  const allocatedWorldId = brandedId<'WorldId'>(`world:w6:contract-${suffix}`) as WorldId
  const runtime = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB,
    databaseName,
    allocateWorldId: () => allocatedWorldId,
  })
  const unavailable = new IndexedDbWorldRuntime({ factory: null, databaseName: `${databaseName}-unavailable` })
  const reservationRaceDb = `${databaseName}-reservation-race`
  let reservationWorldCounter = 0
  const allocateReservationWorld = () => brandedId<'WorldId'>(`world:w6:reservation-race-${++reservationWorldCounter}`) as WorldId
  const reservationRuntimeA = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB, databaseName: reservationRaceDb, allocateWorldId: allocateReservationWorld,
  })
  const reservationRuntimeB = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB, databaseName: reservationRaceDb, allocateWorldId: allocateReservationWorld,
  })
  const sameRequestOwner = ownerIdFromTrustedValue(`owner:local:same-request-race-${suffix}`)
  const [sameRaceA, sameRaceB] = await Promise.all([
    reservationRuntimeA.reserveWorld(sameRequestOwner, 'req:parallel-same', start),
    reservationRuntimeB.reserveWorld(sameRequestOwner, 'req:parallel-same', start),
  ])
  check('concurrent same-owner same-request reservations converge on one WorldId',
    sameRaceA.status === 'reserved' && sameRaceB.status === 'reserved'
      && sameRaceA.reservation.worldId === sameRaceB.reservation.worldId, passed)

  const differentRequestOwner = ownerIdFromTrustedValue(`owner:local:different-request-race-${suffix}`)
  const [differentRaceA, differentRaceB] = await Promise.all([
    reservationRuntimeA.reserveWorld(differentRequestOwner, 'req:parallel-a', start),
    reservationRuntimeB.reserveWorld(differentRequestOwner, 'req:parallel-b', start),
  ])
  check('concurrent different requests for one owner yield one reservation and one conflict',
    [differentRaceA.status, differentRaceB.status].sort().join(',')
      === 'conflict,reserved'
      && [differentRaceA, differentRaceB].some(item => item.status === 'conflict'
        && item.reason === 'owner-already-reserved'), passed)

  check('missing IndexedDB fails closed for reservation', (await unavailable.reserveWorld(owner, 'req:unavailable', start)).status === 'rejected', passed)

  const invalidOwner = await runtime.reserveWorld(ownerIdFromTrustedValue('owner:test'), '', start)
  check('empty reservation request is rejected before opening a transaction', invalidOwner.status === 'rejected', passed)

  const first = await runtime.reserveWorld(owner, 'req:first', start)
  check('first owner reservation atomically creates a world at genesis', first.status === 'reserved'
    && first.reservation.worldId === allocatedWorldId && first.reservation.state === 'reserved', passed)
  if (first.status !== 'reserved') throw new Error('w6-contract-first-reservation-missing')

  const readBackReservation = await runtime.readReservation(owner)
  check('reservation recovery read verifies Owner and World metadata together',
    readBackReservation?.worldId === first.reservation.worldId
      && readBackReservation.clientRequestId === first.reservation.clientRequestId, passed)

  const repeated = await runtime.reserveWorld(owner, 'req:first', start)
  check('same owner and request retry returns the exact existing reservation', repeated.status === 'reserved'
    && repeated.reservation.worldId === first.reservation.worldId
    && repeated.reservation.clientRequestId === first.reservation.clientRequestId, passed)

  const differentRequest = await runtime.reserveWorld(owner, 'req:second', start)
  check('same owner cannot reserve a second world under a different request', differentRequest.status === 'conflict'
    && differentRequest.reason === 'owner-already-reserved', passed)

  const colliding = await runtime.reserveWorld(otherOwner, 'req:other', start)
  check('unique world identity collision rejects the second reservation', colliding.status === 'conflict'
    && colliding.reason === 'world-id-collision'
    && await runtime.readReservation(otherOwner) === null, passed)

  const emptyLedger = await runtime.loadLedger(allocatedWorldId)
  check('new reservation loads a verified empty canonical ledger', emptyLedger.status === 'loaded'
    && emptyLedger.ledger.head === 0 && emptyLedger.metadata.streamHead.kind === 'genesis', passed)

  const adapter = runtime.createWorldAdapter(allocatedWorldId, start)
  const bootstrap = await initializeWorldThroughPorts(requestFor(allocatedWorldId, start), adapter)
  check('durable adapter initializes through shared command processor and canonical replay', bootstrap.status === 'ready'
    && bootstrap.createdPersonIds.length === 1, passed)

  const committed = await runtime.loadLedger(allocatedWorldId)
  check('event rows, idempotency rows and world head commit as one durable ledger', committed.status === 'loaded'
    && committed.ledger.head === 2
    && committed.ledger.events.length === 2
    && committed.ledger.idempotency.length === 2
    && committed.metadata.head === 2, passed)
  if (committed.status !== 'loaded') throw new Error('w6-contract-ledger-not-loaded')

  const firstEvent = committed.ledger.events[0]!
  const duplicate = await adapter.commands.submit({
    worldId: allocatedWorldId,
    clientRequestId: firstEvent.clientRequestId,
    actor: firstEvent.actor,
    source: firstEvent.source as 'rule',
    intentKind: firstEvent.intentKind,
    requestedAt: firstEvent.requestWorldTime,
    expectedHead: { kind: 'genesis', seq: 0 },
    payload: firstEvent.payload,
  })
  check('same command retry remains duplicate even with an old expected cursor', duplicate.status === 'duplicate'
    && duplicate.eventId === firstEvent.id, passed)

  const fingerprintConflict = await adapter.commands.submit({
    worldId: allocatedWorldId,
    clientRequestId: firstEvent.clientRequestId,
    actor: firstEvent.actor,
    source: firstEvent.source as 'rule',
    intentKind: firstEvent.intentKind,
    requestedAt: { day: 1, period: '午' },
    expectedHead: { kind: 'genesis', seq: 0 },
    payload: firstEvent.payload,
  })
  const afterFingerprintConflict = await runtime.loadLedger(allocatedWorldId)
  check('same request identity with changed fingerprint conflicts without append', fingerprintConflict.status === 'conflict'
    && afterFingerprintConflict.status === 'loaded'
    && afterFingerprintConflict.ledger.head === 2, passed)

  const restartedRuntime = new IndexedDbWorldRuntime({ factory: globalThis.indexedDB, databaseName })
  const restartedAdapter = restartedRuntime.createWorldAdapter(allocatedWorldId, start)
  const restoredAggregate = await restartedAdapter.queries.read(allocatedWorldId)
  const restoredLedger = await restartedAdapter.readLedger()
  check('new adapter instance reconstructs aggregate and ledger after restart', restoredAggregate?.persons.length === 1
    && restoredAggregate.streamHead.seq === 2 && restoredLedger?.head === 2, passed)

  const current = await restartedAdapter.queries.read(allocatedWorldId)
  if (!current) throw new Error('w6-contract-restored-aggregate-missing')
  const next = { day: 1, period: '午' } as const
  const inputA = toLedgerEventInput(createWorldTimeAdvancedEventInput(start, next, {
    actor: 'system', requestWorldTime: next, clientRequestId: 'w6-idb-concurrent-a',
  }))
  const inputB = toLedgerEventInput(createWorldTimeAdvancedEventInput(start, next, {
    actor: 'system', requestWorldTime: next, clientRequestId: 'w6-idb-concurrent-b',
  }))
  const adapterA = restartedRuntime.createWorldAdapter(allocatedWorldId, start)
  const adapterB = restartedRuntime.createWorldAdapter(allocatedWorldId, start)
  const submit = (target: typeof adapterA, event: typeof inputA) => target.commands.submit({
    worldId: allocatedWorldId,
    clientRequestId: event.clientRequestId,
    actor: event.actor,
    source: 'rule',
    intentKind: event.intentKind,
    requestedAt: event.requestWorldTime,
    expectedHead: current.streamHead,
    payload: event.payload,
  })
  const [raceA, raceB] = await Promise.all([submit(adapterA, inputA), submit(adapterB, inputB)])
  const raceStatuses = [raceA.status, raceB.status].sort().join(',')
  check('cross-adapter compare-and-swap permits exactly one concurrent writer', raceStatuses === 'committed,conflict', passed)
  const afterRace = await restartedRuntime.loadLedger(allocatedWorldId)
  check('losing concurrent writer leaves no orphan event or idempotency row', afterRace.status === 'loaded'
    && afterRace.ledger.head === 3 && afterRace.ledger.idempotency.length === 3, passed)

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(databaseName, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const corrupt = db.transaction('idempotencyRecords', 'readwrite')
  const corruptDone = new Promise<void>((resolve, reject) => {
    corrupt.oncomplete = () => resolve()
    corrupt.onabort = () => reject(corrupt.error ?? new Error('w6-contract-corruption-transaction-aborted'))
    corrupt.onerror = () => reject(corrupt.error ?? new Error('w6-contract-corruption-transaction-failed'))
  })
  corrupt.objectStore('idempotencyRecords').delete([allocatedWorldId, committed.ledger.idempotency[0]!.key])
  await corruptDone
  const damaged = await restartedRuntime.loadLedger(allocatedWorldId)
  check('missing persisted idempotency row is corruption, never an empty ledger', damaged.status === 'rejected'
    && damaged.reason === 'w6-idempotency-count-mismatch', passed)
  const orphanOwner = db.transaction('ownerReservations', 'readwrite')
  const orphanOwnerDone = new Promise<void>((resolve, reject) => {
    orphanOwner.oncomplete = () => resolve()
    orphanOwner.onabort = () => reject(orphanOwner.error ?? new Error('w6-contract-owner-delete-aborted'))
    orphanOwner.onerror = () => reject(orphanOwner.error ?? new Error('w6-contract-owner-delete-failed'))
  })
  orphanOwner.objectStore('ownerReservations').delete(owner)
  await orphanOwnerDone
  const ownerlessWorld = await restartedRuntime.loadLedger(allocatedWorldId)
  check('world ledger without its unique owner reservation fails closed', ownerlessWorld.status === 'rejected'
    && ownerlessWorld.reason === 'w6-owner-reservation-world-mismatch', passed)
  db.close()
  return Object.freeze(passed)
}
