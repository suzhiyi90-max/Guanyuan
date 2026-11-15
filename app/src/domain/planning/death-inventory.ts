import type {
  EventId, GoalDeathInventoryEntryId, GoalDeathInventoryId, GoalId, PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Goal, GoalDeathDisposition, GoalStatusTransition } from './model'
import {
  validateGoalDeathContinuity,
  type GoalDeathReferences,
} from './death-continuity'
import {
  validateGoalStatusHistory,
  type GoalStatusHistoryReferences,
} from './status-history'

export type GoalDeathInventoryStatus = 'open' | 'challenged' | 'complete'
export type GoalDeathInventoryOutcome =
  | 'terminal-before-death'
  | 'historical'
  | 'abandoned'
  | 'failed'
  | 'undertaken'
  | 'pending'

export interface GoalDeathInventoryEntry {
  readonly id: GoalDeathInventoryEntryId
  readonly goal: GoalId
  readonly outcome: GoalDeathInventoryOutcome
}

export interface GoalDeathInventory {
  readonly id: GoalDeathInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  readonly status: GoalDeathInventoryStatus
  readonly goals: readonly GoalDeathInventoryEntry[]
}

export type GoalDeathInventoryIssue = string

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && unique(left)
    && unique(right)
    && left.every(id => right.includes(id))
}

