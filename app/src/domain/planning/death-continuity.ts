import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId, GoalDeathDispositionId, GoalId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Field } from '../shared/field'
import type { Goal, GoalDeathDisposition } from './model'

export interface GoalDeathReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}
export type GoalDeathIssue =
  | 'goal-death-disposition-duplicate-id'
  | 'goal-death-disposition-duplicate-goal'
  | 'goal-death-disposition-duplicate-successor'
  | 'goal-death-goal-missing'
  | 'goal-death-goal-ambiguous'
  | 'goal-death-person-missing'
  | 'goal-death-person-ambiguous'
  | 'goal-death-person-not-deceased'
  | 'goal-death-person-mismatch'
  | 'goal-death-record-missing'
  | 'goal-death-time-invalid'
  | 'goal-death-event-missing'
  | 'goal-death-event-time-missing'
  | 'goal-death-event-time-mismatch'
  | 'goal-death-goal-source-event-missing'
  | 'goal-death-goal-source-time-missing'
  | 'goal-death-goal-starts-at-or-after-death'
  | 'goal-death-disposition-time-invalid'
  | 'goal-death-disposition-before-death'
  | 'goal-death-outcome-invalid'
  | 'goal-death-goal-status-mismatch'
  | 'goal-death-successor-field-mismatch'
  | 'goal-death-successor-goal-missing'
  | 'goal-death-successor-goal-ambiguous'
  | 'goal-death-successor-same-goal'
  | 'goal-death-successor-person-missing'
  | 'goal-death-successor-person-ambiguous'
  | 'goal-death-successor-not-distinct'
  | 'goal-death-successor-not-alive'
  | 'goal-death-successor-source-event-mismatch'
  | 'goal-death-disposition-missing'
  | 'goal-death-living-person-closed-goal'

function personAliveAt(person: Person, at: WorldTime): boolean {
  if (!isValidWorldTime(at)) return false
  if (person.birth.kind === 'value') {
    if (!isValidWorldTime(person.birth.value) || compareWorldTime(at, person.birth.value) < 0) return false
  }
  if (person.lifeState === 'alive') return person.death.kind === 'n/a'
  if (person.lifeState === 'dead') {
    return person.death.kind === 'value'
      && isValidWorldTime(person.death.value.at)
      && compareWorldTime(at, person.death.value.at) < 0
  }
  return false
}

function hasValue<T extends {}>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/**
 * Validate the explicit fate of unfinished personal goals when their owner dies.
 * A successor undertaking is a newly authored Goal with its own source event;
 * this function never copies text, changes Goal.status, or mutates Person.
 */
