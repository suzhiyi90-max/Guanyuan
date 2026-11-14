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

  if (person.death.kind === 'value') {
    const deathAt = person.death.value.at
    if (!isValidWorldTime(deathAt)) {
      addIssue('invalid-world-time')
    } else if (nowIsValid && compareWorldTime(deathAt, now) > 0) {
      addIssue('death-record-is-in-the-future')
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

  if (isValueField(person.birth)) {
    if (!isValidWorldTime(person.birth.value)) {
      addIssue('invalid-world-time')
    } else if (nowIsValid && compareWorldTime(person.birth.value, now) > 0) {
      addIssue('birth-is-in-the-future')
    }
  }

  return issues
}

function isValueField<T>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

export function isPersonLifecycleValid(person: Person, now: WorldTime): boolean {
  return validatePersonLifecycle(person, now).length === 0
}
