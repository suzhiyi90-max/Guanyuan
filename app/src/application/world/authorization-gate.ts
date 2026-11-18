/**
 * W6-H — explicit authorization gate for player-originated world commands.
 *
 * Permission requirements are supplied by a trusted application policy adapter.
 * This module never infers authority from rank, office title, identity labels,
 * UI state or the request.actor string.
 */
import { hasAuthorization } from '../../domain/identity/authorization'
import type { AuthorizationRequest } from '../../domain/identity/model'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldCommandRequest,
  WorldQueryPort,
} from './ports'

export type WorldCommandAuthorizationRequirement = Omit<AuthorizationRequest, 'at'>

export interface WorldCommandAuthorizationRequirementPort {
  /** Resolve an authenticated principal and exact permission/scope requirement. */
  resolve(request: WorldCommandRequest): WorldCommandAuthorizationRequirement | null
}

export interface AuthorizationGatedWorldCommandOptions {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly requirements: WorldCommandAuthorizationRequirementPort
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

      let requirement: WorldCommandAuthorizationRequirement | null
      try {
        requirement = options.requirements.resolve(request)
      } catch {
        return rejected(request, null, 'world-command-authorization-resolution-failed')
      }
      if (!requirement
        || !requirement.permission.trim()
        || !requirement.principal
        || !requirement.scope) {
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
        { ...requirement, at: request.requestedAt },
        aggregate.persons,
      )
      if (!authorized) {
        return rejected(request, aggregate, 'world-command-unauthorized')
      }
      return options.commands.submit(request)
    },
  })
}
