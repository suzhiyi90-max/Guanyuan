import type {
  AssetId,
  ChannelRef,
  DebtId,
  EventId,
  KnowledgeId,
  MessageId,
  MessagePropagationId,
  OfficeId,
  OrgId,
  PersonId,
  RelationClaimId,
  RelationId,
} from '../shared/ids'
import type { Field } from '../shared/field'
import type { WorldTime } from '../shared/world-time'

/** Q15 remains open: channels and failure codes are extensible, not a frozen enum. */
export type FailureKind = string & { readonly __failureKind: unique symbol }
export type KnowledgeStance = 'known' | 'believed' | 'suspected' | 'misunderstood'
export type KnowledgeSecrecy = 'public' | 'private' | 'secret'

/** Subject reference only; it identifies what a holder believes, not an objective fact mutation. */
export type EntityRef =
  | { readonly kind: 'person'; readonly id: PersonId }
  | { readonly kind: 'relation'; readonly id: RelationId }
  | { readonly kind: 'claim'; readonly id: RelationClaimId }
  | { readonly kind: 'office'; readonly id: OfficeId }
  | { readonly kind: 'org'; readonly id: OrgId }
  | { readonly kind: 'asset'; readonly id: AssetId }
  | { readonly kind: 'debt'; readonly id: DebtId }
  | { readonly kind: 'event'; readonly id: EventId }
  | { readonly kind: 'knowledge'; readonly id: KnowledgeId }
  | { readonly kind: 'message'; readonly id: MessageId }

/** B-layer knowledge is holder-scoped and acquired through a source event. */
export interface KnowledgeEntry {
  readonly id: KnowledgeId
  readonly holder: PersonId
  readonly subject: EntityRef
  readonly proposition: string
  readonly stance: KnowledgeStance
  readonly sourceEvent: EventId
  readonly acquiredAt: WorldTime
  readonly secrecy: KnowledgeSecrecy
}

/** Belief is a constrained view of KnowledgeEntry, not a second fact store. */
export type Belief = KnowledgeEntry & {
  readonly stance: 'believed' | 'misunderstood'
}

/** Message lifecycle fields are explicit sent/delivered/read/understood/replied milestones. */
export interface Message {
  readonly id: MessageId
  readonly sender: PersonId
  readonly recipient: PersonId
  readonly channel: ChannelRef
  readonly contentRefs: readonly EntityRef[]
  readonly sentAt: WorldTime
  readonly deliveredAt: Field<WorldTime>
  readonly readAt: Field<WorldTime>
  readonly understoodAt: Field<WorldTime>
  readonly repliedAt: Field<WorldTime>
  readonly failure: Field<FailureKind>
  /** Normalized distortion ratio in [0, 1]; this is not truth adjudication. */
  readonly distortion: number
  readonly parentMessage: Field<MessageId>
}

/**
 * Information propagation is a B-layer transfer between holders.
 * Resulting KnowledgeEntry records remain separate; propagation never mutates A-layer facts.
 */
export interface MessagePropagation {
  readonly id: MessagePropagationId
  readonly message: MessageId
  readonly fromHolder: PersonId
  readonly toHolder: PersonId
  readonly propagatedAt: WorldTime
  readonly sourceKnowledge: readonly KnowledgeId[]
  readonly resultingKnowledge: readonly KnowledgeId[]
}


export type CognitionIssue =
  | 'knowledge-empty-proposition'
  | 'knowledge-invalid-time'
  | 'knowledge-invalid-stance'
  | 'knowledge-invalid-secrecy'
  | 'knowledge-duplicate-id'
  | 'knowledge-holder-missing'
  | 'knowledge-source-event-missing'
  | 'knowledge-subject-missing'
  | 'belief-invalid-stance'
  | 'message-empty-channel'
  | 'message-invalid-failure-code'
  | 'message-invalid-time'
  | 'message-invalid-distortion'
  | 'message-stage-order'
  | 'message-stage-prerequisite'
  | 'message-failure-after-progress'
  | 'message-parent-missing'
  | 'message-sender-missing'
  | 'message-recipient-missing'
  | 'message-duplicate-id'
  | 'message-content-reference-missing'
  | 'propagation-message-missing'
  | 'propagation-holder-missing'
  | 'propagation-source-knowledge-missing'
  | 'propagation-source-holder-mismatch'
  | 'propagation-result-knowledge-missing'
  | 'propagation-result-holder-mismatch'
  | 'propagation-invalid-time'
  | 'propagation-self-transfer'
  | 'propagation-empty-source'
  | 'propagation-empty-result'
  | 'propagation-time-before-source'
  | 'propagation-time-after-result'
  | 'propagation-time-before-message'
  | 'propagation-recipient-not-read'
  | 'propagation-duplicate-id'
