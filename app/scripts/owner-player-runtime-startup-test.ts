import { brandedId, createEmptyWorldAggregate, field } from '../src/domain'
import { ownerIdFromTrustedValue } from '../src/application/identity/owner'
import { startOwnerPlayerRuntime } from '../src/application/identity/owner-player-runtime-startup'
import type { OwnerIdentityPort, OwnerId } from '../src/application/identity/owner'
import type { OwnerPersonBinding, OwnerWorldReservation, OwnerWorldReservationPort, DurableWorldLedgerPort } from '../src/application/world/durable-ports'
import type { WorldCommandAuthorizationPolicy } from '../src/application/world/authorization-gate'
import type { WorldCommandRequest } from '../src/application/world/ports'
import type { GenesisPersonFactoryPort } from '../src/application/world/genesis'
import type { WorldAggregate } from '../src/domain/world/aggregate'
import type { WorldId, LedgerEvent } from '../src/domain/event-ledger'
import type { WorldTime } from '../src/domain/shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const ownerId = ownerIdFromTrustedValue('owner:local:323e4567-e89b-42d3-a456-426614174000')
const otherOwnerId = ownerIdFromTrustedValue('owner:local:423e4567-e89b-42d3-a456-426614174000')
const worldId = brandedId<'WorldId'>('world:w6-hi-startup-test') as WorldId
const personId = brandedId<'PersonId'>('person:w6-hi-startup-test')
const genesisEventId = brandedId<'EventId'>('event:w6-hi-genesis')
const initializedEventId = brandedId<'EventId'>('event:w6-hi-world-initialized')
const worldStartTime: WorldTime = { day: 1, period: '晨' }
const policy: WorldCommandAuthorizationPolicy = {
  schemaVersion: 'w6-command-authorization/1',
  policyId: 'startup-test',
  revision: '1',
  rules: [],
}

function fixture(options: {
  identitySequence?: readonly (OwnerId | null)[]
  initializer?: 'ready' | 'partial' | 'wrong-world' | 'throw'
  existingReservation?: boolean
} = {}) {
  let identityCall = 0
  let requestIdCalls = 0
  let clockCalls = 0
  let initializerCalls = 0
  let factoryCalls = 0
  let reservation: OwnerWorldReservation | null = options.existingReservation ? {
    schemaVersion: 1, ownerId, worldId, clientRequestId: 'persisted-genesis-request',
    worldStartTime, state: 'reserved',
  } : null
  let binding: OwnerPersonBinding | null = null
  const events: LedgerEvent[] = []
  let aggregate = createEmptyWorldAggregate(worldId, worldStartTime) as WorldAggregate
  const identity: OwnerIdentityPort = {
    async resolve() {
      const sequence = options.identitySequence ?? [ownerId]
      const value = sequence[Math.min(identityCall, sequence.length - 1)] ?? null
      identityCall += 1
      if (!value) throw new Error('identity-unavailable')
      return value
    },
  }
  const reservations: OwnerWorldReservationPort = {
    async reserveWorld(id, clientRequestId, start) {
      if (reservation) return { status: 'conflict', reason: 'owner-already-reserved' }
      reservation = { schemaVersion: 1, ownerId: id, worldId, clientRequestId, worldStartTime: start, state: 'reserved' }
      return { status: 'reserved', reservation }
    },
    async readReservation(id) { return reservation?.ownerId === id ? reservation : null },
    async markGenesisEventCommitted(id, requestId, checkpoint) {
      if (!reservation || reservation.ownerId !== id || reservation.clientRequestId !== requestId) {
        return { status: 'rejected', reason: 'reservation-mismatch' }
      }
      reservation = { ...reservation, state: 'genesis-event-committed', genesis: checkpoint }
      return { status: 'committed', reservation }
    },
    async finalizeOwnerPersonBinding(id, requestId, checkpoint) {
      if (!reservation || reservation.ownerId !== id || reservation.clientRequestId !== requestId) {
        return { status: 'rejected', reason: 'reservation-mismatch' }
      }
      binding = {
        schemaVersion: 1, ownerId: id, worldId, personId: checkpoint.personId,
        genesisEventId: checkpoint.eventId, verifiedStreamHead: checkpoint.streamHead,
      }
      reservation = { ...reservation, state: 'binding-finalized', genesis: checkpoint }
      return { status: 'finalized', binding }
    },
    async readOwnerPersonBinding(id) { return binding?.ownerId === id ? binding : null },
  }

  const commands = {
    async submit(request: WorldCommandRequest) {
      const event = {
        id: genesisEventId, worldId, seq: events.length + 1, actor: request.actor,
        source: request.source, intentKind: request.intentKind,
        kind: 'person.created', clientRequestId: request.clientRequestId,
        requestWorldTime: request.requestedAt, payload: request.payload,
      } as unknown as LedgerEvent
      events.push(event)
      const payload = request.payload as { person: Record<string, unknown>; origin: { kind: string } }
      aggregate = {
        ...aggregate,
        streamHead: { kind: 'event', seq: event.seq, eventId: genesisEventId },
        playerPersonId: personId,
        persons: [payload.person],
        personOrigins: [{ person: personId, origin: payload.origin }],
      } as unknown as WorldAggregate
      return {
        status: 'committed' as const, worldId, clientRequestId: request.clientRequestId,
        eventId: genesisEventId, streamHead: { kind: 'event' as const, seq: event.seq, eventId: genesisEventId },
      }
    },
  }
  const queries = {
    async read(id: WorldId) { return id === worldId ? aggregate : null },
    subscribe() { return () => undefined },
  }
  const adapter = {
    commands,
    queries,
    projector: { async rebuild() { return { status: 'valid' as const, aggregate } } },
    async readLedger() { return null },
  }
  const ledger: DurableWorldLedgerPort = {
    async loadLedger(id) {
      if (id !== worldId || events.length === 0) return { status: 'missing' }
      const last = events[events.length - 1]!
      return {
        status: 'loaded',
        metadata: {
          schemaVersion: 1, worldId, worldStartTime, head: events.length,
          streamHead: { kind: 'event', seq: last.seq, eventId: last.id },
        },
        ledger: { worldId, events },
      }
    },
    createWorldAdapter() { return adapter },
  }
  const persons: GenesisPersonFactoryPort = {
    create() {
      factoryCalls += 1
      return {
        id: personId, displayName: '王某',
        birth: field.unknown,
        capability: brandedId<'CapabilityRef'>('capability:w6-hi-test'),
        stateDomains: {
          body: brandedId<'BodyScopeRef'>('body:w6-hi-test'),
          mind: brandedId<'MindScopeRef'>('mind:w6-hi-test'),
          knowledge: brandedId<'KnowledgeScopeId'>('knowledge:w6-hi-test'),
          goals: [],
          scheduleScope: brandedId<'ScheduleScopeId'>('schedule:w6-hi-test'),
          economy: brandedId<'EconomyScopeId'>('economy:w6-hi-test'),
          location: brandedId<'LocationStateRef'>('location:w6-hi-test'),
        },
        history: brandedId<'LifeHistoryRef'>('history:w6-hi-test'),
      }
    },
  }
  const dependencies = {
    identity,
    requestIds: { create() { requestIdCalls += 1; return 'new-genesis-request' } },
    clock: { async current() { clockCalls += 1; return worldStartTime } },
    persons,
    reservations,
    ledger,
    worldInitialization: {
      async ensureInitialized(input: { worldId: WorldId }) {
        initializerCalls += 1
        if (options.initializer === 'throw') throw new Error('init-failed')
        if (options.initializer === 'partial') return { status: 'partial' as const, worldId: input.worldId, reason: 'bootstrap-partial' }
        if (options.initializer === 'wrong-world') return { status: 'ready' as const, worldId: brandedId<'WorldId'>('world:wrong') as WorldId }
        events.push({
          id: initializedEventId, worldId, seq: 1, actor: 'system', source: 'rule',
          intentKind: 'world.initialize', kind: 'world.initialized',
          clientRequestId: 'world-initialize-request', requestWorldTime: worldStartTime, payload: {},
        } as unknown as LedgerEvent)
        aggregate = createEmptyWorldAggregate(worldId, worldStartTime) as WorldAggregate
        return { status: 'ready' as const, worldId: input.worldId }
      },
    },
    authorizationPolicy: policy,
  }
  return {
    dependencies,
    counts: () => ({ identityCall, requestIdCalls, clockCalls, initializerCalls, factoryCalls }),
    reservation: () => reservation,
    binding: () => binding,
  }
}

