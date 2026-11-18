import {
  appendLedgerEvent,
  brandedId,
  createEventLedger,
  field,
} from '../src/domain'
import type { FailureKind, WorldId, WorldTime } from '../src/domain'
import {
  createWorldAggregateProjector,
  createWorldDomainEventRegistry,
  createWorldInitializationEventInput,
  createPersonCreatedEventInput,
  createRelationCreatedEventInput,
  createRelationClaimRecordedEventInput,
  createRelationEvidenceRecordedEventInput,
  createOrganizationRegisteredEventInput,
  createMembershipAddedEventInput,
  createMembershipEndedEventInput,
  createRelationLifecycleChangedEventInput,
  createKnowledgeRecordedEventInput,
  createMessageSentEventInput,
  createMessageStageRecordedEventInput,
  createMessageFailureRecordedEventInput,
  createMessagePropagationRecordedEventInput,
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
    seed: 'world-projector-test-seed',
    seedFingerprint: '0a1b2c3d',
    locationCode: 'peixian',
    populationPolicyVersion: 'w6.1',
    historicalNameAllowList: [],
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

  const secondPerson: PersonCreationData = {
    ...person,
    id: brandedId<'PersonId'>('person:projector:002'),
    displayName: '另一名随机基层人物',
    capability: brandedId<'CapabilityRef'>('cap:projector:002'),
    stateDomains: {
      ...person.stateDomains,
      body: brandedId<'BodyScopeRef'>('body:projector:002'),
      mind: brandedId<'MindScopeRef'>('mind:projector:002'),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge:projector:002'),
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule:projector:002'),
      economy: brandedId<'EconomyScopeId'>('economy:projector:002'),
      location: brandedId<'LocationStateRef'>('location:projector:002'),
    },
    history: brandedId<'LifeHistoryRef'>('history:projector:002'),
  }
  append(createPersonCreatedEventInput(secondPerson, {
    kind: 'seeded-random',
    candidateId: secondPerson.id,
    seedFingerprint: '0a1b2c3d',
    roleCode: 'county-clerk',
    populationTier: 'county',
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: start,
    clientRequestId: 'projector-person-create-002',
  }))
  const organizationId = brandedId<'OrgId'>('org:projector:county-office')
  append(createOrganizationRegisteredEventInput({
    id: organizationId,
    type: 'county-administration',
    name: '县署',
    purpose: '办理县级公务',
    region: 'projector-region',
    rules: [],
  }, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-organization',
  }))
  const relationId = brandedId<'RelationId'>('relation:projector:001')
  append(createRelationCreatedEventInput({
    id: relationId,
    from: person.id,
    to: secondPerson.id,
    type: 'colleague' as import('../src/domain').RelationTypeCode,
    visibility: { observer: 'player', level: 'contact' },
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: start,
    clientRequestId: 'projector-relation-create',
  }))
  const claimId = brandedId<'RelationClaimId'>('relation-claim:projector:001')
  append(createRelationClaimRecordedEventInput({
    id: claimId,
    relation: relationId,
    claimant: 'player',
    certainty: 'reported',
  }, {
    actor: 'player',
    source: 'player-command',
    requestWorldTime: start,
    clientRequestId: 'projector-relation-claim',
  }))
  const evidenceEvent = append(createRelationEvidenceRecordedEventInput({
    id: brandedId<'RelationEvidenceId'>('relation-evidence:projector:001'),
    claim: claimId,
    evidence: { kind: 'person', id: secondPerson.id },
    weight: 'corroborating',
  }, {
    actor: 'player',
    source: 'player-command',
    requestWorldTime: start,
    clientRequestId: 'projector-relation-evidence',
  }))
  const membershipId = brandedId<'MembershipId'>('membership:projector:001')
  append(createMembershipAddedEventInput({
    id: membershipId,
    organization: organizationId,
    person: person.id,
    role: '书吏',
    obligations: ['应召办事'],
  }, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-membership-added',
  }))
  const membershipEndEvent = append(createMembershipEndedEventInput(membershipId, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-membership-ended',
  }))
  append(createRelationLifecycleChangedEventInput(relationId, 'dormant', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-relation-dormant',
  }))
  append(createRelationLifecycleChangedEventInput(relationId, 'active', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-relation-active',
  }))
  const relationSeveredEvent = append(createRelationLifecycleChangedEventInput(relationId, 'severed', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-relation-severed',
  }))
  append(createKnowledgeRecordedEventInput({
    id: brandedId<'KnowledgeId'>('knowledge:projector:001'),
    holder: person.id,
    subject: { kind: 'relation', id: relationId },
    proposition: '知道两人存在同僚关系',
    stance: 'known',
    secrecy: 'private',
  }, {
    actor: 'player',
    source: 'player-command',
    requestWorldTime: start,
    clientRequestId: 'projector-knowledge-record',
  }))
  const messageId = brandedId<'MessageId'>('message:projector:001')
  append(createMessageSentEventInput({
    id: messageId,
    sender: person.id,
    recipient: secondPerson.id,
    channel: brandedId<'ChannelRef'>('channel:projector-letter'),
    contentRefs: [{ kind: 'relation', id: relationId }],
    parentMessage: field.notApplicable,
    distortion: 0,
  }, {
    actor: 'player',
    source: 'player-command',
    requestWorldTime: start,
    clientRequestId: 'projector-message-sent',
  }))
  append(createMessageStageRecordedEventInput(messageId, 'delivered', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-delivered',
  }))
  append(createMessageStageRecordedEventInput(messageId, 'read', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-read',
  }))
  append(createMessageStageRecordedEventInput(messageId, 'understood', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-understood',
  }))
  append(createMessageStageRecordedEventInput(messageId, 'replied', {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-replied',
  }))
  const recipientKnowledgeId = brandedId<'KnowledgeId'>('knowledge:projector:recipient')
  append(createKnowledgeRecordedEventInput({
    id: recipientKnowledgeId,
    holder: secondPerson.id,
    subject: { kind: 'relation', id: relationId },
    proposition: '收到来信并获知关系',
    stance: 'believed',
    secrecy: 'private',
  }, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-recipient-knowledge',
  }))
  append(createMessagePropagationRecordedEventInput({
    id: brandedId<'MessagePropagationId'>('propagation:projector:001'),
    message: messageId,
    fromHolder: person.id,
    toHolder: secondPerson.id,
    sourceKnowledge: [brandedId<'KnowledgeId'>('knowledge:projector:001')],
    resultingKnowledge: [recipientKnowledgeId],
  }, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-propagation',
  }))
  const failedMessageId = brandedId<'MessageId'>('message:projector:failed')
  append(createMessageSentEventInput({
    id: failedMessageId,
    sender: person.id,
    recipient: secondPerson.id,
    channel: brandedId<'ChannelRef'>('channel:projector-letter'),
    contentRefs: [],
    parentMessage: field.notApplicable,
    distortion: 0,
  }, {
    actor: 'player', source: 'player-command', requestWorldTime: start, clientRequestId: 'projector-failed-message-sent',
  }))
  const finalEvent = append(createMessageFailureRecordedEventInput(failedMessageId, 'courier-lost' as FailureKind, {
    actor: 'system', source: 'rule', requestWorldTime: start, clientRequestId: 'projector-message-failed',
  }))

  const projector = createWorldAggregateProjector({ registry, worldStartTime: start })
  const genesis = await projector.rebuild({ ledger, target: { kind: 'genesis', seq: 0 } })
  const initialized = await projector.rebuild({
    ledger,
    target: { kind: 'event', seq: initEvent.seq, eventId: initEvent.id },
  })
  const complete = await projector.rebuild({
    ledger,
    target: { kind: 'event', seq: finalEvent.seq, eventId: finalEvent.id },
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
    && complete.aggregate.persons.length === 2
    && complete.aggregate.persons[0].id === person.id
    && complete.aggregate.life.histories.length === 2
    && complete.aggregate.society.relations.length === 1
    && complete.aggregate.society.claims.length === 1
    && complete.aggregate.society.evidence.length === 1
    && complete.aggregate.society.memberships.length === 1
    && complete.aggregate.society.memberships[0]?.validTo === membershipEndEvent.id
    && complete.aggregate.society.relations[0]?.lifecycle.status === 'severed'
    && complete.aggregate.society.relations[0]?.lifecycle.validTo === relationSeveredEvent.id
    && complete.aggregate.cognition.knowledge.length === 2
    && complete.aggregate.cognition.propagations.length === 1
    && complete.aggregate.cognition.messages.length === 2
    && complete.aggregate.cognition.messages[0]?.repliedAt.kind === 'value'
    && complete.aggregate.cognition.messages[1]?.failure.kind === 'value')

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
