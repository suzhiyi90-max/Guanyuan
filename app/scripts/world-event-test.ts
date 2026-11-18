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
  createRelationCreatedEventInput,
  createRelationClaimRecordedEventInput,
  createRelationEvidenceRecordedEventInput,
  createKnowledgeRecordedEventInput,
  createMessageSentEventInput,
  createMessageStageRecordedEventInput,
  createMessageFailureRecordedEventInput,
  createMessagePropagationRecordedEventInput,
  createMembershipAddedEventInput,
  createMembershipEndedEventInput,
  createRelationLifecycleChangedEventInput,
  createGoalCreatedEventInput,
  createGoalStatusChangedEventInput,
  createScheduleEntryPlannedEventInput,
  createScheduleEntryExecutionRecordedEventInput,
  createScheduleEntryDeviationRecordedEventInput,
  createDebtRecordedEventInput,
  createDebtSettledEventInput,
  createAssetRegisteredEventInput,
  createAssetCustodyTransferredEventInput,
  createAssetRightGrantedEventInput,
  createAssetRightRevokedEventInput,
  createPersonExposureRecordedEventInput,
  createLifeStateFactRecordedEventInput,
  projectWorldForObserver,
  reduceWorldDomainEvent,
  toLedgerEventInput,
  validateWorldDomainEventPayload,
} from '../src/application'
import type {
  WorldBootstrapDescriptor,
  WorldDomainEventInput,
  PersonCreationData,
  WorldDomainEventKind,
} from '../src/application'
import type { FailureKind, WorldId, WorldTime } from '../src/domain'
import type { RelationTypeCode } from '../src/domain'

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
const historicalMinisterId = brandedId<'PersonId'>('person:historical:minister-001')
const historicalEvidence = ['source:chronicle:volume-01']
const descriptor: WorldBootstrapDescriptor = {
  worldId,
  startedAt: now,
  scenarioPackId: 'scenario:ming-jiajing-02',
  rulesetVersion: 'ruleset-0.16',
  contentPackVersion: 'ming-content-0.1',
  seed: 'world-event-test-seed',
  seedFingerprint: 'a1b2c3d4',
  locationCode: 'peixian',
  populationPolicyVersion: 'w6.1',
  historicalNameAllowList: [{
    personId: historicalMinisterId,
    displayName: '史载名臣',
    category: 'famous-minister',
    evidenceRefs: historicalEvidence,
    validFrom: now,
    validThrough: null,
    scope: { kind: 'world' },
  }],
}
const registry = createWorldDomainEventRegistry()
let ledger = createEventLedger<WorldDomainEventKind>(worldId)
let aggregate = createEmptyWorldAggregate(worldId, now)

check('world domain event registry is frozen and versioned', registry.frozen
  && registry.registryId === 'guanyuan.world-domain'
  && registry.registryVersion === '1.3.0'
  && registry.schemas.length === 30)

function applyAt<K extends WorldDomainEventKind>(
  input: WorldDomainEventInput<K>,
  committedAt: WorldTime,
): void {
  const ledgerInput = toLedgerEventInput(input)
  const schema = validateWorldDomainEventPayload(registry, input.kind, ledgerInput.payload)
  if (schema.status !== 'valid') throw new Error(`test-schema-invalid:${input.kind}`)
  const appended = appendLedgerEvent(ledger, ledgerInput, committedAt)
  if (appended.status !== 'appended') throw new Error(`test-ledger-append-failed:${appended.status}`)
  ledger = appended.ledger
  aggregate = reduceWorldDomainEvent(aggregate, appended.event, registry, {
    eventIds: ledger.events.map(item => item.id),
    eventTimes: new Map(ledger.events.map(item => [item.id, item.committedAt] as const)),
  })
}

function apply<K extends WorldDomainEventKind>(input: WorldDomainEventInput<K>): void {
  applyAt(input, now)
}

function currentEventId() {
  if (aggregate.streamHead.kind !== 'event') throw new Error('test-stream-head-is-genesis')
  return aggregate.streamHead.eventId
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
  kind: 'seeded-random',
  candidateId: person.id,
  seedFingerprint: 'a1b2c3d4',
  roleCode: 'grassroots-runner',
  populationTier: 'grassroots',
}, {
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
  && aggregate.life.histories[0].person === person.id
  && aggregate.planning.scheduleScopes.length === 1
  && aggregate.planning.scheduleScopes[0]?.id === person.stateDomains.scheduleScope
  && aggregate.planning.scheduleScopes[0]?.person === person.id)

