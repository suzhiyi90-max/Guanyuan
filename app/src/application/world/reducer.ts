/**
 * W6-C — pure reducers from accepted ledger events to the world projection.
 *
 * Reducers are deterministic and side-effect free. They do not append events,
 * call AI, mutate the ledger or repair invalid records.
 */
import { field } from '../../domain/shared/field'
import { brandedId, type EventId } from '../../domain/shared/ids'
import { compareWorldTime, isValidWorldTime } from '../../domain/shared/world-time'
import type { LedgerEvent } from '../../domain/event-ledger'
import type { EventRegistry } from '../../domain/event-registry'
import type { Person } from '../../domain/person/model'
import type { PersonOrigin, PersonOriginRecord } from '../../domain/person/provenance'
import { validatePersonLifecycle } from '../../domain/person/lifecycle'
import type { IdentityAssignment, Authorization } from '../../domain/identity/model'
import {
  validateIdentityAssignment,
  validateAuthorization,
} from '../../domain/identity/validation'
import type { Organization, Relation, RelationClaim, RelationEvidence, Membership } from '../../domain/relations/model'
import type { FailureKind, KnowledgeEntry, Message, MessagePropagation } from '../../domain/cognition/model'
import { validateOrganization, validateRelation, validateRelationClaim, validateRelationEvidence, validateMembership } from '../../domain/relations/validation'
import { validateKnowledgeEntry, validateMessage, validateMessagePropagation } from '../../domain/cognition/validation'
import type { LifeHistory } from '../../domain/life/model'
import { validateLifeHistory } from '../../domain/life/validation'
import type { WorldBootstrapMetadata } from '../../domain/world/metadata'
import type { WorldAggregate } from '../../domain/world/aggregate'
import {
  validateWorldDomainEventPayload,
  type WorldDomainEventKind,
  type WorldDomainEventPayloadMap,
  type PersonCreationData,
  type IdentityAssignmentCreationData,
  type AuthorizationGrantData,
  type RelationCreationData,
  type RelationClaimCreationData,
  type RelationEvidenceCreationData,
  type KnowledgeCreationData,
  type MessageCreationData,
  type MessageStage,
  type MessagePropagationCreationData,
} from './event-catalog'

function assertNextEvent(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): void {
  if (event.worldId !== aggregate.worldId) throw new Error('world-reducer-world-id-mismatch')
  if (event.source === 'ai-candidate') throw new Error('world-reducer-ai-candidate-cannot-write-facts')
  const expectedSeq = aggregate.streamHead.kind === 'genesis' ? 1 : aggregate.streamHead.seq + 1
  if (!Number.isSafeInteger(event.seq) || event.seq !== expectedSeq) {
    throw new Error('world-reducer-event-sequence-mismatch')
  }
  const expectedId = brandedId<'EventId'>(`evt:${event.worldId}:${event.seq}`)
  if (event.id !== expectedId) throw new Error('world-reducer-event-id-mismatch')
  if (!isValidWorldTime(event.committedAt) || !isValidWorldTime(event.requestWorldTime)) {
    throw new Error('world-reducer-event-time-invalid')
  }
  if (compareWorldTime(event.committedAt, event.requestWorldTime) < 0
    || compareWorldTime(event.committedAt, aggregate.worldTime) < 0) {
    throw new Error('world-reducer-event-time-regressed')
  }
}

function withEventCursor(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): Pick<WorldAggregate, 'worldTime' | 'streamHead'> {
  return {
    worldTime: Object.freeze({ ...event.committedAt }),
    streamHead: Object.freeze({ kind: 'event' as const, seq: event.seq, eventId: event.id }),
  }
}

function requireBootstrap(aggregate: WorldAggregate): void {
  if (!aggregate.bootstrap) throw new Error('world-reducer-before-initialization')
}

function requireUniquePerson(aggregate: WorldAggregate, personId: string, historyId: string): void {
  if (aggregate.persons.some(person => person.id === personId)) throw new Error('world-reducer-person-duplicate')
  if (aggregate.life.histories.some(history => history.id === historyId)) throw new Error('world-reducer-life-history-duplicate')
}

