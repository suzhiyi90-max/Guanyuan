/**
 * W6-F — observer-scoped, read-only social projection.
 *
 * The full WorldAggregate is an internal reconstruction model. Player-facing
 * screens must use this projection so NPC-private knowledge, private
 * relationships, and other holders' communications are not exposed by default.
 * This projection does not infer acquaintance: only explicit visible facts
 * contribute people to the known-person set.
 */
import type { PersonId } from '../../domain/shared/ids'
import type { Visibility } from '../../domain/shared/visibility'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type { Person } from '../../domain/person/model'
import type {
  IdentityAssignment,
} from '../../domain/identity/model'
import type {
  Relation,
  RelationClaim,
  RelationEvidence,
  Organization,
  Membership,
} from '../../domain/relations/model'
import type {
  KnowledgeEntry,
  Message,
  MessagePropagation,
  EntityRef,
} from '../../domain/cognition/model'
import type { Goal, ScheduleEntry } from '../../domain/planning/model'

export type WorldObserver = PersonId | 'player'

export interface WorldObserverSocialView {
  readonly worldId: WorldAggregate['worldId']
  readonly observer: WorldObserver
  readonly observerPersonId: PersonId | null
  readonly worldTime: WorldAggregate['worldTime']
  readonly streamHead: WorldAggregate['streamHead']
  /** The observer's own person record, if the player character has been created. */
  readonly self: Person | null
  /** People explicitly known through visible records; never the global person table. */
  readonly knownPersons: readonly Person[]
  readonly identityAssignments: readonly IdentityAssignment[]
  readonly relations: readonly Relation[]
  readonly claims: readonly RelationClaim[]
  readonly evidence: readonly RelationEvidence[]
  readonly organizations: readonly Organization[]
  /** Only the observer's own membership records are returned. */
  readonly memberships: readonly Membership[]
  /** Knowledge entries are strictly holder-scoped. */
  readonly knowledge: readonly KnowledgeEntry[]
  /** Messages are visible only to their sender or recipient. */
  readonly messages: readonly Message[]
  readonly propagations: readonly MessagePropagation[]
  readonly goals: readonly Goal[]
  readonly scheduleEntries: readonly ScheduleEntry[]
}

function observerPersonId(aggregate: WorldAggregate, observer: WorldObserver): PersonId | null {
  return observer === 'player' ? aggregate.playerPersonId : observer
}

function observerMatches(
  recordedObserver: PersonId | 'player',
  observer: WorldObserver,
  personId: PersonId | null,
): boolean {
  return recordedObserver === 'player'
    ? observer === 'player'
    : personId !== null && recordedObserver === personId
}

function visibleTo(
  visibility: Visibility,
  observer: WorldObserver,
  personId: PersonId | null,
): boolean {
  return visibility.level === 'public'
    || observerMatches(visibility.observer, observer, personId)
}

function addEntityPeople(
  ref: EntityRef,
  aggregate: WorldAggregate,
  addPerson: (id: PersonId) => void,
): void {
  switch (ref.kind) {
    case 'person':
      addPerson(ref.id)
      return
    case 'relation': {
      const relation = aggregate.society.relations.find(item => item.id === ref.id)
      if (relation) {
        addPerson(relation.from)
        addPerson(relation.to)
      }
      return
    }
    case 'claim': {
      const claim = aggregate.society.claims.find(item => item.id === ref.id)
      const relation = claim && aggregate.society.relations.find(item => item.id === claim.relation)
      if (relation) {
        addPerson(relation.from)
        addPerson(relation.to)
      }
      return
    }
    case 'message': {
      const message = aggregate.cognition.messages.find(item => item.id === ref.id)
      if (message) {
        addPerson(message.sender)
        addPerson(message.recipient)
      }
      return
    }
    case 'office':
    case 'org':
    case 'asset':
    case 'debt':
    case 'event':
    case 'knowledge':
      return
  }
}

/**
 * Derive a safe social view for one observer from the canonical aggregate.
 * No input records are mutated and no hidden NPC record is copied wholesale.
 */