export function validateGoalDeathContinuity(
  goals: readonly Goal[],
  dispositions: readonly GoalDeathDisposition[],
  persons: readonly Person[],
  refs: GoalDeathReferences,
): GoalDeathIssue[] {
  const issues: GoalDeathIssue[] = []
  const goalMap = new Map<string, Goal[]>()
  const personMap = new Map<string, Person[]>()
  for (const goal of goals) goalMap.set(goal.id, [...(goalMap.get(goal.id) ?? []), goal])
  for (const person of persons) personMap.set(person.id, [...(personMap.get(person.id) ?? []), person])

  if (new Set(dispositions.map(item => item.id)).size !== dispositions.length) {
    issues.push('goal-death-disposition-duplicate-id')
  }
  const byGoal = new Map<string, GoalDeathDisposition[]>()
  const successorClaims = new Map<string, number>()
  for (const item of dispositions) {
    byGoal.set(item.goal, [...(byGoal.get(item.goal) ?? []), item])
    if (hasValue(item.successorGoal)) {
      successorClaims.set(item.successorGoal.value, (successorClaims.get(item.successorGoal.value) ?? 0) + 1)
    }
  }
  if ([...byGoal.values()].some(items => items.length > 1)) issues.push('goal-death-disposition-duplicate-goal')
  if ([...successorClaims.values()].some(count => count > 1)) issues.push('goal-death-disposition-duplicate-successor')

  for (const item of dispositions) {
    const goalMatches = goalMap.get(item.goal) ?? []
    if (goalMatches.length === 0) { issues.push('goal-death-goal-missing'); continue }
    if (goalMatches.length !== 1) { issues.push('goal-death-goal-ambiguous'); continue }
    const goal = goalMatches[0]
    if (goal.person !== item.deceased) issues.push('goal-death-person-mismatch')

    const deceasedMatches = personMap.get(item.deceased) ?? []
    if (deceasedMatches.length === 0) { issues.push('goal-death-person-missing'); continue }
    if (deceasedMatches.length !== 1) { issues.push('goal-death-person-ambiguous'); continue }
    const deceased = deceasedMatches[0]
    if (deceased.lifeState !== 'dead') { issues.push('goal-death-person-not-deceased'); continue }
    if (!hasValue(deceased.death)) { issues.push('goal-death-record-missing'); continue }
    const death = deceased.death.value
    if (!isValidWorldTime(death.at)) { issues.push('goal-death-time-invalid'); continue }
    if (death.causeEvent !== item.deathEvent) issues.push('goal-death-event-time-mismatch')
    if (!refs.events.includes(item.deathEvent)) issues.push('goal-death-event-missing')
    const deathAt = refs.eventTimes.get(item.deathEvent)
    if (!deathAt || !isValidWorldTime(deathAt)) { issues.push('goal-death-event-time-missing'); continue }
    if (compareWorldTime(deathAt, death.at) !== 0) {
      issues.push('goal-death-event-time-mismatch'); continue
    }

    if (!refs.events.includes(goal.sourceEvent)) {
      issues.push('goal-death-goal-source-event-missing')
    }
    const goalAt = refs.eventTimes.get(goal.sourceEvent)
    if (!goalAt || !isValidWorldTime(goalAt)) {
      issues.push('goal-death-goal-source-time-missing')
    } else if (compareWorldTime(goalAt, death.at) >= 0) {
      issues.push('goal-death-goal-starts-at-or-after-death')
    }

    if (!refs.events.includes(item.dispositionEvent)) {
      issues.push('goal-death-event-missing')
    }
    const dispositionAt = refs.eventTimes.get(item.dispositionEvent)
    if (!dispositionAt || !isValidWorldTime(dispositionAt)) {
      issues.push('goal-death-disposition-time-invalid')
      continue
    }

    if (item.outcome === 'historical') {
      if (goal.status !== 'closed-by-death') issues.push('goal-death-goal-status-mismatch')
      if (item.dispositionEvent !== item.deathEvent || compareWorldTime(dispositionAt, death.at) !== 0) {
        issues.push('goal-death-disposition-before-death')
      }
      if (hasValue(item.successorGoal)) issues.push('goal-death-successor-field-mismatch')
    } else if (item.outcome === 'abandoned' || item.outcome === 'failed') {
      if (goal.status !== item.outcome) issues.push('goal-death-goal-status-mismatch')
      if (compareWorldTime(dispositionAt, death.at) <= 0) issues.push('goal-death-disposition-before-death')
      if (hasValue(item.successorGoal)) issues.push('goal-death-successor-field-mismatch')
    } else if (item.outcome === 'undertaken') {
      if (goal.status !== 'closed-by-death') issues.push('goal-death-goal-status-mismatch')
      if (compareWorldTime(dispositionAt, death.at) <= 0) issues.push('goal-death-disposition-before-death')
      if (!hasValue(item.successorGoal)) {
        issues.push('goal-death-successor-field-mismatch')
        continue
      }
      if (item.successorGoal.value === goal.id) issues.push('goal-death-successor-same-goal')
      const successorMatches = goalMap.get(item.successorGoal.value) ?? []
      if (successorMatches.length === 0) { issues.push('goal-death-successor-goal-missing'); continue }
      if (successorMatches.length !== 1) { issues.push('goal-death-successor-goal-ambiguous'); continue }
      const successorGoal = successorMatches[0]
      if (successorGoal.person === item.deceased) issues.push('goal-death-successor-not-distinct')
      if (successorGoal.status !== 'active') issues.push('goal-death-goal-status-mismatch')
      if (successorGoal.sourceEvent !== item.dispositionEvent) issues.push('goal-death-successor-source-event-mismatch')
      const successorPeople = personMap.get(successorGoal.person) ?? []
      if (successorPeople.length === 0) { issues.push('goal-death-successor-person-missing'); continue }
      if (successorPeople.length !== 1) { issues.push('goal-death-successor-person-ambiguous'); continue }
      if (!personAliveAt(successorPeople[0], dispositionAt)) issues.push('goal-death-successor-not-alive')
    } else {
      issues.push('goal-death-outcome-invalid')
    }
  }

  for (const goal of goals) {
    const owners = personMap.get(goal.person) ?? []
    if (owners.length !== 1) continue
    const owner = owners[0]
    if (owner.lifeState === 'dead' && (goal.status === 'active' || goal.status === 'closed-by-death')
      && (byGoal.get(goal.id) ?? []).length === 0) {
      issues.push('goal-death-disposition-missing')
    }
    if (owner.lifeState === 'alive' && goal.status === 'closed-by-death') {
      issues.push('goal-death-living-person-closed-goal')
    }
  }

  return unique(issues)
}
