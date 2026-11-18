import {
  brandedId,
  createEmptyWorldAggregate,
  createEventLedger,
  field,
  appendLedgerEvent,
  validateWorldAggregate,
} from '../src/domain'
import {
  createWorldDomainEventRegistry,
  createWorldInitializationEventInput,
  createPersonCreatedEventInput,
  reduceWorldDomainEvent,
  toLedgerEventInput,
  validateWorldDomainEventPayload,
} from '../src/application'
import type {
  WorldBootstrapDescriptor,
  WorldDomainEventInput,
  PersonCreationData,
} from '../src/application'
import type { WorldId } from '../src/domain'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

function expectThrow(name: string, action: () => void, expected: string): void {
  try {
    action()
    check(name, false)
  } catch (error) {
    check(name, error instanceof Error && error.message.includes(expected))
  }
}

const worldId = brandedId<'WorldId'>('world-event-contract-test') as WorldId
const now = { day: 1, period: '晨' } as const
const descriptor: WorldBootstrapDescriptor = {
  worldId,
  startedAt: now,
  scenarioPackId: 'scenario:ming-jiajing-02',
  rulesetVersion: 'ruleset-0.16',
  contentPackVersion: 'ming-content-0.1',
  seedFingerprint: 'a1b2c3d4',
  locationCode: 'peixian',
  populationPolicyVersion: 'w6.1',
}
const registry = createWorldDomainEventRegistry()
let ledger = createEventLedger<'world.initialized' | 'person.created' | 'organization.registered' | 'identity.assignment.added' | 'authorization.granted'>(worldId)
let aggregate = createEmptyWorldAggregate(worldId, now)

check('world domain event registry is frozen and versioned', registry.frozen
  && registry.registryId === 'guanyuan.world-domain'
  && registry.registryVersion === '1.0.0'
  && registry.schemas.length === 5)

function apply<K extends 'world.initialized' | 'person.created' | 'organization.registered' | 'identity.assignment.added' | 'authorization.granted'>(
  input: WorldDomainEventInput<K>,
): void {
  const ledgerInput = toLedgerEventInput(input)
  const schema = validateWorldDomainEventPayload(registry, input.kind, ledgerInput.payload)
  if (schema.status !== 'valid') throw new Error(`test-schema-invalid:${input.kind}`)
  const appended = appendLedgerEvent(ledger, ledgerInput, now)
  if (appended.status !== 'appended') throw new Error(`test-ledger-append-failed:${appended.status}`)
  ledger = appended.ledger
  aggregate = reduceWorldDomainEvent(aggregate, appended.event, registry)
}

const initInput = createWorldInitializationEventInput(descriptor, 'world-init-001')
apply(initInput)
check('world initialization event stores scenario provenance', aggregate.bootstrap?.scenarioPackId === descriptor.scenarioPackId
  && aggregate.streamHead.kind === 'event' && aggregate.streamHead.seq === 1)

const person: PersonCreationData = {
  id: brandedId<'PersonId'>('person:generated:001'),
  displayName: '随机生成县吏',
  birth: field.unknown,
  capability: brandedId<'CapabilityRef'>('cap:generated:001'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('body:generated:001'),
    mind: brandedId<'MindScopeRef'>('mind:generated:001'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge:generated:001'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule:generated:001'),
    economy: brandedId<'EconomyScopeId'>('economy:generated:001'),
    location: brandedId<'LocationStateRef'>('location:generated:001'),
  },
  history: brandedId<'LifeHistoryRef'>('history:generated:001'),
}
apply(createPersonCreatedEventInput(person, {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'person-create-001',
}))
check('person-created event creates active person and life-history projection',
  aggregate.persons.length === 1
  && aggregate.persons[0].lifeState === 'alive'
  && aggregate.persons[0].archiveState === 'active'
  && aggregate.life.histories.length === 1
  && aggregate.life.histories[0].person === person.id)

const organizationId = brandedId<'OrgId'>('org:county-office')
const organizationInput: WorldDomainEventInput<'organization.registered'> = {
  source: 'rule',
  kind: 'organization.registered',
  intentKind: 'organization.register',
  actor: 'system',
  requestWorldTime: now,
  clientRequestId: 'organization-register-001',
  payload: {
    organization: {
      id: organizationId,
      type: 'county-administration',
      name: '县级行政机构',
      purpose: '承载县级行政职能',
      region: 'scenario-region',
      rules: [],
    },
  },
}
apply(organizationInput)
check('organization event registers an independently scoped institution',
  aggregate.society.organizations.length === 1
  && aggregate.society.organizations[0].id === organizationId)

const assignmentInput: WorldDomainEventInput<'identity.assignment.added'> = {
  source: 'rule',
  kind: 'identity.assignment.added',
  intentKind: 'identity.assign',
  actor: 'system',
  requestWorldTime: now,
  clientRequestId: 'identity-assignment-001',
  payload: {
    assignment: {
      id: brandedId<'IdentityId'>('identity:county-clerk'),
      person: person.id,
      axis: 'institutional',
      code: 'county-clerk',
      visibility: { observer: 'player', level: 'public' },
      certainty: 'confirmed',
    },
  },
}
apply(assignmentInput)
check('identity assignment receives event-backed start and source references',
  aggregate.identity.assignments.length === 1
  && aggregate.identity.assignments[0].validFrom === aggregate.identity.assignments[0].sourceEvent)

const authorizationInput: WorldDomainEventInput<'authorization.granted'> = {
  source: 'rule',
  kind: 'authorization.granted',
  intentKind: 'authorization.grant',
  actor: 'system',
  requestWorldTime: now,
  clientRequestId: 'authorization-grant-001',
  payload: {
    authorization: {
      id: brandedId<'AuthorizationId'>('authorization:read-world'),
      principal: person.id,
      permission: 'read-world',
      scope: { kind: 'world' },
      revocable: true,
    },
  },
}
apply(authorizationInput)
check('authorization grant receives immutable event provenance',
  aggregate.identity.authorizations.length === 1
  && aggregate.streamHead.kind === 'event'
  && aggregate.identity.authorizations[0]?.grantedBy === aggregate.streamHead.eventId)

const finalValidation = validateWorldAggregate(aggregate, ledger)
check('replayed world aggregate validates against the complete ledger', finalValidation.status === 'valid')

const malformedPayload = validateWorldDomainEventPayload(registry, 'person.created', {
  person: { id: 'incomplete' },
})
check('event registry rejects incomplete person creation payload', malformedPayload.status === 'payload-invalid')

const duplicateInit = createWorldInitializationEventInput(descriptor, 'world-init-duplicate')
const duplicateAppend = appendLedgerEvent(ledger, toLedgerEventInput(duplicateInit), now)
if (duplicateAppend.status === 'appended') {
  expectThrow('world cannot be initialized twice',
    () => reduceWorldDomainEvent(aggregate, duplicateAppend.event, registry),
    'world-already-initialized')
} else {
  check('duplicate initialization event append is prepared', false)
}

const lastEvent = ledger.events[ledger.events.length - 1]
if (!lastEvent) throw new Error('test-ledger-event-missing')
const skippedEvent = {
  ...lastEvent,
  seq: ledger.head + 2,
  id: brandedId<'EventId'>(`evt:${worldId}:${ledger.head + 2}`),
}
expectThrow('world reducer rejects skipped event sequence',
  () => reduceWorldDomainEvent(aggregate, skippedEvent, registry),
  'event-sequence-mismatch')

if (failed > 0) throw new Error(`World event tests failed: ${failed}/${passed + failed}`)
console.log(`World event contract tests: ${passed}/${passed + failed} passed`)
