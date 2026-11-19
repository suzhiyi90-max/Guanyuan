import { brandedId, createEmptyWorldAggregate } from '../src/domain'
import { createOwnerPersonPrincipalPort, ownerIdFromTrustedValue } from '../src/application'
import type { OwnerId } from '../src/application/identity/owner'
import type {
  OwnerPersonBinding, OwnerWorldReservation, DurableWorldLedgerPort, OwnerWorldReservationPort,
} from '../src/application/world/durable-ports'
import type { PersonId } from '../src/domain/shared/ids'
import type { WorldAggregate } from '../src/domain/world/aggregate'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const ownerId = ownerIdFromTrustedValue('owner:local:123e4567-e89b-42d3-a456-426614174000')
const otherOwnerId = ownerIdFromTrustedValue('owner:local:123e4567-e89b-42d3-a456-426614174001')
const worldId = brandedId<'WorldId'>('world:w6-h-principal-test')
const personId = brandedId<'PersonId'>('person:w6-h-principal-test')
const eventId = brandedId<'EventId'>('event:w6-h-principal-test')
const worldStartTime = { day: 1, period: '晨' } as const
const streamHead = { kind: 'event', seq: 2, eventId } as const

const reservation: OwnerWorldReservation = {
  schemaVersion: 1, ownerId, worldId, clientRequestId: 'genesis-request-1',
  worldStartTime, state: 'binding-finalized',
  genesis: { personId, eventId, streamHead },
}
const binding: OwnerPersonBinding = {
  schemaVersion: 1, ownerId, worldId, personId,
  genesisEventId: eventId, verifiedStreamHead: streamHead,
}
const genesisEvent = {
  id: eventId, worldId, seq: 2, actor: ownerId, source: 'player-command',
  intentKind: 'person.create', kind: 'person.created',
  clientRequestId: reservation.clientRequestId, requestWorldTime: worldStartTime,
  payload: { person: { id: personId }, origin: { kind: 'player-character' } },
}
const aggregate = {
  ...createEmptyWorldAggregate(worldId, worldStartTime),
  playerPersonId: personId,
  persons: [{ id: personId }],
  personOrigins: [{ person: personId, origin: { kind: 'player-character' } }],
} as unknown as WorldAggregate

type Overrides = {
  owner?: OwnerId
  currentOwner?: OwnerId
  currentReservation?: OwnerWorldReservation | null
  currentBinding?: OwnerPersonBinding | null
  event?: typeof genesisEvent | null
  loadedStatus?: 'loaded' | 'missing' | 'rejected'
  aggregate?: WorldAggregate | null
  throwAt?: 'identity' | 'reservation' | 'binding' | 'ledger' | 'aggregate'
}
function fixture(overrides: Overrides = {}) {
  let identityCalls = 0
  const activeOwner = overrides.owner ?? ownerId
  const currentOwner = overrides.currentOwner ?? activeOwner
  const currentReservation = overrides.currentReservation === undefined ? reservation : overrides.currentReservation
  const currentBinding = overrides.currentBinding === undefined ? binding : overrides.currentBinding
  const currentEvent = overrides.event === undefined ? genesisEvent : overrides.event
  const identity = {
    async resolve() {
      identityCalls += 1
      if (overrides.throwAt === 'identity') throw new Error('identity unavailable')
      return identityCalls === 1 ? activeOwner : currentOwner
    },
  }
  const reservations = {
    async readReservation(id: OwnerId) {
      if (overrides.throwAt === 'reservation') throw new Error('reservation unavailable')
      return id === activeOwner ? currentReservation : null
    },
    async readOwnerPersonBinding(id: OwnerId) {
      if (overrides.throwAt === 'binding') throw new Error('binding unavailable')
      return id === activeOwner ? currentBinding : null
    },
  }
  const ledger = {
    async loadLedger() {
      if (overrides.throwAt === 'ledger') throw new Error('ledger unavailable')
      if (overrides.loadedStatus === 'missing') return { status: 'missing' as const }
      if (overrides.loadedStatus === 'rejected') return { status: 'rejected' as const, reason: 'corrupt' }
      return {
        status: 'loaded' as const,
        metadata: { schemaVersion: 1, worldId, worldStartTime, head: 2, streamHead },
        ledger: { events: currentEvent ? [currentEvent] : [] },
      } as unknown as Awaited<ReturnType<DurableWorldLedgerPort['loadLedger']>>
    },
    createWorldAdapter() {
      return {
        queries: {
          async read() {
            if (overrides.throwAt === 'aggregate') throw new Error('projection unavailable')
            return overrides.aggregate === undefined ? aggregate : overrides.aggregate
          },
        },
      } as unknown as ReturnType<DurableWorldLedgerPort['createWorldAdapter']>
    },
  }
  return {
    port: createOwnerPersonPrincipalPort({
      identity,
      reservations: reservations as unknown as Pick<OwnerWorldReservationPort, 'readReservation' | 'readOwnerPersonBinding'>,
      ledger: ledger as unknown as Pick<DurableWorldLedgerPort, 'loadLedger' | 'createWorldAdapter'>,
    }),
    get identityCalls() { return identityCalls },
  }
}