apply(createLifeStateFactRecordedEventInput({
  id: brandedId<'LifeStateFactId'>('life-state:body:stamina:001'),
  person: person.id,
  domain: 'body',
  scope: person.stateDomains.body,
  dimension: 'stamina',
  value: field.value({
    kind: 'quantitative',
    value: 80,
    scale: 'test-normalized-0-100',
    unit: field.notApplicable,
  }),
  supersedes: field.notApplicable,
  visibility: { observer: 'player', level: 'private' },
}, {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'life-state-fact-body-stamina-001',
}))
check('body and mind state changes are immutable event-backed life facts',
  aggregate.life.stateFacts.length === 1
  && aggregate.life.stateFacts[0]?.person === person.id
  && aggregate.life.stateFacts[0]?.domain === 'body'
  && aggregate.life.stateFacts[0]?.dimension === 'stamina'
  && aggregate.life.stateFacts[0]?.sourceEvent === currentEventId()
  && aggregate.life.stateFacts[0]?.at.day === now.day
  && aggregate.life.stateFacts[0]?.at.period === now.period)

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
  && aggregate.identity.authorizations[0]?.grantedBy === currentEventId())

const historicalPerson: PersonCreationData = {
  id: historicalMinisterId,
  displayName: '史载名臣',
  birth: field.unknown,
  capability: brandedId<'CapabilityRef'>('cap:historical:minister-001'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('body:historical:minister-001'),
    mind: brandedId<'MindScopeRef'>('mind:historical:minister-001'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge:historical:minister-001'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule:historical:minister-001'),
    economy: brandedId<'EconomyScopeId'>('economy:historical:minister-001'),
    location: brandedId<'LocationStateRef'>('location:historical:minister-001'),
  },
  history: brandedId<'LifeHistoryRef'>('history:historical:minister-001'),
}
apply(createPersonCreatedEventInput(historicalPerson, {
  kind: 'historical-minister',
  category: 'famous-minister',
  evidenceRefs: historicalEvidence,
  validFrom: now,
  validThrough: null,
  scope: { kind: 'world' },
}, {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'historical-minister-create-001',
}))
check('fixed historical name is accepted only when it matches the world allow-list',
  aggregate.persons.some(item => item.id === historicalMinisterId)
  && aggregate.personOrigins.some(item => item.person === historicalMinisterId && item.origin.kind === 'historical-minister'))

const unconnectedPerson: PersonCreationData = {
  ...person,
  id: brandedId<'PersonId'>('person:generated:unconnected-003'),
  displayName: '随机生成未接触人物',
  capability: brandedId<'CapabilityRef'>('cap:generated:unconnected-003'),
  stateDomains: {
    ...person.stateDomains,
    body: brandedId<'BodyScopeRef'>('body:generated:unconnected-003'),
    mind: brandedId<'MindScopeRef'>('mind:generated:unconnected-003'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge:generated:unconnected-003'),
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule:generated:unconnected-003'),
    economy: brandedId<'EconomyScopeId'>('economy:generated:unconnected-003'),
    location: brandedId<'LocationStateRef'>('location:generated:unconnected-003'),
  },
  history: brandedId<'LifeHistoryRef'>('history:generated:unconnected-003'),
}
apply(createPersonCreatedEventInput(unconnectedPerson, {
  kind: 'seeded-random',
  candidateId: unconnectedPerson.id,
  seedFingerprint: 'a1b2c3d4',
  roleCode: 'county-scholar',
  populationTier: 'county',
}, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'unconnected-person-create-003',
}))
apply(createPersonExposureRecordedEventInput({
  id: brandedId<'ExposureId'>('exposure:player-heard-unconnected-person'),
  observer: 'player',
  subject: unconnectedPerson.id,
  kind: 'heard-of',
}, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'player-exposure-heard-003',
}))
check('exposure enters the observer contact book without creating a social relation',
  aggregate.society.exposures.length === 1
  && aggregate.society.exposures[0]?.observer === 'player'
  && aggregate.society.exposures[0]?.subject === unconnectedPerson.id
  && aggregate.society.exposures[0]?.kind === 'heard-of'
  && aggregate.society.relations.length === 0)

