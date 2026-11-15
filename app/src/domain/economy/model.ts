import type { Field } from '../shared/field'
import type {
  AssetId,
  DebtId,
  DebtPartySuccessionId,
  EventId,
  OrgId,
  PersonId,
  RightGrantId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

export type RightHolder = PersonId | OrgId
export type AssetRightKind = 'ownership' | 'control' | 'handling' | 'disposal'

/** A grant is immutable; a revocation is a separate event referencing this exact grant ID. */
export interface RightGrant {
  readonly id: RightGrantId
  readonly holder: RightHolder
  readonly grantedBy: EventId
  readonly scope: string
  readonly revocable: boolean
  readonly transferable: boolean
  readonly expires: Field<WorldTime>
}

export interface RightRevocation {
  readonly grant: RightGrantId
  readonly revokedBy: EventId
}

export interface AssetRights {
  readonly ownership: readonly RightGrant[]
  readonly control: readonly RightGrant[]
  readonly handling: readonly RightGrant[]
  readonly disposal: readonly RightGrant[]
}

/** owner is a derived compatibility summary; rights.ownership is the only authority. */
export interface Asset {
  readonly id: AssetId
  readonly kind: string
  readonly quantity: number
  readonly rights: AssetRights
  readonly owner: Field<PersonId>
  readonly custody: Field<PersonId>
  readonly valuation: Field<number>
}

export type DebtStatus = 'open' | 'settled' | 'disputed'

/**
 * Explicit post-death continuation of one party's position in a debt.
 * creditor = succession of the claim; debtor = explicit assumption of liability.
 * The original Debt remains immutable; this record does not itself settle it.
 */
export interface DebtPartySuccession {
  readonly id: DebtPartySuccessionId
  readonly debt: DebtId
  readonly role: 'creditor' | 'debtor'
  readonly deceased: PersonId
  readonly successor: PersonId
  /** Exact rational share; multiple successors may share a position without rounding. */
  readonly shareNumerator: number
  readonly shareDenominator: number
  readonly deathEvent: EventId
  readonly successionEvent: EventId
}

export interface Debt {
  readonly id: DebtId
  readonly creditor: PersonId
  readonly debtor: PersonId
  readonly principal: number
  readonly kind: string
  readonly sourceEvent: EventId
  readonly status: DebtStatus
  readonly settlements: readonly EventId[]
}

export type EconomyIssue =
  | 'asset-empty-kind'
  | 'asset-invalid-quantity'
  | 'asset-invalid-valuation'
  | 'asset-custody-person-missing'
  | 'asset-owner-summary-mismatch'
  | 'asset-owner-summary-invalid'
  | 'asset-duplicate-id'
  | 'asset-right-grant-duplicate-id'
  | 'asset-right-grant-holder-missing'
  | 'asset-right-grant-event-missing'
  | 'asset-right-grant-time-missing'
  | 'asset-right-grant-empty-scope'
  | 'asset-right-grant-invalid-flags'
  | 'asset-right-grant-expiry-before-grant'
  | 'asset-right-grant-scope-conflict'
  | 'asset-revocation-grant-missing'
  | 'asset-revocation-event-missing'
  | 'asset-revocation-time-missing'
  | 'asset-revocation-not-permitted'
  | 'asset-revocation-before-grant'
  | 'asset-revocation-duplicate'
  | 'debt-empty-kind'
  | 'debt-duplicate-id'
  | 'debt-invalid-principal'
  | 'debt-creditor-missing'
  | 'debt-debtor-missing'
  | 'debt-source-event-missing'
  | 'debt-invalid-status'
  | 'debt-settlement-event-missing'
  | 'debt-duplicate-settlement'
  | 'debt-settled-without-settlement'
  | 'debt-succession-duplicate-id'
  | 'debt-succession-debt-missing'
  | 'debt-succession-party-role-mismatch'
  | 'debt-succession-invalid-role'
  | 'debt-succession-debt-already-settled'
  | 'debt-succession-deceased-missing'
  | 'debt-succession-deceased-not-dead'
  | 'debt-succession-death-record-missing'
  | 'debt-succession-death-event-mismatch'
  | 'debt-succession-death-event-missing'
  | 'debt-succession-death-time-mismatch'
  | 'debt-succession-successor-missing'
  | 'debt-succession-successor-not-alive'
  | 'debt-succession-self-transfer'
  | 'debt-succession-event-missing'
  | 'debt-succession-event-time-missing'
  | 'debt-succession-before-death'
  | 'debt-succession-invalid-share'
  | 'debt-succession-overallocated'
