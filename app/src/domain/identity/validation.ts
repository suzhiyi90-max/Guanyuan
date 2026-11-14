import type { Field } from '../shared/field'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Appointment, Authorization, IdentityAssignment, IdentityIssue, Office } from './model'

function isValue<T extends {}>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

export function validateIdentityAssignment(
  identity: IdentityAssignment,
  existing: readonly IdentityAssignment[],
): IdentityIssue[] {
  const issues: IdentityIssue[] = []
  if (!identity.code.trim()) issues.push('identity-empty-code')
  if (identity.validTo !== 'open' && identity.validTo === identity.validFrom) {
    issues.push('identity-validity-reference-mismatch')
  }
  if (existing.some((item) => item.id === identity.id)) issues.push('identity-id-already-exists')
  return issues
}

export function validateOffice(office: Office): IdentityIssue[] {
  const issues: IdentityIssue[] = []
  if (office.holder.kind !== 'held' && office.holder.kind !== 'vacant') {
    issues.push('office-invalid-holder')
  }
  if (office.validTo !== 'open' && office.validTo === office.validFrom) {
    issues.push('identity-validity-reference-mismatch')
  }
  if (new Set(office.authorization).size !== office.authorization.length) {
    issues.push('office-authorization-duplicate')
  }
  return issues
}

export function validateAppointment(appointment: Appointment): IdentityIssue[] {
  const issues: IdentityIssue[] = []
  if (!isValidWorldTime(appointment.from)) {
    issues.push('appointment-invalid-world-time')
    return issues
  }
  if (isValue(appointment.to)) {
    if (!isValidWorldTime(appointment.to.value)) {
      issues.push('appointment-invalid-world-time')
    } else if (compareWorldTime(appointment.to.value, appointment.from) <= 0) {
      issues.push('appointment-end-before-start')
    }
  } else if (appointment.to.kind !== 'n/a') {
    issues.push('appointment-unknown-end')
  }
  return issues
}

/** Validate appointment history against the office's objective holder at a given time. */
export function validateOfficeAppointments(
  office: Office,
  appointments: readonly Appointment[],
  at: Appointment['from'],
): IdentityIssue[] {
  const issues: IdentityIssue[] = [...validateOffice(office)]
  if (!isValidWorldTime(at)) return [...issues, 'appointment-invalid-world-time']

  const allIds = new Set<string>()
  for (const item of appointments) {
    if (allIds.has(item.id)) issues.push('appointment-duplicate-id')
    allIds.add(item.id)
  }

  const relevant = appointments.filter((item) => item.office === office.id)
  for (const item of relevant) issues.push(...validateAppointment(item))

  // Invalid records are reported above and excluded from temporal comparisons.
  const validIntervals = relevant.filter((item) =>
    isValidWorldTime(item.from)
    && (item.to.kind === 'n/a'
      || (isValue(item.to) && isValidWorldTime(item.to.value)
        && compareWorldTime(item.to.value, item.from) > 0)),
  ).sort((a, b) => compareWorldTime(a.from, b.from))

  for (let index = 0; index < validIntervals.length - 1; index += 1) {
    const current = validIntervals[index]
    const next = validIntervals[index + 1]
    if (current.to.kind === 'n/a'
      || (isValue(current.to) && compareWorldTime(next.from, current.to.value) < 0)) {
      issues.push('appointment-overlap')
    }
  }

  const active = validIntervals.filter((item) => {
    if (compareWorldTime(item.from, at) > 0) return false
    if (item.to.kind === 'n/a') return true
    return isValue(item.to) && compareWorldTime(at, item.to.value) < 0
  })
  if (office.holder.kind === 'held') {
    if (active.length !== 1 || active[0].person !== office.holder.person) {
      issues.push('office-holder-appointment-mismatch')
    }
  } else if (active.length > 0) {
    issues.push('office-vacancy-has-active-appointment')
  }
  return issues
}

export function validateAuthorization(grant: Authorization): IdentityIssue[] {
  const issues: IdentityIssue[] = []
  if (!grant.permission.trim()) issues.push('authorization-empty-permission')
  if (!isValidWorldTime(grant.validFrom)) issues.push('authorization-invalid-time')
  if (isValue(grant.validTo)) {
    if (!isValidWorldTime(grant.validTo.value)
      || (isValidWorldTime(grant.validFrom) && compareWorldTime(grant.validTo.value, grant.validFrom) <= 0)) {
      issues.push('authorization-invalid-time')
    }
  } else if (grant.validTo.kind !== 'n/a') {
    issues.push('authorization-invalid-time')
  }

  const hasRevocationEvent = isValue(grant.revokedBy)
  const hasRevocationTime = isValue(grant.revokedAt)
  const noRevocation = grant.revokedBy.kind === 'n/a' && grant.revokedAt.kind === 'n/a'
  if (hasRevocationEvent !== hasRevocationTime || (!noRevocation && !hasRevocationEvent)) {
    issues.push('authorization-revocation-inconsistent')
  }
  if ((hasRevocationEvent || hasRevocationTime) && !grant.revocable) {
    issues.push('authorization-revocation-forbidden')
  }
  if (isValue(grant.revokedAt)) {
    if (!isValidWorldTime(grant.revokedAt.value)) {
      issues.push('authorization-invalid-time')
    } else if (isValidWorldTime(grant.validFrom)
      && compareWorldTime(grant.revokedAt.value, grant.validFrom) < 0) {
      issues.push('authorization-invalid-time')
    }
  }
  if (isValue(grant.validTo) && isValidWorldTime(grant.validTo.value)
    && isValue(grant.revokedAt) && isValidWorldTime(grant.revokedAt.value)
    && compareWorldTime(grant.revokedAt.value, grant.validTo.value) > 0) {
    issues.push('authorization-invalid-time')
  }
  return issues
}

/** Office authorization references must resolve to grants scoped to that office. */
export function validateOfficeAuthorizationReferences(
  office: Office,
  grants: readonly Authorization[],
): IdentityIssue[] {
  const issues: IdentityIssue[] = [...validateOffice(office)]
  const byId = new Map(grants.map((grant) => [grant.id, grant]))
  for (const id of office.authorization) {
    const grant = byId.get(id)
    if (!grant) {
      issues.push('office-authorization-reference-missing')
    } else if (grant.scope.kind !== 'office' || grant.scope.office !== office.id) {
      issues.push('office-authorization-scope-mismatch')
    }
  }
  return issues
}

export function validateAuthorizationSet(grants: readonly Authorization[]): IdentityIssue[] {
  const issues: IdentityIssue[] = []
  const ids = new Set<string>()
  for (const grant of grants) {
    if (ids.has(grant.id)) issues.push('authorization-duplicate-id')
    ids.add(grant.id)
    issues.push(...validateAuthorization(grant))
  }
  return issues
}