const relationId = brandedId<'RelationId'>('relation:person-to-minister')
apply(createRelationCreatedEventInput({
  id: relationId,
  from: person.id,
  to: historicalMinisterId,
  type: 'teacher' as RelationTypeCode,
  visibility: { observer: 'player', level: 'private' },
}, {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'relation-create-001',
}))
check('relation creation commits an objective directed edge with event-backed lifecycle',
  aggregate.society.relations.length === 1
  && aggregate.society.relations[0]?.from === person.id
  && aggregate.society.relations[0]?.to === historicalMinisterId
  && aggregate.society.relations[0]?.lifecycle.validFrom === aggregate.society.relations[0]?.sourceEvent
  && aggregate.society.relations[0]?.lifecycle.validTo === 'open')

const membershipId = brandedId<'MembershipId'>('membership:person-county-office')
apply(createMembershipAddedEventInput({
  id: membershipId,
  organization: organizationId,
  person: person.id,
  role: '书吏',
  obligations: ['按期应召', '保守公务文书'],
}, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'membership-added-001',
}))
check('organization membership is a separate time-bounded record with event provenance',
  aggregate.society.memberships.length === 1
  && aggregate.society.memberships[0]?.validFrom === aggregate.society.memberships[0]?.sourceEvent
  && aggregate.society.memberships[0]?.validTo === 'open')

apply(createMembershipEndedEventInput(membershipId, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'membership-ended-001',
}))
check('membership exit closes the existing interval without deleting membership history',
  aggregate.streamHead.kind === 'event'
  && aggregate.society.memberships[0]?.validTo === currentEventId())

apply(createRelationLifecycleChangedEventInput(relationId, 'dormant', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'relation-dormant-001',
}))
apply(createRelationLifecycleChangedEventInput(relationId, 'active', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'relation-reactivated-001',
}))
apply(createRelationLifecycleChangedEventInput(relationId, 'severed', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'relation-severed-001',
}))
check('relation may become dormant, resume, and finally sever while preserving its history',
  aggregate.streamHead.kind === 'event'
  && aggregate.society.relations[0]?.lifecycle.status === 'severed'
  && aggregate.society.relations[0]?.lifecycle.validTo === currentEventId())
const relationReopenAppend = appendLedgerEvent(ledger, toLedgerEventInput(
  createRelationLifecycleChangedEventInput(relationId, 'active', {
    actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'relation-reopen-after-severed',
  }),
), now)
if (relationReopenAppend.status === 'appended') {
  expectThrow('severed relation cannot be silently reopened',
    () => reduceWorldDomainEvent(aggregate, relationReopenAppend.event, registry),
    'relation-lifecycle-transition-invalid')
} else {
  check('relation reopen event is prepared for rejection', false)
}

const claimId = brandedId<'RelationClaimId'>('relation-claim:player-says-teacher')
apply(createRelationClaimRecordedEventInput({
  id: claimId,
  relation: relationId,
  claimant: 'player',
  certainty: 'suspected',
}, {
  actor: 'player',
  source: 'player-command',
  requestWorldTime: now,
  clientRequestId: 'relation-claim-001',
}))
check('relation claim records holder assertion separately from objective relation',
  aggregate.society.claims.length === 1
  && aggregate.society.claims[0]?.claimant === 'player'
  && aggregate.society.claims[0]?.certainty === 'suspected'
  && aggregate.society.claims[0]?.assertedAt.day === now.day)

apply(createRelationEvidenceRecordedEventInput({
  id: brandedId<'RelationEvidenceId'>('relation-evidence:direct-person'),
  claim: claimId,
  evidence: { kind: 'person', id: historicalMinisterId },
  weight: 'direct',
}, {
  actor: 'player',
  source: 'player-command',
  requestWorldTime: now,
  clientRequestId: 'relation-evidence-001',
}))
check('relation evidence remains a separate provenance record attached to a claim',
  aggregate.society.evidence.length === 1
  && aggregate.society.evidence[0]?.claim === claimId
  && aggregate.society.evidence[0]?.weight === 'direct')

const knowledgeId = brandedId<'KnowledgeId'>('knowledge:person-knows-relation')
apply(createKnowledgeRecordedEventInput({
  id: knowledgeId,
  holder: person.id,
  subject: { kind: 'relation', id: relationId },
  proposition: '已获知该人物与名臣存在师生关系',
  stance: 'suspected',
  secrecy: 'private',
}, {
  actor: 'player',
  source: 'player-command',
  requestWorldTime: now,
  clientRequestId: 'knowledge-record-001',
}))
check('knowledge is holder-scoped and records its own source event and acquisition time',
  aggregate.cognition.knowledge.length === 1
  && aggregate.cognition.knowledge[0]?.holder === person.id
  && aggregate.cognition.knowledge[0]?.subject.kind === 'relation'
  && aggregate.streamHead.kind === 'event'
  && aggregate.cognition.knowledge[0]?.sourceEvent === currentEventId()
  && aggregate.cognition.knowledge[0]?.stance === 'suspected')