function applyWorldInitialized(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  if (aggregate.streamHead.kind !== 'genesis' || aggregate.bootstrap !== null || event.seq !== 1) {
    throw new Error('world-reducer-world-already-initialized')
  }
  if (compareWorldTime(event.committedAt, aggregate.worldTime) !== 0) {
    throw new Error('world-reducer-initialization-time-mismatch')
  }
  const metadata = event.payload as unknown as WorldBootstrapMetadata
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    bootstrap: Object.freeze({ ...metadata }),
  })
}

function applyPersonCreated(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['person.created']
  const data: PersonCreationData = payload.person
  if (payload.origin.kind === 'seeded-random'
    && payload.origin.seedFingerprint !== aggregate.bootstrap?.seedFingerprint) {
    throw new Error('world-reducer-random-person-seed-mismatch')
  }
  if (payload.origin.kind === 'historical-minister') {
    // Capture the narrowed union member before entering callbacks; TypeScript
    // otherwise widens payload.origin inside Array#every.
    const historicalOrigin = payload.origin
    const allowed = aggregate.bootstrap?.historicalNameAllowList.find(item => item.personId === data.id)
    const sameScope = !!allowed && allowed.scope.kind === historicalOrigin.scope.kind
      && (historicalOrigin.scope.kind === 'world'
        || (allowed.scope.kind === 'location'
          && allowed.scope.locationCode === historicalOrigin.scope.locationCode))
    const sameValidity = !!allowed
      && compareWorldTime(allowed.validFrom, historicalOrigin.validFrom) === 0
      && ((allowed.validThrough === null && historicalOrigin.validThrough === null)
        || (!!allowed.validThrough && !!historicalOrigin.validThrough
          && compareWorldTime(allowed.validThrough, historicalOrigin.validThrough) === 0))
    const sameEvidence = !!allowed
      && allowed.evidenceRefs.length === historicalOrigin.evidenceRefs.length
      && allowed.evidenceRefs.every((ref, index) => ref === historicalOrigin.evidenceRefs[index])
    if (!allowed || allowed.displayName !== data.displayName || !sameScope || !sameValidity || !sameEvidence) {
      throw new Error('world-reducer-historical-person-not-allowlisted')
    }
    if (compareWorldTime(historicalOrigin.validFrom, event.committedAt) > 0
      || (historicalOrigin.validThrough && compareWorldTime(historicalOrigin.validThrough, event.committedAt) < 0)) {
      throw new Error('world-reducer-historical-person-outside-validity')
    }
  }
  requireUniquePerson(aggregate, data.id, data.history)
  if (aggregate.planning.scheduleScopes.some(scope => scope.id === data.stateDomains.scheduleScope
    || scope.person === data.id)) {
    throw new Error('world-reducer-person-schedule-scope-duplicate')
  }
  const person: Person = Object.freeze({
    ...data,
    lifeState: 'alive',
    archiveState: 'active',
    death: field.notApplicable,
  })
  const personIssues = validatePersonLifecycle(person, event.committedAt)
  if (personIssues.length > 0) throw new Error(`world-reducer-person-invalid:${personIssues.join(',')}`)
  const history: LifeHistory = Object.freeze({ id: person.history, person: person.id, entries: Object.freeze([]) })
  const historyIssues = validateLifeHistory(history, {
    persons: [...aggregate.persons, person],
    events: [event.id],
    eventTimes: new Map<EventId, import('../../domain/shared/world-time').WorldTime>([[event.id, event.committedAt]]),
  })
  if (historyIssues.length > 0) throw new Error(`world-reducer-life-history-invalid:${historyIssues.join(',')}`)
  if (payload.origin.kind === 'player-character' && aggregate.playerPersonId !== null) {
    throw new Error('world-reducer-player-character-already-exists')
  }
  const origin: PersonOrigin = payload.origin.kind === 'historical-minister'
    ? Object.freeze({
        ...payload.origin,
        evidenceRefs: Object.freeze([...payload.origin.evidenceRefs]),
        validFrom: Object.freeze({ ...payload.origin.validFrom }),
        validThrough: payload.origin.validThrough ? Object.freeze({ ...payload.origin.validThrough }) : null,
        scope: Object.freeze({ ...payload.origin.scope }),
      })
    : Object.freeze({ ...payload.origin })
  const originRecord: PersonOriginRecord = Object.freeze({ person: person.id, origin })
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    persons: Object.freeze([...aggregate.persons, person]),
    playerPersonId: payload.origin.kind === 'player-character' ? person.id : aggregate.playerPersonId,
    personOrigins: Object.freeze([...aggregate.personOrigins, originRecord]),
    life: Object.freeze({
      ...aggregate.life,
      histories: Object.freeze([...aggregate.life.histories, history]),
    }),
    planning: Object.freeze({
      ...aggregate.planning,
      // Every person owns exactly one schedule scope from creation; the
      // scope ID is part of the person's immutable state-domain references.
      scheduleScopes: Object.freeze([
        ...aggregate.planning.scheduleScopes,
        Object.freeze({ id: data.stateDomains.scheduleScope, person: person.id }),
      ]),
    }),
  })
}

