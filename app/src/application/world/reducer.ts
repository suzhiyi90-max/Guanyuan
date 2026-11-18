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
import type { WorldTime } from '../../domain/shared/world-time'
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
import type { PersonExposure } from '../../domain/relations/exposure'
import { validatePersonExposure } from '../../domain/relations/exposure'
import type { FailureKind, KnowledgeEntry, Message, MessagePropagation } from '../../domain/cognition/model'
import { validateOrganization, validateRelation, validateRelationClaim, validateRelationEvidence, validateMembership } from '../../domain/relations/validation'
import { validateKnowledgeEntry, validateMessage, validateMessagePropagation } from '../../domain/cognition/validation'
import type { Goal, GoalStatusTransition, ScheduleEntry } from '../../domain/planning/model'
import { validateGoal, validateScheduleEntries } from '../../domain/planning/validation'
import { validateGoalStatusHistory } from '../../domain/planning/status-history'
import type { Debt, Asset, RightGrant, RightRevocation, AssetRightKind } from '../../domain/economy/model'
import { deriveAssetOwner, validateAssetSet, validateDebt, validateDebtSet } from '../../domain/economy/validation'
import type { LifeHistory } from '../../domain/life/model'
import type { LifeStateFact } from '../../domain/life/state'
import { validateLifeStateFacts } from '../../domain/life/state-validation'
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
  type MembershipCreationData,
  type GoalCreationData,
  type GoalTerminalStatus,
  type ScheduleEntryCreationData,
  type ScheduleExecutionData,
  type ScheduleDeviationData,
  type DebtCreationData,
  type AssetCreationData,
  type AssetRightGrantData,
  type PersonExposureCreationData,
  type LifeStateFactCreationData,
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

