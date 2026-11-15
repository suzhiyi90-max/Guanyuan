import type { EventId, MembershipDeathHandoffId, MembershipId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Membership } from './model'

export interface MembershipDeathHandoff {
  readonly id: MembershipDeathHandoffId
  readonly sourceMembership: MembershipId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly successorMembership: MembershipId
  readonly handoffEvent: EventId
}

export interface MembershipDeathReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

export type MembershipDeathIssue =
  | 'membership-death-person-missing'
  | 'membership-death-person-ambiguous'
  | 'membership-death-person-alive'
  | 'membership-death-record-missing'
  | 'membership-death-time-invalid'
  | 'membership-death-event-missing'
  | 'membership-death-event-time-missing'
  | 'membership-death-event-time-mismatch'
  | 'membership-death-membership-start-event-missing'
  | 'membership-death-membership-start-time-missing'
  | 'membership-death-membership-start-time-invalid'
  | 'membership-death-membership-starts-at-or-after-death'
  | 'membership-death-membership-open-at-death'
  | 'membership-death-membership-end-event-missing'
  | 'membership-death-membership-end-time-missing'
  | 'membership-death-membership-end-time-invalid'
  | 'membership-death-membership-ends-after-death'
  | 'membership-death-membership-end-not-death-event'
  | 'membership-death-membership-end-before-start'
  | 'membership-death-handoff-duplicate-id'
  | 'membership-death-handoff-duplicate-source'
  | 'membership-death-handoff-duplicate-successor'
  | 'membership-death-source-membership-missing'
  | 'membership-death-source-membership-ambiguous'
  | 'membership-death-source-person-mismatch'
  | 'membership-death-source-not-closed-by-death'
  | 'membership-death-source-not-active-before-death'
  | 'membership-death-successor-membership-missing'
  | 'membership-death-successor-membership-ambiguous'
  | 'membership-death-successor-same-membership'
  | 'membership-death-successor-organization-mismatch'
  | 'membership-death-successor-person-missing'
  | 'membership-death-successor-person-not-alive'
  | 'membership-death-handoff-event-missing'
  | 'membership-death-handoff-event-time-missing'
  | 'membership-death-handoff-before-death'
  | 'membership-death-successor-start-mismatch'

function one<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined
}

function personAliveAt(person: Person, at: WorldTime): boolean {
  if (!isValidWorldTime(at)) return false
  if (person.birth.kind === 'value'
    && (!isValidWorldTime(person.birth.value)
      || compareWorldTime(at, person.birth.value) < 0)) return false
  if (person.lifeState === 'alive') return person.death.kind === 'n/a'
  return person.death.kind === 'value'
    && isValidWorldTime(person.death.value.at)
    && compareWorldTime(at, person.death.value.at) < 0
}

/**
 * A membership is a person-bound historical interval. A death closes only
 * memberships still active immediately before death; it does not dissolve the
 * organization, transfer the deceased's role, or infer a successor.
 */
export function validateMembershipDeathContinuity(
  memberships: readonly Membership[],
  persons: readonly Person[],
  refs: MembershipDeathReferences,
): MembershipDeathIssue[] {
  const issues: MembershipDeathIssue[] = []
  for (const membership of memberships) {
    const matchingPeople = persons.filter(person => person.id === membership.person)
    if (matchingPeople.length === 0) {
      issues.push('membership-death-person-missing')
      continue
    }
    if (matchingPeople.length !== 1) {
      issues.push('membership-death-person-ambiguous')
      continue
    }
    const person = matchingPeople[0]
    if (person.lifeState !== 'dead') continue
    if (person.death.kind !== 'value') {
      issues.push('membership-death-record-missing')
      continue
    }
    const death = person.death.value
    if (!isValidWorldTime(death.at)) {
      issues.push('membership-death-time-invalid')
      continue
    }
    if (!refs.events.includes(death.causeEvent)) {
      issues.push('membership-death-event-missing')
    }
    const deathAt = refs.eventTimes.get(death.causeEvent)
    if (!deathAt || !isValidWorldTime(deathAt)) {
      issues.push('membership-death-event-time-missing')
    } else if (compareWorldTime(deathAt, death.at) !== 0) {
      issues.push('membership-death-event-time-mismatch')
    }

    if (!refs.events.includes(membership.validFrom)) {
      issues.push('membership-death-membership-start-event-missing')
      continue
    }
    const startAt = refs.eventTimes.get(membership.validFrom)
    if (!startAt) {
      issues.push('membership-death-membership-start-time-missing')
      continue
    }
    if (!isValidWorldTime(startAt)) {
      issues.push('membership-death-membership-start-time-invalid')
      continue
    }
    if (compareWorldTime(startAt, death.at) >= 0) {
      issues.push('membership-death-membership-starts-at-or-after-death')
      continue
    }

    if (membership.validTo === 'open') {
      issues.push('membership-death-membership-open-at-death')
      continue
    }
    if (!refs.events.includes(membership.validTo)) {
      issues.push('membership-death-membership-end-event-missing')
      continue
    }
    const endAt = refs.eventTimes.get(membership.validTo)
    if (!endAt) {
      issues.push('membership-death-membership-end-time-missing')
      continue
    }
    if (!isValidWorldTime(endAt)) {
      issues.push('membership-death-membership-end-time-invalid')
      continue
    }
    if (compareWorldTime(endAt, startAt) <= 0) {
      issues.push('membership-death-membership-end-before-start')
      continue
    }
    if (compareWorldTime(endAt, death.at) > 0) {
      issues.push('membership-death-membership-ends-after-death')
    } else if (compareWorldTime(endAt, death.at) === 0
      && membership.validTo !== death.causeEvent) {
      issues.push('membership-death-membership-end-not-death-event')
    }
  }
  return [...new Set(issues)]
}

