import type {
  AppointmentId, AssetId, DebtDeathInventoryEntryId, DebtDeathInventoryId, DebtId,
  DeathOfficeInventoryEntryId, DeathOfficeInventoryId, DeathSettlementEvidenceId,
  EstateAssetInventoryEntryId, EstateAssetInventoryId, EventId, GoalDeathInventoryEntryId,
  GoalDeathInventoryId, GoalId, MembershipDeathInventoryEntryId, MembershipDeathInventoryId,
  MembershipId, PersonId, RelationDeathInventoryEntryId, RelationDeathInventoryId, RelationId,
  AuthorizationId,
} from '../shared/ids'
import type { DebtDeathInventory } from './debt-death-inventory'
import type { DeathOfficeInventory } from '../identity/death-inventory'
import type { MembershipDeathInventory } from '../relations/death-inventory'
import type { RelationDeathInventory } from '../relations/relation-death-inventory'
import type { GoalDeathInventory } from '../planning/death-inventory'
import type { EstateAssetInventory } from './estate-inventory'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { WorldTime } from '../shared/world-time'

/**
 * A typed index over a domain-owned inventory. It deliberately carries references,
 * not copied domain outcomes: the owning validator remains authoritative.
 */
interface DeathSettlementInventoryEvidenceBase<Domain extends string, InventoryId extends string, EntryId extends string> {
  readonly id: DeathSettlementEvidenceId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  readonly domain: Domain
  readonly inventory: InventoryId
  readonly status: 'open' | 'challenged' | 'complete'
  readonly entries: readonly { readonly id: EntryId }[]
}

export type DeathSettlementDomainEvidence =
  | (DeathSettlementInventoryEvidenceBase<'office', DeathOfficeInventoryId, DeathOfficeInventoryEntryId> & {
      readonly appointments: readonly AppointmentId[]
      readonly authorizations: readonly AuthorizationId[]
    })
  | (DeathSettlementInventoryEvidenceBase<'debt', DebtDeathInventoryId, DebtDeathInventoryEntryId> & {
      readonly positions: readonly { readonly debt: DebtId; readonly role: 'creditor' | 'debtor' }[]
    })
  | (DeathSettlementInventoryEvidenceBase<'asset', EstateAssetInventoryId, EstateAssetInventoryEntryId> & {
      readonly assets: readonly AssetId[]
    })
  | (DeathSettlementInventoryEvidenceBase<'membership', MembershipDeathInventoryId, MembershipDeathInventoryEntryId> & {
      readonly memberships: readonly MembershipId[]
    })
  | (DeathSettlementInventoryEvidenceBase<'relation', RelationDeathInventoryId, RelationDeathInventoryEntryId> & {
      readonly relations: readonly RelationId[]
    })
  | (DeathSettlementInventoryEvidenceBase<'goal', GoalDeathInventoryId, GoalDeathInventoryEntryId> & {
      readonly goals: readonly GoalId[]
    })

export type DeathSettlementEvidenceIssue =
  | 'death-settlement-evidence-empty-id'
  | 'death-settlement-evidence-deceased-missing'
  | 'death-settlement-evidence-death-event-missing'
  | 'death-settlement-evidence-death-time-missing'
  | 'death-settlement-evidence-death-time-invalid'
  | 'death-settlement-evidence-death-time-mismatch'
  | 'death-settlement-evidence-inventory-event-missing'
  | 'death-settlement-evidence-inventory-before-death'
  | 'death-settlement-evidence-inventory-reference-missing'
  | 'death-settlement-evidence-inventory-identity-mismatch'
  | 'death-settlement-evidence-inventory-status-mismatch'
  | 'death-settlement-evidence-review-time-missing'
  | 'death-settlement-evidence-review-time-invalid'
  | 'death-settlement-evidence-entry-id-duplicate'
  | 'death-settlement-evidence-domain-reference-duplicate'
  | 'death-settlement-evidence-domain-entry-count-mismatch'
  | 'death-settlement-evidence-domain-reference-mismatch'

export interface DeathSettlementCanonicalInventoryReference {
  readonly id: string
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  readonly status: 'open' | 'challenged' | 'complete'
  /** Ordered canonical mapping; itemRef is domain-qualified and stable. */
  readonly entries: readonly { readonly id: string; readonly itemRef: string }[]
}

export interface DeathSettlementEvidenceReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

/** Build a typed evidence index from the debt domain's canonical inventory. */
export function projectDebtDeathInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: DebtDeathInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'debt' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'debt',
    inventory: inventory.id,
    status: inventory.status,
    entries: inventory.entries.map(entry => ({ id: entry.id })),
    positions: inventory.entries.map(entry => ({ debt: entry.debt, role: entry.role })),
  }
}

function domainItemRefs(evidence: DeathSettlementDomainEvidence): string[] {
  switch (evidence.domain) {
    case 'office':
      return [
        ...evidence.appointments.map(id => `appointment:${id}`),
        ...evidence.authorizations.map(id => `authorization:${id}`),
      ]
    case 'debt':
      return evidence.positions.map(item => `debt:${item.debt}:${item.role}`)
    case 'asset':
      return evidence.assets.map(id => `asset:${id}`)
    case 'membership':
      return evidence.memberships.map(id => `membership:${id}`)
    case 'relation':
      return evidence.relations.map(id => `relation:${id}`)
    case 'goal':
      return evidence.goals.map(id => `goal:${id}`)
  }
}

