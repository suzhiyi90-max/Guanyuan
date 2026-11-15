import type { EventId, PersonId, RelationDeathDispositionId, RelationId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Relation } from './model'

export type RelationDeathOutcome = 'preserved' | 'ended'
export interface RelationDeathDisposition {
  readonly id: RelationDeathDispositionId
  readonly relation: RelationId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly outcome: RelationDeathOutcome
}
export interface RelationDeathReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}
export type RelationDeathIssue =
  | 'relation-death-person-missing' | 'relation-death-person-ambiguous'
  | 'relation-death-record-missing' | 'relation-death-time-invalid'
  | 'relation-death-event-missing' | 'relation-death-event-time-missing'
  | 'relation-death-event-time-mismatch' | 'relation-death-relation-missing'
  | 'relation-death-relation-ambiguous' | 'relation-death-person-not-endpoint'
  | 'relation-death-start-event-missing' | 'relation-death-start-time-missing'
  | 'relation-death-start-time-invalid' | 'relation-death-starts-at-or-after-death'
  | 'relation-death-end-event-missing' | 'relation-death-end-time-missing'
  | 'relation-death-end-time-invalid' | 'relation-death-end-before-start'
  | 'relation-death-end-not-death-event' | 'relation-death-disposition-duplicate-id'
  | 'relation-death-disposition-duplicate-endpoint' | 'relation-death-disposition-missing'
  | 'relation-death-disposition-unnecessary' | 'relation-death-disposition-invalid-outcome'
  | 'relation-death-preserved-but-severed' | 'relation-death-ended-not-closed'
  | 'relation-death-ended-not-severed' | 'relation-death-preserved-after-end'

function uniqueIssues(issues: RelationDeathIssue[]): RelationDeathIssue[] {
  return [...new Set(issues)]
}

/**
 * Requires explicit event-backed disposition only while a relation remains valid
 * at an endpoint's death. It never infers semantics from the open relation type.
 * Preserved facts remain historical facts; ended relations close at the death event.
 * This validator is read-only and never mutates relations, persons, claims, evidence,
 * survivor state, or estate settlement status.
 */
