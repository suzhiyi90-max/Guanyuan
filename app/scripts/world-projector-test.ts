import {
  appendLedgerEvent,
  brandedId,
  createEventLedger,
  field,
} from '../src/domain'
import type { WorldId, WorldTime } from '../src/domain'
import {
  createWorldAggregateProjector,
  createWorldDomainEventRegistry,
  createWorldInitializationEventInput,
  createPersonCreatedEventInput,
  toLedgerEventInput,
} from '../src/application'
import type {
  PersonCreationData,
  WorldBootstrapDescriptor,
  WorldDomainEventInput,
  WorldDomainEventKind,
} from '../src/application'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

async function run(): Promise<void> {
  const worldId = brandedId<'WorldId'>('world-projector-contract-test') as WorldId
  const start: WorldTime = { day: 1, period: '晨' }
  const descriptor: WorldBootstrapDescriptor = {
    worldId,
    startedAt: start,
    scenarioPackId: 'scenario:ming-jiajing-02',
    rulesetVersion: 'ruleset-0.16',
    contentPackVersion: 'ming-content-0.1',
    seedFingerprint: '0a1b2c3d',
    locationCode: 'peixian',
    populationPolicyVersion: 'w6.1',
  }
  const registry = createWorldDomainEventRegistry()
  let ledger = createEventLedger<WorldDomainEventKind>(worldId)

  function append<K extends WorldDomainEventKind>(
    input: WorldDomainEventInput<K>,
  ) {
    const result = appendLedgerEvent(ledger, toLedgerEventInput(input), start)
    if (result.status !== 'appended') throw new Error(`projector-test-append-failed:${result.status}`)
    ledger = result.ledger
    return result.event
  }

  const initEvent = append(createWorldInitializationEventInput(descriptor, 'projector-world-init'))
  const person: PersonCreationData = {
    id: brandedId<'PersonId'>('person:projector:001'),
    displayName: '随机生成基层人物',
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>('cap:projector:001'),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body:projector:001'),
      mind: brandedId<'MindScopeRef'>('mind:projector:001'),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge:projector:001'),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule:projector:001'),
      economy: brandedId<'EconomyScopeId'>('economy:projector:001'),
      location: brandedId<'LocationStateRef'>('location:projector:001'),
    },
    history: brandedId<'LifeHistoryRef'>('history:projector:001'),
  }
  const personEvent = append(createPersonCreatedEventInput(person, {
  kind: 'seeded-random',
  candidateId: person.id,
  seedFingerprint: '0a1b2c3d',
  roleCode: 'grassroots-runner',
  populationTier: 'grassroots',
}, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: start,
    clientRequestId: 'projector-person-create',
  }))

  const projector = createWorldAggregateProjector({ registry, worldStartTime: start })
  const genesis = await projector.rebuild({ ledger, target: { kind: 'genesis', seq: 0 } })
  const initialized = await projector.rebuild({
    ledger,
    target: { kind: 'event', seq: initEvent.seq, eventId: initEvent.id },
  })
  const complete = await projector.rebuild({
    ledger,
    target: { kind: 'event', seq: personEvent.seq, eventId: personEvent.id },
  })

  check('projector can rebuild a valid empty genesis projection',
    genesis.status === 'valid'
    && genesis.aggregate.streamHead.kind === 'genesis'
    && genesis.aggregate.bootstrap === null)
  check('projector can rebuild the world-initialized historical cursor',
    initialized.status === 'valid'
    && initialized.aggregate.bootstrap?.scenarioPackId === descriptor.scenarioPackId
    && initialized.aggregate.persons.length === 0)
  check('projector replays person creation into the aggregate',
    complete.status === 'valid'
    && complete.aggregate.persons.length === 1
    && complete.aggregate.persons[0].id === person.id
    && complete.aggregate.life.histories.length === 1)

  const badAnchor = await projector.rebuild({
    ledger,
    target: {
      kind: 'event',
      seq: initEvent.seq,
      eventId: brandedId<'EventId'>(`evt:${worldId}:wrong-anchor`),
    },
  })
  check('projector rejects a historical cursor with a forged event anchor', badAnchor.status === 'rejected')

  const beyondHead = await projector.rebuild({
    ledger,
    target: {
      kind: 'event',
      seq: ledger.head + 1,
      eventId: brandedId<'EventId'>(`evt:${worldId}:${ledger.head + 1}`),
    },
  })
  check('projector rejects a cursor beyond the ledger head', beyondHead.status === 'rejected')

  if (failed > 0) throw new Error(`World projector tests failed: ${failed}/${passed + failed}`)
  console.log(`World projector contract tests: ${passed}/${passed + failed} passed`)
}

void run().catch(error => {
  console.error(error)
  throw error
})