/** Project the office domain's canonical appointment and authorization inventory. */
export function projectDeathOfficeInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: DeathOfficeInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'office' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'office',
    inventory: inventory.id,
    status: inventory.status,
    entries: [
      ...inventory.appointments.map(entry => ({ id: entry.id })),
      ...inventory.authorizations.map(entry => ({ id: entry.id })),
    ],
    appointments: inventory.appointments.map(entry => entry.appointment),
    authorizations: inventory.authorizations.map(entry => entry.authorization),
  }
}

/** Project the organization domain's canonical membership inventory. */
export function projectMembershipDeathInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: MembershipDeathInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'membership' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'membership',
    inventory: inventory.id,
    status: inventory.status,
    entries: inventory.memberships.map(entry => ({ id: entry.id })),
    memberships: inventory.memberships.map(entry => entry.membership),
  }
}


/** Project the relation domain's canonical relation inventory without copying outcomes. */
export function projectRelationDeathInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: RelationDeathInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'relation' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'relation',
    inventory: inventory.id,
    status: inventory.status,
    entries: inventory.relations.map(entry => ({ id: entry.id })),
    relations: inventory.relations.map(entry => entry.relation),
  }
}

/** Project the NPC goal domain's canonical inventory without copying outcomes. */
export function projectGoalDeathInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: GoalDeathInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'goal' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'goal',
    inventory: inventory.id,
    status: inventory.status,
    entries: inventory.goals.map(entry => ({ id: entry.id })),
    goals: inventory.goals.map(entry => entry.goal),
  }
}


/** Project the canonical estate asset inventory without copying ownership or disposition decisions. */
export function projectEstateAssetDeathInventoryEvidence(
  id: DeathSettlementEvidenceId,
  inventory: EstateAssetInventory,
): Extract<DeathSettlementDomainEvidence, { readonly domain: 'asset' }> {
  return {
    id,
    deceased: inventory.deceased,
    deathEvent: inventory.deathEvent,
    inventoryEvent: inventory.inventoryEvent,
    domain: 'asset',
    inventory: inventory.id,
    status: inventory.status,
    entries: inventory.entries.map(entry => ({ id: entry.id })),
    assets: inventory.entries.map(entry => entry.asset),
  }
}

/**
 * Validates envelope identity, chronology and exact one-to-one projection only.
 * It does not establish domain completeness or disposition legality.
 */
export function validateDeathSettlementDomainEvidence(
  evidence: DeathSettlementDomainEvidence,
  canonical: DeathSettlementCanonicalInventoryReference | null,
  refs: DeathSettlementEvidenceReferences,
  deathAt: WorldTime,
): DeathSettlementEvidenceIssue[] {
  const issues: DeathSettlementEvidenceIssue[] = []
  if (!evidence.id.trim()) issues.push('death-settlement-evidence-empty-id')
  if (!evidence.deceased.trim()) issues.push('death-settlement-evidence-deceased-missing')
  if (!refs.events.includes(evidence.deathEvent)) issues.push('death-settlement-evidence-death-event-missing')

  if (!isValidWorldTime(deathAt)) {
    issues.push('death-settlement-evidence-death-time-invalid')
  } else {
    const recordedDeathAt = refs.eventTimes.get(evidence.deathEvent)
    if (!recordedDeathAt) issues.push('death-settlement-evidence-death-time-missing')
    else if (!isValidWorldTime(recordedDeathAt)) issues.push('death-settlement-evidence-death-time-invalid')
    else if (compareWorldTime(recordedDeathAt, deathAt) !== 0) {
      issues.push('death-settlement-evidence-death-time-mismatch')
    }
  }

  if (!refs.events.includes(evidence.inventoryEvent)) {
    issues.push('death-settlement-evidence-inventory-event-missing')
  }
  const reviewAt = refs.eventTimes.get(evidence.inventoryEvent)
  if (!reviewAt) {
    issues.push('death-settlement-evidence-review-time-missing')
  } else if (!isValidWorldTime(reviewAt)) {
    issues.push('death-settlement-evidence-review-time-invalid')
  } else if (isValidWorldTime(deathAt) && compareWorldTime(reviewAt, deathAt) < 0) {
    issues.push('death-settlement-evidence-inventory-before-death')
  }

  if (!canonical) {
    issues.push('death-settlement-evidence-inventory-reference-missing')
  } else {
    if (canonical.id !== evidence.inventory
      || canonical.deceased !== evidence.deceased
      || canonical.deathEvent !== evidence.deathEvent
      || canonical.inventoryEvent !== evidence.inventoryEvent) {
      issues.push('death-settlement-evidence-inventory-identity-mismatch')
    }
    if (canonical.status !== evidence.status) {
      issues.push('death-settlement-evidence-inventory-status-mismatch')
    }
  }

  const entryIds = evidence.entries.map(entry => entry.id)
  if (new Set(entryIds).size !== entryIds.length) {
    issues.push('death-settlement-evidence-entry-id-duplicate')
  }
  const itemRefs = domainItemRefs(evidence)
  if (new Set(itemRefs).size !== itemRefs.length) {
    issues.push('death-settlement-evidence-domain-reference-duplicate')
  }
  if (itemRefs.length !== evidence.entries.length) {
    issues.push('death-settlement-evidence-domain-entry-count-mismatch')
  }
  if (canonical) {
    const aligned = canonical.entries.length === evidence.entries.length
      && canonical.entries.every((entry, index) =>
        entry.id === evidence.entries[index]?.id
        && entry.itemRef === itemRefs[index])
    if (!aligned) issues.push('death-settlement-evidence-domain-reference-mismatch')
  }
  return [...new Set(issues)]
}
