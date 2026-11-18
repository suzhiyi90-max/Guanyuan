/**
 * W6 — canonical world projection aggregate.
 *
 * This is a read-only materialized view over the W3 event ledger. It is not a
 * second fact store and it does not replace the frozen W3/W4/W5 machinery.
 * Domain validators remain authoritative for their own records; this module
 * composes them and checks references that cross domain boundaries.
 */
import type { EventLedger, WorldId } from '../event-ledger'
import type { StreamCursor } from '../event-replay'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId, PersonId } from '../shared/ids'
import type { WorldBootstrapMetadata } from './metadata'
import type { Person } from '../person/model'
import type { PersonOriginRecord } from '../person/provenance'
import { validatePersonLifecycle, validateDeathSettlementReferences } from '../person/lifecycle'

import type { IdentityAssignment, Office, Appointment, Authorization } from '../identity/model'
import { validateIdentityAssignment, validateAppointment, validateOfficeAppointments, validateOfficeAuthorizationReferences, validateAuthorizationSet } from '../identity/validation'

import type { Relation, RelationClaim, RelationEvidence, Organization, Membership } from '../relations/model'
import { validateRelationSet, validateRelationClaimSet, validateRelationEvidenceSet, validateOrganizationSet, validateMembershipSet } from '../relations/validation'

import type { KnowledgeEntry, Message, MessagePropagation } from '../cognition/model'
import { validateKnowledgeSet, validateMessageSet, validateMessagePropagationSet } from '../cognition/validation'

import type { Goal, GoalStatusTransition, GoalDeathDisposition, PlayerGoal, ScheduleScope, ScheduleEntry } from '../planning/model'
import { validateGoalSet, validatePlayerGoal, validateScheduleSet } from '../planning/validation'
import { validateGoalStatusHistory } from '../planning/status-history'

import type { Asset, Debt, RightRevocation, DebtPartySuccession } from '../economy/model'
import { validateAssetSet, validateDebtSet, validateDebtPartySuccessions } from '../economy/validation'

import type { LifeHistory, LifeDomainHook } from '../life/model'
import { validateLifeHistory, validateLifeDomainHookSet } from '../life/validation'
import type { LifeStateFact } from '../life/state'
import { validateLifeStateFacts } from '../life/state-validation'
import type { LifeStageFact } from '../life/stage'
import { validateLifeStageFacts } from '../life/stage-validation'

export interface WorldAggregate {
  readonly schemaVersion: number
  readonly worldId: WorldId
  readonly worldTime: WorldTime
  readonly streamHead: StreamCursor
  readonly bootstrap: WorldBootstrapMetadata | null
  readonly persons: readonly Person[]
  readonly playerPersonId: PersonId | null
  readonly personOrigins: readonly PersonOriginRecord[]
  readonly identity: {
    readonly assignments: readonly IdentityAssignment[]
    readonly offices: readonly Office[]
    readonly appointments: readonly Appointment[]
    readonly authorizations: readonly Authorization[]
  }
  readonly society: {
    readonly relations: readonly Relation[]
    readonly claims: readonly RelationClaim[]
    readonly evidence: readonly RelationEvidence[]
    readonly organizations: readonly Organization[]
    readonly memberships: readonly Membership[]
  }
  readonly cognition: {
    readonly knowledge: readonly KnowledgeEntry[]
    readonly messages: readonly Message[]
    readonly propagations: readonly MessagePropagation[]
  }
  readonly planning: {
    readonly goals: readonly Goal[]
    readonly goalStatusTransitions: readonly GoalStatusTransition[]
    readonly goalDeathDispositions: readonly GoalDeathDisposition[]
    readonly playerGoal: PlayerGoal | null
    readonly scheduleScopes: readonly ScheduleScope[]
    readonly scheduleEntries: readonly ScheduleEntry[]
  }
  readonly economy: {
    readonly assets: readonly Asset[]
    readonly debts: readonly Debt[]
    readonly rightRevocations: readonly RightRevocation[]
    readonly debtPartySuccessions: readonly DebtPartySuccession[]
  }
  readonly life: {
    readonly histories: readonly LifeHistory[]
    readonly hooks: readonly LifeDomainHook[]
    readonly stateFacts: readonly LifeStateFact[]
    readonly stageFacts: readonly LifeStageFact[]
  }
}