export interface WorldEventContext {
  readonly eventIds: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

function eventReferences(
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): { readonly events: readonly EventId[]; readonly eventTimes: ReadonlyMap<EventId, WorldTime> } {
  const eventIds = new Set([...(context?.eventIds ?? []), event.id])
  const eventTimes = new Map(context?.eventTimes ?? [])
  eventTimes.set(event.id, event.committedAt)
  return { events: [...eventIds], eventTimes }
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

function applyWorldTimeAdvanced(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['world.time.advanced']
  if (compareWorldTime(payload.from, aggregate.worldTime) !== 0
    || compareWorldTime(payload.to, event.committedAt) !== 0
    || compareWorldTime(payload.to, aggregate.worldTime) <= 0) {
    throw new Error('world-reducer-clock-advance-invalid')
  }
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
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

function applyGoalCreated(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['goal.created']
  const data: GoalCreationData = payload.goal
  if (aggregate.planning.goals.some(item => item.id === data.id)) {
    throw new Error('world-reducer-goal-duplicate')
  }
  const personIndex = aggregate.persons.findIndex(item => item.id === data.person)
  if (personIndex < 0) throw new Error('world-reducer-goal-person-missing')
  const person = aggregate.persons[personIndex]!
  if (person.lifeState !== 'alive' || person.death.kind !== 'n/a') {
    throw new Error('world-reducer-goal-owner-not-alive')
  }
  const goal: Goal = Object.freeze({ ...data, status: 'active', sourceEvent: event.id })
  const updatedPerson: Person = Object.freeze({
    ...person,
    stateDomains: Object.freeze({
      ...person.stateDomains,
      goals: Object.freeze([...person.stateDomains.goals, goal.id]),
    }),
  })
  const persons = aggregate.persons.map((item, index) => index === personIndex ? updatedPerson : item)
  const refs = eventReferences(event, context)
  const issues = validateGoal(goal, persons, refs.events)
  if (issues.length > 0) throw new Error(`world-reducer-goal-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    persons: Object.freeze(persons),
    planning: Object.freeze({
      ...aggregate.planning,
      goals: Object.freeze([...aggregate.planning.goals, goal]),
    }),
  })
}

function applyGoalStatusChanged(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['goal.status.changed']
  const index = aggregate.planning.goals.findIndex(item => item.id === payload.goalId)
  if (index < 0) throw new Error('world-reducer-goal-status-goal-missing')
  const current = aggregate.planning.goals[index]!
  if (current.status !== 'active') throw new Error('world-reducer-goal-status-transition-invalid')
  const owner = aggregate.persons.find(item => item.id === current.person)
  if (!owner || owner.lifeState !== 'alive' || owner.death.kind !== 'n/a') {
    throw new Error('world-reducer-goal-status-owner-not-alive')
  }
  if (compareWorldTime(event.committedAt, aggregate.worldTime) <= 0) {
    throw new Error('world-reducer-goal-status-transition-not-after-source')
  }
  const status = payload.status as GoalTerminalStatus
  const updated: Goal = Object.freeze({ ...current, status })
  const transition: GoalStatusTransition = Object.freeze({
    id: brandedId<'GoalStatusTransitionId'>(`goal-transition:${event.id}`),
    goal: current.id,
    fromStatus: 'active',
    toStatus: status,
    event: event.id,
  })
  const goals = aggregate.planning.goals.map((item, itemIndex) => itemIndex === index ? updated : item)
  const transitions = [...aggregate.planning.goalStatusTransitions, transition]
  const refs = eventReferences(event, context)
  const issues = validateGoalStatusHistory(
    goals,
    transitions,
    aggregate.persons,
    aggregate.planning.goalDeathDispositions,
    { events: refs.events, eventTimes: refs.eventTimes },
  )
  if (issues.length > 0) throw new Error(`world-reducer-goal-status-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    planning: Object.freeze({
      ...aggregate.planning,
      goals: Object.freeze(goals),
      goalStatusTransitions: Object.freeze(transitions),
    }),
  })
}

function applyScheduleEntryPlanned(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['schedule.entry.planned']
  const data: ScheduleEntryCreationData = payload.entry
  if (aggregate.planning.scheduleEntries.some(item => item.id === data.id)) {
    throw new Error('world-reducer-schedule-entry-duplicate')
  }
  const entry: ScheduleEntry = Object.freeze({
    ...data,
    intent: 'planned',
    execution: field.notApplicable,
    deviation: field.notApplicable,
  })
  if (compareWorldTime({ day: entry.day, period: entry.period }, aggregate.worldTime) < 0) {
    throw new Error('world-reducer-schedule-entry-in-past')
  }
  const entries = [...aggregate.planning.scheduleEntries, entry]
  const refs = eventReferences(event, context)
  const issues = validateScheduleEntries(
    entries,
    aggregate.planning.scheduleScopes,
    aggregate.persons,
    refs.events,
  )
  if (issues.length > 0) throw new Error(`world-reducer-schedule-entry-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    planning: Object.freeze({ ...aggregate.planning, scheduleEntries: Object.freeze(entries) }),
  })
}

function applyScheduleEntryExecutionRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['schedule.entry.execution.recorded']
  const data: ScheduleExecutionData = payload
  const index = aggregate.planning.scheduleEntries.findIndex(item => item.id === data.scheduleId)
  if (index < 0) throw new Error('world-reducer-schedule-execution-entry-missing')
  const current = aggregate.planning.scheduleEntries[index]!
  if (current.execution.kind === 'value' || current.deviation.kind === 'value') {
    throw new Error('world-reducer-schedule-already-settled')
  }
  if (data.resultEventId === event.id) throw new Error('world-reducer-schedule-result-event-self-reference')
  const refs = eventReferences(event, context)
  const resultTime = refs.eventTimes.get(data.resultEventId)
  const orderedEventIds = context?.eventIds ?? []
  const resultIndex = orderedEventIds.indexOf(data.resultEventId)
  const settlementIndex = orderedEventIds.indexOf(event.id)
  if (!refs.events.includes(data.resultEventId) || !resultTime
    || resultIndex < 0 || settlementIndex < 0 || resultIndex >= settlementIndex) {
    throw new Error('world-reducer-schedule-result-event-missing-or-not-prior')
  }
  const plannedAt: WorldTime = { day: current.day, period: current.period }
  if (compareWorldTime(resultTime, plannedAt) < 0) {
    throw new Error('world-reducer-schedule-result-before-planned-time')
  }
  if (compareWorldTime(resultTime, event.committedAt) > 0) {
    throw new Error('world-reducer-schedule-result-after-settlement')
  }
  const updated: ScheduleEntry = Object.freeze({
    ...current,
    execution: field.value(data.resultEventId),
  })
  const entries = aggregate.planning.scheduleEntries.map((item, itemIndex) => itemIndex === index ? updated : item)
  const issues = validateScheduleEntries(
    entries,
    aggregate.planning.scheduleScopes,
    aggregate.persons,
    refs.events,
  )
  if (issues.length > 0) throw new Error(`world-reducer-schedule-execution-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    planning: Object.freeze({ ...aggregate.planning, scheduleEntries: Object.freeze(entries) }),
  })
}

function applyScheduleEntryDeviationRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['schedule.entry.deviation.recorded']
  const data: ScheduleDeviationData = payload
  const index = aggregate.planning.scheduleEntries.findIndex(item => item.id === data.scheduleId)
  if (index < 0) throw new Error('world-reducer-schedule-deviation-entry-missing')
  const current = aggregate.planning.scheduleEntries[index]!
  if (current.execution.kind === 'value' || current.deviation.kind === 'value') {
    throw new Error('world-reducer-schedule-already-settled')
  }
  if (!data.reason.trim()) throw new Error('world-reducer-schedule-deviation-reason-empty')
  const updated: ScheduleEntry = Object.freeze({
    ...current,
    deviation: field.value(event.id),
  })
  const refs = eventReferences(event, context)
  const entries = aggregate.planning.scheduleEntries.map((item, itemIndex) => itemIndex === index ? updated : item)
  const issues = validateScheduleEntries(
    entries,
    aggregate.planning.scheduleScopes,
    aggregate.persons,
    refs.events,
  )
  if (issues.length > 0) throw new Error(`world-reducer-schedule-deviation-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    planning: Object.freeze({ ...aggregate.planning, scheduleEntries: Object.freeze(entries) }),
  })
}

function applyDebtRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['debt.recorded']
  const data: DebtCreationData = payload.debt
  if (aggregate.economy.debts.some(item => item.id === data.id)) {
    throw new Error('world-reducer-debt-duplicate')
  }
  const debt: Debt = Object.freeze({
    ...data,
    sourceEvent: event.id,
    status: 'open',
    settlements: Object.freeze([]),
  })
  const refs = eventReferences(event, context)
  const issues = validateDebt(debt, {
    persons: aggregate.persons.map(item => item.id),
    organizations: aggregate.society.organizations.map(item => item.id),
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: aggregate.economy.rightRevocations,
  })
  if (issues.length > 0) throw new Error(`world-reducer-debt-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    economy: Object.freeze({
      ...aggregate.economy,
      debts: Object.freeze([...aggregate.economy.debts, debt]),
    }),
  })
}

