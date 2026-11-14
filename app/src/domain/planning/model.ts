import type { Field } from '../shared/field'
import type {
  ActionRef,
  EventId,
  GoalId,
  PersonId,
  PlaceId,
  ScheduleId,
  ScheduleScopeId,
} from '../shared/ids'
import type { Period, WorldDay, WorldTime } from '../shared/world-time'
import type { Visibility } from '../shared/visibility'

export type GoalStatus = 'active' | 'achieved' | 'abandoned' | 'failed'

/** NPC goals are A-layer domain records; player aspiration is a separate singleton. */
export interface Goal {
  readonly id: GoalId
  readonly person: PersonId
  readonly statement: string
  readonly priority: number
  readonly status: GoalStatus
  readonly sourceEvent: EventId
  readonly visibility: Visibility
}

export interface PlayerGoal {
  readonly id: 'player'
  readonly aspirationCode: string
  readonly statement: string
  readonly chosenAt: WorldTime
}

/** One immutable schedule scope per person; the scope owns many entries. */
export interface ScheduleScope {
  readonly id: ScheduleScopeId
  readonly person: PersonId
}

export interface ScheduleEntry {
  readonly id: ScheduleId
  readonly scope: ScheduleScopeId
  readonly person: PersonId
  readonly day: WorldDay
  readonly period: Period
  readonly action: ActionRef
  readonly place: PlaceId
  readonly intent: 'planned'
  readonly execution: Field<EventId>
  readonly deviation: Field<EventId>
  readonly visibility: Visibility
}

export type PlanningIssue =
  | 'goal-empty-statement'
  | 'goal-invalid-priority'
  | 'goal-invalid-status'
  | 'goal-person-missing'
  | 'goal-source-event-missing'
  | 'goal-visibility-invalid'
  | 'goal-person-index-mismatch'
  | 'goal-duplicate-id'
  | 'player-goal-empty-aspiration'
  | 'player-goal-empty-statement'
  | 'player-goal-invalid-time'
  | 'schedule-scope-person-missing'
  | 'schedule-scope-duplicate-id'
  | 'schedule-person-multiple-scopes'
  | 'schedule-person-scope-mismatch'
  | 'schedule-entry-duplicate-id'
  | 'schedule-entry-scope-missing'
  | 'schedule-entry-person-missing'
  | 'schedule-entry-scope-person-mismatch'
  | 'schedule-entry-invalid-day'
  | 'schedule-entry-invalid-period'
  | 'schedule-entry-empty-action'
  | 'schedule-entry-empty-place'
  | 'schedule-entry-invalid-intent'
  | 'schedule-entry-execution-event-missing'
  | 'schedule-entry-deviation-event-missing'
  | 'schedule-entry-visibility-invalid'