export type WorldAggregateDomain =
  | 'envelope' | 'person' | 'identity' | 'society'
  | 'cognition' | 'planning' | 'economy' | 'life'

export interface WorldAggregateIssue {
  readonly domain: WorldAggregateDomain
  readonly code: string
  readonly recordId?: string
}

export type WorldAggregateValidation =
  | { readonly status: 'valid'; readonly aggregate: WorldAggregate }
  | { readonly status: 'rejected'; readonly issues: readonly WorldAggregateIssue[] }

function addIssue(
  issues: WorldAggregateIssue[],
  domain: WorldAggregateDomain,
  code: string,
  recordId?: string,
): void {
  if (!issues.some(item => item.domain === domain && item.code === code && item.recordId === recordId)) {
    issues.push(recordId === undefined ? { domain, code } : { domain, code, recordId })
  }
}

function addCodes(
  issues: WorldAggregateIssue[],
  domain: WorldAggregateDomain,
  codes: readonly string[],
  recordId?: string,
): void {
  for (const code of codes) addIssue(issues, domain, code, recordId)
}

function uniqueIds<T>(items: readonly T[], getId: (item: T) => string): boolean {
  return new Set(items.map(getId)).size === items.length
}

function cursorMatchesLedger(cursor: StreamCursor, ledger: EventLedger): boolean {
  if (ledger.head !== ledger.events.length) return false
  if (cursor.kind === 'genesis') return ledger.head === 0 && cursor.seq === 0
  if (ledger.head === 0 || cursor.seq !== ledger.head) return false
  return ledger.events[ledger.events.length - 1]?.id === cursor.eventId
}

/** Create a valid empty shell before any people or domain facts are generated. */
export function createEmptyWorldAggregate(
  worldId: WorldId,
  worldTime: WorldTime,
): WorldAggregate {
  const empty = Object.freeze([]) as readonly never[]
  return Object.freeze({
    schemaVersion: 1,
    worldId,
    worldTime: Object.freeze({ ...worldTime }),
    streamHead: Object.freeze({ kind: 'genesis' as const, seq: 0 as const }),
    bootstrap: null,
    persons: empty,
    playerPersonId: null,
    personOrigins: empty,
    identity: Object.freeze({ assignments: empty, offices: empty, appointments: empty, authorizations: empty }),
    society: Object.freeze({ relations: empty, claims: empty, evidence: empty, organizations: empty, memberships: empty }),
    cognition: Object.freeze({ knowledge: empty, messages: empty, propagations: empty }),
    planning: Object.freeze({
      goals: empty, goalStatusTransitions: empty, goalDeathDispositions: empty,
      playerGoal: null, scheduleScopes: empty, scheduleEntries: empty,
    }),
    economy: Object.freeze({ assets: empty, debts: empty, rightRevocations: empty, debtPartySuccessions: empty }),
    life: Object.freeze({ histories: empty, hooks: empty, stateFacts: empty, stageFacts: empty }),
  })
}

/**
 * Validate one materialized world against the canonical event ledger.
 * No record is repaired, inferred, appended or mutated by this operation.
 */
