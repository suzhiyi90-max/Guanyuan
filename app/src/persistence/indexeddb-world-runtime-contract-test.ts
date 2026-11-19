import { brandedId } from '../domain/shared/ids'
import type { WorldId } from '../domain/event-ledger'
import type { WorldTime } from '../domain/shared/world-time'
import { field } from '../domain/shared/field'
import { ownerIdFromTrustedValue } from '../application/identity/owner'
import { initializeWorldThroughPorts } from '../application/world/initialize'
import { runPlayerGenesis } from '../application/world/genesis'
import type { WorldBootstrapRequest } from '../application/world/bootstrap'
import {
  createPersonCreatedEventInput,
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

  const playerId = brandedId<'PersonId'>(`person:w6:genesis:${suffix}`)
  const player = {
    id: playerId,
    displayName: 'Genesis 契约玩家',
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>(`capability:w6:genesis:${suffix}`),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>(`body:w6:genesis:${suffix}`),
      mind: brandedId<'MindScopeRef'>(`mind:w6:genesis:${suffix}`),
      knowledge: brandedId<'KnowledgeScopeId'>(`knowledge:w6:genesis:${suffix}`),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>(`schedule:w6:genesis:${suffix}`),
      economy: brandedId<'EconomyScopeId'>(`economy:w6:genesis:${suffix}`),
      location: brandedId<'LocationStateRef'>(`location:w6:genesis:${suffix}`),
    },
    history: brandedId<'LifeHistoryRef'>(`history:w6:genesis:${suffix}`),
  }
  const genesisInput = toLedgerEventInput(createPersonCreatedEventInput(player, { kind: 'player-character' }, {
    actor: owner,
    source: 'player-command',
    requestWorldTime: start,
    clientRequestId: first.reservation.clientRequestId,
  }))
  const genesisReceipt = await adapter.commands.submit({
    worldId: allocatedWorldId,
    clientRequestId: genesisInput.clientRequestId,
    actor: genesisInput.actor,
    source: 'player-command',
    intentKind: genesisInput.intentKind,
    requestedAt: genesisInput.requestWorldTime,
    expectedHead: committed.metadata.streamHead,
    payload: genesisInput.payload,
  })
  check('Genesis player-character is appended as Owner player-command through canonical command processor',
    genesisReceipt.status === 'committed' && !!genesisReceipt.eventId, passed)
  if (genesisReceipt.status !== 'committed') throw new Error('w6-contract-genesis-event-not-committed')
  const checkpoint = Object.freeze({
    personId: playerId,
    eventId: genesisReceipt.eventId,
    streamHead: genesisReceipt.streamHead,
  })
  const prematureFinalize = await runtime.finalizeOwnerPersonBinding(owner, first.reservation.clientRequestId, checkpoint)
  check('Owner→Person binding cannot finalize before Genesis checkpoint state advances',
    prematureFinalize.status === 'rejected', passed)
  const marked = await runtime.markGenesisEventCommitted(owner, first.reservation.clientRequestId, checkpoint)
  check('Genesis committed state requires canonical event and replay proof',
    marked.status === 'committed' && marked.reservation.state === 'genesis-event-committed', passed)
  const markedAgain = await runtime.markGenesisEventCommitted(owner, first.reservation.clientRequestId, checkpoint)
  check('Genesis checkpoint transition is idempotent',
    markedAgain.status === 'already-committed', passed)
  const wrongPerson = await runtime.markGenesisEventCommitted(owner, first.reservation.clientRequestId, {
    ...checkpoint, personId: brandedId<'PersonId'>(`person:w6:wrong:${suffix}`),
  })
  check('Genesis checkpoint rejects PersonId that differs from canonical player projection',
    wrongPerson.status === 'rejected', passed)
  const finalized = await runtime.finalizeOwnerPersonBinding(owner, first.reservation.clientRequestId, checkpoint)
  check('Owner→Person binding and finalized reservation commit atomically',
    finalized.status === 'finalized' && finalized.binding.personId === playerId
      && finalized.binding.worldId === allocatedWorldId, passed)
  const finalizedAgain = await runtime.finalizeOwnerPersonBinding(owner, first.reservation.clientRequestId, checkpoint)
  check('Owner→Person binding finalization is idempotent',
    finalizedAgain.status === 'already-finalized', passed)
  const bindingRead = await runtime.readOwnerPersonBinding(owner)
  const finalizedReservation = await runtime.readReservation(owner)
  check('binding recovery read requires matching finalized reservation',
    bindingRead?.personId === playerId && bindingRead.genesisEventId === genesisReceipt.eventId
      && finalizedReservation?.state === 'binding-finalized', passed)

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
    && afterFingerprintConflict.ledger.head === 3, passed)

  const restartedRuntime = new IndexedDbWorldRuntime({ factory: globalThis.indexedDB, databaseName })
  const restartedAdapter = restartedRuntime.createWorldAdapter(allocatedWorldId, start)
  const restoredAggregate = await restartedAdapter.queries.read(allocatedWorldId)
  const restoredLedger = await restartedAdapter.readLedger()
  check('new adapter instance reconstructs aggregate and ledger after restart', restoredAggregate?.persons.length === 2
    && restoredAggregate.playerPersonId === playerId
    && restoredAggregate.streamHead.seq === 3 && restoredLedger?.head === 3, passed)

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
    && afterRace.ledger.head === 4 && afterRace.ledger.idempotency.length === 4, passed)

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

  // Normal trusted Genesis and idempotent retry.
  const serviceDb = `${databaseName}-genesis-service`
  const serviceOwner = ownerIdFromTrustedValue(`owner:local:genesis-service-${suffix}`)
  const serviceWorld = brandedId<'WorldId'>(`world:w6:genesis-service:${suffix}`) as WorldId
  const serviceRuntime = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB, databaseName: serviceDb, allocateWorldId: () => serviceWorld,
  })
  const servicePerson = {
    id: brandedId<'PersonId'>(`person:w6:genesis-service:${suffix}`),
    displayName: 'Genesis Service 契约玩家',
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>(`capability:w6:genesis-service:${suffix}`),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>(`body:w6:genesis-service:${suffix}`),
      mind: brandedId<'MindScopeRef'>(`mind:w6:genesis-service:${suffix}`),
      knowledge: brandedId<'KnowledgeScopeId'>(`knowledge:w6:genesis-service:${suffix}`),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>(`schedule:w6:genesis-service:${suffix}`),
      economy: brandedId<'EconomyScopeId'>(`economy:w6:genesis-service:${suffix}`),
      location: brandedId<'LocationStateRef'>(`location:w6:genesis-service:${suffix}`),
    },
    history: brandedId<'LifeHistoryRef'>(`history:w6:genesis-service:${suffix}`),
  }
  const serviceDependencies = {
    identity: { resolve: async () => serviceOwner },
    requestIds: { create: () => `req:genesis-service:${suffix}` },
    clock: { current: async () => start },
    reservations: serviceRuntime,
    ledger: serviceRuntime,
  }
  const serviceGenesis = await runPlayerGenesis(serviceDependencies, servicePerson)
  check('trusted Genesis service reserves WorldId and commits canonical player binding',
    serviceGenesis.status === 'ready' && serviceGenesis.worldId === serviceWorld
      && serviceGenesis.personId === servicePerson.id, passed)
  const serviceRetry = await runPlayerGenesis(serviceDependencies, servicePerson)
  const serviceRetryLedger = await serviceRuntime.loadLedger(serviceWorld)
  check('Genesis service retry recovers the finalized binding without a second person event',
    serviceRetry.status === 'recovered' && serviceRetryLedger.status === 'loaded'
      && serviceRetryLedger.ledger.events.length === 1, passed)

  // Simulate process loss after the Genesis event commit but before the
  // reservation checkpoint write. Recovery must discover that event by its
  // persisted request id and finalize the binding without appending again.
  const crashDb = `${databaseName}-genesis-crash`
  const crashOwner = ownerIdFromTrustedValue(`owner:local:genesis-crash-${suffix}`)
  const crashWorld = brandedId<'WorldId'>(`world:w6:genesis-crash:${suffix}`) as WorldId
  const crashRuntime = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB, databaseName: crashDb, allocateWorldId: () => crashWorld,
  })
  const crashReservation = await crashRuntime.reserveWorld(crashOwner, `req:genesis-crash:${suffix}`, start)
  if (crashReservation.status !== 'reserved') throw new Error('w6-contract-crash-reservation-missing')
  const crashPerson = {
    ...servicePerson,
    id: brandedId<'PersonId'>(`person:w6:genesis-crash:${suffix}`),
  }
  const crashAdapter = crashRuntime.createWorldAdapter(crashWorld, start)
  const crashInput = toLedgerEventInput(createPersonCreatedEventInput(
    crashPerson, { kind: 'player-character' }, {
      actor: crashOwner, source: 'player-command', requestWorldTime: start,
      clientRequestId: crashReservation.reservation.clientRequestId,
    },
  ))
  const crashAppend = await crashAdapter.commands.submit({
    worldId: crashWorld,
    clientRequestId: crashInput.clientRequestId,
    actor: crashOwner,
    source: 'player-command',
    intentKind: crashInput.intentKind,
    requestedAt: start,
    expectedHead: { kind: 'genesis', seq: 0 },
    payload: crashInput.payload,
  })
  if (crashAppend.status !== 'committed') throw new Error('w6-contract-crash-genesis-append-failed')
  const crashDependencies = {
    identity: { resolve: async () => crashOwner },
    requestIds: { create: () => 'unused-after-reservation' },
    clock: { current: async () => start },
    reservations: crashRuntime,
    ledger: crashRuntime,
  }
  const crashRecovery = await runPlayerGenesis(crashDependencies, crashPerson)
  const crashLedger = await crashRuntime.loadLedger(crashWorld)
  check('crash recovery after append-before-checkpoint finalizes the existing Genesis event exactly once',
    crashRecovery.status === 'recovered' && crashLedger.status === 'loaded'
      && crashLedger.ledger.events.length === 1
      && crashRecovery.personId === crashPerson.id, passed)

  // Simulate loss after the reservation checkpoint but before the binding
  // transaction. The service resumes from the persisted checkpoint.
  const checkpointDb = `${databaseName}-genesis-checkpoint`
  const checkpointOwner = ownerIdFromTrustedValue(`owner:local:genesis-checkpoint-${suffix}`)
  const checkpointWorld = brandedId<'WorldId'>(`world:w6:genesis-checkpoint:${suffix}`) as WorldId
  const checkpointRuntime = new IndexedDbWorldRuntime({
    factory: globalThis.indexedDB, databaseName: checkpointDb, allocateWorldId: () => checkpointWorld,
  })
  const checkpointReservation = await checkpointRuntime.reserveWorld(checkpointOwner, `req:genesis-checkpoint:${suffix}`, start)
  if (checkpointReservation.status !== 'reserved') throw new Error('w6-contract-checkpoint-reservation-missing')
  const checkpointPerson = {
    ...servicePerson,
    id: brandedId<'PersonId'>(`person:w6:genesis-checkpoint:${suffix}`),
  }
  const checkpointAdapter = checkpointRuntime.createWorldAdapter(checkpointWorld, start)
  const checkpointInput = toLedgerEventInput(createPersonCreatedEventInput(
    checkpointPerson, { kind: 'player-character' }, {
      actor: checkpointOwner, source: 'player-command', requestWorldTime: start,
      clientRequestId: checkpointReservation.reservation.clientRequestId,
    },
  ))
  const checkpointAppend = await checkpointAdapter.commands.submit({
    worldId: checkpointWorld,
    clientRequestId: checkpointInput.clientRequestId,
    actor: checkpointOwner,
    source: 'player-command',
    intentKind: checkpointInput.intentKind,
    requestedAt: start,
    expectedHead: { kind: 'genesis', seq: 0 },
    payload: checkpointInput.payload,
  })
  if (checkpointAppend.status !== 'committed') throw new Error('w6-contract-checkpoint-genesis-append-failed')
  const checkpointRecoveryData = {
    personId: checkpointPerson.id,
    eventId: checkpointAppend.eventId,
    streamHead: checkpointAppend.streamHead,
  }
  const checkpointMarked = await checkpointRuntime.markGenesisEventCommitted(
    checkpointOwner, checkpointReservation.reservation.clientRequestId, checkpointRecoveryData,
  )
  if (checkpointMarked.status !== 'committed') throw new Error('w6-contract-checkpoint-mark-failed')
  const checkpointRecovery = await runPlayerGenesis({
    identity: { resolve: async () => checkpointOwner },
    requestIds: { create: () => 'unused-after-checkpoint' },
    clock: { current: async () => start },
    reservations: checkpointRuntime,
    ledger: checkpointRuntime,
  }, checkpointPerson)
  const checkpointRecoveryBinding = await checkpointRuntime.readOwnerPersonBinding(checkpointOwner)
  const checkpointRecoveryLedger = await checkpointRuntime.loadLedger(checkpointWorld)
  check('crash recovery after checkpoint-before-binding finalizes without replay append',
    checkpointRecovery.status === 'recovered'
      && checkpointRecoveryBinding?.personId === checkpointPerson.id
      && checkpointRecoveryLedger.status === 'loaded'
      && checkpointRecoveryLedger.ledger.events.length === 1, passed)

  return Object.freeze(passed)
}
