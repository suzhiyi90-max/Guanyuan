import type { Field } from '../shared/field'
import type {
  BodyScopeRef,
  CapabilityRef,
  EconomyScopeId,
  EventId,
  GoalId,
  KnowledgeScopeId,
  LifeHistoryRef,
  LocationStateRef,
  MindScopeRef,
  PersonId,
  ScheduleScopeId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

export type LifeState = 'alive' | 'dead'
export type ArchiveState = 'active' | 'archived'

export type EstateSettlementDomain =
  | 'office'
  | 'debt'
  | 'asset'
  | 'membership'
  | 'relation'
  | 'goal'

export interface EstateSettlementRef {
  readonly domain: EstateSettlementDomain
  readonly settlementEvent: EventId
  readonly status: 'pending' | 'settled'
}

export interface DeathRecord {
  readonly at: WorldTime
  readonly causeEvent: EventId
  readonly estateSettlements: readonly EstateSettlementRef[]
}

export interface PersonStateDomains {
  readonly body: BodyScopeRef
  readonly mind: MindScopeRef
  readonly knowledge: KnowledgeScopeId
  readonly goals: readonly GoalId[]
  readonly scheduleScope: ScheduleScopeId
  readonly economy: EconomyScopeId
  readonly location: LocationStateRef
}

export interface Person {
  readonly id: PersonId
  readonly displayName: string
  readonly birth: Field<WorldTime>
  readonly lifeState: LifeState
  readonly archiveState: ArchiveState
  readonly death: Field<DeathRecord>
  readonly capability: CapabilityRef
  readonly stateDomains: PersonStateDomains
  readonly history: LifeHistoryRef
  /** Optional fixture provenance; never part of person identity or world rules. */
  readonly fixture: Field<string>
}

