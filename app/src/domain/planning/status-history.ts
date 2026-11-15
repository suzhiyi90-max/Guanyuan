import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId, GoalId, GoalStatusTransitionId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Goal, GoalDeathDisposition, GoalStatusTransition } from './model'

export interface GoalStatusHistoryReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

export type GoalStatusHistoryIssue =
  | 'goal-status-transition-duplicate-id'
  | 'goal-status-transition-duplicate-goal'
  | 'goal-status-transition-goal-missing'
  | 'goal-status-transition-goal-ambiguous'
  | 'goal-status-transition-person-missing'
  | 'goal-status-transition-person-ambiguous'
  | 'goal-status-transition-event-missing'
  | 'goal-status-transition-event-time-missing'
  | 'goal-status-transition-event-time-invalid'
  | 'goal-status-transition-source-event-missing'
  | 'goal-status-transition-source-time-missing'
  | 'goal-status-transition-not-after-source'
  | 'goal-status-transition-owner-not-alive'
  | 'goal-status-transition-invalid-from-status'
  | 'goal-status-transition-invalid-to-status'
  | 'goal-status-transition-status-mismatch'
  | 'goal-status-transition-death-disposition-conflict'
  | 'goal-status-history-missing-terminal-transition'
  | 'goal-status-history-unexpected-transition'

function hasValue<T extends {}>(value: import('../shared/field').Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

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

const ordinaryTerminalStatuses = ['achieved', 'abandoned', 'failed'] as const

/**
 * Validate the immutable, event-backed status history for NPC Goals.
 * Death dispositions remain authoritative for death-caused abandonment/failure;
 * closed-by-death is never represented as an ordinary status transition.
 */
export function validateGoalStatusHistory(
  goals: readonly Goal[],
  transitions: readonly GoalStatusTransition[],
  persons: readonly Person[],
  deathDispositions: readonly GoalDeathDisposition[],
  refs: GoalStatusHistoryReferences,
): GoalStatusHistoryIssue[] {
  const issues: GoalStatusHistoryIssue[] = []
  const goalMap = new Map<string, Goal[]>()
  const personMap = new Map<string, Person[]>()
  const transitionMap = new Map<string, GoalStatusTransition[]>()
  const deathDispositionMap = new Map<string, GoalDeathDisposition[]>()

  for (const goal of goals) goalMap.set(goal.id, [...(goalMap.get(goal.id) ?? []), goal])
  for (const person of persons) personMap.set(person.id, [...(personMap.get(person.id) ?? []), person])
  for (const transition of transitions) {
    transitionMap.set(transition.goal, [...(transitionMap.get(transition.goal) ?? []), transition])
  }
  for (const disposition of deathDispositions) {
    deathDispositionMap.set(disposition.goal, [...(deathDispositionMap.get(disposition.goal) ?? []), disposition])
  }

  if (new Set(transitions.map(item => item.id)).size !== transitions.length) {
    issues.push('goal-status-transition-duplicate-id')
  }
  if ([...transitionMap.values()].some(items => items.length > 1)) {
    issues.push('goal-status-transition-duplicate-goal')
  }

  for (const transition of transitions) {
    const goalMatches = goalMap.get(transition.goal) ?? []
    if (goalMatches.length === 0) { issues.push('goal-status-transition-goal-missing'); continue }
    if (goalMatches.length !== 1) { issues.push('goal-status-transition-goal-ambiguous'); continue }
    const goal = goalMatches[0]

    if (transition.fromStatus !== 'active') issues.push('goal-status-transition-invalid-from-status')
    if (!ordinaryTerminalStatuses.includes(transition.toStatus)) {
      issues.push('goal-status-transition-invalid-to-status')
    }
    if (goal.status !== transition.toStatus) issues.push('goal-status-transition-status-mismatch')

    const ownerMatches = personMap.get(goal.person) ?? []
    if (ownerMatches.length === 0) { issues.push('goal-status-transition-person-missing'); continue }
    if (ownerMatches.length !== 1) { issues.push('goal-status-transition-person-ambiguous'); continue }
    const owner = ownerMatches[0]

    if (!refs.events.includes(goal.sourceEvent)) {
      issues.push('goal-status-transition-source-event-missing')
    }
    const sourceAt = refs.eventTimes.get(goal.sourceEvent)
    if (!sourceAt) {
      issues.push('goal-status-transition-source-time-missing')
    } else if (!isValidWorldTime(sourceAt)) {
      issues.push('goal-status-transition-source-time-missing')
    }

    if (!refs.events.includes(transition.event)) {
      issues.push('goal-status-transition-event-missing')
      continue
    }
    const transitionAt = refs.eventTimes.get(transition.event)
    if (!transitionAt) {
      issues.push('goal-status-transition-event-time-missing')
      continue
    }
    if (!isValidWorldTime(transitionAt)) {
      issues.push('goal-status-transition-event-time-invalid')
      continue
    }
    if (sourceAt && isValidWorldTime(sourceAt)
      && compareWorldTime(transitionAt, sourceAt) <= 0) {
      issues.push('goal-status-transition-not-after-source')
    }
    if (!personAliveAt(owner, transitionAt)) {
      issues.push('goal-status-transition-owner-not-alive')
    }
    if ((deathDispositionMap.get(goal.id) ?? []).length > 0) {
      issues.push('goal-status-transition-death-disposition-conflict')
    }
  }

  for (const goal of goals) {
    const goalTransitions = transitionMap.get(goal.id) ?? []
    const dispositions = deathDispositionMap.get(goal.id) ?? []
    if (dispositions.length > 0) {
      if (goalTransitions.length > 0) issues.push('goal-status-transition-death-disposition-conflict')
      continue
    }
    if (ordinaryTerminalStatuses.includes(goal.status as typeof ordinaryTerminalStatuses[number])) {
      if (goalTransitions.length !== 1) issues.push('goal-status-history-missing-terminal-transition')
    } else if (goal.status === 'active' || goal.status === 'closed-by-death') {
      if (goalTransitions.length > 0) issues.push('goal-status-history-unexpected-transition')
    }
  }

  return [...new Set(issues)]
}

export type { GoalStatusTransitionId, GoalId, PersonId }