async function main(): Promise<void> {
  const valid = fixture()
  check('finalized Owner→Person binding resolves to replay-verified player PersonId',
    await valid.port.resolve() === personId && valid.identityCalls === 2)

  check('missing reservation fails closed', await fixture({ currentReservation: null }).port.resolve() === null)
  check('missing binding fails closed', await fixture({ currentBinding: null }).port.resolve() === null)
  check('non-finalized reservation fails closed', await fixture({
    currentReservation: { ...reservation, state: 'genesis-event-committed', genesis: reservation.genesis },
  }).port.resolve() === null)
  check('binding owned by another Owner fails closed', await fixture({
    currentBinding: { ...binding, ownerId: otherOwnerId },
  }).port.resolve() === null)
  check('binding WorldId mismatch fails closed', await fixture({
    currentBinding: { ...binding, worldId: brandedId<'WorldId'>('world:other') },
  }).port.resolve() === null)
  check('missing durable ledger fails closed', await fixture({ loadedStatus: 'missing' }).port.resolve() === null)
  check('rejected or corrupt durable ledger fails closed', await fixture({ loadedStatus: 'rejected' }).port.resolve() === null)
  check('Genesis event must match trusted Owner actor and request provenance', await fixture({
    event: { ...genesisEvent, actor: otherOwnerId },
  }).port.resolve() === null)
  check('Genesis event must carry player-character origin and exact PersonId', await fixture({
    event: { ...genesisEvent, payload: { person: { id: personId }, origin: { kind: 'npc' } } },
  }).port.resolve() === null)
  check('Genesis event id and stream sequence must match finalized checkpoint', await fixture({
    event: { ...genesisEvent, seq: 1 },
  }).port.resolve() === null)
  check('aggregate must project the bound Person as this world player', await fixture({
    aggregate: { ...aggregate, playerPersonId: brandedId<'PersonId'>('person:other') },
  }).port.resolve() === null)
  check('aggregate must contain exactly one matching player Person record', await fixture({
    aggregate: { ...aggregate, persons: [{ id: personId }, { id: personId }] } as unknown as WorldAggregate,
  }).port.resolve() === null)
  check('aggregate must contain exactly one player-character origin', await fixture({
    aggregate: { ...aggregate, personOrigins: [
      { person: personId, origin: { kind: 'player-character' } },
      { person: brandedId<'PersonId'>('person:other'), origin: { kind: 'player-character' } },
    ] } as unknown as WorldAggregate,
  }).port.resolve() === null)
  check('owner session change during verification invalidates the principal', await fixture({
    currentOwner: otherOwnerId,
  }).port.resolve() === null)
  check('identity provider failure fails closed', await fixture({ throwAt: 'identity' }).port.resolve() === null)
  check('reservation read failure fails closed', await fixture({ throwAt: 'reservation' }).port.resolve() === null)
  check('ledger read failure fails closed', await fixture({ throwAt: 'ledger' }).port.resolve() === null)
  check('projection read failure fails closed', await fixture({ throwAt: 'aggregate' }).port.resolve() === null)

  if (failed > 0) throw new Error(`Owner person principal tests failed: ${failed}/${passed + failed}`)
  console.log(`Owner person principal tests: ${passed}/${passed + failed} passed`)
}
void main().catch(error => { console.error(error); throw error })
