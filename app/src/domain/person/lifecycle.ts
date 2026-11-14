import type { Field } from '../shared/field'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { WorldTime } from '../shared/world-time'
import type { EstateSettlementDomain, Person } from './model'

const requiredSettlementDomains: readonly EstateSettlementDomain[] = [
  'office',
  'debt',
  'asset',
  'membership',
  'relation',
  'goal',
]

export type PersonLifecycleIssue =
  | 'dead-person-requires-death-record'
  | 'alive-person-must-not-have-death-record'
  | 'death-record-is-in-the-future'
  | 'birth-is-in-the-future'
  | 'death-precedes-birth'
  | 'invalid-world-time'
  | 'death-settlement-chain-incomplete'

export function validatePersonLifecycle(person: Person, now: WorldTime): PersonLifecycleIssue[] {
  const issues: PersonLifecycleIssue[] = []
  const addIssue = (issue: PersonLifecycleIssue) => {
    if (!issues.includes(issue)) issues.push(issue)
  }
  const nowIsValid = isValidWorldTime(now)

  if (!nowIsValid) addIssue('invalid-world-time')

  if (person.lifeState === 'dead' && person.death.kind !== 'value') {
    addIssue('dead-person-requires-death-record')
  }

  if (person.lifeState === 'alive' && person.death.kind !== 'n/a') {
    addIssue('alive-person-must-not-have-death-record')
  }

  const birthAt = isValueField(person.birth) ? person.birth.value : undefined
  if (birthAt !== undefined) {
    if (!isValidWorldTime(birthAt)) {
      addIssue('invalid-world-time')
    } else if (nowIsValid && compareWorldTime(birthAt, now) > 0) {
      addIssue('birth-is-in-the-future')
    }
  }

  if (person.death.kind === 'value') {
    const deathAt = person.death.value.at
    if (!isValidWorldTime(deathAt)) {
      addIssue('invalid-world-time')
    } else {
      if (nowIsValid && compareWorldTime(deathAt, now) > 0) {
        addIssue('death-record-is-in-the-future')
      }
      if (birthAt !== undefined && isValidWorldTime(birthAt) && compareWorldTime(deathAt, birthAt) < 0) {
        addIssue('death-precedes-birth')
      }
    }

    const domains = person.death.value.estateSettlements.map((item) => item.domain)
    const uniqueDomains = new Set(domains)
    if (
      domains.length !== requiredSettlementDomains.length
      || uniqueDomains.size !== requiredSettlementDomains.length
      || requiredSettlementDomains.some((domain) => !uniqueDomains.has(domain))
    ) {
      addIssue('death-settlement-chain-incomplete')
    }
  }

  return issues
}

function isValueField<T extends {}>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

export function isPersonLifecycleValid(person: Person, now: WorldTime): boolean {
  return validatePersonLifecycle(person, now).length === 0
}

/** Shared temporal boundary verdict for all event-backed person-life records. */
export type PersonLifeTimeBoundaryViolation = 'before-birth' | 'after-death'

/**
 * Birth and death instants are inclusive. Unknown, not-generated and n/a
 * boundaries remain unknown; this helper never invents a life boundary.
 * Invalid record times are handled by the owning domain validator.
 */
export function personLifeTimeBoundaryViolations(
  person: Person,
  at: WorldTime,
): PersonLifeTimeBoundaryViolation[] {
  if (!isValidWorldTime(at)) return []
  const violations: PersonLifeTimeBoundaryViolation[] = []
  if (person.birth.kind === 'value'
    && isValidWorldTime(person.birth.value)
    && compareWorldTime(at, person.birth.value) < 0) {
    violations.push('before-birth')
  }
  if (person.death.kind === 'value'
    && isValidWorldTime(person.death.value.at)
    && compareWorldTime(at, person.death.value.at) > 0) {
    violations.push('after-death')
  }
  return violations
}


export type DeathSettlementIssue =
  | 'death-settlement-person-alive'
  | 'death-settlement-record-missing'
  | 'death-settlement-death-event-missing'
  | 'death-settlement-death-time-invalid'
  | 'death-settlement-death-event-time-missing'
  | 'death-settlement-death-time-mismatch'
  | 'death-settlement-event-missing'
  | 'death-settlement-event-time-missing'
  | 'death-settlement-before-death'
  | 'death-settlement-invalid-status'

export interface DeathSettlementReferences {
  readonly events: readonly import('../shared/ids').EventId[]
  readonly eventTimes: ReadonlyMap<import('../shared/ids').EventId, WorldTime>
}

/**
 * Validate only the shared reference/time envelope for a deceased person's six
 * settlement domains. Domain-specific completion remains the responsibility of
 * each domain validator; this function never settles or mutates domain records.
 */
export function validateDeathSettlementReferences(
  person: Person,
  refs: DeathSettlementReferences,
): DeathSettlementIssue[] {
  const issues: DeathSettlementIssue[] = []
  if (person.lifeState !== 'dead') issues.push('death-settlement-person-alive')
  if (person.death.kind !== 'value') {
    issues.push('death-settlement-record-missing')
    return issues
  }

  const death = person.death.value
  const deathTimeValid = isValidWorldTime(death.at)
  if (!deathTimeValid) issues.push('death-settlement-death-time-invalid')
  if (!refs.events.includes(death.causeEvent)) {
    issues.push('death-settlement-death-event-missing')
  }
  const causeAt = refs.eventTimes.get(death.causeEvent)
  if (!causeAt || !isValidWorldTime(causeAt)) {
    issues.push('death-settlement-death-event-time-missing')
  } else if (deathTimeValid && compareWorldTime(causeAt, death.at) !== 0) {
    issues.push('death-settlement-death-time-mismatch')
  }

  for (const settlement of death.estateSettlements) {
    if (settlement.status !== 'pending' && settlement.status !== 'settled') {
      issues.push('death-settlement-invalid-status')
    }
    if (!refs.events.includes(settlement.settlementEvent)) {
      issues.push('death-settlement-event-missing')
      continue
    }
    const settlementAt = refs.eventTimes.get(settlement.settlementEvent)
    if (!settlementAt || !isValidWorldTime(settlementAt)) {
      issues.push('death-settlement-event-time-missing')
      continue
    }
    if (deathTimeValid && compareWorldTime(settlementAt, death.at) < 0) {
      issues.push('death-settlement-before-death')
    }
  }
  return [...new Set(issues)]
}
