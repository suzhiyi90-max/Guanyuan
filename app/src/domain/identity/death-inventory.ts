import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type {
  AppointmentId,
  AuthorizationId,
  DeathOfficeInventoryEntryId,
  DeathOfficeInventoryId,
  EventId,
  PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Appointment, Authorization, AuthorizationRequest, IdentityIssue } from './model'
import type { DeathOfficeHandoffIssue } from './death-handoff'
import { validateDeathOfficeAppointmentClosure } from './death-handoff'
import { hasAuthorization } from './authorization'
import { validateAuthorizationSet } from './validation'

export type DeathOfficeAppointmentDisposition =
  | 'ended-before-death'
  | 'closed-by-death'
  | 'pending'

export type DeathOfficeAuthorizationDisposition =
  | 'inactive-before-death'
  | 'inactive-at-death'
  | 'death-gated'
  | 'pending'

export interface DeathOfficeAppointmentEntry {
  readonly id: DeathOfficeInventoryEntryId
  readonly appointment: AppointmentId
  readonly disposition: DeathOfficeAppointmentDisposition
}

export interface DeathOfficeAuthorizationEntry {
  readonly id: DeathOfficeInventoryEntryId
  readonly authorization: AuthorizationId
  readonly disposition: DeathOfficeAuthorizationDisposition
}

export interface DeathOfficeInventory {
  readonly id: DeathOfficeInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  /** complete attests only to the supplied appointment and authorization universes. */
  readonly status: 'open' | 'complete' | 'challenged'
  readonly appointments: readonly DeathOfficeAppointmentEntry[]
  readonly authorizations: readonly DeathOfficeAuthorizationEntry[]
}

export type DeathOfficeInventoryIssue =
  | 'death-office-inventory-deceased-missing'
  | 'death-office-inventory-deceased-ambiguous'
  | 'death-office-inventory-deceased-not-dead'
  | 'death-office-inventory-death-record-missing'
  | 'death-office-inventory-death-event-mismatch'
  | 'death-office-inventory-death-event-missing'
  | 'death-office-inventory-death-time-invalid'
  | 'death-office-inventory-death-time-mismatch'
  | 'death-office-inventory-invalid-status'
  | 'death-office-inventory-event-missing'
  | 'death-office-inventory-event-time-missing'
  | 'death-office-inventory-before-death'
  | 'death-office-inventory-appointment-duplicate-id'
  | 'death-office-inventory-entry-duplicate-id'
  | 'death-office-inventory-appointment-reference-missing'
  | 'death-office-inventory-appointment-reference-duplicate'
  | 'death-office-inventory-appointment-person-mismatch'
  | 'death-office-inventory-appointment-disposition-mismatch'
  | 'death-office-inventory-appointment-coverage-missing'
  | 'death-office-inventory-authorization-duplicate-id'
  | 'death-office-inventory-authorization-reference-missing'
  | 'death-office-inventory-authorization-reference-duplicate'
  | 'death-office-inventory-authorization-principal-mismatch'
  | 'death-office-inventory-authorization-disposition-mismatch'
  | 'death-office-inventory-authorization-coverage-missing'
  | 'death-office-inventory-authorization-grant-event-missing'
  | 'death-office-inventory-authorization-grant-event-time-missing'
  | 'death-office-inventory-authorization-granted-at-or-after-death'
  | 'death-office-inventory-authorization-revocation-event-missing'
  | 'death-office-inventory-authorization-revocation-time-mismatch'
  | 'death-office-inventory-authorization-death-gate-failed'
  | 'death-office-inventory-authorization-unaccounted'

  | IdentityIssue
  | DeathOfficeHandoffIssue

