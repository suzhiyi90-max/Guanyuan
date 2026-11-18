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
import type { Organization, Relation, RelationClaim, RelationEvidence } from '../../domain/relations/model'
import { validateOrganization, validateRelation, validateRelationClaim, validateRelationEvidence } from '../../domain/relations/validation'
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
    default: {
      const unreachable: never = event.kind
      throw new Error(`world-reducer-unhandled-event:${String(unreachable)}`)
    }
  }
}