async function main(): Promise<void> {
  const fresh = fixture()
  const started = await startOwnerPlayerRuntime(fresh.dependencies, '王某')
  check('fresh Owner completes reservation→world initialization→Genesis→player boundary',
    started.status === 'ready' && started.worldId === worldId && started.personId === personId)
  check('fresh startup invokes trusted world initializer exactly once', fresh.counts().initializerCalls === 1)
  check('fresh startup persists finalized Owner→Person binding', fresh.reservation()?.state === 'binding-finalized' && fresh.binding()?.personId === personId)
  check('fresh startup creates request id and world clock only once', fresh.counts().requestIdCalls === 1 && fresh.counts().clockCalls === 1)

  const resumed = await startOwnerPlayerRuntime(fresh.dependencies, 'ignored-on-recovery')
  check('finalized restart recovers the existing player session', resumed.status === 'ready' && resumed.genesis.status === 'recovered')
  check('finalized restart does not rerun world initialization or person factory',
    fresh.counts().initializerCalls === 1 && fresh.counts().factoryCalls === 1)
  check('finalized restart does not allocate a new reservation request or world time',
    fresh.counts().requestIdCalls === 1 && fresh.counts().clockCalls === 1)

  const partial = fixture({ initializer: 'partial' })
  const partialResult = await startOwnerPlayerRuntime(partial.dependencies, '王某')
  check('partial world initialization never publishes a player boundary',
    partialResult.status === 'rejected' && partialResult.reason.includes('initialization-partial'))
  check('partial initialization preserves reservation for idempotent retry',
    partial.reservation()?.state === 'reserved' && partial.counts().factoryCalls === 0)

  const mismatch = fixture({ initializer: 'wrong-world' })
  const mismatchResult = await startOwnerPlayerRuntime(mismatch.dependencies, '王某')
  check('initializer cannot substitute another WorldId',
    mismatchResult.status === 'rejected' && mismatchResult.reason === 'owner-player-startup-initializer-world-mismatch')

  const switched = fixture({ identitySequence: [ownerId, otherOwnerId] })
  const switchedResult = await startOwnerPlayerRuntime(switched.dependencies, '王某')
  check('Owner switch before initialization fails closed',
    switchedResult.status === 'rejected' && switchedResult.reason === 'owner-player-startup-owner-changed-before-initialization')

  if (failed > 0) throw new Error(`Owner player runtime startup contracts failed: ${failed}/${passed + failed}`)
  console.log(`Owner player runtime startup contracts: ${passed}/${passed + failed} passed`)
}

void main().catch(error => { console.error(error); throw error })