function applyOrganizationRegistered(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['organization.registered']
  const organization: Organization = Object.freeze({ ...payload.organization, rules: Object.freeze([...payload.organization.rules]) })
  if (aggregate.society.organizations.some(item => item.id === organization.id)) {
    throw new Error('world-reducer-organization-duplicate')
  }
  const issues = validateOrganization(organization)
  if (issues.length > 0) throw new Error(`world-reducer-organization-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      organizations: Object.freeze([...aggregate.society.organizations, organization]),
    }),
  })
}

function applyIdentityAssignmentAdded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['identity.assignment.added']
  const data: IdentityAssignmentCreationData = payload.assignment
  if (!aggregate.persons.some(person => person.id === data.person)) {
    throw new Error('world-reducer-identity-person-missing')
  }
  const assignment: IdentityAssignment = Object.freeze({
    ...data,
    validFrom: event.id,
    validTo: 'open',
    sourceEvent: event.id,
  })
  const issues = validateIdentityAssignment(assignment, aggregate.identity.assignments)
  if (issues.length > 0) throw new Error(`world-reducer-identity-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    identity: Object.freeze({
      ...aggregate.identity,
      assignments: Object.freeze([...aggregate.identity.assignments, assignment]),
    }),
  })
}

function applyAuthorizationGranted(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['authorization.granted']
  const data: AuthorizationGrantData = payload.authorization
  if (!aggregate.persons.some(person => person.id === data.principal)) {
    throw new Error('world-reducer-authorization-principal-missing')
  }
  const scope = data.scope
  if (scope.kind === 'institution'
    && !aggregate.society.organizations.some(item => item.id === scope.institution)) {
    throw new Error('world-reducer-authorization-institution-missing')
  }
  if (scope.kind === 'person' && !aggregate.persons.some(item => item.id === scope.person)) {
    throw new Error('world-reducer-authorization-person-scope-missing')
  }
  if (scope.kind === 'office' && !aggregate.identity.offices.some(item => item.id === scope.office)) {
    throw new Error('world-reducer-authorization-office-scope-missing')
  }
  const authorization: Authorization = Object.freeze({
    ...data,
    grantedBy: event.id,
    validFrom: Object.freeze({ ...event.committedAt }),
    validTo: field.notApplicable,
    revokedBy: field.notApplicable,
    revokedAt: field.notApplicable,
  })
  const issues = validateAuthorization(authorization)
  if (issues.length > 0) throw new Error(`world-reducer-authorization-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    identity: Object.freeze({
      ...aggregate.identity,
      authorizations: Object.freeze([...aggregate.identity.authorizations, authorization]),
    }),
  })
}

function applyRelationCreated(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['relation.created']
  const data: RelationCreationData = payload.relation
  if (aggregate.society.relations.some(item => item.id === data.id)) {
    throw new Error('world-reducer-relation-duplicate')
  }
  const personIds = aggregate.persons.map(person => person.id)
  if (!personIds.includes(data.from)) throw new Error('world-reducer-relation-source-person-missing')
  if (!personIds.includes(data.to)) throw new Error('world-reducer-relation-target-person-missing')
  if (data.visibility.observer !== 'player' && !personIds.includes(data.visibility.observer)) {
    throw new Error('world-reducer-relation-observer-person-missing')
  }
  const relation: Relation = Object.freeze({
    ...data,
    lifecycle: Object.freeze({ status: 'active', validFrom: event.id, validTo: 'open' }),
    sourceEvent: event.id,
    visibility: Object.freeze({ ...data.visibility }),
  })
  const issues = validateRelation(relation)
  if (issues.length > 0) throw new Error(`world-reducer-relation-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      relations: Object.freeze([...aggregate.society.relations, relation]),
    }),
  })
}

function applyRelationClaimRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['relation.claim.recorded']
  const data: RelationClaimCreationData = payload.claim
  if (aggregate.society.claims.some(item => item.id === data.id)) {
    throw new Error('world-reducer-relation-claim-duplicate')
  }
  const claim: RelationClaim = Object.freeze({
    ...data,
    assertedAt: Object.freeze({ ...event.committedAt }),
    sourceEvent: event.id,
  })
  const issues = validateRelationClaim(
    claim,
    aggregate.society.relations.map(item => item.id),
    aggregate.persons.map(person => person.id),
  )
  if (issues.length > 0) throw new Error(`world-reducer-relation-claim-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      claims: Object.freeze([...aggregate.society.claims, claim]),
    }),
  })
}

function applyRelationEvidenceRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['relation.evidence.recorded']
  const data: RelationEvidenceCreationData = payload.evidence
  if (aggregate.society.evidence.some(item => item.id === data.id)) {
    throw new Error('world-reducer-relation-evidence-duplicate')
  }
  const evidence: RelationEvidence = Object.freeze({
    ...data,
    evidence: Object.freeze({ ...data.evidence }),
    sourceEvent: event.id,
  })
  const issues = validateRelationEvidence(
    evidence,
    aggregate.society.claims.map(item => item.id),
    aggregate.persons.map(person => person.id),
    aggregate.society.organizations.map(item => item.id),
  )
  if (issues.length > 0) throw new Error(`world-reducer-relation-evidence-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      evidence: Object.freeze([...aggregate.society.evidence, evidence]),
    }),
  })
}

function cognitionReferences(aggregate: WorldAggregate, event: LedgerEvent<WorldDomainEventKind>) {
  return {
    persons: aggregate.persons.map(item => item.id),
    relations: aggregate.society.relations.map(item => item.id),
    claims: aggregate.society.claims.map(item => item.id),
    offices: aggregate.identity.offices.map(item => item.id),
    organizations: aggregate.society.organizations.map(item => item.id),
    assets: aggregate.economy.assets.map(item => item.id),
    debts: aggregate.economy.debts.map(item => item.id),
    // Cognition references may point to any prior committed event, not
    // only the event currently being reduced. Reconstruct the canonical
    // contiguous event-ID prefix from the already-validated sequence.
    events: Array.from({ length: event.seq }, (_, index) =>
      brandedId<'EventId'>(`evt:${aggregate.worldId}:${index + 1}`)),
    knowledge: aggregate.cognition.knowledge.map(item => item.id),
    messages: aggregate.cognition.messages.map(item => item.id),
  }
}

function applyKnowledgeRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['knowledge.recorded']
  const data: KnowledgeCreationData = payload.entry
  if (aggregate.cognition.knowledge.some(item => item.id === data.id)) {
    throw new Error('world-reducer-knowledge-duplicate')
  }
  const entry: KnowledgeEntry = Object.freeze({
    ...data,
    subject: Object.freeze({ ...data.subject }) as KnowledgeEntry['subject'],
    sourceEvent: event.id,
    acquiredAt: Object.freeze({ ...event.committedAt }),
  })
  const issues = validateKnowledgeEntry(entry, cognitionReferences(aggregate, event))
  if (issues.length > 0) throw new Error(`world-reducer-knowledge-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    cognition: Object.freeze({
      ...aggregate.cognition,
      knowledge: Object.freeze([...aggregate.cognition.knowledge, entry]),
    }),
  })
}

function applyMessageSent(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['message.sent']
  const data: MessageCreationData = payload.message
  if (aggregate.cognition.messages.some(item => item.id === data.id)) {
    throw new Error('world-reducer-message-duplicate')
  }
  const message: Message = Object.freeze({
    ...data,
    channel: data.channel,
    contentRefs: Object.freeze(data.contentRefs.map(ref => Object.freeze({ ...ref }))),
    parentMessage: Object.freeze({ ...data.parentMessage }),
    sentAt: Object.freeze({ ...event.committedAt }),
    deliveredAt: field.notApplicable,
    readAt: field.notApplicable,
    understoodAt: field.notApplicable,
    repliedAt: field.notApplicable,
    failure: field.notApplicable,
  })
  const issues = validateMessage(message, cognitionReferences(aggregate, event))
  if (issues.length > 0) throw new Error(`world-reducer-message-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    cognition: Object.freeze({
      ...aggregate.cognition,
      messages: Object.freeze([...aggregate.cognition.messages, message]),
    }),
  })
}

