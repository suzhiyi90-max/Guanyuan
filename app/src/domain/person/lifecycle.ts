import type { Field } from '../shared/field'
import { compareWorldTime } from '../shared/world-time'
import type { WorldTime } from '../shared/world-time'
import type { Person } from './model'

export type PersonLifecycleIssue =
  | 'dead-person-requires-death-record'
  | 'alive-person-must-not-have-death-record'
  | 'death-record-is-in-the-future'
  | 'birth-is-in-the-future'

export function validatePersonLifecycle(person: Person, now: WorldTime): PersonLifecycleIssue[] {
  const issues: PersonLifecycleIssue[] = []

  if (person.lifeState === 'dead' && person.death.kind !== 'value') {
    issues.push('dead-person-requires-death-record')
  }

  if (person.lifeState === 'alive' && person.death.kind !== 'n/a') {
    issues.push('alive-person-must-not-have-death-record')
  }

  if (person.death.kind === 'value' && compareWorldTime(person.death.value.at, now) > 0) {
    issues.push('death-record-is-in-the-future')
  }

  if (isValueField(person.birth) && compareWorldTime(person.birth.value, now) > 0) {
    issues.push('birth-is-in-the-future')
  }

  return issues
}

function isValueField<T>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

export function isPersonLifecycleValid(person: Person, now: WorldTime): boolean {
  return validatePersonLifecycle(person, now).length === 0
}
