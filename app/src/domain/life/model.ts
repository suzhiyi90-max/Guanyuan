import type { Visibility } from '../shared/visibility'
import type {
  BodyScopeRef,
  EventId,
  LifeDomainHookId,
  LifeHistoryEntryId,
  LifeHistoryRef,
  MindScopeRef,
  PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

/** Append-only projection of a person's event-backed life history. */
export interface LifeHistoryEntry {
  readonly id: LifeHistoryEntryId
  readonly event: EventId
  readonly at: WorldTime
  readonly visibility: Visibility
}

export interface LifeHistory {
  readonly id: LifeHistoryRef
  readonly person: PersonId
  readonly entries: readonly LifeHistoryEntry[]
}

interface LifeDomainHookBase {
  readonly id: LifeDomainHookId
  readonly person: PersonId
  readonly sourceEvent: EventId
  readonly at: WorldTime
  /** Open hook code: W2 does not freeze body/mind effect taxonomies. */
  readonly code: string
  readonly visibility: Visibility
}

export type LifeDomainHook =
  | (LifeDomainHookBase & { readonly domain: 'body'; readonly scope: BodyScopeRef })
  | (LifeDomainHookBase & { readonly domain: 'mind'; readonly scope: MindScopeRef })

export type LifeIssue =
  | 'life-history-person-missing'
  | 'life-history-reference-mismatch'
  | 'life-history-entry-duplicate-id'
  | 'life-history-event-duplicate'
  | 'life-history-event-missing'
  | 'life-history-event-time-missing'
  | 'life-history-event-time-mismatch'
  | 'life-history-invalid-time'
  | 'life-history-before-birth'
  | 'life-history-after-death'
  | 'life-history-order-reversed'
  | 'life-history-visibility-invalid'
  | 'life-hook-person-missing'
  | 'life-hook-scope-mismatch'
  | 'life-hook-event-missing'
  | 'life-hook-event-time-missing'
  | 'life-hook-event-time-mismatch'
  | 'life-hook-invalid-time'
  | 'life-hook-before-birth'
  | 'life-hook-after-death'
  | 'life-hook-empty-code'
  | 'life-hook-visibility-invalid'
  | 'life-hook-duplicate-id'