function applyMessageFailed(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['message.failed']
  const messageIndex = aggregate.cognition.messages.findIndex(item => item.id === payload.messageId)
  if (messageIndex < 0) throw new Error('world-reducer-message-failure-message-missing')
  const current = aggregate.cognition.messages[messageIndex]!
  if (current.failure.kind === 'value'
    || [current.deliveredAt, current.readAt, current.understoodAt, current.repliedAt].some(stage => stage.kind === 'value')) {
    throw new Error('world-reducer-message-failure-after-progress')
  }
  const updated: Message = Object.freeze({
    ...current,
    failure: field.value(payload.failureCode as FailureKind),
  })
  const messages = aggregate.cognition.messages.map((item, index) => index === messageIndex ? updated : item)
  const issues = validateMessage(updated, cognitionReferences(aggregate, event))
  if (issues.length > 0) throw new Error(`world-reducer-message-failure-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    cognition: Object.freeze({ ...aggregate.cognition, messages: Object.freeze(messages) }),
  })
}

function applyMessagePropagated(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['message.propagated']
  const data: MessagePropagationCreationData = payload.propagation
  if (aggregate.cognition.propagations.some(item => item.id === data.id)) {
    throw new Error('world-reducer-message-propagation-duplicate')
  }
  const propagation: MessagePropagation = Object.freeze({
    ...data,
    sourceKnowledge: Object.freeze([...data.sourceKnowledge]),
    resultingKnowledge: Object.freeze([...data.resultingKnowledge]),
    propagatedAt: Object.freeze({ ...event.committedAt }),
  })
  const issues = validateMessagePropagation(
    propagation,
    aggregate.cognition.messages,
    aggregate.cognition.knowledge,
    aggregate.persons.map(item => item.id),
  )
  if (issues.length > 0) throw new Error(`world-reducer-message-propagation-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    cognition: Object.freeze({
      ...aggregate.cognition,
      propagations: Object.freeze([...aggregate.cognition.propagations, propagation]),
    }),
  })
}

function applyMessageStageRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['message.stage.recorded']
  const messageIndex = aggregate.cognition.messages.findIndex(item => item.id === payload.messageId)
  if (messageIndex < 0) throw new Error('world-reducer-message-stage-message-missing')
  const current = aggregate.cognition.messages[messageIndex]!
  const stage = payload.stage as MessageStage
  const previousStage = stage === 'delivered' ? null
    : stage === 'read' ? 'deliveredAt'
      : stage === 'understood' ? 'readAt' : 'understoodAt'
  const currentStage = stage === 'delivered' ? 'deliveredAt'
    : stage === 'read' ? 'readAt'
      : stage === 'understood' ? 'understoodAt' : 'repliedAt'
  if (current.failure.kind === 'value' || current[currentStage].kind === 'value'
    || (previousStage !== null && current[previousStage].kind !== 'value')) {
    throw new Error('world-reducer-message-stage-prerequisite')
  }
  const updated: Message = Object.freeze({
    ...current,
    [currentStage]: Object.freeze({ kind: 'value' as const, value: Object.freeze({ ...event.committedAt }) }),
  })
  const messages = aggregate.cognition.messages.map((item, index) => index === messageIndex ? updated : item)
  const issues = validateMessage(updated, cognitionReferences(aggregate, event))
  if (issues.length > 0) throw new Error(`world-reducer-message-stage-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    cognition: Object.freeze({ ...aggregate.cognition, messages: Object.freeze(messages) }),
  })
}

function applyMembershipAdded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['organization.membership.added']
  const data: MembershipCreationData = payload.membership
  if (aggregate.society.memberships.some(item => item.id === data.id)) {
    throw new Error('world-reducer-membership-duplicate')
  }
  if (!aggregate.society.organizations.some(item => item.id === data.organization)) {
    throw new Error('world-reducer-membership-organization-missing')
  }
  if (!aggregate.persons.some(item => item.id === data.person)) {
    throw new Error('world-reducer-membership-person-missing')
  }
  const membership: Membership = Object.freeze({
    ...data,
    obligations: Object.freeze([...data.obligations]),
    validFrom: event.id,
    validTo: 'open',
    sourceEvent: event.id,
  })
  const issues = validateMembership(membership)
  if (issues.length > 0) throw new Error(`world-reducer-membership-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      memberships: Object.freeze([...aggregate.society.memberships, membership]),
    }),
  })
}