export function projectWorldForObserver(
  aggregate: WorldAggregate,
  observer: WorldObserver,
): WorldObserverSocialView {
  const personId = observerPersonId(aggregate, observer)
  const identityAssignments = aggregate.identity.assignments.filter(item =>
    visibleTo(item.visibility, observer, personId))
  const relations = aggregate.society.relations.filter(item =>
    visibleTo(item.visibility, observer, personId))
  const claims = aggregate.society.claims.filter(item =>
    item.claimant === 'player'
      ? observer === 'player'
      : personId !== null && item.claimant === personId)
  const claimIds = new Set(claims.map(item => item.id))
  const evidence = aggregate.society.evidence.filter(item => claimIds.has(item.claim))
  const memberships = personId === null
    ? []
    : aggregate.society.memberships.filter(item => item.person === personId)
  const organizationIds = new Set(memberships.map(item => item.organization))
  const organizations = aggregate.society.organizations.filter(item => organizationIds.has(item.id))
  const knowledge = personId === null
    ? []
    : aggregate.cognition.knowledge.filter(item => item.holder === personId)
  const messages = personId === null
    ? []
    : aggregate.cognition.messages.filter(item => item.sender === personId || item.recipient === personId)
  const messageIds = new Set(messages.map(item => item.id))
  const propagations = personId === null
    ? []
    : aggregate.cognition.propagations.filter(item =>
        messageIds.has(item.message) && (item.fromHolder === personId || item.toHolder === personId))
  const goals = aggregate.planning.goals.filter(item =>
    visibleTo(item.visibility, observer, personId))
  const scheduleEntries = aggregate.planning.scheduleEntries.filter(item =>
    visibleTo(item.visibility, observer, personId))

  const personMap = new Map(aggregate.persons.map(person => [person.id, person]))
  const knownIds = new Set<PersonId>()
  const addPerson = (id: PersonId) => {
    if (personMap.has(id)) knownIds.add(id)
  }

  if (personId) addPerson(personId)
  for (const item of identityAssignments) addPerson(item.person)
  for (const relation of relations) {
    addPerson(relation.from)
    addPerson(relation.to)
  }
  for (const claim of claims) {
    const relation = aggregate.society.relations.find(item => item.id === claim.relation)
    if (relation) {
      addPerson(relation.from)
      addPerson(relation.to)
    }
  }
  for (const item of evidence) {
    if (item.evidence.kind === 'person') addPerson(item.evidence.id)
  }
  for (const item of knowledge) addEntityPeople(item.subject, aggregate, addPerson)
  for (const item of messages) {
    addPerson(item.sender)
    addPerson(item.recipient)
    for (const ref of item.contentRefs) addEntityPeople(ref, aggregate, addPerson)
  }
  for (const item of propagations) {
    addPerson(item.fromHolder)
    addPerson(item.toHolder)
  }
  for (const item of memberships) addPerson(item.person)
  for (const item of goals) addPerson(item.person)
  for (const item of scheduleEntries) addPerson(item.person)

  const knownPersons = aggregate.persons.filter(item => knownIds.has(item.id))
  const self = personId ? personMap.get(personId) ?? null : null

  return Object.freeze({
    worldId: aggregate.worldId,
    observer,
    observerPersonId: personId,
    worldTime: aggregate.worldTime,
    streamHead: aggregate.streamHead,
    self,
    knownPersons: Object.freeze(knownPersons),
    identityAssignments: Object.freeze(identityAssignments),
    relations: Object.freeze(relations),
    claims: Object.freeze(claims),
    evidence: Object.freeze(evidence),
    organizations: Object.freeze(organizations),
    memberships: Object.freeze(memberships),
    knowledge: Object.freeze(knowledge),
    messages: Object.freeze(messages),
    propagations: Object.freeze(propagations),
    goals: Object.freeze(goals),
    scheduleEntries: Object.freeze(scheduleEntries),
  })
}
