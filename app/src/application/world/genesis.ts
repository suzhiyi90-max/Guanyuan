/**
 * W6-I-3C-B — trusted Genesis orchestration and crash recovery.
 *
 * This coordinator is application-only. OwnerId and request identity come
 * from trusted ports; the UI never chooses WorldId, actor, source or event ids.
 * Every authoritative write goes through WorldCommandPort and the canonical
 * durable ledger. Recovery always discovers an already-appended Genesis event
 * before attempting another append.
 */
import type { OwnerIdentityPort, OwnerId } from '../identity/owner'
import type { PersonId } from '../../domain/shared/ids'
import type { WorldTime } from '../../domain/shared/world-time'
import type { StreamCursor } from '../../domain/event-replay'
import type { EventLedger, LedgerEvent, WorldId } from '../../domain/event-ledger'
import type { PersonOrigin } from '../../domain/person/provenance'
import {
  createPersonCreatedEventInput,
  toLedgerEventInput,
  type PersonCreationData,
  type WorldDomainEventKind,
} from './event-catalog'
import type {
  OwnerWorldReservationPort,
  DurableWorldLedgerPort,
  OwnerWorldReservation,
  OwnerPersonBinding,
} from './durable-ports'

export interface GenesisRequestIdPort {
  /** Must return a fresh opaque id; persisted reservation makes retries stable. */
  create(): string
}

export interface GenesisWorldTimePort {
  /** Supplies the actual world clock; this module never invents a date. */
  current(): Promise<WorldTime>
}

export interface GenesisPersonFactoryPort {
  /**
   * Creates PersonId and state-domain identifiers in the trusted application
   * layer. For the same owner/world/request tuple it must return stable data.
   */
  create(input: {
    readonly ownerId: OwnerId
    readonly worldId: WorldId
    readonly clientRequestId: string
    readonly displayName: string
  }): Promise<PersonCreationData> | PersonCreationData
}

export interface GenesisCoordinatorDependencies {
  readonly identity: OwnerIdentityPort
  readonly requestIds: GenesisRequestIdPort
  readonly clock: GenesisWorldTimePort
  readonly persons: GenesisPersonFactoryPort
  readonly reservations: OwnerWorldReservationPort
  readonly ledger: DurableWorldLedgerPort
}

export type GenesisResult =
  | {
      readonly status: 'ready' | 'recovered'
      readonly ownerId: OwnerId
      readonly worldId: WorldId
      readonly personId: PersonId
      readonly binding: OwnerPersonBinding
      readonly streamHead: StreamCursor
    }
  | { readonly status: 'rejected'; readonly reason: string }

function checkpointFromEvent(
  event: LedgerEvent<WorldDomainEventKind>,
  ownerId: OwnerId,
  reservation: OwnerWorldReservation,
): { readonly personId: PersonId; readonly eventId: typeof event.id; readonly streamHead: StreamCursor } | null {
  if (event.worldId !== reservation.worldId || event.actor !== ownerId
    || event.source !== 'player-command' || event.intentKind !== 'person.create'
    || event.kind !== 'person.created' || event.clientRequestId !== reservation.clientRequestId
    || event.requestWorldTime.day !== reservation.worldStartTime.day
    || event.requestWorldTime.period !== reservation.worldStartTime.period) return null
  const payload = event.payload as { readonly person?: { readonly id?: unknown }; readonly origin?: PersonOrigin }
  if (!payload?.person || typeof payload.person.id !== 'string'
    || payload.origin?.kind !== 'player-character') return null
  return Object.freeze({
    personId: payload.person.id as PersonId,
    eventId: event.id,
    streamHead: Object.freeze({ kind: 'event', seq: event.seq, eventId: event.id }),
  })
}

function findGenesisEvent(
  ledger: EventLedger<WorldDomainEventKind>,
  ownerId: OwnerId,
  reservation: OwnerWorldReservation,
) {
  const matches = ledger.events.filter(event => event.clientRequestId === reservation.clientRequestId)
  if (matches.length > 1) return { status: 'invalid' as const }
  if (matches.length === 0) return { status: 'missing' as const }
  const checkpoint = checkpointFromEvent(matches[0]!, ownerId, reservation)
  return checkpoint ? { status: 'found' as const, checkpoint } : { status: 'invalid' as const }
}

/**
 * Starts Genesis or resumes any interrupted stage:
 * reservation → canonical person.created → committed checkpoint → binding.
 * Person identity and state-domain ids are created by the trusted person
 * factory. Once the event exists, recovery uses the canonical ledger payload
 * and does not call the factory again.
 */