export interface DeathOfficeInventoryReferences {
  readonly persons: readonly Person[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return unique(left) && unique(right)
    && [...left].sort().join('|') === [...right].sort().join('|')
}

function appointmentDisposition(
  appointment: Appointment,
  deathAt: WorldTime,
  deathEvent: EventId,
): DeathOfficeAppointmentDisposition {
  if (appointment.to.kind !== 'value' || !isValidWorldTime(appointment.to.value)) return 'pending'
  const order = compareWorldTime(appointment.to.value, deathAt)
  if (order < 0) return 'ended-before-death'
  if (order === 0 && appointment.endedBy.kind === 'value'
    && appointment.endedBy.value === deathEvent) return 'closed-by-death'
  return 'pending'
}

function authorizationDisposition(
  grant: Authorization,
  deathAt: WorldTime,
): DeathOfficeAuthorizationDisposition {
  if (!isValidWorldTime(grant.validFrom)) return 'pending'

  const stopTimes: WorldTime[] = []
  if (grant.validTo.kind === 'value') {
    if (!isValidWorldTime(grant.validTo.value)) return 'pending'
    stopTimes.push(grant.validTo.value)
  } else if (grant.validTo.kind !== 'n/a') {
    return 'pending'
  }

  if (grant.revokedBy.kind === 'value' && grant.revokedAt.kind === 'value') {
    if (!grant.revocable || !isValidWorldTime(grant.revokedAt.value)) return 'pending'
    stopTimes.push(grant.revokedAt.value)
  } else if (grant.revokedBy.kind !== 'n/a' || grant.revokedAt.kind !== 'n/a') {
    return 'pending'
  }

  if (stopTimes.length === 0) return 'death-gated'
  const earliest = stopTimes.reduce((current, next) =>
    compareWorldTime(next, current) < 0 ? next : current)
  const order = compareWorldTime(earliest, deathAt)
  if (order < 0) return 'inactive-before-death'
  if (order === 0) return 'inactive-at-death'
  return 'death-gated'
}

/**
 * Validates the complete supplied set of person-bound office appointments and
 * authorizations for a deceased person. It is read-only: appointments, Office
 * holders and authorization grants are never closed, revoked or reassigned.
 */
export function validateDeathOfficeInventory(
  inventory: DeathOfficeInventory,
  appointments: readonly Appointment[],
  authorizations: readonly Authorization[],
  refs: DeathOfficeInventoryReferences,
): DeathOfficeInventoryIssue[] {
  const issues: DeathOfficeInventoryIssue[] = []
  const deceasedRecords = refs.persons.filter(person => person.id === inventory.deceased)
  const deceased = deceasedRecords.length === 1 ? deceasedRecords[0] : undefined
  if (deceasedRecords.length === 0) issues.push('death-office-inventory-deceased-missing')
  if (deceasedRecords.length > 1) issues.push('death-office-inventory-deceased-ambiguous')
  if (deceased && deceased.lifeState !== 'dead') issues.push('death-office-inventory-deceased-not-dead')
  if (!deceased || deceased.death.kind !== 'value') {
    issues.push('death-office-inventory-death-record-missing')
    return [...new Set(issues)]
  }

  const death = deceased.death.value
  if (death.causeEvent !== inventory.deathEvent) issues.push('death-office-inventory-death-event-mismatch')
  if (!isValidWorldTime(death.at)) {
    issues.push('death-office-inventory-death-time-invalid')
    return [...new Set(issues)]
  }
  if (!refs.events.includes(inventory.deathEvent)) issues.push('death-office-inventory-death-event-missing')
  const deathEventAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathEventAt || !isValidWorldTime(deathEventAt)) {
    issues.push('death-office-inventory-death-time-mismatch')
  } else if (isValidWorldTime(death.at) && compareWorldTime(deathEventAt, death.at) !== 0) {
    issues.push('death-office-inventory-death-time-mismatch')
  }