function applyMembershipEnded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['organization.membership.ended']
  const index = aggregate.society.memberships.findIndex(item => item.id === payload.membershipId)
  if (index < 0) throw new Error('world-reducer-membership-end-missing')
  const current = aggregate.society.memberships[index]!
  if (current.validTo !== 'open') throw new Error('world-reducer-membership-already-ended')
  const updated: Membership = Object.freeze({ ...current, validTo: event.id })
  const issues = validateMembership(updated)
  if (issues.length > 0) throw new Error(`world-reducer-membership-end-invalid:${issues.join(',')}`)
  const memberships = aggregate.society.memberships.map((item, itemIndex) => itemIndex === index ? updated : item)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({ ...aggregate.society, memberships: Object.freeze(memberships) }),
  })
}

function applyRelationLifecycleChanged(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['relation.lifecycle.changed']
  const index = aggregate.society.relations.findIndex(item => item.id === payload.relationId)
  if (index < 0) throw new Error('world-reducer-relation-lifecycle-missing')
  const current = aggregate.society.relations[index]!
  if (current.lifecycle.status === 'severed' || current.lifecycle.status === payload.status) {
    throw new Error('world-reducer-relation-lifecycle-transition-invalid')
  }
  const relation: Relation = Object.freeze({
    ...current,
    lifecycle: Object.freeze({
      status: payload.status,
      validFrom: current.lifecycle.validFrom,
      validTo: payload.status === 'severed' ? event.id : 'open',
    }),
  })
  const issues = validateRelation(relation)
  if (issues.length > 0) throw new Error(`world-reducer-relation-lifecycle-invalid:${issues.join(',')}`)
  const relations = aggregate.society.relations.map((item, itemIndex) => itemIndex === index ? relation : item)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({ ...aggregate.society, relations: Object.freeze(relations) }),
  })
}

/** Apply one schema-validated event to the read-only world projection. */
export function reduceWorldDomainEvent(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  registry: EventRegistry<WorldDomainEventKind>,
): WorldAggregate {
  assertNextEvent(aggregate, event)
  const schemaResult = validateWorldDomainEventPayload(registry, event.kind, event.payload)
  if (schemaResult.status !== 'valid') {
    throw new Error(`world-reducer-payload-invalid:${event.kind}:${schemaResult.status}`)
  }

  switch (event.kind) {
    case 'world.initialized':
      return applyWorldInitialized(aggregate, event)
    case 'person.created':
      return applyPersonCreated(aggregate, event)
    case 'organization.registered':
      return applyOrganizationRegistered(aggregate, event)
    case 'identity.assignment.added':
      return applyIdentityAssignmentAdded(aggregate, event)
    case 'authorization.granted':
      return applyAuthorizationGranted(aggregate, event)
    case 'relation.created':
      return applyRelationCreated(aggregate, event)
    case 'relation.claim.recorded':
      return applyRelationClaimRecorded(aggregate, event)
    case 'relation.evidence.recorded':
      return applyRelationEvidenceRecorded(aggregate, event)
    case 'knowledge.recorded':
      return applyKnowledgeRecorded(aggregate, event)
    case 'message.sent':
      return applyMessageSent(aggregate, event)
    case 'message.stage.recorded':
      return applyMessageStageRecorded(aggregate, event)
    case 'message.failed':
      return applyMessageFailed(aggregate, event)
    case 'message.propagated':
      return applyMessagePropagated(aggregate, event)
    case 'organization.membership.added':
      return applyMembershipAdded(aggregate, event)
    case 'organization.membership.ended':
      return applyMembershipEnded(aggregate, event)
    case 'relation.lifecycle.changed':
      return applyRelationLifecycleChanged(aggregate, event)
    default: {
      const unreachable: never = event.kind
      throw new Error(`world-reducer-unhandled-event:${String(unreachable)}`)
    }
  }
}