export function validateRelationDeathContinuity(
  relations: readonly Relation[],
  dispositions: readonly RelationDeathDisposition[],
  persons: readonly Person[],
  refs: RelationDeathReferences,
): RelationDeathIssue[] {
  const issues: RelationDeathIssue[] = []
  const relationMap = new Map<string, Relation[]>()
  const personMap = new Map<string, Person[]>()
  for (const item of relations) relationMap.set(item.id, [...(relationMap.get(item.id) ?? []), item])
  for (const item of persons) personMap.set(item.id, [...(personMap.get(item.id) ?? []), item])

  if (new Set(dispositions.map(item => item.id)).size !== dispositions.length) {
    issues.push('relation-death-disposition-duplicate-id')
  }
  const keyOf = (relation: RelationId, person: PersonId) => String(relation) + '::' + String(person)
  const byEndpoint = new Map<string, RelationDeathDisposition[]>()
  for (const item of dispositions) {
    const key = keyOf(item.relation, item.deceased)
    byEndpoint.set(key, [...(byEndpoint.get(key) ?? []), item])
  }
  if ([...byEndpoint.values()].some(items => items.length > 1)) {
    issues.push('relation-death-disposition-duplicate-endpoint')
  }

  for (const item of dispositions) {
    const relationMatches = relationMap.get(item.relation) ?? []
    if (relationMatches.length === 0) { issues.push('relation-death-relation-missing'); continue }
    if (relationMatches.length !== 1) { issues.push('relation-death-relation-ambiguous'); continue }
    const relation = relationMatches[0]
    if (relation.from !== item.deceased && relation.to !== item.deceased) {
      issues.push('relation-death-person-not-endpoint'); continue
    }
    const personMatches = personMap.get(item.deceased) ?? []
    if (personMatches.length === 0) { issues.push('relation-death-person-missing'); continue }
    if (personMatches.length !== 1) { issues.push('relation-death-person-ambiguous'); continue }
    const person = personMatches[0]
    if (person.lifeState !== 'dead' || person.death.kind !== 'value') {
      issues.push('relation-death-record-missing'); continue
    }
    const death = person.death.value
    if (!isValidWorldTime(death.at)) { issues.push('relation-death-time-invalid'); continue }
    if (death.causeEvent !== item.deathEvent) issues.push('relation-death-event-time-mismatch')
    if (!refs.events.includes(item.deathEvent)) issues.push('relation-death-event-missing')
    const deathAt = refs.eventTimes.get(item.deathEvent)
    if (!deathAt || !isValidWorldTime(deathAt)) { issues.push('relation-death-event-time-missing'); continue }
    if (compareWorldTime(deathAt, death.at) !== 0) {
      issues.push('relation-death-event-time-mismatch'); continue
    }

    if (!refs.events.includes(relation.lifecycle.validFrom)) {
      issues.push('relation-death-start-event-missing'); continue
    }
    const startAt = refs.eventTimes.get(relation.lifecycle.validFrom)
    if (!startAt) { issues.push('relation-death-start-time-missing'); continue }
    if (!isValidWorldTime(startAt)) { issues.push('relation-death-start-time-invalid'); continue }
    if (compareWorldTime(startAt, death.at) >= 0) {
      issues.push('relation-death-starts-at-or-after-death'); continue
    }

    let endAt: WorldTime | undefined
    if (relation.lifecycle.validTo !== 'open') {
      if (!refs.events.includes(relation.lifecycle.validTo)) {
        issues.push('relation-death-end-event-missing'); continue
      }
      endAt = refs.eventTimes.get(relation.lifecycle.validTo)
      if (!endAt) { issues.push('relation-death-end-time-missing'); continue }
      if (!isValidWorldTime(endAt)) { issues.push('relation-death-end-time-invalid'); continue }
      if (compareWorldTime(endAt, startAt) <= 0) {
        issues.push('relation-death-end-before-start'); continue
      }
      if (compareWorldTime(endAt, death.at) < 0) {
        issues.push('relation-death-disposition-unnecessary'); continue
      }
      if (compareWorldTime(endAt, death.at) === 0 && relation.lifecycle.validTo !== item.deathEvent) {
        issues.push('relation-death-end-not-death-event')
      }
    }

    if (item.outcome === 'ended') {
      if (relation.lifecycle.validTo !== item.deathEvent) issues.push('relation-death-ended-not-closed')
      if (relation.lifecycle.status !== 'severed') issues.push('relation-death-ended-not-severed')
    } else if (item.outcome === 'preserved') {
      if (relation.lifecycle.status === 'severed') issues.push('relation-death-preserved-but-severed')
      if (endAt && compareWorldTime(endAt, death.at) <= 0) issues.push('relation-death-preserved-after-end')
    } else {
      issues.push('relation-death-disposition-invalid-outcome')
    }
  }

  // A relation may touch two people who die at different times. A preserved
  // disposition keeps the fact available for the other endpoint's later death.
  for (const relation of relations) {
    const endpointIds = [...new Set([relation.from, relation.to])]
    const deceased: Array<{ id: PersonId; at: WorldTime; event: EventId }> = []
    for (const id of endpointIds) {
      const matches = personMap.get(id) ?? []
      if (matches.length !== 1 || matches[0].lifeState !== 'dead' || matches[0].death.kind !== 'value') continue
      const death = matches[0].death.value
      if (isValidWorldTime(death.at)) deceased.push({ id, at: death.at, event: death.causeEvent })
    }
    deceased.sort((a, b) => compareWorldTime(a.at, b.at))
    let terminalAt: WorldTime | undefined
    for (const endpoint of deceased) {
      if (terminalAt && compareWorldTime(endpoint.at, terminalAt) >= 0) continue
      const startAt = refs.eventTimes.get(relation.lifecycle.validFrom)
      if (!startAt || !isValidWorldTime(startAt) || compareWorldTime(startAt, endpoint.at) >= 0) continue
      if (relation.lifecycle.validTo !== 'open') {
        const endAt = refs.eventTimes.get(relation.lifecycle.validTo)
        if (!endAt || !isValidWorldTime(endAt) || compareWorldTime(endAt, endpoint.at) < 0) continue
      }
      const matches = byEndpoint.get(keyOf(relation.id, endpoint.id)) ?? []
      if (matches.length === 0) { issues.push('relation-death-disposition-missing'); continue }
      if (matches.length !== 1 || matches[0].deathEvent !== endpoint.event) continue
      if (matches[0].outcome === 'ended') terminalAt = endpoint.at
    }
  }
  return uniqueIssues(issues)
}
