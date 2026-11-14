import type { EventId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Appointment } from './model'
import type { Person } from '../person/model'

export interface DeathOfficeHandoffReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

export type DeathOfficeHandoffIssue =
  | 'death-office-person-alive'
  | 'death-office-record-missing'
  | 'death-office-death-time-invalid'
  | 'death-office-death-event-missing'
  | 'death-office-death-event-time-missing'
  | 'death-office-death-event-time-mismatch'
  | 'death-office-appointment-time-invalid'
  | 'death-office-appointment-starts-at-or-after-death'
  | 'death-office-appointment-open-at-death'
  | 'death-office-appointment-ends-after-death'
  | 'death-office-appointment-end-event-missing'
  | 'death-office-appointment-end-event-time-missing'
  | 'death-office-appointment-end-event-time-mismatch'
  | 'death-office-appointment-end-event-not-death-event'

/**
 * Validates appointment interval closure caused by a person's death.
 * It preserves completed appointments and never changes offices or grants.
 * A successor appointment is a separate, later event and is outside this slice.
 */
export function validateDeathOfficeAppointmentClosure(
  person: Person,
  appointments: readonly Appointment[],
  refs: DeathOfficeHandoffReferences,
): DeathOfficeHandoffIssue[] {
  const issues: DeathOfficeHandoffIssue[] = []
  if (person.lifeState !== 'dead') issues.push('death-office-person-alive')
  if (person.death.kind !== 'value') {
    issues.push('death-office-record-missing')
    return issues
  }

  const death = person.death.value
  if (!isValidWorldTime(death.at)) {
    issues.push('death-office-death-time-invalid')
    return issues
  }
  if (!refs.events.includes(death.causeEvent)) issues.push('death-office-death-event-missing')
  const deathEventAt = refs.eventTimes.get(death.causeEvent)
  if (!deathEventAt || !isValidWorldTime(deathEventAt)) {
    issues.push('death-office-death-event-time-missing')
  } else if (compareWorldTime(deathEventAt, death.at) !== 0) {
    issues.push('death-office-death-event-time-mismatch')
  }

  for (const appointment of appointments) {
    if (appointment.person !== person.id) continue
    if (!isValidWorldTime(appointment.from)) {
      issues.push('death-office-appointment-time-invalid')
      continue
    }
    if (compareWorldTime(appointment.from, death.at) >= 0) {
      issues.push('death-office-appointment-starts-at-or-after-death')
      continue
    }

    if (appointment.to.kind === 'n/a') {
      issues.push('death-office-appointment-open-at-death')
      continue
    }
    if (appointment.to.kind !== 'value' || !isValidWorldTime(appointment.to.value)
      || compareWorldTime(appointment.to.value, appointment.from) <= 0) {
      issues.push('death-office-appointment-time-invalid')
      continue
    }
    if (compareWorldTime(appointment.to.value, death.at) > 0) {
      issues.push('death-office-appointment-ends-after-death')
    }

    if (appointment.endedBy.kind !== 'value') {
      issues.push('death-office-appointment-end-event-missing')
      continue
    }
    const endEvent = appointment.endedBy.value
    if (!refs.events.includes(endEvent)) {
      issues.push('death-office-appointment-end-event-missing')
      continue
    }
    const endEventAt = refs.eventTimes.get(endEvent)
    if (!endEventAt || !isValidWorldTime(endEventAt)) {
      issues.push('death-office-appointment-end-event-time-missing')
    } else if (compareWorldTime(endEventAt, appointment.to.value) !== 0) {
      issues.push('death-office-appointment-end-event-time-mismatch')
    }
    if (compareWorldTime(appointment.to.value, death.at) === 0 && endEvent !== death.causeEvent) {
      issues.push('death-office-appointment-end-event-not-death-event')
    }
  }
  return [...new Set(issues)]
}
