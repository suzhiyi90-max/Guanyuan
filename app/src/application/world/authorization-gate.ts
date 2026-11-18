/**
 * W6-H — explicit authorization gate for player-originated world commands.
 *
 * Permission requirements are supplied by a trusted application policy adapter.
 * This module never infers authority from rank, office title, identity labels,
 * UI state or the request.actor string.
 */
import { hasAuthorization } from '../../domain/identity/authorization'
import type { AuthorizationRequest } from '../../domain/identity/model'
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
  resolve(request: WorldCommandRequest): Promise<PersonId | null> | PersonId | null
}

/** Maps a command to its exact permission and scope; no rank/title inference. */
export interface WorldCommandAuthorizationRequirementPort {
  resolve(request: WorldCommandRequest): Promise<WorldCommandAuthorizationRequirement | null> | WorldCommandAuthorizationRequirement | null
}

export interface AuthorizationGatedWorldCommandOptions {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly requirements: WorldCommandAuthorizationRequirementPort
  readonly principals: WorldCommandPrincipalPort
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
 * Player commands require an explicit, currently-active grant for a living
 * principal. Internal rule/schedule/system commands retain their separate
 * trusted application path and are not treated as player authorization.
 */
export function createAuthorizationGatedWorldCommandPort(
  options: AuthorizationGatedWorldCommandOptions,
): WorldCommandPort {
  return Object.freeze({
    async submit(request: WorldCommandRequest): Promise<WorldCommandReceipt> {
      if (request.source !== 'player-command') {
        return options.commands.submit(request)
      }

      let principal: PersonId | null
      let requirement: WorldCommandAuthorizationRequirement | null
      try {
        [principal, requirement] = await Promise.all([
          options.principals.resolve(request),
          options.requirements.resolve(request),
        ])
      } catch {
        return rejected(request, null, 'world-command-authorization-resolution-failed')
      }
      if (!principal) {
        return rejected(request, null, 'world-command-authenticated-principal-missing')
      }
      if (!requirement || !requirement.permission.trim() || !requirement.scope) {
        return rejected(request, null, 'world-command-authorization-requirement-missing')
      }

      let aggregate: WorldAggregate | null
      try {
        aggregate = await options.queries.read(request.worldId)
      } catch {
        return rejected(request, null, 'world-command-authorization-query-failed')
      }
      if (!aggregate) return rejected(request, null, 'world-command-world-not-found')

      const authorized = hasAuthorization(
        aggregate.identity.authorizations,
        { ...requirement, principal, at: request.requestedAt },
        aggregate.persons,
      )
      if (!authorized) {
        return rejected(request, aggregate, 'world-command-unauthorized')
      }
      return options.commands.submit(request)
    },
  })
}