function hasValue<T extends {}>(value: import('../shared/field').Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

function terminalBeforeDeath(
  goal: Goal,
  transitions: readonly GoalStatusTransition[],
  deathAt: WorldTime,
  refs: GoalDeathReferences,
): boolean {
  if (!['achieved', 'abandoned', 'failed'].includes(goal.status)) return false
  const matching = transitions.filter(item => item.goal === goal.id)
  if (matching.length !== 1) return false
  const transition = matching[0]
  const at = refs.eventTimes.get(transition.event)
  const sourceAt = refs.eventTimes.get(goal.sourceEvent)
  return refs.events.includes(transition.event)
    && !!at && isValidWorldTime(at)
    && !!sourceAt && isValidWorldTime(sourceAt)
    && compareWorldTime(at, sourceAt) > 0
    && compareWorldTime(at, deathAt) < 0
    && transition.fromStatus === 'active'
    && transition.toStatus === goal.status
}

/**
 * Validates a caller-declared, complete inventory of one deceased NPC's goals.
 * It is read-only and proves coverage only over the supplied Goal collection.
 * PlayerGoal is intentionally outside this API and cannot enter its inventory.
 */
export function validateGoalDeathInventory(
  inventory: GoalDeathInventory,
  goals: readonly Goal[],
  dispositions: readonly GoalDeathDisposition[],
  transitions: readonly GoalStatusTransition[],
  persons: readonly Person[],
  refs: GoalDeathReferences & GoalStatusHistoryReferences,
): GoalDeathInventoryIssue[] {
  const issues: string[] = []
  const deceasedMatches = persons.filter(person => person.id === inventory.deceased)
  if (deceasedMatches.length !== 1) {
    issues.push(deceasedMatches.length === 0
      ? 'goal-death-inventory-person-missing'
      : 'goal-death-inventory-person-ambiguous')
    return [...new Set(issues)]
  }
  const deceased = deceasedMatches[0]
  if (deceased.lifeState !== 'dead') {
    issues.push('goal-death-inventory-person-alive')
    return [...new Set(issues)]
  }
  if (deceased.death.kind !== 'value') {
    issues.push('goal-death-inventory-death-record-missing')
    return [...new Set(issues)]
  }
  const death = deceased.death.value
  if (!isValidWorldTime(death.at)) {
    issues.push('goal-death-inventory-death-time-invalid')
    return [...new Set(issues)]
  }
  if (death.causeEvent !== inventory.deathEvent) {
    issues.push('goal-death-inventory-death-event-mismatch')
  }
  if (!refs.events.includes(inventory.deathEvent)) {
    issues.push('goal-death-inventory-death-event-missing')
  }
  const deathAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathAt || !isValidWorldTime(deathAt)) {
    issues.push('goal-death-inventory-death-event-time-missing')
  } else if (compareWorldTime(deathAt, death.at) !== 0) {
    issues.push('goal-death-inventory-death-event-time-mismatch')
  }
  if (!refs.events.includes(inventory.inventoryEvent)) {
    issues.push('goal-death-inventory-review-event-missing')
  }
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !isValidWorldTime(inventoryAt)) {
    issues.push('goal-death-inventory-review-event-time-missing')
  } else if (compareWorldTime(inventoryAt, death.at) < 0) {
    issues.push('goal-death-inventory-before-death')
  }
  if (!['open', 'challenged', 'complete'].includes(inventory.status)) {
    issues.push('goal-death-inventory-status-invalid')
  }

  const deceasedGoals = goals.filter(goal => goal.person === inventory.deceased)
  if (!unique(goals.map(goal => goal.id))) {
    issues.push('goal-death-inventory-input-goal-duplicate-id')
  }
  if (!unique(inventory.goals.map(entry => entry.id))) {
    issues.push('goal-death-inventory-entry-duplicate-id')
  }
  if (!unique(inventory.goals.map(entry => entry.goal))) {
    issues.push('goal-death-inventory-goal-reference-duplicate')
  }

  const goalMap = new Map<string, Goal[]>()
  for (const goal of goals) goalMap.set(goal.id, [...(goalMap.get(goal.id) ?? []), goal])
  const dispositionsForDeceased = dispositions.filter(item => item.deceased === inventory.deceased)
  const dispositionGoalIds = new Set(dispositionsForDeceased.map(item => item.goal))
  const referencedSuccessorIds = dispositionsForDeceased
    .filter(item => hasValue(item.successorGoal))
    .map(item => (item.successorGoal as { readonly kind: 'value'; readonly value: GoalId }).value)
  const continuityGoals = goals.filter(goal =>
    goal.person === inventory.deceased || referencedSuccessorIds.includes(goal.id))
  issues.push(...validateGoalDeathContinuity(continuityGoals, dispositionsForDeceased, persons, refs))
  issues.push(...validateGoalStatusHistory(
    deceasedGoals,
    transitions.filter(item => deceasedGoals.some(goal => goal.id === item.goal)),
    persons,
    dispositionsForDeceased,
    refs,
  ))

  for (const entry of inventory.goals) {
    const matches = goalMap.get(entry.goal) ?? []
    if (matches.length !== 1) {
      issues.push(matches.length === 0
        ? 'goal-death-inventory-goal-reference-missing'
        : 'goal-death-inventory-goal-reference-ambiguous')
      continue
    }
    const goal = matches[0]
    if (goal.person !== inventory.deceased) {
      issues.push('goal-death-inventory-goal-owner-mismatch')
      continue
    }

    if (entry.outcome === 'terminal-before-death') {
      if (!terminalBeforeDeath(goal, transitions, death.at, refs)) {
        issues.push('goal-death-inventory-terminal-evidence-mismatch')
      }
    } else if (entry.outcome === 'historical' || entry.outcome === 'abandoned'
      || entry.outcome === 'failed' || entry.outcome === 'undertaken') {
      const matching = dispositionsForDeceased.filter(item => item.goal === goal.id)
      if (matching.length !== 1 || matching[0].outcome !== entry.outcome) {
        issues.push('goal-death-inventory-disposition-mismatch')
      }
    } else if (entry.outcome === 'pending') {
      issues.push('goal-death-inventory-item-pending')
    } else {
      issues.push('goal-death-inventory-outcome-invalid')
    }

    if (entry.outcome === 'terminal-before-death' && dispositionGoalIds.has(goal.id)) {
      issues.push('goal-death-inventory-terminal-disposition-conflict')
    }
  }

  if (inventory.status === 'complete'
    && !sameIdSet(inventory.goals.map(entry => entry.goal), deceasedGoals.map(goal => goal.id))) {
    issues.push('goal-death-inventory-coverage-mismatch')
  }
  return [...new Set(issues)]
}

/** Complete means every supplied NPC Goal is covered and independently validated. */
export function isGoalDeathInventoryReadyForSettlement(
  inventory: GoalDeathInventory,
  validationIssues: readonly GoalDeathInventoryIssue[],
): boolean {
  return inventory.status === 'complete'
    && validationIssues.length === 0
    && inventory.goals.every(entry => entry.outcome !== 'pending')
}