export async function runPlayerGenesis(
  dependencies: GenesisCoordinatorDependencies,
  displayName: string,
): Promise<GenesisResult> {
  let ownerId: OwnerId
  try { ownerId = await dependencies.identity.resolve() } catch {
    return { status: 'rejected', reason: 'genesis-owner-identity-unavailable' }
  }

  let reservation = await dependencies.reservations.readReservation(ownerId)
  if (!reservation) {
    let start: WorldTime
    let requestId: string
    try {
      start = await dependencies.clock.current()
      requestId = dependencies.requestIds.create().trim()
    } catch {
      return { status: 'rejected', reason: 'genesis-trusted-request-context-unavailable' }
    }
    if (!requestId) return { status: 'rejected', reason: 'genesis-request-id-empty' }
    const reserved = await dependencies.reservations.reserveWorld(ownerId, requestId, start)
    if (reserved.status === 'reserved') reservation = reserved.reservation
    else {
      // A concurrent first-run may have won the unique Owner reservation.
      reservation = await dependencies.reservations.readReservation(ownerId)
      if (!reservation) return { status: 'rejected', reason: reserved.status === 'rejected' ? reserved.reason : reserved.reason }
    }
  }

  const loaded = await dependencies.ledger.loadLedger(reservation.worldId)
  if (loaded.status !== 'loaded') {
    return { status: 'rejected', reason: loaded.status === 'rejected' ? loaded.reason : 'genesis-reserved-ledger-missing' }
  }

  let checkpoint = reservation.genesis
  let recovered = reservation.state !== 'reserved'
  if (!checkpoint) {
    const existing = findGenesisEvent(loaded.ledger, ownerId, reservation)
    if (existing.status === 'invalid') return { status: 'rejected', reason: 'genesis-existing-event-invalid' }
    if (existing.status === 'found') {
      checkpoint = existing.checkpoint
      recovered = true
    } else {
      let person: PersonCreationData
      try {
        person = await dependencies.persons.create({
          ownerId,
          worldId: reservation.worldId,
          clientRequestId: reservation.clientRequestId,
          displayName: displayName.trim(),
        })
      } catch {
        return { status: 'rejected', reason: 'genesis-person-factory-failed' }
      }
      if (!displayName.trim()) return { status: 'rejected', reason: 'genesis-player-name-empty' }
      const adapter = dependencies.ledger.createWorldAdapter(reservation.worldId, reservation.worldStartTime)
      const input = toLedgerEventInput(createPersonCreatedEventInput(
        person,
        { kind: 'player-character' },
        {
          actor: ownerId,
          source: 'player-command',
          requestWorldTime: reservation.worldStartTime,
          clientRequestId: reservation.clientRequestId,
        },
      ))
      const receipt = await adapter.commands.submit({
        worldId: reservation.worldId,
        clientRequestId: reservation.clientRequestId,
        actor: ownerId,
        source: 'player-command',
        intentKind: input.intentKind,
        requestedAt: reservation.worldStartTime,
        expectedHead: loaded.metadata.streamHead,
        payload: input.payload,
      })
      if (receipt.status === 'rejected' || receipt.status === 'conflict') {
        // A competing tab may have committed the same request. Reload before
        // deciding whether this is a real conflict; never blindly append again.
        const latest = await dependencies.ledger.loadLedger(reservation.worldId)
        if (latest.status !== 'loaded') return { status: 'rejected', reason: receipt.reason }
        const raced = findGenesisEvent(latest.ledger, ownerId, reservation)
        if (raced.status !== 'found') return { status: 'rejected', reason: receipt.reason }
        checkpoint = raced.checkpoint
        recovered = true
      } else {
        const latest = await dependencies.ledger.loadLedger(reservation.worldId)
        if (latest.status !== 'loaded') return { status: 'rejected', reason: 'genesis-committed-ledger-unreadable' }
        const committed = findGenesisEvent(latest.ledger, ownerId, reservation)
        if (committed.status !== 'found') return { status: 'rejected', reason: 'genesis-committed-event-not-recoverable' }
        checkpoint = committed.checkpoint
      }
    }
  }

  if (reservation.state === 'reserved') {
    const marked = await dependencies.reservations.markGenesisEventCommitted(
      ownerId, reservation.clientRequestId, checkpoint,
    )
    if (marked.status === 'rejected') return { status: 'rejected', reason: marked.reason }
    reservation = marked.reservation
  }

  if (reservation.state !== 'binding-finalized') {
    const finalized = await dependencies.reservations.finalizeOwnerPersonBinding(
      ownerId, reservation.clientRequestId, checkpoint,
    )
    if (finalized.status === 'rejected') return { status: 'rejected', reason: finalized.reason }
    const result: GenesisResult = {
      status: recovered ? 'recovered' : 'ready',
      ownerId,
      worldId: reservation.worldId,
      personId: finalized.binding.personId,
      binding: finalized.binding,
      streamHead: finalized.binding.verifiedStreamHead,
    }
    return result
  }

  const binding = await dependencies.reservations.readOwnerPersonBinding(ownerId)
  if (!binding || binding.worldId !== reservation.worldId) {
    return { status: 'rejected', reason: 'genesis-finalized-binding-unreadable' }
  }
  return {
    status: 'recovered',
    ownerId,
    worldId: reservation.worldId,
    personId: binding.personId,
    binding,
    streamHead: binding.verifiedStreamHead,
  }
}