  if (!['open', 'complete', 'challenged'].includes(inventory.status)) {
    issues.push('death-office-inventory-invalid-status')
  }
  if (!refs.events.includes(inventory.inventoryEvent)) issues.push('death-office-inventory-event-missing')
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !isValidWorldTime(inventoryAt)) {
    issues.push('death-office-inventory-event-time-missing')
  } else if (isValidWorldTime(death.at) && compareWorldTime(inventoryAt, death.at) < 0) {
    issues.push('death-office-inventory-before-death')
  }

  const personAppointments = appointments.filter(item => item.person === inventory.deceased)
  const personAuthorizations = authorizations.filter(item => item.principal === inventory.deceased)
  if (!unique(appointments.map(item => item.id))) {
    issues.push('death-office-inventory-appointment-duplicate-id')
  }
  if (!unique(authorizations.map(item => item.id))) {
    issues.push('death-office-inventory-authorization-duplicate-id')
  }
  if (!unique([...inventory.appointments.map(item => item.id), ...inventory.authorizations.map(item => item.id)])) {
    issues.push('death-office-inventory-entry-duplicate-id')
  }
  if (!unique(inventory.appointments.map(item => item.id))
    || !unique(inventory.appointments.map(item => item.appointment))) {
    issues.push('death-office-inventory-appointment-reference-duplicate')
  }
  if (!unique(inventory.authorizations.map(item => item.id))
    || !unique(inventory.authorizations.map(item => item.authorization))) {
    issues.push('death-office-inventory-authorization-reference-duplicate')
  }

  issues.push(...validateDeathOfficeAppointmentClosure(deceased, appointments, refs))
  issues.push(...validateAuthorizationSet(personAuthorizations))

  const appointmentById = new Map<string, Appointment[]>()
  for (const item of appointments) {
    appointmentById.set(item.id, [...(appointmentById.get(item.id) ?? []), item])
  }
  for (const entry of inventory.appointments) {
    const matches = appointmentById.get(entry.appointment) ?? []
    if (matches.length !== 1) {
      issues.push('death-office-inventory-appointment-reference-missing')
      continue
    }
    const appointment = matches[0]
    if (appointment.person !== inventory.deceased) {
      issues.push('death-office-inventory-appointment-person-mismatch')
      continue
    }
    const expected = appointmentDisposition(appointment, death.at, inventory.deathEvent)
    if (entry.disposition !== expected) issues.push('death-office-inventory-appointment-disposition-mismatch')
  }

  const authorizationById = new Map<string, Authorization[]>()
  for (const grant of authorizations) {
    authorizationById.set(grant.id, [...(authorizationById.get(grant.id) ?? []), grant])
  }
  for (const entry of inventory.authorizations) {
    const matches = authorizationById.get(entry.authorization) ?? []
    if (matches.length !== 1) {
      issues.push('death-office-inventory-authorization-reference-missing')
      continue
    }
    const grant = matches[0]
    if (grant.principal !== inventory.deceased) {
      issues.push('death-office-inventory-authorization-principal-mismatch')
      continue
    }
    if (!refs.events.includes(grant.grantedBy)) {
      issues.push('death-office-inventory-authorization-grant-event-missing')
    }
    const grantEventAt = refs.eventTimes.get(grant.grantedBy)
    if (!grantEventAt || !isValidWorldTime(grantEventAt)) {
      issues.push('death-office-inventory-authorization-grant-event-time-missing')
    } else if (!isValidWorldTime(grant.validFrom)
      || compareWorldTime(grantEventAt, death.at) >= 0
      || compareWorldTime(grant.validFrom, death.at) >= 0) {
      issues.push('death-office-inventory-authorization-granted-at-or-after-death')
    }

    if (grant.revokedBy.kind === 'value') {
      if (!refs.events.includes(grant.revokedBy.value)) {
        issues.push('death-office-inventory-authorization-revocation-event-missing')
      }
      const revokedAt = refs.eventTimes.get(grant.revokedBy.value)
      if (!revokedAt || !isValidWorldTime(revokedAt) || grant.revokedAt.kind !== 'value'
        || !isValidWorldTime(grant.revokedAt.value)
        || compareWorldTime(revokedAt, grant.revokedAt.value) !== 0) {
        issues.push('death-office-inventory-authorization-revocation-time-mismatch')
      }
    }

    const expected = authorizationDisposition(grant, death.at)
    if (entry.disposition !== expected) {
      issues.push('death-office-inventory-authorization-disposition-mismatch')
    }
    const request: AuthorizationRequest = {
      principal: inventory.deceased,
      permission: grant.permission,
      scope: grant.scope,
      at: death.at,
    }
    if (hasAuthorization([grant], request, refs.persons)) {
      issues.push('death-office-inventory-authorization-death-gate-failed')
    }
  }

  const appointmentEntryIds = inventory.appointments.map(item => item.appointment)
  const authorizationEntryIds = inventory.authorizations.map(item => item.authorization)
  if (!sameIdSet(appointmentEntryIds, personAppointments.map(item => item.id))) {
    if (inventory.status === 'complete') issues.push('death-office-inventory-appointment-coverage-missing')
  }
  if (!sameIdSet(authorizationEntryIds, personAuthorizations.map(item => item.id))) {
    if (inventory.status === 'complete') issues.push('death-office-inventory-authorization-coverage-missing')
  }

  return [...new Set(issues)]
}

/**
 * Readiness means all supplied person-bound appointment and principal-authorization
 * records have been accounted for and have a valid death disposition. It does not
 * mean an Office is vacant, a successor has been appointed, or grants were revoked.
 */
export function isDeathOfficeInventoryReadyForSettlement(
  inventory: DeathOfficeInventory,
  validationIssues: readonly DeathOfficeInventoryIssue[],
): boolean {
  return inventory.status === 'complete'
    && validationIssues.length === 0
    && inventory.appointments.every(entry =>
      entry.disposition === 'ended-before-death' || entry.disposition === 'closed-by-death')
    && inventory.authorizations.every(entry =>
      entry.disposition === 'inactive-before-death'
      || entry.disposition === 'inactive-at-death'
      || entry.disposition === 'death-gated')
}
