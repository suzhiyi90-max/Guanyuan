import type {
  AppointmentId, AssetId, DebtDeathInventoryEntryId, DebtDeathInventoryId, DebtId,
  DeathOfficeInventoryEntryId, DeathOfficeInventoryId, DeathSettlementEvidenceId,
  EstateAssetInventoryEntryId, EstateAssetInventoryId, EventId, GoalDeathInventoryEntryId,
  GoalDeathInventoryId, GoalId, MembershipDeathInventoryEntryId, MembershipDeathInventoryId,
  MembershipId, PersonId, RelationDeathInventoryEntryId, RelationDeathInventoryId, RelationId,
  AuthorizationId,
} from '../shared/ids'
import type { DebtDeathInventory } from '../economy/debt-death-inventory'

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
  readonly entries: readonly {
    readonly id: EntryId
  }[]
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

export interface DeathSettlementCanonicalInventoryReference {\n  readonly id: string\n  readonly deceased: PersonId\n  readonly deathEvent: EventId\n  readonly inventoryEvent: EventId\n  readonly status: 'open' | 'challenged' | 'complete'\n  readonly entryIds: readonly string[]\n}\n\nexport interface DeathSettlementEvidenceReferences {
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime>
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

/**
 * Validates envelope identity, chronology and one-to-one projection only.
 * It does not establish domain completeness or disposition legality.
 */
export function validateDeathSettlementDomainEvidence(
  evidence: DeathSettlementDomainEvidence,
  canonical: DeathSettlementCanonicalInventoryReference | null,
  refs: DeathSettlementEvidenceReferences,
  deathAt: import('../shared/world-time').WorldTime,
): DeathSettlementEvidenceIssue[] {
  const issues: DeathSettlementEvidenceIssue[] = []
  if (!evidence.id.trim()) issues.push('death-settlement-evidence-empty-id')
  if (!evidence.deceased.trim()) issues.push('death-settlement-evidence-deceased-missing')
  if (!refs.events.includes(evidence.deathEvent)) issues.push('death-settlement-evidence-death-event-missing')
  if (!refs.events.includes(evidence.inventoryEvent)) {
    issues.push('death-settlement-evidence-inventory-event-missing')
  }
  const reviewAt = refs.eventTimes.get(evidence.inventoryEvent)
  if (reviewAt && compareEvidenceTime(reviewAt, deathAt) < 0) {
    issues.push('death-settlement-evidence-inventory-before-death')
  }
  if (!inventoryExists) issues.push('death-settlement-evidence-inventory-reference-missing')
  const entryIds = evidence.entries.map(entry => entry.id)
  if (new Set(entryIds).size !== entryIds.length) {
    issues.push('death-settlement-evidence-entry-id-duplicate')
  }
  const domainRefs = evidence.domain === 'office'
    ? [...evidence.appointments, ...evidence.authorizations]
    : evidence.domain === 'debt' ? evidence.positions.map(item => `${item.debt}:${item.role}`)
    : evidence.domain === 'asset' ? evidence.assets
    : evidence.domain === 'membership' ? evidence.memberships
    : evidence.domain === 'relation' ? evidence.relations
    : evidence.goals
  if (new Set(domainRefs).size !== domainRefs.length) {
    issues.push('death-settlement-evidence-domain-reference-duplicate')
  }
  if (domainRefs.length !== evidence.entries.length) {
    issues.push('death-settlement-evidence-domain-entry-count-mismatch')
  }
  return [...new Set(issues)]
}

function compareEvidenceTime(
  left: import('../shared/world-time').WorldTime,
  right: import('../shared/world-time').WorldTime,
): number {
  const order = ['晨', '午', '暮', '夜']
  if (!Number.isSafeInteger(left.day) || !Number.isSafeInteger(right.day)
    || !order.includes(left.period) || !order.includes(right.period)) return Number.NaN
  return left.day === right.day
    ? order.indexOf(left.period) - order.indexOf(right.period)
    : left.day - right.day
}
