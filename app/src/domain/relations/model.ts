import type { EventId, OrgId, PersonId, RelationId, RelationClaimId, RelationEvidenceId, MembershipId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

/** Open string code: Q11 remains undecided; callers may register new relation types. */
export type RelationTypeCode = string & { readonly __relationTypeCode: unique symbol }
export type RelationCertainty = 'confirmed' | 'reported' | 'suspected' | 'unverified'
export type RelationLifecycleStatus = 'active' | 'dormant' | 'severed'
export type RelationVisibilityLevel = 'public' | 'contact' | 'private' | 'secret'

export interface RelationVisibility {
  readonly observer: PersonId | 'player'
  readonly level: RelationVisibilityLevel
}

export interface RelationLifecycle {
  readonly status: RelationLifecycleStatus
  readonly validFrom: EventId
  readonly validTo: EventId | 'open'
}

/** Objective A-layer directed edge. Multiple edges between the same people are valid. */
export interface Relation {
  readonly id: RelationId
  readonly from: PersonId
  readonly to: PersonId
  readonly type: RelationTypeCode
  readonly lifecycle: RelationLifecycle
  readonly sourceEvent: EventId
  readonly visibility: RelationVisibility
}

/** A person's assertion about a relation; it is not an objective relation mutation. */
export interface RelationClaim {
  readonly id: RelationClaimId
  readonly relation: RelationId
  readonly claimant: PersonId | 'player'
  readonly certainty: RelationCertainty
  readonly assertedAt: WorldTime
  readonly sourceEvent: EventId
}

/** Provenance attached to a claim, kept separate from both claim and objective relation. */
export type EvidenceReference =
  | { readonly kind: 'event'; readonly id: EventId }
  | { readonly kind: 'person'; readonly id: PersonId }
  | { readonly kind: 'organization'; readonly id: OrgId }
  | { readonly kind: 'document'; readonly id: string }

export interface RelationEvidence {
  readonly id: RelationEvidenceId
  readonly claim: RelationClaimId
  readonly evidence: EvidenceReference
  readonly weight: 'direct' | 'corroborating' | 'hearsay'
  readonly sourceEvent: EventId
}

export interface Organization {
  readonly id: OrgId
  readonly type: string
  readonly name: string
  readonly purpose: string
  readonly region: string
  readonly rules: readonly string[]
}

export interface Membership {
  readonly id: MembershipId
  readonly organization: OrgId
  readonly person: PersonId
  readonly role: string
  readonly obligations: readonly string[]
  readonly validFrom: EventId
  readonly validTo: EventId | 'open'
  readonly sourceEvent: EventId
}

export type RelationIssue =
  | 'relation-empty-type'
  | 'relation-empty-validity'
  | 'relation-invalid-lifecycle'
  | 'relation-invalid-visibility'
  | 'relation-duplicate-id'
  | 'relation-source-person-missing'
  | 'relation-target-person-missing'
  | 'claim-relation-missing'
  | 'claim-person-missing'
  | 'claim-invalid-time'
  | 'claim-invalid-certainty'
  | 'claim-duplicate-id'
  | 'evidence-claim-missing'
  | 'evidence-reference-invalid'
  | 'evidence-person-missing'
  | 'evidence-organization-missing'
  | 'evidence-invalid-weight'
  | 'evidence-duplicate-id'
  | 'organization-empty-type'
  | 'organization-empty-name'
  | 'organization-empty-purpose'
  | 'organization-empty-region'
  | 'organization-invalid-rule'
  | 'organization-duplicate-rule'
  | 'organization-duplicate-id'
  | 'membership-empty-role'
  | 'membership-empty-validity'
  | 'membership-invalid-obligation'
  | 'membership-duplicate-obligation'
  | 'membership-duplicate-id'
  | 'membership-organization-missing'
  | 'membership-person-missing'