export function validateWorldAggregate(
  aggregate: WorldAggregate,
  ledger: EventLedger,
): WorldAggregateValidation {
  const issues: WorldAggregateIssue[] = []
  if (!Number.isSafeInteger(aggregate.schemaVersion) || aggregate.schemaVersion < 1) {
    addIssue(issues, 'envelope', 'world-schema-version-invalid')
  }
  if (!aggregate.worldId.trim() || aggregate.worldId !== ledger.worldId) {
    addIssue(issues, 'envelope', 'world-id-ledger-mismatch')
  }
  if (!isValidWorldTime(aggregate.worldTime)) {
    addIssue(issues, 'envelope', 'world-time-invalid')
  }
  if (!cursorMatchesLedger(aggregate.streamHead, ledger)) {
    addIssue(issues, 'envelope', 'stream-head-ledger-mismatch')
  }
  if (aggregate.streamHead.kind === 'genesis' && aggregate.bootstrap !== null) {
    addIssue(issues, 'envelope', 'world-bootstrap-present-before-initialization')
  }
  if (aggregate.streamHead.kind === 'event' && aggregate.bootstrap === null) {
    addIssue(issues, 'envelope', 'world-bootstrap-metadata-missing')
  }
  if (aggregate.bootstrap === null && (aggregate.persons.length > 0 || aggregate.personOrigins.length > 0)) {
    addIssue(issues, 'envelope', 'world-bootstrap-required-before-persons')
  }
  if (aggregate.bootstrap && [aggregate.bootstrap.scenarioPackId, aggregate.bootstrap.rulesetVersion,
    aggregate.bootstrap.contentPackVersion, aggregate.bootstrap.seed, aggregate.bootstrap.seedFingerprint,
    aggregate.bootstrap.locationCode, aggregate.bootstrap.populationPolicyVersion].some(value => !value.trim())) {
    addIssue(issues, 'envelope', 'world-bootstrap-metadata-invalid')
  }
  if (aggregate.bootstrap) {
    const allowList = aggregate.bootstrap.historicalNameAllowList
    if (!Array.isArray(allowList)
      || !uniqueIds(allowList, item => item.personId)
      || new Set(allowList.map(item => item.displayName)).size !== allowList.length) {
      addIssue(issues, 'envelope', 'world-historical-name-allow-list-invalid')
    }
    for (const item of allowList ?? []) {
      if (!item.displayName.trim() || item.category !== 'famous-minister'
        || item.evidenceRefs.length === 0 || item.evidenceRefs.some((ref: string) => !ref.trim())
        || !isValidWorldTime(item.validFrom)
        || (item.validThrough !== null && (!isValidWorldTime(item.validThrough)
          || compareWorldTime(item.validThrough, item.validFrom) < 0))
        || (item.scope.kind === 'location' && !item.scope.locationCode.trim())) {
        addIssue(issues, 'envelope', 'world-historical-name-allow-list-entry-invalid', item.personId)
      }
    }
  }

  const eventIds = ledger.events.map(event => event.id)
  const eventTimes = new Map<EventId, WorldTime>()
  for (const event of ledger.events) {
    if (event.worldId !== ledger.worldId) addIssue(issues, 'envelope', 'ledger-event-world-mismatch', event.id)
    if (!isValidWorldTime(event.committedAt)) addIssue(issues, 'envelope', 'ledger-event-time-invalid', event.id)
    else eventTimes.set(event.id, event.committedAt)
  }
  const lastEvent = ledger.events[ledger.events.length - 1]
  if (lastEvent && isValidWorldTime(aggregate.worldTime) && isValidWorldTime(lastEvent.committedAt)
    && compareWorldTime(aggregate.worldTime, lastEvent.committedAt) < 0) {
    addIssue(issues, 'envelope', 'world-time-before-stream-head')
  }

  const personIds = aggregate.persons.map(person => person.id)
  if (!uniqueIds(aggregate.personOrigins, item => item.person)) {
    addIssue(issues, 'person', 'person-origin-duplicate')
  }
  const originByPerson = new Map(aggregate.personOrigins.map(item => [item.person, item.origin]))
  let playerOriginCount = 0
  for (const person of aggregate.persons) {
    const origin = originByPerson.get(person.id)
    if (!origin) {
      addIssue(issues, 'person', 'person-origin-missing', person.id)
      continue
    }
    if (origin.kind === 'seeded-random') {
      if (![origin.candidateId, origin.seedFingerprint, origin.roleCode].every(value => value.trim())
        || !['county', 'grassroots', 'other'].includes(origin.populationTier)) {
        addIssue(issues, 'person', 'person-random-origin-invalid', person.id)
      }
      if (aggregate.bootstrap && origin.seedFingerprint !== aggregate.bootstrap.seedFingerprint) {
        addIssue(issues, 'person', 'person-random-origin-seed-mismatch', person.id)
      }
    } else if (origin.kind === 'historical-minister') {
      if (origin.category !== 'famous-minister' || origin.evidenceRefs.length === 0
        || origin.evidenceRefs.some(ref => !ref.trim())
        || !isValidWorldTime(origin.validFrom)
        || (origin.validThrough !== null && !isValidWorldTime(origin.validThrough))) {
        addIssue(issues, 'person', 'person-historical-origin-invalid', person.id)
      } else if (origin.validThrough && compareWorldTime(origin.validThrough, origin.validFrom) < 0) {
        addIssue(issues, 'person', 'person-historical-origin-validity-range-invalid', person.id)
      } else if (isValidWorldTime(aggregate.worldTime)) {
        if (compareWorldTime(origin.validFrom, aggregate.worldTime) > 0
          || (origin.validThrough && compareWorldTime(origin.validThrough, aggregate.worldTime) < 0)) {
          addIssue(issues, 'person', 'person-historical-origin-outside-validity', person.id)
        }
      }
      if (origin.scope.kind === 'location'
        && (!origin.scope.locationCode.trim() || origin.scope.locationCode !== aggregate.bootstrap?.locationCode)) {
        addIssue(issues, 'person', 'person-historical-origin-location-mismatch', person.id)
      }
      const allowListEntry = aggregate.bootstrap?.historicalNameAllowList.find(item => item.personId === person.id)
      const sameScope = !!allowListEntry
        && allowListEntry.scope.kind === origin.scope.kind
        && (origin.scope.kind === 'world'
          || (allowListEntry.scope.kind === 'location'
            && allowListEntry.scope.locationCode === origin.scope.locationCode))
      const sameValidity = !!allowListEntry
        && isValidWorldTime(allowListEntry.validFrom)
        && isValidWorldTime(origin.validFrom)
        && compareWorldTime(allowListEntry.validFrom, origin.validFrom) === 0
        && ((allowListEntry.validThrough === null && origin.validThrough === null)
          || (!!allowListEntry.validThrough && !!origin.validThrough
            && isValidWorldTime(allowListEntry.validThrough)
            && isValidWorldTime(origin.validThrough)
            && compareWorldTime(allowListEntry.validThrough, origin.validThrough) === 0))
      const sameEvidence = !!allowListEntry
        && allowListEntry.evidenceRefs.length === origin.evidenceRefs.length
        && allowListEntry.evidenceRefs.every((ref, index) => ref === origin.evidenceRefs[index])
      if (!allowListEntry || allowListEntry.displayName !== person.displayName
        || !sameScope || !sameValidity || !sameEvidence) {
        addIssue(issues, 'person', 'person-historical-origin-not-allowlisted', person.id)
      }
    } else if (origin.kind === 'player-character') {
      playerOriginCount += 1
      if (aggregate.playerPersonId !== person.id) addIssue(issues, 'person', 'player-origin-reference-mismatch', person.id)
    } else {
      addIssue(issues, 'person', 'person-origin-kind-invalid', person.id)
    }
  }
  for (const origin of aggregate.personOrigins) {
    if (!personIds.includes(origin.person)) addIssue(issues, 'person', 'person-origin-person-missing', origin.person)
  }
  if (playerOriginCount > 1) addIssue(issues, 'person', 'player-origin-duplicate')
  if (aggregate.playerPersonId === null && playerOriginCount > 0) {
    addIssue(issues, 'person', 'player-origin-reference-mismatch')
  }
  if (aggregate.playerPersonId !== null
    && (!personIds.includes(aggregate.playerPersonId) || playerOriginCount !== 1)) {
    addIssue(issues, 'person', 'player-person-reference-invalid', aggregate.playerPersonId)
  }
  const organizationIds = aggregate.society.organizations.map(item => item.id)
  const officeIds = aggregate.identity.offices.map(item => item.id)
  const relationIds = aggregate.society.relations.map(item => item.id)
  const claimIds = aggregate.society.claims.map(item => item.id)
  const assetIds = aggregate.economy.assets.map(item => item.id)
  const debtIds = aggregate.economy.debts.map(item => item.id)
  const knowledgeIds = aggregate.cognition.knowledge.map(item => item.id)
  const messageIds = aggregate.cognition.messages.map(item => item.id)

  if (!uniqueIds(aggregate.persons, item => item.id)) addIssue(issues, 'person', 'person-id-duplicate')
  for (const person of aggregate.persons) {
    addCodes(issues, 'person', validatePersonLifecycle(person, aggregate.worldTime), person.id)
    if (person.death.kind === 'value') {
      addCodes(issues, 'person', validateDeathSettlementReferences(person, { events: eventIds, eventTimes }), person.id)
    }
  }

  const personSet = new Set<string>(personIds)
  const eventSet = new Set<string>(eventIds)
  const orgSet = new Set<string>(organizationIds)
  const officeSet = new Set<string>(officeIds)

  if (!uniqueIds(aggregate.identity.assignments, item => item.id)) addIssue(issues, 'identity', 'identity-id-duplicate')
  for (const item of aggregate.identity.assignments) {
    addCodes(issues, 'identity', validateIdentityAssignment(item, aggregate.identity.assignments.filter(other => other.id !== item.id)), item.id)
    if (!personSet.has(item.person)) addIssue(issues, 'identity', 'identity-person-missing', item.id)
    if (!eventSet.has(item.validFrom) || !eventSet.has(item.sourceEvent)
      || (item.validTo !== 'open' && !eventSet.has(item.validTo))) {
      addIssue(issues, 'identity', 'identity-event-reference-missing', item.id)
    }
    if (item.visibility.observer !== 'player' && !personSet.has(item.visibility.observer)) {
      addIssue(issues, 'identity', 'identity-visibility-observer-missing', item.id)
    }
  }

  if (!uniqueIds(aggregate.identity.offices, item => item.id)) addIssue(issues, 'identity', 'office-id-duplicate')
  for (const office of aggregate.identity.offices) {
    if (!orgSet.has(office.institution)) addIssue(issues, 'identity', 'office-institution-missing', office.id)
    if (office.holder.kind === 'held' && !personSet.has(office.holder.person)) {
      addIssue(issues, 'identity', 'office-holder-person-missing', office.id)
    }
    if (!eventSet.has(office.validFrom) || (office.validTo !== 'open' && !eventSet.has(office.validTo))) {
      addIssue(issues, 'identity', 'office-event-reference-missing', office.id)
    }
    addCodes(issues, 'identity', validateOfficeAppointments(office, aggregate.identity.appointments, aggregate.worldTime), office.id)
    addCodes(issues, 'identity', validateOfficeAuthorizationReferences(office, aggregate.identity.authorizations), office.id)
  }
  if (!uniqueIds(aggregate.identity.appointments, item => item.id)) addIssue(issues, 'identity', 'appointment-id-duplicate')
  for (const appointment of aggregate.identity.appointments) {
    addCodes(issues, 'identity', validateAppointment(appointment), appointment.id)
    if (!officeSet.has(appointment.office)) addIssue(issues, 'identity', 'appointment-office-missing', appointment.id)
    if (!personSet.has(appointment.person)) addIssue(issues, 'identity', 'appointment-person-missing', appointment.id)
  }
  addCodes(issues, 'identity', validateAuthorizationSet(aggregate.identity.authorizations))
  for (const grant of aggregate.identity.authorizations) {
    if (!personSet.has(grant.principal)) addIssue(issues, 'identity', 'authorization-principal-missing', grant.id)
    if (!eventSet.has(grant.grantedBy)) addIssue(issues, 'identity', 'authorization-grant-event-missing', grant.id)
    if (grant.scope.kind === 'person' && !personSet.has(grant.scope.person)) addIssue(issues, 'identity', 'authorization-scope-person-missing', grant.id)
    if (grant.scope.kind === 'office' && !officeSet.has(grant.scope.office)) addIssue(issues, 'identity', 'authorization-scope-office-missing', grant.id)
    if (grant.scope.kind === 'institution' && !orgSet.has(grant.scope.institution)) addIssue(issues, 'identity', 'authorization-scope-institution-missing', grant.id)
  }

  addCodes(issues, 'society', validateOrganizationSet(aggregate.society.organizations))
  addCodes(issues, 'society', validateRelationSet(aggregate.society.relations, personIds))
  addCodes(issues, 'society', validateRelationClaimSet(aggregate.society.claims, relationIds, personIds))
  addCodes(issues, 'society', validateRelationEvidenceSet(aggregate.society.evidence, claimIds, personIds, organizationIds))
  addCodes(issues, 'society', validateMembershipSet(aggregate.society.memberships, organizationIds, personIds))
  for (const relation of aggregate.society.relations) {
    if (!eventSet.has(relation.sourceEvent) || !eventSet.has(relation.lifecycle.validFrom)
      || (relation.lifecycle.validTo !== 'open' && !eventSet.has(relation.lifecycle.validTo))) {
      addIssue(issues, 'society', 'relation-event-reference-missing', relation.id)
    }
    if (relation.visibility.observer !== 'player' && !personSet.has(relation.visibility.observer)) {
      addIssue(issues, 'society', 'relation-visibility-observer-missing', relation.id)
    }
  }
  for (const claim of aggregate.society.claims) {
    if (!eventSet.has(claim.sourceEvent)) addIssue(issues, 'society', 'claim-event-reference-missing', claim.id)
  }
  for (const evidence of aggregate.society.evidence) {
    if (!eventSet.has(evidence.sourceEvent)) addIssue(issues, 'society', 'evidence-event-reference-missing', evidence.id)
    if (evidence.evidence.kind === 'event' && !eventSet.has(evidence.evidence.id)) {
      addIssue(issues, 'society', 'evidence-target-event-missing', evidence.id)
    }
  }
  for (const membership of aggregate.society.memberships) {
    if (!eventSet.has(membership.validFrom) || !eventSet.has(membership.sourceEvent)
      || (membership.validTo !== 'open' && !eventSet.has(membership.validTo))) {
      addIssue(issues, 'society', 'membership-event-reference-missing', membership.id)
    }
  }

  const cognitionRefs = {
    persons: personIds,
    relations: relationIds,
    claims: claimIds,
    offices: officeIds,
    organizations: organizationIds,
    assets: assetIds,
    debts: debtIds,
    events: eventIds,
    knowledge: knowledgeIds,
    messages: messageIds,
  }
  addCodes(issues, 'cognition', validateKnowledgeSet(aggregate.cognition.knowledge, cognitionRefs))
  addCodes(issues, 'cognition', validateMessageSet(aggregate.cognition.messages, cognitionRefs))
  addCodes(issues, 'cognition', validateMessagePropagationSet(
    aggregate.cognition.propagations, aggregate.cognition.messages, aggregate.cognition.knowledge, personIds,
  ))

  addCodes(issues, 'planning', validateGoalSet(aggregate.planning.goals, aggregate.persons, eventIds))
  if (aggregate.planning.playerGoal) addCodes(issues, 'planning', validatePlayerGoal(aggregate.planning.playerGoal))
  addCodes(issues, 'planning', validateScheduleSet(
    aggregate.planning.scheduleScopes, aggregate.planning.scheduleEntries, aggregate.persons, eventIds,
  ))
  addCodes(issues, 'planning', validateGoalStatusHistory(
    aggregate.planning.goals,
    aggregate.planning.goalStatusTransitions,
    aggregate.persons,
    aggregate.planning.goalDeathDispositions,
    { events: eventIds, eventTimes },
  ))

  const economyRefs = {
    persons: personIds,
    organizations: organizationIds,
    events: eventIds,
    eventTimes,
    revocations: aggregate.economy.rightRevocations,
  }
  addCodes(issues, 'economy', validateAssetSet(aggregate.economy.assets, economyRefs, aggregate.worldTime))
  addCodes(issues, 'economy', validateDebtSet(aggregate.economy.debts, economyRefs))
  addCodes(issues, 'economy', validateDebtPartySuccessions(
    aggregate.economy.debts,
    aggregate.economy.debtPartySuccessions,
    { ...economyRefs, persons: aggregate.persons },
  ))

  const lifeRefs = { persons: aggregate.persons, events: eventIds, eventTimes }
  if (!uniqueIds(aggregate.life.histories, item => item.id)) addIssue(issues, 'life', 'life-history-id-duplicate')
  for (const history of aggregate.life.histories) {
    addCodes(issues, 'life', validateLifeHistory(history, lifeRefs), history.id)
  }
  addCodes(issues, 'life', validateLifeDomainHookSet(aggregate.life.hooks, lifeRefs))
  addCodes(issues, 'life', validateLifeStateFacts(aggregate.life.stateFacts, lifeRefs))
  addCodes(issues, 'life', validateLifeStageFacts(aggregate.life.stageFacts, lifeRefs))

  return issues.length > 0
    ? { status: 'rejected', issues: Object.freeze(issues) }
    : { status: 'valid', aggregate }
}
