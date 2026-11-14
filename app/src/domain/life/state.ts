import type { Field } from '../shared/field'
import type {
  BodyScopeRef,
  EventId,
  LifeStateFactId,
  MindScopeRef,
  PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Visibility } from '../shared/visibility'

export type BodyStateDimension =
  | 'constitution'
  | 'health'
  | 'stamina'
  | 'fatigue'
  | 'injury'
  | 'chronic-condition'
  | 'disability'
  | 'nutrition'
  | 'recovery'
  | 'sensory'
  | 'aging-effect'

export type MindStateDimension =
  | 'mood'
  | 'stress'
  | 'fear'
  | 'desire'
  | 'obsession'
  | 'psychological-load'
  | 'coping'

/** Descriptive facts, not calibrated gameplay effects. Quantities require an explicit scale. */
export type LifeStateValue =
  | { readonly kind: 'qualitative'; readonly code: string }
  | {
      readonly kind: 'quantitative'
      readonly value: number
      readonly scale: string
      readonly unit: Field<string>
    }
  | { readonly kind: 'classified'; readonly code: string; readonly detail: Field<string> }

interface LifeStateFactBase {
  readonly id: LifeStateFactId
  readonly person: PersonId
  readonly sourceEvent: EventId
  readonly at: WorldTime
  readonly value: Field<LifeStateValue>
  readonly supersedes: Field<LifeStateFactId>
  readonly visibility: Visibility
}

export type LifeStateFact =
  | (LifeStateFactBase & {
      readonly domain: 'body'
      readonly scope: BodyScopeRef
      readonly dimension: BodyStateDimension | (string & {})
    })
  | (LifeStateFactBase & {
      readonly domain: 'mind'
      readonly scope: MindScopeRef
      readonly dimension: MindStateDimension | (string & {})
    })

export type LifeStateIssue =
  | 'life-state-person-missing'
  | 'life-state-scope-mismatch'
  | 'life-state-event-missing'
  | 'life-state-event-time-missing'
  | 'life-state-event-time-mismatch'
  | 'life-state-invalid-time'
  | 'life-state-after-death'
  | 'life-state-empty-dimension'
  | 'life-state-empty-value-code'
  | 'life-state-invalid-quantitative-value'
  | 'life-state-empty-scale'
  | 'life-state-empty-unit'
  | 'life-state-empty-detail'
  | 'life-state-invalid-visibility'
  | 'life-state-duplicate-id'
  | 'life-state-supersedes-missing'
  | 'life-state-supersedes-self'
  | 'life-state-supersedes-person-mismatch'
  | 'life-state-supersedes-domain-mismatch'
  | 'life-state-supersedes-dimension-mismatch'
  | 'life-state-supersedes-scope-mismatch'
  | 'life-state-supersedes-time-not-later'
  | 'life-state-supersedes-already-replaced'
  | 'life-state-dimension-root-duplicate'
  | 'life-state-root-must-be-not-applicable'