function applyDebtSettled(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['debt.settled']
  const index = aggregate.economy.debts.findIndex(item => item.id === payload.debtId)
  if (index < 0) throw new Error('world-reducer-debt-settlement-debt-missing')
  const current = aggregate.economy.debts[index]!
  if (current.status === 'settled') throw new Error('world-reducer-debt-already-settled')
  const updated: Debt = Object.freeze({
    ...current,
    status: 'settled',
    settlements: Object.freeze([...current.settlements, event.id]),
  })
  const debts = aggregate.economy.debts.map((item, itemIndex) => itemIndex === index ? updated : item)
  const refs = eventReferences(event, context)
  const issues = validateDebtSet(debts, {
    persons: aggregate.persons.map(item => item.id),
    organizations: aggregate.society.organizations.map(item => item.id),
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: aggregate.economy.rightRevocations,
  })
  if (issues.length > 0) throw new Error(`world-reducer-debt-settlement-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    economy: Object.freeze({ ...aggregate.economy, debts: Object.freeze(debts) }),
  })
}

function economyReferences(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
) {
  const refs = eventReferences(event, context)
  return {
    persons: aggregate.persons.map(item => item.id),
    organizations: aggregate.society.organizations.map(item => item.id),
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: aggregate.economy.rightRevocations,
  }
}

function recomputeAssetOwner(
  asset: Asset,
  at: WorldTime,
  refs: ReturnType<typeof economyReferences>,
): Asset {
  return Object.freeze({
    ...asset,
    owner: deriveAssetOwner(asset.rights.ownership, at, refs),
  })
}

function applyAssetRegistered(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['asset.registered']
  const data: AssetCreationData = payload.asset
  if (aggregate.economy.assets.some(item => item.id === data.id)) {
    throw new Error('world-reducer-asset-duplicate')
  }
  const asset: Asset = Object.freeze({
    ...data,
    rights: Object.freeze({ ownership: Object.freeze([]), control: Object.freeze([]), handling: Object.freeze([]), disposal: Object.freeze([]) }),
    owner: field.notApplicable,
  })
  const assets = [...aggregate.economy.assets, asset]
  const refs = economyReferences(aggregate, event, context)
  const issues = validateAssetSet(assets, refs, event.committedAt)
  if (issues.length > 0) throw new Error(`world-reducer-asset-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    economy: Object.freeze({ ...aggregate.economy, assets: Object.freeze(assets) }),
  })
}

