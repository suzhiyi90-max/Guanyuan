import type { Field } from '../shared/field'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Authorization, AuthorizationRequest, AuthorizationScope } from './model'

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
  }
  if (isValue(grant.revokedAt)) {
    if (!isValidWorldTime(grant.revokedAt.value) || compareWorldTime(at, grant.revokedAt.value) >= 0) return false
  }
  return true
}

/** Default-deny authorization. Rank, office title and identity are not implicit grants. */
export function hasAuthorization(
  grants: readonly Authorization[],
  request: AuthorizationRequest,
): boolean {
  if (!isValidWorldTime(request.at)) return false
  return grants.some((grant) =>
    grant.principal === request.principal
    && grant.permission === request.permission
    && scopeCovers(grant.scope, request.scope)
    && isAuthorizationActive(grant, request.at),
  )
}
