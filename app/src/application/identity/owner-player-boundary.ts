/**
 * W6-HC — compose the trusted Owner→Person principal with the player boundary.
 *
 * This is an application composition capability, not a UI identity API. It
 * derives the sole world from the authenticated owner's finalized reservation,
 * verifies the principal against canonical Genesis evidence, and returns only
 * the capability-limited player boundary plus that trusted WorldId.
 */
import type { PersonId } from '../../domain/shared/ids'
import type { WorldId } from '../../domain/event-ledger'
import type { OwnerIdentityPort, OwnerId } from './owner'
import { createOwnerPersonPrincipalPort } from './owner-person-principal'
import type {
  OwnerPersonBinding,
  OwnerWorldReservation,
  OwnerWorldReservationPort,
  DurableWorldLedgerPort,
} from '../world/durable-ports'
import {
  createWorldPlayerBoundary,
  type WorldPlayerBoundary,
} from '../world/player-boundary'
import type { WorldCommandAuthorizationPolicy } from '../world/authorization-gate'
import { projectWorldForObserver } from '../world/observer-view'
import type { WorldObserver, WorldObserverSocialView } from '../world/observer-view'
import type { WorldObserverQueryPort } from '../world/ports'

export interface OwnerPlayerBoundarySessionDependencies {
  readonly identity: OwnerIdentityPort
  readonly reservations: Pick<OwnerWorldReservationPort, 'readReservation' | 'readOwnerPersonBinding'>
  readonly ledger: Pick<DurableWorldLedgerPort, 'loadLedger' | 'createWorldAdapter'>
  readonly authorizationPolicy: WorldCommandAuthorizationPolicy
}

export interface OwnerPlayerBoundarySession {
  /** WorldId comes from the trusted Owner reservation, never a UI argument. */
  readonly worldId: WorldId
  /** Only this capability-limited boundary may be passed to player UI. */
  readonly boundary: WorldPlayerBoundary
}

function sameStreamHead(
  left: OwnerPersonBinding['verifiedStreamHead'],
  right: OwnerPersonBinding['verifiedStreamHead'],
): boolean {
  return left.kind === 'event' && right.kind === 'event'
    && left.seq === right.seq && left.eventId === right.eventId
}

function matchesFinalizedReservation(
  ownerId: OwnerId,
  reservation: OwnerWorldReservation,
  binding: OwnerPersonBinding,
): boolean {
  return reservation.state === 'binding-finalized'
    && reservation.ownerId === ownerId
    && Boolean(reservation.genesis)
    && binding.schemaVersion === 1
    && binding.ownerId === ownerId
    && binding.worldId === reservation.worldId
    && binding.personId === reservation.genesis?.personId
    && binding.genesisEventId === reservation.genesis?.eventId
    && sameStreamHead(binding.verifiedStreamHead, reservation.genesis!.streamHead)
}

/**
 * Returns null for unauthenticated, unbound, unverified, stale or unreadable
 * owner state. The returned player boundary re-resolves the trusted principal
 * on each command/query/subscription emission and never exposes raw ports.
 */
export async function createOwnerPlayerBoundarySession(
  dependencies: OwnerPlayerBoundarySessionDependencies,
): Promise<OwnerPlayerBoundarySession | null> {
  let ownerId: OwnerId
  try {
    ownerId = await dependencies.identity.resolve()
  } catch {
    return null
  }

  let reservation: OwnerWorldReservation | null
  let binding: OwnerPersonBinding | null
  try {
    [reservation, binding] = await Promise.all([
      dependencies.reservations.readReservation(ownerId),
      dependencies.reservations.readOwnerPersonBinding(ownerId),
    ])
  } catch {
    return null
  }
  if (!reservation || !binding || !matchesFinalizedReservation(ownerId, reservation, binding)) return null

  const principals = createOwnerPersonPrincipalPort({
    identity: dependencies.identity,
    reservations: dependencies.reservations,
    ledger: dependencies.ledger,
  })
  let principal: PersonId | null
  try {
    principal = await principals.resolve()
  } catch {
    return null
  }
  if (!principal || principal !== binding.personId) return null

  // Do not complete composition against a session that changed while the
  // canonical ledger and replay-backed projection were being verified.
  try {
    if (await dependencies.identity.resolve() !== ownerId) return null
  } catch {
    return null
  }

  let adapter: ReturnType<DurableWorldLedgerPort['createWorldAdapter']>
  try {
    adapter = dependencies.ledger.createWorldAdapter(reservation.worldId, reservation.worldStartTime)
  } catch {
    return null
  }

  let aggregate
  try {
    aggregate = await adapter.queries.read(reservation.worldId)
  } catch {
    return null
  }
  if (!aggregate || aggregate.worldId !== reservation.worldId || aggregate.playerPersonId !== principal) {
    return null
  }

  const observerQueries: WorldObserverQueryPort = Object.freeze({
    async read(worldId: WorldId, observer: WorldObserver): Promise<WorldObserverSocialView | null> {
      if (worldId !== reservation.worldId) return null
      try {
        const current = await adapter.queries.read(worldId)
        if (!current || current.worldId !== reservation.worldId || current.playerPersonId !== principal) return null
        return projectWorldForObserver(current, observer)
      } catch {
        return null
      }
    },
    subscribe(
      worldId: WorldId,
      observer: WorldObserver,
      listener: (view: WorldObserverSocialView) => void,
    ): () => void {
      if (worldId !== reservation.worldId) return () => undefined
      let active = true
      let unsubscribe: (() => void) | null = null
      try {
        unsubscribe = adapter.queries.subscribe(worldId, current => {
          if (!active || current.worldId !== reservation.worldId || current.playerPersonId !== principal) return
          try {
            listener(projectWorldForObserver(current, observer))
          } catch {
            // Subscriber failures cannot widen access or affect committed facts.
          }
        })
      } catch {
        active = false
      }
      return () => {
        if (!active) return
        active = false
        unsubscribe?.()
        unsubscribe = null
      }
    },
  })

  // Final identity check closes the asynchronous adapter/projection setup
  // window. Subsequent operations are independently revalidated by the
  // PlayerBoundary and OwnerPersonPrincipalPort.
  try {
    if (await dependencies.identity.resolve() !== ownerId) return null
  } catch {
    return null
  }

  return Object.freeze({
    worldId: reservation.worldId,
    boundary: createWorldPlayerBoundary({
      commands: adapter.commands,
      queries: adapter.queries,
      observerQueries,
      principals,
      authorizationPolicy: dependencies.authorizationPolicy,
    }),
  })
}
