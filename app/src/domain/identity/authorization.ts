import type { Field } from '../shared/field'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Authorization, AuthorizationRequest, AuthorizationScope } from './model'
import type { Person } from '../person/model'

function isValue<T extends {}>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}

function sameScope(left: AuthorizationScope, right: AuthorizationScope): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'world':
      return true
    case 'institution':
      return right.kind === 'institution' && left.institution === right.institution
    case 'office':
      return right.kind === 'office' && left.office === right.office
    case 'person':
      return right.kind === 'person' && left.person === right.person
  }
}

function scopeCovers(grant: AuthorizationScope, requested: AuthorizationScope): boolean {
  return grant.kind === 'world' || sameScope(grant, requested)
}

export function isAuthorizationActive(grant: Authorization, at: AuthorizationRequest['at']): boolean {
  if (!isValidWorldTime(at) || !isValidWorldTime(grant.validFrom)) return false
  if (compareWorldTime(at, grant.validFrom) < 0) return false
  if (isValue(grant.validTo)) {
    if (!isValidWorldTime(grant.validTo.value) || compareWorldTime(at, grant.validTo.value) >= 0) return false
  } else if (grant.validTo.kind !== 'n/a') {
    return false
  }
  if (isValue(grant.revokedAt)) {
    if (!grant.revocable || !isValue(grant.revokedBy)
      || !isValidWorldTime(grant.revokedAt.value)
      || compareWorldTime(at, grant.revokedAt.value) >= 0) return false
  } else if (grant.revokedAt.kind !== 'n/a' || grant.revokedBy.kind !== 'n/a') {
    return false
  }
  return true
}

/** Default-deny authorization. Rank, office title and identity are not implicit grants. */
/**
 * A grant is exercisable only by its living principal at the requested world
 * time. Historical checks before a recorded death remain valid; the death
 * instant itself is the first instant at which the person cannot act.
 *
 * Missing, duplicated or contradictory principal life records fail closed.
 * Archive state is deliberately irrelevant: archived living people remain
 * capable of exercising otherwise-valid authority.
 */
function isPrincipalAliveAt(
  person: Person,
  at: AuthorizationRequest['at'],
): boolean {
  if (!isValidWorldTime(at)) return false

  if (person.birth.kind === 'value') {
    if (!isValidWorldTime(person.birth.value)
      || compareWorldTime(at, person.birth.value) < 0) return false
  }

  if (person.lifeState === 'alive') {
    return person.death.kind === 'n/a'
  }

  if (person.lifeState === 'dead') {
    if (person.death.kind !== 'value' || !isValidWorldTime(person.death.value.at)) return false
    return compareWorldTime(at, person.death.value.at) < 0
  }

  return false
}

/** Default-deny authorization, including the principal's life-state gate. */
export function hasAuthorization(
  grants: readonly Authorization[],
  request: AuthorizationRequest,
  people: readonly Person[],
): boolean {
  if (!isValidWorldTime(request.at) || !request.permission.trim()) return false
  const principalRecords = people.filter((person) => person.id === request.principal)
  if (principalRecords.length !== 1 || !isPrincipalAliveAt(principalRecords[0], request.at)) {
    return false
  }
  return grants.some((grant) =>
    grant.principal === request.principal
    && grant.permission === request.permission
    && scopeCovers(grant.scope, request.scope)
    && isAuthorizationActive(grant, request.at),
  )
}
