/**
 * W6-H — explicit authorization gate for player-originated world commands.
 *
 * Permission requirements are supplied by a trusted application policy adapter.
 * This module never infers authority from rank, office title, identity labels,
 * UI state or the request.actor string.
 */
import { hasAuthorization } from '../../domain/identity/authorization'
import type { AuthorizationRequest } from '../../domain/identity/model'
import type { JsonValue } from '../../domain/event-ledger'
import type { PersonId } from '../../domain/shared/ids'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldCommandRequest,
  WorldQueryPort,
} from './ports'

export type WorldCommandAuthorizationRequirement = Omit<AuthorizationRequest, 'principal' | 'at'>

/** Resolves identity from trusted session/authentication state, never request.actor. */
export interface WorldCommandPrincipalPort {
  resolve(): Promise<PersonId | null> | PersonId | null
}

/** Maps a command to its exact permission and scope; no rank/title inference. */
export interface WorldCommandAuthorizationRequirementPort {
  resolve(intentKind: string): Promise<WorldCommandAuthorizationRequirement | null> | WorldCommandAuthorizationRequirement | null
}

export interface AuthorizationGatedWorldCommandOptions {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly requirements: WorldCommandAuthorizationRequirementPort
  readonly principals: WorldCommandPrincipalPort
  /** When true, the authenticated principal must be this world's player character. */
  readonly requireWorldPlayer?: boolean
}

function snapshotJsonValue(value: JsonValue, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  if (typeof value !== 'object') throw new Error('world-command-payload-not-json')
  if (ancestors.has(value)) throw new Error('world-command-payload-circular-reference')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map(item => snapshotJsonValue(item, ancestors)))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('world-command-payload-not-plain-object')
    }
    const record = value as { readonly [key: string]: JsonValue }
    const entries: [string, JsonValue][] = []
    for (const key of Object.keys(record)) {
      entries.push([key, snapshotJsonValue(record[key]!, ancestors)])
    }
    return Object.freeze(Object.fromEntries(entries)) as { readonly [key: string]: JsonValue }
  } finally {
    ancestors.delete(value)
  }
}

function rejected(
  request: WorldCommandRequest,
  aggregate: WorldAggregate | null,
  reason: string,
): WorldCommandReceipt {
  return {
    status: 'rejected',
    worldId: request.worldId,
    clientRequestId: request.clientRequestId,
    reason,
    streamHead: aggregate?.streamHead ?? { kind: 'genesis', seq: 0 },
  }
}

/**
 * This is a player-facing boundary: every request must be tagged as a
 * player-command and pass explicit authorization. Internal rule/schedule/system
 * commands must use their own non-UI application composition, never this port.
 */
export function createAuthorizationGatedWorldCommandPort(
  options: AuthorizationGatedWorldCommandOptions,
): WorldCommandPort {
  return Object.freeze({
    async submit(request: WorldCommandRequest): Promise<WorldCommandReceipt> {
      // Snapshot request identity and authorization inputs before crossing async
      // boundaries; TypeScript readonly does not prevent runtime mutation.
      let command: WorldCommandRequest
      try {
        command = Object.freeze({
          ...request,
          requestedAt: Object.freeze({ ...request.requestedAt }),
          expectedHead: Object.freeze({ ...request.expectedHead }),
          // Snapshot nested JSON payloads too: callers must not be able to
          // change the target/action while principal and authorization resolve.
          payload: snapshotJsonValue(request.payload),
        })
      } catch {
        return rejected(request, null, 'world-command-request-snapshot-failed')
      }
      if (command.source !== 'player-command') {
        return rejected(command, null, 'world-command-source-not-allowed-at-player-boundary')
      }

      let principal: PersonId | null
      let requirement: WorldCommandAuthorizationRequirement | null
      try {
        [principal, requirement] = await Promise.all([
          options.principals.resolve(),
          options.requirements.resolve(command.intentKind),
        ])
      } catch {
        return rejected(command, null, 'world-command-authorization-resolution-failed')
      }
      if (!principal) {
        return rejected(command, null, 'world-command-authenticated-principal-missing')
      }
      if (!requirement || !requirement.permission.trim() || !requirement.scope) {
        return rejected(command, null, 'world-command-authorization-requirement-missing')
      }

      let aggregate: WorldAggregate | null
      try {
        aggregate = await options.queries.read(command.worldId)
      } catch {
        return rejected(command, null, 'world-command-authorization-query-failed')
      }
      if (!aggregate) return rejected(command, null, 'world-command-world-not-found')
      let currentPrincipal: PersonId | null
      try {
        currentPrincipal = await options.principals.resolve()
      } catch {
        return rejected(command, aggregate, 'world-command-authorization-resolution-failed')
      }
      if (currentPrincipal !== principal) {
        return rejected(command, aggregate, 'world-command-principal-changed')
      }
      if (options.requireWorldPlayer && aggregate.playerPersonId !== principal) {
        return rejected(command, aggregate, 'world-command-principal-not-world-player')
      }

      const authorized = hasAuthorization(
        aggregate.identity.authorizations,
        { ...requirement, principal, at: command.requestedAt },
        aggregate.persons,
      )
      if (!authorized) {
        return rejected(command, aggregate, 'world-command-unauthorized')
      }
      return options.commands.submit({ ...command, actor: principal })
    },
  })
}