/**
 * Validates an explicit organization-side successor membership. The target is a
 * new membership record in the same organization, not a mutation or inheritance
 * of the deceased person's membership. Role and obligations are authored on the
 * successor record and are deliberately not copied or compared.
 */
export function validateMembershipDeathHandoffs(
  memberships: readonly Membership[],
  handoffs: readonly MembershipDeathHandoff[],
  persons: readonly Person[],
  refs: MembershipDeathReferences,
): MembershipDeathIssue[] {
  const issues: MembershipDeathIssue[] = []
  const byId = new Map<string, Membership[]>()
  for (const membership of memberships) {
    const values = byId.get(membership.id) ?? []
    values.push(membership)
    byId.set(membership.id, values)
  }
  const personById = new Map<string, Person[]>()
  for (const person of persons) {
    const values = personById.get(person.id) ?? []
    values.push(person)
    personById.set(person.id, values)
  }

  if (new Set(handoffs.map(item => item.id)).size !== handoffs.length) {
    issues.push('membership-death-handoff-duplicate-id')
  }
  if (new Set(handoffs.map(item => item.sourceMembership)).size !== handoffs.length) {
    issues.push('membership-death-handoff-duplicate-source')
  }
  if (new Set(handoffs.map(item => item.successorMembership)).size !== handoffs.length) {
    issues.push('membership-death-handoff-duplicate-successor')
  }

  for (const handoff of handoffs) {
    const sourceMatches = byId.get(handoff.sourceMembership) ?? []
    const targetMatches = byId.get(handoff.successorMembership) ?? []
    if (sourceMatches.length === 0) {
      issues.push('membership-death-source-membership-missing')
      continue
    }
    if (sourceMatches.length !== 1) {
      issues.push('membership-death-source-membership-ambiguous')
      continue
    }
    const source = sourceMatches[0]
    if (source.person !== handoff.deceased) issues.push('membership-death-source-person-mismatch')
    if (source.validTo !== handoff.deathEvent) issues.push('membership-death-source-not-closed-by-death')

    const deceasedMatches = personById.get(handoff.deceased) ?? []
    const deceased = one(deceasedMatches)
    if (!deceased) {
      issues.push('membership-death-person-missing')
      continue
    }
    if (deceased.lifeState !== 'dead') {
      issues.push('membership-death-person-alive')
      continue
    }
    if (deceased.death.kind !== 'value') {
      issues.push('membership-death-record-missing')
      continue
    }
    const death = deceased.death.value
    if (!isValidWorldTime(death.at)) {
      issues.push('membership-death-time-invalid')
      continue
    }
    if (death.causeEvent !== handoff.deathEvent) issues.push('membership-death-event-time-mismatch')
    if (!refs.events.includes(handoff.deathEvent)) issues.push('membership-death-event-missing')
    const deathAt = refs.eventTimes.get(handoff.deathEvent)
    if (!deathAt || !isValidWorldTime(deathAt)) {
      issues.push('membership-death-event-time-missing')
    } else if (compareWorldTime(deathAt, death.at) !== 0) {
      issues.push('membership-death-event-time-mismatch')
    }

    const sourceStart = refs.eventTimes.get(source.validFrom)
    if (!refs.events.includes(source.validFrom) || !sourceStart || !isValidWorldTime(sourceStart)
      || compareWorldTime(sourceStart, death.at) >= 0) {
      issues.push('membership-death-source-not-active-before-death')
    }

    if (targetMatches.length === 0) {
      issues.push('membership-death-successor-membership-missing')
      continue
    }
    if (targetMatches.length !== 1) {
      issues.push('membership-death-successor-membership-ambiguous')
      continue
    }
    const target = targetMatches[0]
    if (target.id === source.id) issues.push('membership-death-successor-same-membership')
    if (target.organization !== source.organization) {
      issues.push('membership-death-successor-organization-mismatch')
    }
    if (target.person === handoff.deceased) {
      issues.push('membership-death-successor-person-not-alive')
    }

    if (!refs.events.includes(handoff.handoffEvent)) {
      issues.push('membership-death-handoff-event-missing')
    }
    const handoffAt = refs.eventTimes.get(handoff.handoffEvent)
    if (!handoffAt || !isValidWorldTime(handoffAt)) {
      issues.push('membership-death-handoff-event-time-missing')
    } else if (compareWorldTime(handoffAt, death.at) <= 0) {
      issues.push('membership-death-handoff-before-death')
    }
    if (target.validFrom !== handoff.handoffEvent) {
      issues.push('membership-death-successor-start-mismatch')
    }

    const successorMatches = personById.get(target.person) ?? []
    if (successorMatches.length !== 1) {
      issues.push('membership-death-successor-person-missing')
    } else if (!handoffAt || !isValidWorldTime(handoffAt)
      || !personAliveAt(successorMatches[0], handoffAt)) {
      issues.push('membership-death-successor-person-not-alive')
    }
  }
  return [...new Set(issues)]
}
