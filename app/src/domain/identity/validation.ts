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
