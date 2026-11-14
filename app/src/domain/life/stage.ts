import type { Field } from '../shared/field'
import type { EventId, LifeStageFactId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Visibility } from '../shared/visibility'

/**
 * A stage is a contextual label on one independent life track.
 * Track and code are open strings; no universal age gates or linear life script.
 */
export interface LifeStageFact {
  readonly id: LifeStageFactId
  readonly person: PersonId
  readonly track: string
  readonly code: string
  readonly detail: Field<string>
  readonly sourceEvent: EventId
  readonly at: WorldTime
  readonly supersedes: Field<LifeStageFactId>
  readonly visibility: Visibility
}

export type LifeStageIssue =
  | 'life-stage-person-missing'
  | 'life-stage-event-missing'
  | 'life-stage-event-time-missing'
  | 'life-stage-event-time-mismatch'
  | 'life-stage-invalid-time'
  | 'life-stage-after-death'
  | 'life-stage-before-birth'
  | 'life-stage-empty-track'
  | 'life-stage-empty-code'
  | 'life-stage-empty-detail'
  | 'life-stage-invalid-visibility'
  | 'life-stage-duplicate-id'
  | 'life-stage-supersedes-missing'
  | 'life-stage-supersedes-self'
  | 'life-stage-supersedes-person-mismatch'
  | 'life-stage-supersedes-track-mismatch'
  | 'life-stage-supersedes-time-not-later'
  | 'life-stage-supersedes-already-replaced'
  | 'life-stage-track-root-duplicate'
  | 'life-stage-root-must-be-not-applicable'
