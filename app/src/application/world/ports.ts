/**
 * W6 — application boundary ports for the complete world runtime.
 *
 * These contracts isolate React/UI, storage vendors, model providers and
 * simulation scheduling from the deterministic domain. Implementations must
 * delegate fact writes to the existing command/ledger/replay boundary.
 */
import type { EventLedger, JsonValue, WorldId } from '../../domain/event-ledger'
import type { EventId, PersonId } from '../../domain/shared/ids'
import type { WorldTime } from '../../domain/shared/world-time'
import type { StreamCursor } from '../../domain/event-replay'
import type { WorldAggregate, WorldAggregateValidation } from '../../domain/world/aggregate'
import type { WorldSnapshot } from '../../domain/world-snapshot'

export interface WorldCommandRequest {
  readonly worldId: WorldId
  readonly clientRequestId: string
  readonly actor: string
  readonly intentKind: string
  readonly requestedAt: WorldTime
  readonly expectedHead: StreamCursor
  readonly payload: JsonValue
}

export type WorldCommandReceipt =
  | {
      readonly status: 'committed' | 'duplicate'
      readonly worldId: WorldId
      readonly clientRequestId: string
      readonly eventId: EventId
      readonly streamHead: StreamCursor
    }
  | {
      readonly status: 'rejected' | 'conflict'
      readonly worldId: WorldId
      readonly clientRequestId: string
      readonly reason: string
      readonly streamHead: StreamCursor
    }

/** The only application-facing write port. UI code must never call domain reducers directly. */
export interface WorldCommandPort {
  submit(request: WorldCommandRequest): Promise<WorldCommandReceipt>
}

/** Query results are materialized projections, never an alternate write model. */
export interface WorldProjectionRequest<Kind extends string = string> {
  readonly ledger: EventLedger<Kind>
  readonly target: StreamCursor
}

/** Rebuilds a projection from the canonical ledger; implementations must use registered replay reducers. */
export interface WorldProjectionPort<Kind extends string = string> {
  rebuild(request: WorldProjectionRequest<Kind>): Promise<WorldAggregateValidation>
}

export interface WorldQueryPort {
  read(worldId: WorldId): Promise<WorldAggregate | null>
  subscribe(worldId: WorldId, listener: (aggregate: WorldAggregate) => void): () => void
}

export interface WorldSnapshotWriteRequest {
  readonly snapshot: WorldSnapshot
  readonly expectedHead: StreamCursor
}

export type WorldSnapshotWriteResult =
  | { readonly status: 'stored'; readonly streamHead: StreamCursor }
  | { readonly status: 'conflict'; readonly currentHead: StreamCursor }
  | { readonly status: 'rejected'; readonly reason: string }

/** Adapter seam for W4/W5 save packages and storage backends; not a new save format. */
export interface WorldSnapshotPort {
  load(worldId: WorldId): Promise<WorldSnapshot | null>
  store(request: WorldSnapshotWriteRequest): Promise<WorldSnapshotWriteResult>
}

export type SimulationLod = 'near-field' | 'relationship-circle' | 'regional' | 'remote-world'

export interface WorldSimulationRequest {
  readonly worldId: WorldId
  readonly from: WorldTime
  readonly to: WorldTime
  readonly lod: SimulationLod
  readonly maxEvents: number
}

export type WorldSimulationResult =
  | {
      readonly status: 'advanced'
      readonly worldId: WorldId
      readonly from: WorldTime
      readonly to: WorldTime
      readonly emittedEventIds: readonly EventId[]
      readonly streamHead: StreamCursor
    }
  | { readonly status: 'unchanged'; readonly worldId: WorldId; readonly streamHead: StreamCursor }
  | { readonly status: 'rejected'; readonly worldId: WorldId; readonly reason: string; readonly streamHead: StreamCursor }

/**
 * Deterministic scheduler/rule implementation owns simulation. It may consume
 * candidate proposals, but it alone decides whether and when facts are committed.
 */
export interface WorldSimulationPort {
  advance(request: WorldSimulationRequest): Promise<WorldSimulationResult>
}

export interface WorldCandidateContext {
  readonly worldId: WorldId
  readonly worldTime: WorldTime
  readonly observer: PersonId | 'player'
  /** Explicit allow-list: providers must not receive the full objective world graph. */
  readonly exposedPersonIds: readonly PersonId[]
  readonly exposedEventIds: readonly EventId[]
  readonly allowedKinds: readonly string[]
  readonly seed: string
}

export interface WorldCandidateProposal {
  readonly proposalId: string
  readonly kind: string
  readonly payload: JsonValue
  readonly basedOnEventIds: readonly EventId[]
}

/** AI/template output is an untrusted proposal and never a fact-write port. */
export interface WorldCandidateProviderPort {
  propose(context: WorldCandidateContext): Promise<readonly WorldCandidateProposal[]>
}

export interface WorldApplicationPorts<Kind extends string = string> {
  readonly commands: WorldCommandPort
  readonly projector: WorldProjectionPort<Kind>
  readonly queries: WorldQueryPort
  readonly snapshots: WorldSnapshotPort
  readonly simulation: WorldSimulationPort
  readonly candidates: WorldCandidateProviderPort
}
