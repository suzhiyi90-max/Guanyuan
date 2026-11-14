import { isValidWorldTime } from '../shared/world-time'
import type { EventId, PersonId, ScheduleScopeId } from '../shared/ids'
import type { Person } from '../person/model'
import type { Goal, PlayerGoal, PlanningIssue, ScheduleEntry, ScheduleScope } from './model'
import type { Visibility } from '../shared/visibility'

const visibilityLevels = ['public', 'contact', 'private', 'secret'] as const

function duplicateIds<T>(items: readonly T[], getId: (item: T) => string): boolean {
  const seen = new Set<string>()
  for (const item of items) {
    const id = getId(item)
    if (seen.has(id)) return true
    seen.add(id)
  }
  return false
}

function validVisibility(value: Visibility, persons: readonly PersonId[]): boolean {
  return (value.observer === 'player' || persons.includes(value.observer))
    && visibilityLevels.includes(value.level)
}

export function validateGoal(goal: Goal, persons: readonly Person[], eventIds: readonly EventId[]): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  const person = persons.find(item => item.id === goal.person)
  if (!person) issues.push('goal-person-missing')
  if (!goal.statement.trim()) issues.push('goal-empty-statement')
  if (!Number.isFinite(goal.priority) || goal.priority < 0) issues.push('goal-invalid-priority')
  if (!['active', 'achieved', 'abandoned', 'failed'].includes(goal.status)) issues.push('goal-invalid-status')
  if (!eventIds.includes(goal.sourceEvent)) issues.push('goal-source-event-missing')
  if (!validVisibility(goal.visibility, persons.map(item => item.id))) issues.push('goal-visibility-invalid')
  if (person && !person.stateDomains.goals.includes(goal.id)) issues.push('goal-person-index-mismatch')
  return issues
}

export function validateGoalSet(goals: readonly Goal[], persons: readonly Person[], eventIds: readonly EventId[]): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  if (duplicateIds(goals, item => item.id)) issues.push('goal-duplicate-id')
  for (const goal of goals) issues.push(...validateGoal(goal, persons, eventIds))
  for (const person of persons) {
    for (const goalId of person.stateDomains.goals) {
      if (!goals.some(goal => goal.id === goalId && goal.person === person.id)) {
        issues.push('goal-person-index-mismatch')
      }
    }
  }
  return issues
}

export function validatePlayerGoal(goal: PlayerGoal): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  if (goal.id !== 'player') issues.push('player-goal-empty-aspiration')
  if (!goal.aspirationCode.trim()) issues.push('player-goal-empty-aspiration')
  if (!goal.statement.trim()) issues.push('player-goal-empty-statement')
  if (!isValidWorldTime(goal.chosenAt)) issues.push('player-goal-invalid-time')
  return issues
}

export function validateScheduleScopes(
  scopes: readonly ScheduleScope[],
  persons: readonly Person[],
): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  if (duplicateIds(scopes, item => item.id)) issues.push('schedule-scope-duplicate-id')
  const personIds = new Set<string>()
  for (const scope of scopes) {
    if (!persons.some(person => person.id === scope.person)) issues.push('schedule-scope-person-missing')
    if (personIds.has(scope.person)) issues.push('schedule-person-multiple-scopes')
    personIds.add(scope.person)
  }
  for (const person of persons) {
    if (!scopes.some(scope => scope.id === person.stateDomains.scheduleScope && scope.person === person.id)) {
      issues.push('schedule-person-scope-mismatch')
    }
  }
  return issues
}

export function validateScheduleEntries(
  entries: readonly ScheduleEntry[],
  scopes: readonly ScheduleScope[],
  persons: readonly Person[],
  eventIds: readonly EventId[],
): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  if (duplicateIds(entries, item => item.id)) issues.push('schedule-entry-duplicate-id')
  for (const entry of entries) {
    const scope = scopes.find(item => item.id === entry.scope)
    if (!scope) issues.push('schedule-entry-scope-missing')
    if (!persons.some(person => person.id === entry.person)) issues.push('schedule-entry-person-missing')
    if (scope && scope.person !== entry.person) issues.push('schedule-entry-scope-person-mismatch')
    if (!Number.isInteger(entry.day) || entry.day < 1) issues.push('schedule-entry-invalid-day')
    if (!['晨', '午', '暮', '夜'].includes(entry.period)) issues.push('schedule-entry-invalid-period')
    if (!String(entry.action).trim()) issues.push('schedule-entry-empty-action')
    if (!String(entry.place).trim()) issues.push('schedule-entry-empty-place')
    if (entry.intent !== 'planned') issues.push('schedule-entry-invalid-intent')
    if (entry.execution.kind === 'value' && !eventIds.includes(entry.execution.value)) {
      issues.push('schedule-entry-execution-event-missing')
    }
    if (entry.deviation.kind === 'value' && !eventIds.includes(entry.deviation.value)) {
      issues.push('schedule-entry-deviation-event-missing')
    }
    if (!validVisibility(entry.visibility, persons.map(item => item.id))) {
      issues.push('schedule-entry-visibility-invalid')
    }
  }
  return issues
}

export function validateScheduleSet(
  scopes: readonly ScheduleScope[],
  entries: readonly ScheduleEntry[],
  persons: readonly Person[],
  eventIds: readonly EventId[],
): PlanningIssue[] {
  return [
    ...validateScheduleScopes(scopes, persons),
    ...validateScheduleEntries(entries, scopes, persons, eventIds),
  ]
}

export type { ScheduleScopeId }
