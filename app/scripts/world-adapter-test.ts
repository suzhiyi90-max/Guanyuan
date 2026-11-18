import {
  brandedId,
  field,
  type StreamCursor,
  type WorldId,
} from '../src/domain'
import {
  createInMemoryWorldAdapter,
  createPersonCreatedEventInput,
  initializeWorldThroughPorts,
  toLedgerEventInput,
} from '../src/application'
import type { PersonCreationData, WorldBootstrapRequest } from '../src/application'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world-in-memory-adapter-test') as WorldId
const worldTime = { day: 1, period: '晨' } as const
const request: WorldBootstrapRequest = {
  worldId,
  seed: 'in-memory-adapter-seed',
  scenarioPackId: 'scenario:adapter-test',
  rulesetVersion: 'ruleset-adapter-1',
  contentPackVersion: 'content-adapter-1',
  worldTime,
  locationCode: 'adapter-county',
  roleSlots: [{ roleCode: 'county-runner', tier: 'county', minCount: 2, maxCount: 2 }],
  namePool: {
    surnames: ['王', '李', '张', '赵'],
    givenNames: ['守仁', '文远', '景初', '仲平'],
  },
  historicalMinisters: [{
    personId: brandedId<'PersonId'>('person:historical:adapter-minister'),
    displayName: '测试名臣',
    category: 'famous-minister',
    evidenceStatus: 'verified',
    evidenceRefs: ['source:test:minister'],
    validFrom: worldTime,
    validThrough: null,
    scope: { kind: 'world' },
  }],
}

async function main(): Promise<void> {
  const adapter = createInMemoryWorldAdapter({ worldId, worldStartTime: worldTime })
  let notifications = 0
  const unsubscribe = adapter.queries.subscribe(worldId, () => { notifications += 1 })

  const initialized = await initializeWorldThroughPorts(request, adapter)
  const aggregate = await adapter.queries.read(worldId)
  const ledger = adapter.readLedger()
  check('in-memory command adapter executes bootstrap through canonical ledger and replay',
    initialized.status === 'ready'
    && aggregate?.bootstrap?.seed === request.seed
    && aggregate.persons.length === 3
    && aggregate.personOrigins.filter(item => item.origin.kind === 'seeded-random').length === 2
    && aggregate.personOrigins.some(item => item.origin.kind === 'historical-minister')
    && ledger.head === 4)
  check('query subscribers are notified only after each valid committed event', notifications === 4)

  const repeated = await initializeWorldThroughPorts(request, adapter)
  if (repeated.status !== 'ready' || repeated.createdPersonIds.length !== 0
    || repeated.existingPersonCount !== 3 || adapter.readLedger().head !== 4) {
    console.error('Repeat initialization diagnostic:', JSON.stringify({
      repeated,
      bootstrap: aggregate?.bootstrap,
      persons: aggregate?.persons.map(person => ({ id: person.id, name: person.displayName })),
      origins: aggregate?.personOrigins,
      ledgerHead: adapter.readLedger().head,
    }))
  }
  check('repeated initialization observes the materialized world and appends no duplicate facts',
    repeated.status === 'ready'
    && repeated.createdPersonIds.length === 0
    && repeated.existingPersonCount === 3
    && adapter.readLedger().head === 4)

  const tail = ledger.events[ledger.events.length - 1]
  if (!tail) throw new Error('adapter-test-ledger-tail-missing')
  const staleCursor: StreamCursor = { kind: 'genesis', seq: 0 }
  const extraPerson: PersonCreationData = {
    id: brandedId<'PersonId'>('person:adapter:stale-command'),
    displayName: '不应写入的候选',
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>('cap:adapter:stale'),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body:adapter:stale'),
      mind: brandedId<'MindScopeRef'>('mind:adapter:stale'),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge:adapter:stale'),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule:adapter:stale'),
      economy: brandedId<'EconomyScopeId'>('economy:adapter:stale'),
      location: brandedId<'LocationStateRef'>('location:adapter:stale'),
    },
    history: brandedId<'LifeHistoryRef'>('history:adapter:stale'),
  }
  const eventInput = toLedgerEventInput(createPersonCreatedEventInput(extraPerson, {
    kind: 'seeded-random',
    candidateId: extraPerson.id,
    seedFingerprint: request.seed,
    roleCode: 'county-runner',
    populationTier: 'county',
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: worldTime,
    clientRequestId: 'adapter-stale-person-create',
  }))
  const conflict = await adapter.commands.submit({
    worldId,
    clientRequestId: eventInput.clientRequestId,
    actor: 'system',
    source: 'rule',
    intentKind: 'person.create',
    requestedAt: worldTime,
    expectedHead: staleCursor,
    payload: eventInput.payload,
  })
  check('stale expected-head command is rejected without appending or notifying',
    conflict.status === 'conflict'
    && adapter.readLedger().head === 4
    && notifications === 4)

  const unsupported = await adapter.commands.submit({
    worldId,
    clientRequestId: 'adapter-unsupported-command',
    actor: 'system',
    source: 'rule',
    intentKind: 'unregistered.intent',
    requestedAt: worldTime,
    expectedHead: aggregate!.streamHead,
    payload: {},
  })
  check('unregistered command intent cannot bypass the event catalogue', unsupported.status === 'rejected')

  const rebuilt = await adapter.projector.rebuild({
    ledger: adapter.readLedger(),
    target: aggregate!.streamHead,
  })
  check('public projector port independently rebuilds and validates the same aggregate',
    rebuilt.status === 'valid'
    && rebuilt.aggregate.persons.length === 3
    && rebuilt.aggregate.streamHead.seq === 4)

  unsubscribe()
  if (failed > 0) throw new Error(`In-memory world adapter tests failed: ${failed}/${passed + failed}`)
  console.log(`In-memory world adapter tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => {
  console.error(error)
  throw error
})
