/**
 * W6-HI — headless Owner→World→Player startup orchestration.
 *
 * This is a trusted application coordinator, not a UI API. The caller supplies
 * an audited world-initialization policy; this module never invents scenario,
 * location, ruleset, world time, identities or permissions.
 */
import type { OwnerIdentityPort } from './owner'
import type { WorldId } from '../../domain/event-ledger'
import type { PersonId } from '../../domain/shared/ids'
import type { WorldTime } from '../../domain/shared/world-time'
import type { OwnerWorldReservation, OwnerWorldReservationPort, DurableWorldLedgerPort } from '../world/durable-ports'
import type { WorldCommandAuthorizationPolicy } from '../world/authorization-gate'
import type { WorldCommandPort, WorldQueryPort } from '../world/ports'
import type {
  GenesisPersonFactoryPort,
  GenesisRequestIdPort,
  GenesisWorldTimePort,
  GenesisResult,
} from '../world/genesis'
import { runPlayerGenesis } from '../world/genesis'
import { createOwnerPlayerBoundarySession, type OwnerPlayerBoundarySession } from './owner-player-boundary'

export type EnsureWorldInitializedResult =
  | { readonly status: 'ready'; readonly worldId: WorldId }
  | { readonly status: 'partial'; readonly worldId: WorldId; readonly reason: string }
  | { readonly status: 'rejected'; readonly worldId: WorldId; readonly reason: string }

export interface OwnerWorldInitializationPort {
  /**
   * Must be idempotent and resume from canonical ledger state. Implementations
   * normally delegate to initializeWorldThroughPorts with a reviewed scenario
   * descriptor and the supplied durable adapter ports.
   */
  ensureInitialized(input: {
    readonly worldId: WorldId
    readonly worldStartTime: WorldTime
    readonly commands: WorldCommandPort
    readonly queries: WorldQueryPort
  }): Promise<EnsureWorldInitializedResult>
}

export interface OwnerPlayerRuntimeStartupDependencies {
  readonly identity: OwnerIdentityPort
  readonly requestIds: GenesisRequestIdPort
  readonly clock: GenesisWorldTimePort
  readonly persons: GenesisPersonFactoryPort
  readonly reservations: OwnerWorldReservationPort
  readonly ledger: DurableWorldLedgerPort
  readonly worldInitialization: OwnerWorldInitializationPort
  readonly authorizationPolicy: WorldCommandAuthorizationPolicy
}

export type OwnerPlayerRuntimeStartupResult =
  | {
      readonly status: 'ready'
      readonly ownerId: OwnerWorldReservation['ownerId']
      readonly worldId: WorldId
      readonly personId: PersonId
      readonly genesis: Extract<GenesisResult, { readonly status: 'ready' | 'recovered' }>
      readonly session: OwnerPlayerBoundarySession
    }
  | { readonly status: 'rejected'; readonly reason: string }

function sameReservation(left: OwnerWorldReservation, right: OwnerWorldReservation): boolean {
  return left.ownerId === right.ownerId
    && left.worldId === right.worldId
    && left.clientRequestId === right.clientRequestId
    && left.worldStartTime.day === right.worldStartTime.day
    && left.worldStartTime.period === right.worldStartTime.period
}

async function resolveOwner(identity: OwnerIdentityPort) {
  try { return await identity.resolve() } catch { return null }
}

/**
 * Publishes a player capability only after reservation, world initialization,
 * Genesis and replay-backed Owner→Person verification have all succeeded.
 * Partial initialization is durable but never exposed as a playable session.
 */
