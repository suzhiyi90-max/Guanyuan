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
import { validatePersonLifecycle } from '../../domain/person/lifecycle'
import type { IdentityAssignment, Authorization } from '../../domain/identity/model'
import {
  validateIdentityAssignment,
  validateAuthorization,
} from '../../domain/identity/validation'
import type { Organization } from '../../domain/relations/model'
import { validateOrganization } from '../../domain/relations/validation'
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
} from './event-catalog'

function assertNextEvent(
  aggregate: WorldAggregate,
  event: LedgerEvent<WorldDomainEventKind>,
): void {
  if (event.worldId !== aggregate.worldId) throw new Error('world-reducer-world-id-mismatch')
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
  requireUniquePerson(aggregate, data.id, data.history)
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
  return Object.freeze({
    ...aggregate,
    ...withEventCursor(aggregate, event),
    persons: Object.freeze([...aggregate.persons, person]),
    life: Object.freeze({
      ...aggregate.life,
      histories: Object.freeze([...aggregate.life.histories, history]),
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
  if (data.scope.kind === 'institution'
    && !aggregate.society.organizations.some(item => item.id === data.scope.institution)) {
    throw new Error('world-reducer-authorization-institution-missing')
  }
  if (data.scope.kind === 'person' && !aggregate.persons.some(item => item.id === data.scope.person)) {
    throw new Error('world-reducer-authorization-person-scope-missing')
  }
  if (data.scope.kind === 'office' && !aggregate.identity.offices.some(item => item.id === data.scope.office)) {
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
  }
}
