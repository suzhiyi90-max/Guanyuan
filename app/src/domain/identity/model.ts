import type { Field } from '../shared/field'
import type {
  AppointmentId,
  AuthorizationId,
  EventId,
  IdentityId,
  OfficeId,
  OrgId,
  PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

export type IdentityAxis = 'institutional' | 'social' | 'family' | 'organizational'
export type IdentityCertainty = 'confirmed' | 'reported' | 'suspected' | 'unverified'
export type VisibilityLevel = 'public' | 'contact' | 'private' | 'secret'

export interface IdentityVisibility {
  readonly observer: PersonId | 'player'
  readonly level: VisibilityLevel
}

export interface IdentityAssignment {
  readonly id: IdentityId
  readonly person: PersonId
  readonly axis: IdentityAxis
  readonly code: string
  readonly validFrom: EventId
  readonly validTo: EventId | 'open'
  readonly sourceEvent: EventId
  readonly visibility: IdentityVisibility
  readonly certainty: IdentityCertainty
}

export type ObjectiveHolder =
  | { readonly kind: 'held'; readonly person: PersonId }
  | { readonly kind: 'vacant' }

export interface Office {
  readonly id: OfficeId
  readonly institution: OrgId
  readonly rank: string
  readonly title: string
  /** Objective A-layer state only. Observer ignorance belongs to Knowledge. */
  readonly holder: ObjectiveHolder
  readonly authorization: readonly AuthorizationId[]
  readonly validFrom: EventId
  readonly validTo: EventId | 'open'
}

export interface Appointment {
  readonly id: AppointmentId
  readonly office: OfficeId
  readonly person: PersonId
  readonly from: WorldTime
  /** n/a means the appointment has no recorded end yet. */
  readonly to: Field<WorldTime>
}

export type AuthorizationScope =
  | { readonly kind: 'world' }
  | { readonly kind: 'institution'; readonly institution: OrgId }
  | { readonly kind: 'office'; readonly office: OfficeId }
  | { readonly kind: 'person'; readonly person: PersonId }

export interface Authorization {
  readonly id: AuthorizationId
  readonly principal: PersonId
  readonly permission: string
  readonly scope: AuthorizationScope
  readonly grantedBy: EventId
  readonly validFrom: WorldTime
  readonly validTo: Field<WorldTime>
  readonly revocable: boolean
  readonly revokedBy: Field<EventId>
  readonly revokedAt: Field<WorldTime>
}

export interface AuthorizationRequest {
  readonly principal: PersonId
  readonly permission: string
  readonly scope: AuthorizationScope
  readonly at: WorldTime
}

export type IdentityIssue =
  | 'identity-empty-code'
  | 'identity-validity-reference-mismatch'
  | 'identity-id-already-exists'
  | 'office-invalid-holder'
  | 'office-authorization-duplicate'
  | 'appointment-invalid-world-time'
  | 'appointment-end-before-start'
  | 'appointment-unknown-end'
  | 'appointment-duplicate-id'
  | 'appointment-overlap'
  | 'office-holder-appointment-mismatch'
  | 'office-vacancy-has-active-appointment'
  | 'authorization-duplicate-id'
  | 'authorization-empty-permission'
  | 'authorization-invalid-time'
  | 'authorization-revocation-inconsistent'
  | 'authorization-revocation-forbidden'
