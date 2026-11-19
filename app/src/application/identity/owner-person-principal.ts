/**
 * W6-H — resolve the authenticated local/account Owner to its finalized in-world Person.
 *
 * This adapter is read-only. It accepts no caller-selected WorldId or PersonId,
 * verifies the binding against the reservation, canonical event ledger and
 * replay-backed aggregate, then rechecks the owner session before returning.
 */
import type { PersonId } from '../../domain/shared/ids'
import type { OwnerIdentityPort, OwnerId } from './owner'
import type { OwnerPersonBinding, OwnerWorldReservationPort, DurableWorldLedgerPort } from '../world/durable-ports'
import type { WorldCommandPrincipalPort } from '../world/authorization-gate'

export interface OwnerPersonPrincipalDependencies {
  readonly identity: OwnerIdentityPort
  readonly reservations: Pick<OwnerWorldReservationPort, 'readReservation' | 'readOwnerPersonBinding'>
  readonly ledger: Pick<DurableWorldLedgerPort, 'loadLedger' | 'createWorldAdapter'>
}

function sameCursor(
  left: OwnerPersonBinding['verifiedStreamHead'],
  right: OwnerPersonBinding['verifiedStreamHead'],
): boolean {
  return left.kind === 'event' && right.kind === 'event'
    && left.seq === right.seq && left.eventId === right.eventId
}

function matchesBinding(
  ownerId: OwnerId,
  reservation: Awaited<ReturnType<OwnerWorldReservationPort['readReservation']>>,
  binding: OwnerPersonBinding | null,
): binding is OwnerPersonBinding {
  if (!reservation || !binding || reservation.state !== 'binding-finalized'
    || reservation.ownerId !== ownerId || binding.schemaVersion !== 1
    || binding.ownerId !== ownerId || binding.worldId !== reservation.worldId
    || !reservation.genesis) return false
  return reservation.genesis.personId === binding.personId
    && reservation.genesis.eventId === binding.genesisEventId
    && sameCursor(reservation.genesis.streamHead, binding.verifiedStreamHead)
}

function matchesCanonicalGenesis(
  event: {
    readonly worldId: string
    readonly actor: string
    readonly source: string
    readonly intentKind: string
    readonly kind: string
    readonly clientRequestId: string
    readonly requestWorldTime: { readonly day: number; readonly period: string }
    readonly seq: number
    readonly id: string
    readonly payload: unknown
  } | undefined,
  reservation: NonNullable<Awaited<ReturnType<OwnerWorldReservationPort['readReservation']>>>,
  binding: OwnerPersonBinding,
): boolean {
  if (!event || event.worldId !== reservation.worldId || event.actor !== binding.ownerId
    || event.source !== 'player-command' || event.intentKind !== 'person.create'
    || event.kind !== 'person.created' || event.clientRequestId !== reservation.clientRequestId
    || event.requestWorldTime.day !== reservation.worldStartTime.day
    || event.requestWorldTime.period !== reservation.worldStartTime.period
    || event.id !== binding.genesisEventId || event.seq !== binding.verifiedStreamHead.seq) return false
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return false
  const payload = event.payload as { readonly person?: { readonly id?: unknown }; readonly origin?: { readonly kind?: unknown } }
  return payload.person?.id === binding.personId && payload.origin?.kind === 'player-character'
}

/**
 * Every resolve performs a fresh trusted lookup. Missing, malformed, stale,
 * mismatched or unverifiable state returns null (default deny).
 */
export function createOwnerPersonPrincipalPort(
  dependencies: OwnerPersonPrincipalDependencies,
): WorldCommandPrincipalPort {
  return Object.freeze({
    async resolve(): Promise<PersonId | null> {
      let ownerId: OwnerId
      try { ownerId = await dependencies.identity.resolve() } catch { return null }

      let reservation: Awaited<ReturnType<OwnerWorldReservationPort['readReservation']>>
      let binding: OwnerPersonBinding | null
      try {
        [reservation, binding] = await Promise.all([
          dependencies.reservations.readReservation(ownerId),
          dependencies.reservations.readOwnerPersonBinding(ownerId),
        ])
      } catch { return null }
      if (!matchesBinding(ownerId, reservation, binding) || !reservation) return null

      let loaded: Awaited<ReturnType<DurableWorldLedgerPort['loadLedger']>>
      try { loaded = await dependencies.ledger.loadLedger(binding.worldId) } catch { return null }
      if (loaded.status !== 'loaded') return null
      const genesis = loaded.ledger.events.find(event => event.id === binding.genesisEventId)
      if (!matchesCanonicalGenesis(genesis, reservation, binding)) return null

      let aggregate
      try {
        const adapter = dependencies.ledger.createWorldAdapter(binding.worldId, reservation.worldStartTime)
        aggregate = await adapter.queries.read(binding.worldId)
      } catch { return null }
      if (!aggregate || aggregate.worldId !== binding.worldId
        || aggregate.playerPersonId !== binding.personId
        || aggregate.persons.filter(person => person.id === binding.personId).length !== 1) return null
      const playerOrigins = aggregate.personOrigins.filter(item => item.person === binding.personId
        && item.origin.kind === 'player-character')
      if (playerOrigins.length !== 1
        || aggregate.personOrigins.filter(item => item.origin.kind === 'player-character').length !== 1) return null

      // A logout/account switch or binding replacement during async verification
      // must invalidate this resolution rather than leak the prior PersonId.
      let currentOwner: OwnerId
      let currentBinding: OwnerPersonBinding | null
      let currentReservation: Awaited<ReturnType<OwnerWorldReservationPort['readReservation']>>
      try {
        [currentOwner, currentReservation, currentBinding] = await Promise.all([
          dependencies.identity.resolve(),
          dependencies.reservations.readReservation(ownerId),
          dependencies.reservations.readOwnerPersonBinding(ownerId),
        ])
      } catch { return null }
      if (currentOwner !== ownerId || !matchesBinding(ownerId, currentReservation, currentBinding)
        || currentBinding.personId !== binding.personId
        || currentBinding.worldId !== binding.worldId
        || currentBinding.genesisEventId !== binding.genesisEventId
        || !sameCursor(currentBinding.verifiedStreamHead, binding.verifiedStreamHead)) return null

      return binding.personId
    },
  })
}