export async function startOwnerPlayerRuntime(
  dependencies: OwnerPlayerRuntimeStartupDependencies,
  displayName: string,
): Promise<OwnerPlayerRuntimeStartupResult> {
  const ownerId = await resolveOwner(dependencies.identity)
  if (!ownerId) return { status: 'rejected', reason: 'owner-player-startup-identity-unavailable' }

  let reservation: OwnerWorldReservation | null
  try { reservation = await dependencies.reservations.readReservation(ownerId) } catch {
    return { status: 'rejected', reason: 'owner-player-startup-reservation-read-failed' }
  }

  if (!reservation) {
    let worldStartTime: WorldTime
    let clientRequestId: string
    try {
      worldStartTime = await dependencies.clock.current()
      clientRequestId = dependencies.requestIds.create().trim()
    } catch {
      return { status: 'rejected', reason: 'owner-player-startup-request-context-unavailable' }
    }
    if (!clientRequestId) return { status: 'rejected', reason: 'owner-player-startup-request-id-empty' }

    try {
      const reserved = await dependencies.reservations.reserveWorld(ownerId, clientRequestId, worldStartTime)
      if (reserved.status === 'reserved') reservation = reserved.reservation
      else reservation = await dependencies.reservations.readReservation(ownerId)
    } catch {
      return { status: 'rejected', reason: 'owner-player-startup-reservation-failed' }
    }
    if (!reservation) return { status: 'rejected', reason: 'owner-player-startup-reservation-unavailable' }
  }

  if (reservation.ownerId !== ownerId) {
    return { status: 'rejected', reason: 'owner-player-startup-reservation-owner-mismatch' }
  }

  // Only a reservation that has not yet committed Genesis needs the world
  // initializer. A retry reuses the same reservation/request identity.
  if (reservation.state === 'reserved') {
    if (await resolveOwner(dependencies.identity) !== ownerId) {
      return { status: 'rejected', reason: 'owner-player-startup-owner-changed-before-initialization' }
    }
    let adapter: ReturnType<DurableWorldLedgerPort['createWorldAdapter']>
    try {
      adapter = dependencies.ledger.createWorldAdapter(reservation.worldId, reservation.worldStartTime)
    } catch {
      return { status: 'rejected', reason: 'owner-player-startup-world-adapter-unavailable' }
    }
    let initialized: EnsureWorldInitializedResult
    try {
      initialized = await dependencies.worldInitialization.ensureInitialized({
        worldId: reservation.worldId,
        worldStartTime: reservation.worldStartTime,
        commands: adapter.commands,
        queries: adapter.queries,
      })
    } catch {
      return { status: 'rejected', reason: 'owner-player-startup-world-initialization-failed' }
    }
    if (initialized.worldId !== reservation.worldId) {
      return { status: 'rejected', reason: 'owner-player-startup-initializer-world-mismatch' }
    }
    if (initialized.status !== 'ready') {
      return {
        status: 'rejected',
        reason: initialized.status === 'partial'
          ? `owner-player-startup-world-initialization-partial:${initialized.reason}`
          : `owner-player-startup-world-initialization-rejected:${initialized.reason}`,
      }
    }

    if (await resolveOwner(dependencies.identity) !== ownerId) {
      return { status: 'rejected', reason: 'owner-player-startup-owner-changed-after-initialization' }
    }
    let currentReservation: OwnerWorldReservation | null
    try { currentReservation = await dependencies.reservations.readReservation(ownerId) } catch {
      return { status: 'rejected', reason: 'owner-player-startup-reservation-recheck-failed' }
    }
    if (!currentReservation || !sameReservation(currentReservation, reservation)) {
      return { status: 'rejected', reason: 'owner-player-startup-reservation-changed-during-initialization' }
    }
    reservation = currentReservation
  }

  let genesis: GenesisResult
  try {
    genesis = await runPlayerGenesis({
    identity: dependencies.identity,
    requestIds: dependencies.requestIds,
    clock: dependencies.clock,
    persons: dependencies.persons,
    reservations: dependencies.reservations,
    ledger: dependencies.ledger,
    }, displayName)
  } catch {
    return { status: 'rejected', reason: 'owner-player-startup-genesis-execution-failed' }
  }
  if (genesis.status === 'rejected') {
    return { status: 'rejected', reason: `owner-player-startup-genesis-rejected:${genesis.reason}` }
  }
  if (genesis.ownerId !== ownerId || genesis.worldId !== reservation.worldId) {
    return { status: 'rejected', reason: 'owner-player-startup-genesis-binding-mismatch' }
  }

  let session: OwnerPlayerBoundarySession | null
  try {
    session = await createOwnerPlayerBoundarySession({
    identity: dependencies.identity,
    reservations: dependencies.reservations,
    ledger: dependencies.ledger,
    authorizationPolicy: dependencies.authorizationPolicy,
    })
  } catch {
    return { status: 'rejected', reason: 'owner-player-startup-boundary-resolution-failed' }
  }
  if (!session || session.worldId !== reservation.worldId) {
    return { status: 'rejected', reason: 'owner-player-startup-player-boundary-unavailable' }
  }
  if (await resolveOwner(dependencies.identity) !== ownerId) {
    return { status: 'rejected', reason: 'owner-player-startup-owner-changed-before-publication' }
  }

  return Object.freeze({
    status: 'ready',
    ownerId,
    worldId: reservation.worldId,
    personId: genesis.personId,
    genesis,
    session,
  })
}
