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
import type { FailureKind, WorldId } from '../src/domain'
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
  && registry.registryVersion === '1.0.0'
  && registry.schemas.length === 16)

function apply<K extends WorldDomainEventKind>(
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
  aggregate.society.memberships[0]?.validTo === aggregate.streamHead.eventId)

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
  aggregate.society.relations[0]?.lifecycle.status === 'severed'
  && aggregate.society.relations[0]?.lifecycle.validTo === aggregate.streamHead.eventId)
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
  && aggregate.cognition.knowledge[0]?.sourceEvent === aggregate.streamHead.eventId
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

const finalValidation = validateWorldAggregate(aggregate, ledger)
if (finalValidation.status === 'rejected') {
  console.error('World aggregate validation issues:', JSON.stringify(finalValidation.issues))
}
check('replayed world aggregate validates against the complete ledger', finalValidation.status === 'valid')

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