function applyAssetRightGranted(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['asset.right.granted']
  const assetIndex = aggregate.economy.assets.findIndex(item => item.id === payload.assetId)
  if (assetIndex < 0) throw new Error('world-reducer-asset-right-asset-missing')
  const data: AssetRightGrantData = payload.grant
  if (aggregate.economy.assets.some(asset =>
    (['ownership', 'control', 'handling', 'disposal'] as const)
      .some(kind => asset.rights[kind].some(grant => grant.id === data.id)))) {
    throw new Error('world-reducer-asset-right-grant-duplicate')
  }
  const grant: RightGrant = Object.freeze({ ...data, grantedBy: event.id })
  const current = aggregate.economy.assets[assetIndex]!
  const rights = Object.freeze({
    ...current.rights,
    [payload.rightKind as AssetRightKind]: Object.freeze([...current.rights[payload.rightKind as AssetRightKind], grant]),
  })
  const refs = economyReferences(aggregate, event, context)
  const updated = recomputeAssetOwner(Object.freeze({ ...current, rights }), event.committedAt, refs)
  const assets = aggregate.economy.assets.map((item, index) => index === assetIndex ? updated : item)
  const issues = validateAssetSet(assets, refs, event.committedAt)
  if (issues.length > 0) throw new Error(`world-reducer-asset-right-grant-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    economy: Object.freeze({ ...aggregate.economy, assets: Object.freeze(assets) }),
  })
}

function applyAssetRightRevoked(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['asset.right.revoked']
  const grant = aggregate.economy.assets.flatMap(asset =>
    (['ownership', 'control', 'handling', 'disposal'] as const).flatMap(kind => asset.rights[kind]),
  ).find(item => item.id === payload.grantId)
  if (!grant) throw new Error('world-reducer-asset-right-revocation-grant-missing')
  if (!grant.revocable) throw new Error('world-reducer-asset-right-revocation-not-permitted')
  if (aggregate.economy.rightRevocations.some(item => item.grant === grant.id)) {
    throw new Error('world-reducer-asset-right-revocation-duplicate')
  }
  const revocation: RightRevocation = Object.freeze({ grant: grant.id, revokedBy: event.id })
  const rightRevocations = [...aggregate.economy.rightRevocations, revocation]
  const refs = { ...economyReferences(aggregate, event, context), revocations: rightRevocations }
  const assets = aggregate.economy.assets.map(asset => recomputeAssetOwner(asset, event.committedAt, refs))
  const issues = validateAssetSet(assets, refs, event.committedAt)
  if (issues.length > 0) throw new Error(`world-reducer-asset-right-revocation-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    economy: Object.freeze({
      ...aggregate.economy,
      assets: Object.freeze(assets),
      rightRevocations: Object.freeze(rightRevocations),
    }),
  })
}

function applyLifeStateFactRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['life.state.fact.recorded']
  const data: LifeStateFactCreationData = payload.fact
  const fact: LifeStateFact = Object.freeze({
    ...data,
    sourceEvent: event.id,
    at: Object.freeze({ ...event.committedAt }),
  })
  const refs = eventReferences(event, context)
  const issues = validateLifeStateFacts(
    [...aggregate.life.stateFacts, fact],
    { persons: aggregate.persons, events: refs.events, eventTimes: refs.eventTimes },
  )
  if (issues.length > 0) throw new Error(`world-reducer-life-state-fact-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    life: Object.freeze({
      ...aggregate.life,
      stateFacts: Object.freeze([...aggregate.life.stateFacts, fact]),
    }),
  })
}

function applyPersonExposureRecorded(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): WorldAggregate {
  requireBootstrap(aggregate)
  const payload = event.payload as unknown as WorldDomainEventPayloadMap['person.exposure.recorded']
  const data: PersonExposureCreationData = payload.exposure
  if (aggregate.society.exposures.some(item => item.id === data.id)) {
    throw new Error('world-reducer-person-exposure-duplicate')
  }
  const exposure: PersonExposure = Object.freeze({
    ...data,
    sourceEvent: event.id,
    occurredAt: Object.freeze({ ...event.committedAt }),
  })
  const issues = validatePersonExposure(exposure, {
    persons: aggregate.persons.map(item => item.id),
    events: [event.id],
    eventTimes: new Map([[event.id, event.committedAt]]),
  })
  if (issues.length > 0) throw new Error(`world-reducer-person-exposure-invalid:${issues.join(',')}`)
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    society: Object.freeze({
      ...aggregate.society,
      exposures: Object.freeze([...aggregate.society.exposures, exposure]),
    }),
  })
}

/** Apply one schema-validated event to the read-only world projection. */
export function reduceWorldDomainEvent(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
  registry: EventRegistry<WorldDomainEventKind>,
  context?: WorldEventContext,
): WorldAggregate {
  assertNextEvent(aggregate, event)
  const schemaResult = validateWorldDomainEventPayload(registry, event.kind, event.payload)
  if (schemaResult.status !== 'valid') {
    throw new Error(`world-reducer-payload-invalid:${event.kind}:${schemaResult.status}`)
  }

  switch (event.kind) {
    case 'world.initialized':
      return applyWorldInitialized(aggregate, event)
    case 'world.time.advanced':
      return applyWorldTimeAdvanced(aggregate, event)
    case 'life.state.fact.recorded':
      return applyLifeStateFactRecorded(aggregate, event, context)
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
    case 'goal.created':
      return applyGoalCreated(aggregate, event, context)
    case 'goal.status.changed':
      return applyGoalStatusChanged(aggregate, event, context)
    case 'schedule.entry.planned':
      return applyScheduleEntryPlanned(aggregate, event, context)
    case 'schedule.entry.execution.recorded':
      return applyScheduleEntryExecutionRecorded(aggregate, event, context)
    case 'schedule.entry.deviation.recorded':
      return applyScheduleEntryDeviationRecorded(aggregate, event, context)
    case 'debt.recorded':
      return applyDebtRecorded(aggregate, event, context)
    case 'debt.settled':
      return applyDebtSettled(aggregate, event, context)
    case 'asset.registered':
      return applyAssetRegistered(aggregate, event, context)
    case 'asset.right.granted':
      return applyAssetRightGranted(aggregate, event, context)
    case 'asset.right.revoked':
      return applyAssetRightRevoked(aggregate, event, context)
    case 'person.exposure.recorded':
      return applyPersonExposureRecorded(aggregate, event)
    default: {
      const unreachable: never = event.kind
      throw new Error(`world-reducer-unhandled-event:${String(unreachable)}`)
    }
  }
}
