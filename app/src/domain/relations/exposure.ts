import type { EventId, ExposureId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'

/**
 * Observer-owned evidence that one person has entered another person's
 * awareness or direct experience. Exposure is not a social relation and
 * never implies trust, acquaintance, friendship, or mutual recognition.
 */
export type ExposureKind = 'heard-of' | 'seen' | 'met' | 'conversed' | 'corresponded'

export interface PersonExposure {
  readonly id: ExposureId
  readonly observer: PersonId | 'player'
  readonly subject: PersonId
  readonly kind: ExposureKind
  readonly sourceEvent: EventId
  readonly occurredAt: WorldTime
}

export type PersonExposureIssue =
  | 'exposure-empty-id'
  | 'exposure-subject-person-missing'
  | 'exposure-observer-person-missing'
  | 'exposure-self-reference'
  | 'exposure-invalid-kind'
  | 'exposure-invalid-time'
  | 'exposure-source-event-missing'
  | 'exposure-source-time-missing'
  | 'exposure-time-source-mismatch'
  | 'exposure-duplicate-id'

export interface PersonExposureReferences {
  readonly persons: readonly PersonId[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

export function validatePersonExposure(
  exposure: PersonExposure,
  refs: PersonExposureReferences,
): PersonExposureIssue[] {
  const issues: PersonExposureIssue[] = []
  if (!exposure.id.trim()) issues.push('exposure-empty-id')
  if (!refs.persons.includes(exposure.subject)) issues.push('exposure-subject-person-missing')
  if (exposure.observer !== 'player' && !refs.persons.includes(exposure.observer)) {
    issues.push('exposure-observer-person-missing')
  }
  if (exposure.observer !== 'player' && exposure.observer === exposure.subject) {
    issues.push('exposure-self-reference')
  }
  if (!['heard-of', 'seen', 'met', 'conversed', 'corresponded'].includes(exposure.kind)) {
    issues.push('exposure-invalid-kind')
  }
  if (!isValidWorldTime(exposure.occurredAt)) issues.push('exposure-invalid-time')
  if (!refs.events.includes(exposure.sourceEvent)) {
    issues.push('exposure-source-event-missing')
  } else {
    const sourceTime = refs.eventTimes.get(exposure.sourceEvent)
    if (!sourceTime) issues.push('exposure-source-time-missing')
    else if (isValidWorldTime(exposure.occurredAt)
      && compareWorldTime(sourceTime, exposure.occurredAt) !== 0) {
      issues.push('exposure-time-source-mismatch')
    }
  }
  return issues
}

export function validatePersonExposureSet(
  exposures: readonly PersonExposure[],
  refs: PersonExposureReferences,
): PersonExposureIssue[] {
  const issues: PersonExposureIssue[] = []
  const ids = exposures.map(item => item.id)
  if (new Set(ids).size !== ids.length) issues.push('exposure-duplicate-id')
  for (const item of exposures) issues.push(...validatePersonExposure(item, refs))
  return issues
}