const messageId = brandedId<'MessageId'>('message:letter-to-minister')
apply(createMessageSentEventInput({
  id: messageId,
  sender: person.id,
  recipient: historicalMinisterId,
  channel: brandedId<'ChannelRef'>('channel:letter'),
  contentRefs: [{ kind: 'relation', id: relationId }],
  parentMessage: field.notApplicable,
  distortion: 0.15,
}, {
  actor: 'player',
  source: 'player-command',
  requestWorldTime: now,
  clientRequestId: 'message-send-001',
}))
check('sent message begins with no delivery or comprehension milestones',
  aggregate.cognition.messages.length === 1
  && aggregate.cognition.messages[0]?.deliveredAt.kind === 'n/a'
  && aggregate.cognition.messages[0]?.readAt.kind === 'n/a'
  && aggregate.cognition.messages[0]?.sentAt.day === now.day)

const prematureReadInput = createMessageStageRecordedEventInput(messageId, 'read', {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'message-premature-read',
})
const prematureReadAppend = appendLedgerEvent(ledger, toLedgerEventInput(prematureReadInput), now)
if (prematureReadAppend.status === 'appended') {
  expectThrow('message cannot be read before delivery',
    () => reduceWorldDomainEvent(aggregate, prematureReadAppend.event, registry),
    'message-stage-prerequisite')
} else {
  check('premature message read event is prepared for rejection', false)
}

apply(createMessageStageRecordedEventInput(messageId, 'delivered', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-delivered-001',
}))
apply(createMessageStageRecordedEventInput(messageId, 'read', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-read-001',
}))
apply(createMessageStageRecordedEventInput(messageId, 'understood', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-understood-001',
}))
apply(createMessageStageRecordedEventInput(messageId, 'replied', {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-replied-001',
}))
const completedMessage = aggregate.cognition.messages[0]
check('message delivery, reading, understanding and reply are separately event-backed stages',
  completedMessage?.deliveredAt.kind === 'value'
  && completedMessage.readAt.kind === 'value'
  && completedMessage.understoodAt.kind === 'value'
  && completedMessage.repliedAt.kind === 'value')

const recipientKnowledgeId = brandedId<'KnowledgeId'>('knowledge:minister-learns-relation')
apply(createKnowledgeRecordedEventInput({
  id: recipientKnowledgeId,
  holder: historicalMinisterId,
  subject: { kind: 'relation', id: relationId },
  proposition: '来信告知双方存在师生关系',
  stance: 'believed',
  secrecy: 'private',
}, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'knowledge-recipient-001',
}))
const propagationId = brandedId<'MessagePropagationId'>('propagation:letter-001')
apply(createMessagePropagationRecordedEventInput({
  id: propagationId,
  message: messageId,
  fromHolder: person.id,
  toHolder: historicalMinisterId,
  sourceKnowledge: [knowledgeId],
  resultingKnowledge: [recipientKnowledgeId],
}, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-propagation-001',
}))
check('message propagation transfers holder-scoped knowledge without mutating the source entry',
  aggregate.cognition.propagations.length === 1
  && aggregate.cognition.propagations[0]?.fromHolder === person.id
  && aggregate.cognition.propagations[0]?.toHolder === historicalMinisterId
  && aggregate.cognition.knowledge.length === 2)

const failedMessageId = brandedId<'MessageId'>('message:failed-letter')
apply(createMessageSentEventInput({
  id: failedMessageId,
  sender: person.id,
  recipient: historicalMinisterId,
  channel: brandedId<'ChannelRef'>('channel:letter'),
  contentRefs: [],
  parentMessage: field.notApplicable,
  distortion: 0,
}, {
  actor: 'player', source: 'player-command', requestWorldTime: now, clientRequestId: 'message-failure-send-001',
}))
apply(createMessageFailureRecordedEventInput(failedMessageId, 'courier-lost' as FailureKind, {
  actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-failure-001',
}))
check('message delivery failure is an explicit terminal fact before any delivery progress',
  aggregate.cognition.messages.find(item => item.id === failedMessageId)?.failure.kind === 'value')
const stageAfterFailure = appendLedgerEvent(ledger, toLedgerEventInput(
  createMessageStageRecordedEventInput(failedMessageId, 'delivered', {
    actor: 'system', source: 'rule', requestWorldTime: now, clientRequestId: 'message-after-failure',
  }),
), now)
if (stageAfterFailure.status === 'appended') {
  expectThrow('failed message cannot later acquire delivery milestones',
    () => reduceWorldDomainEvent(aggregate, stageAfterFailure.event, registry),
    'message-stage-prerequisite')
} else {
  check('post-failure delivery event is prepared for rejection', false)
}



