import { brandedId, createEmptyWorldAggregate } from '../src/domain'
import { ownerIdFromTrustedValue, createOwnerPlayerBoundarySession } from '../src/application'
import type { OwnerIdentityPort, OwnerId } from '../src/application/identity/owner'
import type {
  OwnerPersonBinding, OwnerWorldReservation, OwnerWorldReservationPort, DurableWorldLedgerPort,
} from '../src/application/world/durable-ports'
import type { WorldCommandAuthorizationPolicy } from '../src/application/world/authorization-gate'
import type { WorldAggregate } from '../src/domain/world/aggregate'
import type { WorldId } from '../src/domain/event-ledger'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const ownerId = ownerIdFromTrustedValue('owner:local:223e4567-e89b-42d3-a456-426614174000')
const otherOwnerId = ownerIdFromTrustedValue('owner:local:223e4567-e89b-42d3-a456-426614174001')
const worldId = brandedId<'WorldId'>('world:w6-hc-composition-test')
const otherWorldId = brandedId<'WorldId'>('world:w6-hc-other-world')
const personId = brandedId<'PersonId'>('person:w6-hc-composition-test')
const eventId = brandedId<'EventId'>('event:w6-hc-composition-test')
const worldStartTime = { day: 1, period: '晨' } as const
const streamHead = { kind: 'event', seq: 2, eventId } as const

const reservation: OwnerWorldReservation = {
  schemaVersion: 1, ownerId, worldId, clientRequestId: 'genesis-request-hc',
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
  persons: [{ id: personId, displayName: '玩家' }],
  personOrigins: [{ person: personId, origin: { kind: 'player-character' } }],
} as unknown as WorldAggregate

function fixture(options: {
  currentOwner?: OwnerId
  currentReservation?: OwnerWorldReservation | null
  currentBinding?: OwnerPersonBinding | null
  ledgerStatus?: 'loaded' | 'missing' | 'rejected'
  aggregate?: WorldAggregate | null
  failIdentity?: boolean
} = {}) {
  let identityCalls = 0
  let rawSubmissions = 0
  const identity: OwnerIdentityPort = {
    async resolve() {
      identityCalls += 1
      if (options.failIdentity) throw new Error('identity unavailable')
      return identityCalls === 1 ? ownerId : (options.currentOwner ?? ownerId)
    },
  }
  const reservations = {
    async readReservation(id: OwnerId) {
      return id === ownerId
        ? (options.currentReservation === undefined ? reservation : options.currentReservation)
        : null
    },
    async readOwnerPersonBinding(id: OwnerId) {
      return id === ownerId
        ? (options.currentBinding === undefined ? binding : options.currentBinding)
        : null
    },
  }
  const commands = {
    async submit() {
      rawSubmissions += 1
      return {
        status: 'rejected' as const, worldId, clientRequestId: 'unexpected-raw-submit',
        reason: 'unexpected', streamHead,
      }
    },
  }
  const queries = {
    async read(id: WorldId) {
      return id === worldId ? (options.aggregate === undefined ? aggregate : options.aggregate) : null
    },
    subscribe() { return () => undefined },
  }
  const adapter = {
    commands,
    queries,
    projector: { async rebuild() { return { status: 'valid' as const, aggregate } } },
    async readLedger() { return null },
  }
  const ledger = {
    async loadLedger() {
      const status = options.ledgerStatus ?? 'loaded'
      if (status === 'missing') return { status: 'missing' as const }
      if (status === 'rejected') return { status: 'rejected' as const, reason: 'ledger-rejected' }
      return {
        status: 'loaded' as const,
        metadata: { schemaVersion: 1 as const, worldId, worldStartTime, head: 2, streamHead },
        ledger: { worldId, events: [genesisEvent] },
      }
    },
    createWorldAdapter() { return adapter },
  }
  const dependencies = {
    identity,
    reservations: reservations as unknown as Pick<OwnerWorldReservationPort, 'readReservation' | 'readOwnerPersonBinding'>,
    ledger: ledger as unknown as Pick<DurableWorldLedgerPort, 'loadLedger' | 'createWorldAdapter'>,
    authorizationPolicy: {
      schemaVersion: 'w6-command-authorization/1',
      policyId: 'composition-test',
      revision: '1',
      rules: [],
    } satisfies WorldCommandAuthorizationPolicy,
  }
  return { dependencies, getRawSubmissions: () => rawSubmissions }
}

async function main(): Promise<void> {
  const valid = fixture()
  const session = await createOwnerPlayerBoundarySession(valid.dependencies)
  check('valid finalized Owner→Person binding composes a player boundary', Boolean(session))
  check('composed session exposes only the trusted reserved WorldId', session?.worldId === worldId)
  check('raw command and aggregate ports are not exposed on the player boundary',
    Boolean(session && Object.keys(session.boundary).sort().join(',') === 'commands,queries'))

  const view = session ? await session.boundary.queries.read(worldId) : null
  check('player query returns an observer-scoped projection for the bound Person',
    Boolean(view && view.observerPersonId === personId && view.self?.id === personId))
  const wrongWorldView = session ? await session.boundary.queries.read(otherWorldId) : null
  check('caller-selected foreign WorldId cannot escape the reserved-world adapter', wrongWorldView === null)

  const denied = session ? await session.boundary.commands.submit({
    worldId, clientRequestId: 'unmapped-intent', actor: 'ui-spoofed-actor',
    source: 'player-command', intentKind: 'unmapped.intent',
    requestedAt: worldStartTime, expectedHead: streamHead, payload: {},
  }) : null
  check('unmapped UI command is rejected before the raw command port', denied?.status === 'rejected')
  check('UI-supplied actor never reaches the raw command port', valid.getRawSubmissions() === 0)

  const noReservation = fixture({ currentReservation: null })
  check('missing Owner reservation prevents composition', await createOwnerPlayerBoundarySession(noReservation.dependencies) === null)
  const noBinding = fixture({ currentBinding: null })
  check('missing Owner→Person binding prevents composition', await createOwnerPlayerBoundarySession(noBinding.dependencies) === null)
  const unfinalized = fixture({ currentReservation: { ...reservation, state: 'reserved', genesis: undefined } })
  check('unfinalized reservation prevents composition', await createOwnerPlayerBoundarySession(unfinalized.dependencies) === null)
  const missingLedger = fixture({ ledgerStatus: 'missing' })
  check('missing canonical ledger prevents composition', await createOwnerPlayerBoundarySession(missingLedger.dependencies) === null)
  const rejectedLedger = fixture({ ledgerStatus: 'rejected' })
  check('rejected canonical ledger prevents composition', await createOwnerPlayerBoundarySession(rejectedLedger.dependencies) === null)
  const missingPlayerProjection = fixture({ aggregate: { ...aggregate, playerPersonId: null } as unknown as WorldAggregate })
  check('projection without the bound player Person prevents composition',
    await createOwnerPlayerBoundarySession(missingPlayerProjection.dependencies) === null)
  const switched = fixture({ currentOwner: otherOwnerId })
  check('Owner session switch during composition fails closed',
    await createOwnerPlayerBoundarySession(switched.dependencies) === null)
  const unavailableIdentity = fixture({ failIdentity: true })
  check('unavailable trusted identity prevents composition',
    await createOwnerPlayerBoundarySession(unavailableIdentity.dependencies) === null)

  if (failed > 0) throw new Error(`Owner player boundary composition tests failed: ${failed}/${passed + failed}`)
  console.log(`Owner player boundary composition contracts: ${passed}/${passed + failed} passed`)
}

void main().catch(error => { console.error(error); throw error })