export interface WorldCommandAuthorizationPolicyRule {
  readonly intentKind: string
  readonly permission: string
  readonly scope: AuthorizationRequest['scope']
}

export interface WorldCommandAuthorizationPolicy {
  readonly schemaVersion: 'w6-command-authorization/1'
  readonly policyId: string
  readonly revision: string
  readonly rules: readonly WorldCommandAuthorizationPolicyRule[]
}

function validAuthorizationScope(scope: AuthorizationRequest['scope']): boolean {
  if (!scope || typeof scope !== 'object') return false
  switch (scope.kind) {
    case 'world':
      return true
    case 'institution':
      return typeof scope.institution === 'string' && scope.institution.trim().length > 0
    case 'office':
      return typeof scope.office === 'string' && scope.office.trim().length > 0
    case 'person':
      return typeof scope.person === 'string' && scope.person.trim().length > 0
    default:
      return false
  }
}

/** Exact, versioned command-intent mapping. No wildcard, rank, title or payload fallback exists. */
export function validateWorldCommandAuthorizationPolicy(
  policy: WorldCommandAuthorizationPolicy,
): readonly string[] {
  const issues: string[] = []
  if (!policy || policy.schemaVersion !== 'w6-command-authorization/1') issues.push('authorization-policy-schema-unsupported')
  if (typeof policy?.policyId !== 'string' || !policy.policyId.trim()) issues.push('authorization-policy-id-invalid')
  if (typeof policy?.revision !== 'string' || !policy.revision.trim()) issues.push('authorization-policy-revision-invalid')
  if (!Array.isArray(policy?.rules)) issues.push('authorization-policy-rules-invalid')
  const intents = new Set<string>()
  for (const rule of Array.isArray(policy?.rules) ? policy.rules : []) {
    if (!rule || typeof rule.intentKind !== 'string' || !rule.intentKind.trim()) {
      issues.push('authorization-policy-intent-invalid')
      continue
    }
    if (intents.has(rule.intentKind)) issues.push('authorization-policy-intent-duplicate')
    intents.add(rule.intentKind)
    if (typeof rule.permission !== 'string' || !rule.permission.trim()) {
      issues.push('authorization-policy-permission-invalid')
    }
    if (!validAuthorizationScope(rule.scope)) issues.push('authorization-policy-scope-invalid')
  }
  return Object.freeze([...new Set(issues)].sort())
}

/**
 * Builds the requirement adapter consumed by the player command gate.
 * The policy is trusted application configuration; an unmapped intent returns
 * null and is denied by the gate. Scope is fixed by the exact rule, never read
 * from untrusted request payload fields.
 */
export function createWorldCommandAuthorizationRequirementResolver(
  policy: WorldCommandAuthorizationPolicy,
): WorldCommandAuthorizationRequirementPort {
  const issues = validateWorldCommandAuthorizationPolicy(policy)
  if (issues.length > 0) {
    throw new Error(`world-command-authorization-policy-invalid:${issues.join(',')}`)
  }
  // Snapshot trusted configuration at composition time. Later mutation of the
  // provider's source object must not silently change active authorization.
  const rules = new Map(policy.rules.map(rule => [rule.intentKind, Object.freeze({
    intentKind: rule.intentKind,
    permission: rule.permission,
    scope: Object.freeze({ ...rule.scope }),
  })] as const))
  return Object.freeze({
    resolve(intentKind: string): WorldCommandAuthorizationRequirement | null {
      const rule = rules.get(intentKind)
      if (!rule) return null
      return Object.freeze({
        permission: rule.permission,
        scope: Object.freeze({ ...rule.scope }),
      })
    },
  })
}