const reversedValidityPayload = {
  ...descriptor,
  historicalNameAllowList: [{
    ...descriptor.historicalNameAllowList[0]!,
    validFrom: { day: 3, period: '晨' },
    validThrough: { day: 2, period: '夜' },
  }],
}
const reversedValiditySchema = validateWorldDomainEventPayload(
  registry,
  'world.initialized',
  reversedValidityPayload as never,
)
check('world initialization schema rejects reversed historical validity windows',
  reversedValiditySchema.status === 'payload-invalid')

const unlistedPerson: PersonCreationData = {
  ...historicalPerson,
  id: brandedId<'PersonId'>('person:historical:unlisted-002'),
  displayName: '未列入名臣',
  capability: brandedId<'CapabilityRef'>('cap:historical:unlisted-002'),
  stateDomains: {
    ...historicalPerson.stateDomains,
    body: brandedId<'BodyScopeRef'>('body:historical:unlisted-002'),
    mind: brandedId<'MindScopeRef'>('mind:historical:unlisted-002'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge:historical:unlisted-002'),
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule:historical:unlisted-002'),
    economy: brandedId<'EconomyScopeId'>('economy:historical:unlisted-002'),
    location: brandedId<'LocationStateRef'>('location:historical:unlisted-002'),
  },
  history: brandedId<'LifeHistoryRef'>('history:historical:unlisted-002'),
}
const unlistedInput = createPersonCreatedEventInput(unlistedPerson, {
  kind: 'historical-minister',
  category: 'famous-minister',
  evidenceRefs: ['source:unlisted:fake'],
  validFrom: now,
  validThrough: null,
  scope: { kind: 'world' },
}, {
  actor: 'system',
  source: 'rule',
  requestWorldTime: now,
  clientRequestId: 'historical-minister-unlisted-002',
})
const unlistedAppend = appendLedgerEvent(ledger, toLedgerEventInput(unlistedInput), now)
if (unlistedAppend.status === 'appended') {
  expectThrow('historical minister not in bootstrap allow-list is rejected',
    () => reduceWorldDomainEvent(aggregate, unlistedAppend.event, registry),
    'historical-person-not-allowlisted')
} else {
  check('unlisted historical minister event was appended for rejection test', false)
}

const nextMorning: WorldTime = { day: now.day + 1, period: '晨' }
const nextNoon: WorldTime = { day: now.day + 1, period: '午' }
const nextEvening: WorldTime = { day: now.day + 1, period: '暮' }
const goalId = brandedId<'GoalId'>('goal:person:protect-family')
apply(createGoalCreatedEventInput({
  id: goalId,
  person: person.id,
  statement: '攒足家用并照料家中长辈',
  priority: 0.8,
  visibility: { observer: 'player', level: 'private' },
}, {
  actor: 'player', source: 'player-command', requestWorldTime: now, clientRequestId: 'goal-create-001',
}))
check('goal creation indexes the goal on its owning person and starts active',
  aggregate.planning.goals[0]?.status === 'active'
  && aggregate.persons.find(item => item.id === person.id)?.stateDomains.goals.includes(goalId) === true)

applyAt(createGoalStatusChangedEventInput(goalId, 'achieved', {
  actor: 'player', source: 'player-command', requestWorldTime: nextMorning, clientRequestId: 'goal-achieved-001',
}), nextMorning)
check('goal terminal status change records a separate event-backed transition',
  aggregate.planning.goals[0]?.status === 'achieved'
  && aggregate.planning.goalStatusTransitions.length === 1
  && aggregate.planning.goalStatusTransitions[0]?.event === currentEventId())

const scheduleId = brandedId<'ScheduleId'>('schedule:person:next-noon')
applyAt(createScheduleEntryPlannedEventInput({
  id: scheduleId,
  scope: person.stateDomains.scheduleScope,
  person: person.id,
  day: nextNoon.day,
  period: nextNoon.period,
  action: brandedId<'ActionRef'>('action:review-petitions'),
  place: brandedId<'PlaceId'>('place:county-yamen'),
  visibility: { observer: 'player', level: 'private' },
}, {
  actor: 'player', source: 'player-command', requestWorldTime: nextMorning, clientRequestId: 'schedule-plan-001',
}), nextMorning)
check('schedule entry is planned in its person-owned scope without claiming execution',
  aggregate.planning.scheduleEntries.length === 1
  && aggregate.planning.scheduleEntries[0]?.intent === 'planned'
  && aggregate.planning.scheduleEntries[0]?.execution.kind === 'n/a')

const debtId = brandedId<'DebtId'>('debt:person-to-minister')
applyAt(createDebtRecordedEventInput({
  id: debtId,
  creditor: person.id,
  debtor: historicalMinisterId,
  principal: 120,
  kind: '银两借贷',
}, {
  actor: 'player', source: 'player-command', requestWorldTime: nextNoon, clientRequestId: 'debt-record-001',
}), nextNoon)
const debtSourceEvent = currentEventId()
const scheduledActionResultEvent = debtSourceEvent
applyAt(createScheduleEntryExecutionRecordedEventInput(scheduleId, scheduledActionResultEvent, {
  actor: 'system', source: 'schedule', requestWorldTime: nextEvening, clientRequestId: 'schedule-execution-001',
}), nextEvening)
check('schedule execution is linked to a distinct action result event after the planned time',
  aggregate.planning.scheduleEntries[0]?.execution.kind === 'value'
  && aggregate.planning.scheduleEntries[0]?.execution.value === scheduledActionResultEvent
  && aggregate.planning.scheduleEntries[0]?.deviation.kind === 'n/a')
const deferredScheduleId = brandedId<'ScheduleId'>('schedule:person:deferred')
applyAt(createScheduleEntryPlannedEventInput({
  id: deferredScheduleId,
  scope: person.stateDomains.scheduleScope,
  person: person.id,
  day: nextNoon.day + 1,
  period: '晨',
  action: brandedId<'ActionRef'>('action:attend-county-hearing'),
  place: brandedId<'PlaceId'>('place:county-yamen'),
  visibility: { observer: 'player', level: 'private' },
}, {
  actor: 'player', source: 'player-command', requestWorldTime: nextEvening, clientRequestId: 'schedule-deferred-plan',
}), nextEvening)
applyAt(createScheduleEntryDeviationRecordedEventInput(deferredScheduleId, '目标人物未到场，改日再议', {
  actor: 'system', source: 'schedule', requestWorldTime: nextEvening, clientRequestId: 'schedule-deviation-001',
}), nextEvening)
check('schedule deviation records its own event and reason without inventing an execution',
  aggregate.planning.scheduleEntries.find(item => item.id === deferredScheduleId)?.execution.kind === 'n/a'
  && aggregate.planning.scheduleEntries.find(item => item.id === deferredScheduleId)?.deviation.kind === 'value')
check('debt creation records creditor, debtor, principal and source event',
  aggregate.economy.debts[0]?.status === 'open'
  && aggregate.economy.debts[0]?.sourceEvent === debtSourceEvent)

const duplicateScheduleExecution = appendLedgerEvent(ledger, toLedgerEventInput(
  createScheduleEntryExecutionRecordedEventInput(deferredScheduleId, scheduledActionResultEvent, {
    actor: 'system', source: 'schedule', requestWorldTime: nextEvening, clientRequestId: 'schedule-execution-after-deviation',
  }),
), nextEvening)
if (duplicateScheduleExecution.status === 'appended') {
  expectThrow('a deviated schedule cannot also be marked executed',
    () => reduceWorldDomainEvent(aggregate, duplicateScheduleExecution.event, registry, {
      eventIds: [...ledger.events.map(item => item.id), duplicateScheduleExecution.event.id],
      eventTimes: new Map([...ledger.events, duplicateScheduleExecution.event].map(item => [item.id, item.committedAt] as const)),
    }),
    'schedule-already-settled')
} else {
  check('schedule execution after deviation is prepared for rejection', false)
}
applyAt(createDebtSettledEventInput(debtId, {
  actor: 'player', source: 'player-command', requestWorldTime: nextEvening, clientRequestId: 'debt-settle-001',
}), nextEvening)
check('debt settlement is an explicit event reference and terminal status',
  aggregate.economy.debts[0]?.status === 'settled'
  && aggregate.economy.debts[0]?.settlements.length === 1
  && aggregate.economy.debts[0]?.settlements[0] === currentEventId())

const assetId = brandedId<'AssetId'>('asset:person:small-field')
applyAt(createAssetRegisteredEventInput({
  id: assetId,
  kind: '田地',
  quantity: 1,
  custody: field.value(person.id),
  valuation: field.value(500),
}, {
  actor: 'player', source: 'player-command', requestWorldTime: nextEvening, clientRequestId: 'asset-register-001',
}), nextEvening)
const ownershipGrantId = brandedId<'RightGrantId'>('right:asset:ownership:001')
applyAt(createAssetRightGrantedEventInput(assetId, 'ownership', {
  id: ownershipGrantId,
  holder: person.id,
  scope: 'asset:small-field',
  revocable: true,
  transferable: true,
  expires: field.notApplicable,
}, {
  actor: 'player', source: 'player-command', requestWorldTime: nextEvening, clientRequestId: 'asset-owner-grant-001',
}), nextEvening)
check('asset ownership summary derives only from effective ownership rights',
  aggregate.economy.assets[0]?.owner.kind === 'value'
  && aggregate.economy.assets[0]?.owner.value === person.id
  && aggregate.economy.assets[0]?.rights.ownership.length === 1)

applyAt(createAssetRightRevokedEventInput(ownershipGrantId, {
  actor: 'player', source: 'player-command', requestWorldTime: nextEvening, clientRequestId: 'asset-owner-revoke-001',
}), nextEvening)
check('right revocation is explicit and recomputes derived ownership without deleting the grant',
  aggregate.economy.assets[0]?.owner.kind === 'n/a'
  && aggregate.economy.assets[0]?.rights.ownership.length === 1
  && aggregate.economy.rightRevocations.length === 1)

applyAt(createAssetCustodyTransferredEventInput(assetId, person.id, unconnectedPerson.id, {
  actor: 'player',
  source: 'player-command',
  requestWorldTime: nextEvening,
  clientRequestId: 'asset-custody-transfer-001',
}), nextEvening)
check('asset custody transfer changes physical custodian without changing ownership rights',
  aggregate.economy.assets[0]?.custody.kind === 'value'
  && aggregate.economy.assets[0]?.custody.value === unconnectedPerson.id
  && aggregate.economy.assets[0]?.owner.kind === 'n/a'
  && aggregate.economy.assets[0]?.rights.ownership.length === 1)

const staleCustodyInput = toLedgerEventInput(createAssetCustodyTransferredEventInput(
  assetId, person.id, historicalMinisterId, {
    actor: 'player',
    source: 'player-command',
    requestWorldTime: nextEvening,
    clientRequestId: 'asset-custody-transfer-stale-source',
  },
))
const staleCustodyAppend = appendLedgerEvent(ledger, staleCustodyInput, nextEvening)
if (staleCustodyAppend.status === 'appended') {
  expectThrow('custody transfer rejects a stale source custodian',
    () => reduceWorldDomainEvent(aggregate, staleCustodyAppend.event, registry, {
      eventIds: [...ledger.events.map(item => item.id), staleCustodyAppend.event.id],
      eventTimes: new Map([...ledger.events, staleCustodyAppend.event].map(item => [item.id, item.committedAt] as const)),
    }),
    'world-reducer-asset-custody-source-mismatch')
} else {
  check('stale custody transfer is prepared for reducer rejection', false)
}

const finalValidation = validateWorldAggregate(aggregate, ledger)
if (finalValidation.status === 'rejected') {
  console.error('World aggregate validation issues:', JSON.stringify(finalValidation.issues))
}
check('replayed world aggregate validates against the complete ledger', finalValidation.status === 'valid')

const forgedScheduleExecution = {
  ...aggregate,
  planning: {
    ...aggregate.planning,
    scheduleEntries: aggregate.planning.scheduleEntries.map(item => item.id === scheduleId
      ? { ...item, execution: field.value(currentEventId()) }
      : item),
  },
}
const forgedScheduleResult = validateWorldAggregate(forgedScheduleExecution, ledger)
check('aggregate rejects a schedule execution reference without its matching settlement event',
  forgedScheduleResult.status === 'rejected'
  && forgedScheduleResult.issues.some(issue => issue.code === 'schedule-execution-settlement-event-missing'))

const playerSocialView = projectWorldForObserver(aggregate, 'player')
const firstPersonView = projectWorldForObserver(aggregate, person.id)
const ministerView = projectWorldForObserver(aggregate, historicalMinisterId)
check('player social projection contains only player-visible relations and player-owned claims',
  playerSocialView.relations.some(item => item.id === relationId)
  && playerSocialView.claims.some(item => item.id === claimId)
  && playerSocialView.knownPersons.some(item => item.id === person.id)
  && playerSocialView.knownPersons.some(item => item.id === historicalMinisterId))
check('contact-book exposure reveals the person identity without inventing a relationship',
  playerSocialView.exposures.length === 1
  && playerSocialView.exposures[0]?.subject === unconnectedPerson.id
  && playerSocialView.knownPersons.some(item => item.id === unconnectedPerson.id)
  && !playerSocialView.relations.some(item => item.from === unconnectedPerson.id || item.to === unconnectedPerson.id)
  && firstPersonView.exposures.length === 0
  && ministerView.exposures.length === 0)
check('known-person cards expose only identity summary, not hidden life or state-domain records',
  playerSocialView.knownPersons.length > 0
  && !('lifeState' in playerSocialView.knownPersons[0]!)
  && !('death' in playerSocialView.knownPersons[0]!)
  && !('stateDomains' in playerSocialView.knownPersons[0]!))
check('NPC observer receives only their own knowledge and participant messages, not player-private claims',
  firstPersonView.knowledge.length === 1
  && firstPersonView.knowledge[0]?.id === knowledgeId
  && firstPersonView.claims.length === 0
  && firstPersonView.messages.some(item => item.id === messageId)
  && firstPersonView.memberships.some(item => item.person === person.id)
  && firstPersonView.organizations.some(item => item.id === organizationId))
check('message recipient receives their own propagated knowledge without unrelated player knowledge',
  ministerView.knowledge.length === 1
  && ministerView.knowledge[0]?.id === recipientKnowledgeId
  && ministerView.messages.some(item => item.id === messageId)
  && ministerView.propagations.some(item => item.id === propagationId)
  && !ministerView.memberships.some(item => item.person === person.id))
check('unrelated NPC private relationship and knowledge are not globally disclosed',
  !firstPersonView.relations.some(item => item.id === relationId)
  && !ministerView.relations.some(item => item.id === relationId)
  && !firstPersonView.knowledge.some(item => item.id === recipientKnowledgeId)
  && !ministerView.knowledge.some(item => item.id === knowledgeId))

const malformedRelationPayload = validateWorldDomainEventPayload(registry, 'relation.created', {
  relation: { id: 'relation:broken', from: person.id, to: historicalMinisterId, type: '', visibility: { observer: 'player', level: 'private' } },
})
check('relation event schema rejects an empty relation type', malformedRelationPayload.status === 'payload-invalid')

const malformedPayload = validateWorldDomainEventPayload(registry, 'person.created', {
  person: { id: 'incomplete' },
})
check('event registry rejects incomplete person creation payload', malformedPayload.status === 'payload-invalid')
const fakeLocalOfficialOrigin = validateWorldDomainEventPayload(registry, 'person.created', {
  person,
  origin: {
    kind: 'historical-minister',
    category: 'local-official',
    evidenceRefs: ['unverified-local-name'],
    validFrom: now,
    validThrough: null,
    scope: { kind: 'world' },
  },
} as never)
check('event registry rejects fixed-name local officials outside the minister exception',
  fakeLocalOfficialOrigin.status === 'payload-invalid')
const storedOrigin = aggregate.personOrigins[0]
if (!storedOrigin || storedOrigin.origin.kind !== 'seeded-random') throw new Error('test-person-origin-missing')
const mismatchedSeedAggregate = {
  ...aggregate,
  personOrigins: [{
    ...storedOrigin,
    origin: { ...storedOrigin.origin, seedFingerprint: 'ffffffff' },
  }],
}
const mismatchedSeedResult = validateWorldAggregate(mismatchedSeedAggregate, ledger)
check('aggregate rejects generated people whose provenance seed differs from world seed',
  mismatchedSeedResult.status === 'rejected'
  && mismatchedSeedResult.issues.some(issue => issue.code === 'person-random-origin-seed-mismatch'))

const duplicateInit = createWorldInitializationEventInput({ ...descriptor, startedAt: aggregate.worldTime }, 'world-init-duplicate')
const duplicateAppend = appendLedgerEvent(ledger, toLedgerEventInput(duplicateInit), aggregate.worldTime)
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

const aiSourcedEvent = {
  ...lastEvent,
  source: 'ai-candidate' as const,
  seq: ledger.head + 1,
  id: brandedId<'EventId'>(`evt:${worldId}:${ledger.head + 1}`),
}
expectThrow('AI candidate proposals cannot directly write world facts',
  () => reduceWorldDomainEvent(aggregate, aiSourcedEvent, registry),
  'ai-candidate-cannot-write-facts')

if (failed > 0) throw new Error(`World event tests failed: ${failed}/${passed + failed}`)
console.log(`World event contract tests: ${passed}/${passed + failed} passed`)
