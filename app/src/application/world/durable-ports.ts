/**
 * W6-I-3C-A — narrow application contracts for durable Genesis checkpoints.
 *
 * These ports are consumed only by trusted application composition. They are
 * not presentation/UI capabilities and do not expose arbitrary record writes.
 */
import type { OwnerId } from '../identity/owner'
import type { EventLedger, WorldId } from '../../domain/event-ledger'
import type { EventId, PersonId } from '../../domain/shared/ids'
import type { WorldTime } from '../../domain/shared/world-time'
import type { StreamCursor } from '../../domain/event-replay'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type { WorldDomainEventKind } from './event-catalog'
import type { WorldCommandPort, WorldProjectionPort, WorldQueryPort } from './ports'

export type OwnerWorldReservationState = 'reserved' | 'genesis-event-committed' | 'binding-finalized'

export interface OwnerWorldGenesisCheckpoint {
  readonly personId: PersonId
  readonly eventId: EventId
  readonly streamHead: StreamCursor
}

export interface OwnerWorldReservation {
  readonly schemaVersion: 1
  readonly ownerId: OwnerId
  readonly worldId: WorldId
  readonly clientRequestId: string
  readonly worldStartTime: WorldTime
  readonly state: OwnerWorldReservationState
  readonly genesis?: OwnerWorldGenesisCheckpoint
}

export interface OwnerPersonBinding {
  readonly schemaVersion: 1
  readonly ownerId: OwnerId
  readonly worldId: WorldId
  readonly personId: PersonId
  readonly genesisEventId: EventId
  readonly verifiedStreamHead: StreamCursor
}

export type OwnerWorldReservationResult =
  | { readonly status: 'reserved'; readonly reservation: OwnerWorldReservation }
  | { readonly status: 'conflict'; readonly reason: 'owner-already-reserved' | 'reservation-request-conflict' | 'world-id-collision' }
  | { readonly status: 'rejected'; readonly reason: string }

export type GenesisCheckpointResult =
  | { readonly status: 'committed' | 'already-committed'; readonly reservation: OwnerWorldReservation }
  | { readonly status: 'rejected'; readonly reason: string }

export type OwnerPersonBindingResult =
  | { readonly status: 'finalized' | 'already-finalized'; readonly binding: OwnerPersonBinding }
  | { readonly status: 'rejected'; readonly reason: string }

/** Trusted application-only port; ownerId must come from OwnerIdentityPort. */
export interface OwnerWorldReservationPort {
  reserveWorld(ownerId: OwnerId, clientRequestId: string, worldStartTime: WorldTime): Promise<OwnerWorldReservationResult>
  readReservation(ownerId: OwnerId): Promise<OwnerWorldReservation | null>
  markGenesisEventCommitted(
    ownerId: OwnerId,
    clientRequestId: string,
    checkpoint: OwnerWorldGenesisCheckpoint,
  ): Promise<GenesisCheckpointResult>
  finalizeOwnerPersonBinding(
    ownerId: OwnerId,
    clientRequestId: string,
    checkpoint: OwnerWorldGenesisCheckpoint,
  ): Promise<OwnerPersonBindingResult>
  readOwnerPersonBinding(ownerId: OwnerId): Promise<OwnerPersonBinding | null>
}

export interface DurableWorldMetadata {
  readonly schemaVersion: 1
  readonly worldId: WorldId
  readonly worldStartTime: WorldTime
  readonly head: number
  readonly streamHead: StreamCursor
}

export type DurableWorldLedgerResult<Kind extends string = WorldDomainEventKind> =
  | { readonly status: 'loaded'; readonly metadata: DurableWorldMetadata; readonly ledger: EventLedger<Kind> }
  | { readonly status: 'missing' }
  | { readonly status: 'rejected'; readonly reason: string }

export interface DurableWorldCommandAdapter {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly projector: WorldProjectionPort<WorldDomainEventKind>
  readLedger(): Promise<EventLedger<WorldDomainEventKind> | null>
}

/** Append-only persistence contract. No replace/save-all operation is exposed. */
export interface DurableWorldLedgerPort {
  loadLedger(worldId: WorldId): Promise<DurableWorldLedgerResult>
  createWorldAdapter(worldId: WorldId, worldStartTime: WorldTime): DurableWorldCommandAdapter
}

export type DurableWorldAggregate = WorldAggregate
