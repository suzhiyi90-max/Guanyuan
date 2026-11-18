/**
 * W6-I — player-facing composition boundary.
 *
 * This is the only object intended for a player UI to receive. It deliberately
 * exposes neither raw command/query ports nor a caller-selectable observer ID.
 */
import {
  createAuthorizationGatedWorldCommandPort,
  createWorldCommandAuthorizationRequirementResolver,
  type WorldCommandAuthorizationPolicy,
  type WorldCommandPrincipalPort,
} from './authorization-gate'
import type {
  WorldCommandPort,
  WorldObserverQueryPort,
  WorldQueryPort,
} from './ports'
import type { WorldObserverSocialView } from './observer-view'
import type { WorldId } from '../../domain/event-ledger'

export interface WorldPlayerQueryPort {
  /** Reads only the authenticated principal's observer-scoped projection. */
  read(worldId: WorldId): Promise<WorldObserverSocialView | null>
  /** Subscribes only to the authenticated principal's observer-scoped projection. */
  subscribe(worldId: WorldId, listener: (view: WorldObserverSocialView) => void): () => void
}

export interface WorldPlayerBoundaryOptions {
  /** Raw command port is captured privately and never returned. */
  readonly commands: WorldCommandPort
  /** Internal aggregate query is used only inside the authorization gate. */
  readonly queries: WorldQueryPort
  /** Generic observer query is captured privately; UI cannot choose an observer. */
  readonly observerQueries: WorldObserverQueryPort
  /** Shared trusted identity resolver for both command authorization and read scoping. */
  readonly principals: WorldCommandPrincipalPort
  /** Explicit, versioned policy. Empty or incomplete mappings fail closed at submit time. */
  readonly authorizationPolicy: WorldCommandAuthorizationPolicy
}

export interface WorldPlayerBoundary {
  readonly commands: WorldCommandPort
  readonly queries: WorldPlayerQueryPort
}

/**
 * Creates a capability-limited player boundary.
 *
 * The caller must retain raw ports for trusted bootstrap/rule/scheduler work and
 * pass only this return value to player-facing UI. This factory does not choose
 * permissions, infer a principal, or grant any default command.
 */
export function createWorldPlayerBoundary(
  options: WorldPlayerBoundaryOptions,
): WorldPlayerBoundary {
  const requirements = createWorldCommandAuthorizationRequirementResolver(options.authorizationPolicy)
  const commands = createAuthorizationGatedWorldCommandPort({
    commands: options.commands,
    queries: options.queries,
    requirements,
    principals: options.principals,
  })

  const queries: WorldPlayerQueryPort = Object.freeze({
    async read(worldId: WorldId): Promise<WorldObserverSocialView | null> {
      try {
        const principal = await options.principals.resolve()
        if (!principal) return null
        const aggregate = await options.queries.read(worldId)
        if (!aggregate || aggregate.worldId !== worldId || aggregate.playerPersonId !== principal) return null
        const view = await options.observerQueries.read(worldId, principal)
        if (!view || view.worldId !== worldId || view.observerPersonId !== principal) return null
        // A session can change while storage/projection reads are pending. Do not
        // return a previous player's view after logout or account switching.
        const currentPrincipal = await options.principals.resolve()
        return currentPrincipal === principal ? view : null
      } catch {
        return null
      }
    },

    subscribe(worldId: WorldId, listener: (view: WorldObserverSocialView) => void): () => void {
      let active = true
      let unsubscribe: (() => void) | null = null
      const deactivate = () => {
        if (!active) return
        active = false
        unsubscribe?.()
        unsubscribe = null
      }
      void Promise.resolve()
        .then(() => options.principals.resolve())
        .then(async principal => {
          if (!active || !principal) return
          const aggregate = await options.queries.read(worldId)
          if (!active || !aggregate || aggregate.worldId !== worldId || aggregate.playerPersonId !== principal) return
          const currentPrincipal = await options.principals.resolve()
          if (!active || currentPrincipal !== principal) return
          unsubscribe = options.observerQueries.subscribe(worldId, principal, view => {
            if (!active || view.worldId !== worldId || view.observerPersonId !== principal) return
            // Revalidate on every emission so an existing subscription cannot
            // continue delivering a prior account's view after session change.
            void Promise.resolve().then(() => options.principals.resolve()).then(current => {
              if (!active) return
              if (current !== principal) {
                deactivate()
                return
              }
              listener(view)
            }).catch(() => deactivate())
          })
          if (!active) {
            unsubscribe()
            unsubscribe = null
          }
        })
        .catch(() => {
          // Missing/failed authentication produces no subscription.
        })
      return deactivate
    },
  })

  return Object.freeze({ commands, queries })
}
