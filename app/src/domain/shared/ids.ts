declare const idBrand: unique symbol

export type BrandedId<Kind extends string> = string & {
  readonly [idBrand]: Kind
}

export type PersonId = BrandedId<'PersonId'>
export type EventId = BrandedId<'EventId'>
export type IdentityId = BrandedId<'IdentityId'>
export type OfficeId = BrandedId<'OfficeId'>
export type OrgId = BrandedId<'OrgId'>
export type AppointmentId = BrandedId<'AppointmentId'>
export type AuthorizationId = BrandedId<'AuthorizationId'>
export type RelationId = BrandedId<'RelationId'>
export type RelationClaimId = BrandedId<'RelationClaimId'>
export type RelationEvidenceId = BrandedId<'RelationEvidenceId'>
export type MembershipId = BrandedId<'MembershipId'>
export type KnowledgeId = BrandedId<'KnowledgeId'>
export type MessageId = BrandedId<'MessageId'>
export type AssetId = BrandedId<'AssetId'>
export type DebtId = BrandedId<'DebtId'>
export type RightGrantId = BrandedId<'RightGrantId'>
export type AssetInheritanceId = BrandedId<'AssetInheritanceId'>
export type ScheduleId = BrandedId<'ScheduleId'>
export type PlaceId = BrandedId<'PlaceId'>
export type ActionRef = BrandedId<'ActionRef'>
export type ChannelRef = BrandedId<'ChannelRef'>
export type MessagePropagationId = BrandedId<'MessagePropagationId'>
export type CapabilityRef = BrandedId<'CapabilityRef'>
export type BodyScopeRef = BrandedId<'BodyScopeRef'>
export type MindScopeRef = BrandedId<'MindScopeRef'>
export type KnowledgeScopeId = BrandedId<'KnowledgeScopeId'>
export type GoalId = BrandedId<'GoalId'>
export type ScheduleScopeId = BrandedId<'ScheduleScopeId'>
export type EconomyScopeId = BrandedId<'EconomyScopeId'>
export type LocationStateRef = BrandedId<'LocationStateRef'>
export type LifeHistoryRef = BrandedId<'LifeHistoryRef'>
export type LifeHistoryEntryId = BrandedId<'LifeHistoryEntryId'>
export type LifeDomainHookId = BrandedId<'LifeDomainHookId'>
export type LifeStateFactId = BrandedId<'LifeStateFactId'>

/**
 * Brands an already allocated identifier without choosing its wire format.
 * World scoping, allocation and fixture mapping remain persistence/identity
 * policy decisions; this helper only rejects empty identifiers.
 */
export function brandedId<Kind extends string>(value: string): BrandedId<Kind> {
  const normalized = value.trim()
  if (!normalized) throw new Error('Domain identifiers must not be empty')
  return normalized as BrandedId<Kind>
}
