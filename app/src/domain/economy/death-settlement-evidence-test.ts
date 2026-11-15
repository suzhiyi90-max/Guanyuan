import { brandedId } from '../shared/ids'
import type { DebtDeathInventory } from './debt-death-inventory'
import type { DeathOfficeInventory } from '../identity/death-inventory'
import type { MembershipDeathInventory } from '../relations/death-inventory'
import type { RelationDeathInventory } from '../relations/relation-death-inventory'
import type { GoalDeathInventory } from '../planning/death-inventory'
import type { EstateAssetInventory } from './estate-inventory'
import {
  projectDebtDeathInventoryEvidence,
  projectDeathOfficeInventoryEvidence,
  projectMembershipDeathInventoryEvidence,
  projectRelationDeathInventoryEvidence,
  projectGoalDeathInventoryEvidence,
  projectEstateAssetDeathInventoryEvidence,
  validateDeathSettlementDomainEvidence,
} from './death-settlement-evidence'
import type { EventId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}
const deceased = brandedId<'PersonId'>('deceased')
const deathEvent = brandedId<'EventId'>('death')
const reviewEvent = brandedId<'EventId'>('review')
const debtId = brandedId<'DebtId'>('debt')
const otherDebtId = brandedId<'DebtId'>('other-debt')
const entryId = brandedId<'DebtDeathInventoryEntryId'>('entry')
const inventoryId = brandedId<'DebtDeathInventoryId'>('inventory')
const evidenceId = brandedId<'DeathSettlementEvidenceId'>('evidence')
const deathAt: WorldTime = { day: 3, period: '午' }
const reviewAt: WorldTime = { day: 4, period: '晨' }
const inventory: DebtDeathInventory = {
  id: inventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  entries: [{ id: entryId, debt: debtId, role: 'creditor', disposition: 'pending', successions: [] }],
}
const refs = {
  events: [deathEvent, reviewEvent],
  eventTimes: new Map<EventId, WorldTime>([[deathEvent, deathAt], [reviewEvent, reviewAt]]),
}
const evidence = projectDebtDeathInventoryEvidence(evidenceId, inventory)
const canonical = {
  id: inventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: inventory.status,
  entries: [{ id: entryId, itemRef: `debt:${debtId}:creditor` }],
}
check('debt projection preserves inventory identity and scope', evidence.inventory === inventoryId
  && evidence.deceased === deceased && evidence.entries[0].id === entryId)
check('debt projection preserves typed creditor/debtor position', evidence.positions[0].debt === debtId
  && evidence.positions[0].role === 'creditor')
check('valid envelope passes exact canonical mapping validation', validateDeathSettlementDomainEvidence(
  evidence, canonical, refs, deathAt,
).length === 0)
check('missing canonical inventory is rejected', validateDeathSettlementDomainEvidence(
  evidence, null, refs, deathAt,
).includes('death-settlement-evidence-inventory-reference-missing'))
check('canonical inventory identity mismatch is rejected', validateDeathSettlementDomainEvidence(
  evidence, { ...canonical, deceased: brandedId<'PersonId'>('someone-else') }, refs, deathAt,
).includes('death-settlement-evidence-inventory-identity-mismatch'))
check('canonical inventory status mismatch is rejected', validateDeathSettlementDomainEvidence(
  evidence, { ...canonical, status: 'open' }, refs, deathAt,
).includes('death-settlement-evidence-inventory-status-mismatch'))
check('same-count but wrong canonical item reference is rejected', validateDeathSettlementDomainEvidence(
  evidence, { ...canonical, entries: [{ id: entryId, itemRef: `debt:${otherDebtId}:creditor` }] }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))
check('review event before death is rejected', validateDeathSettlementDomainEvidence(
  evidence, canonical, { ...refs, eventTimes: new Map([[deathEvent, deathAt], [reviewEvent, { day: 2, period: '夜' }]]) }, deathAt,
).includes('death-settlement-evidence-inventory-before-death'))
check('missing review event time is rejected', validateDeathSettlementDomainEvidence(
  evidence, canonical, { ...refs, eventTimes: new Map([[deathEvent, deathAt]]) }, deathAt,
).includes('death-settlement-evidence-review-time-missing'))
check('death event time mismatch is rejected', validateDeathSettlementDomainEvidence(
  evidence, canonical, { ...refs, eventTimes: new Map([[deathEvent, { day: 3, period: '暮' }], [reviewEvent, reviewAt]]) }, deathAt,
).includes('death-settlement-evidence-death-time-mismatch'))
check('duplicate evidence entry IDs are rejected', validateDeathSettlementDomainEvidence(
  { ...evidence, entries: [evidence.entries[0], evidence.entries[0]] }, canonical, refs, deathAt,
).includes('death-settlement-evidence-entry-id-duplicate'))
check('domain references and entries must align one-to-one', validateDeathSettlementDomainEvidence(
  { ...evidence, positions: [] }, canonical, refs, deathAt,
).includes('death-settlement-evidence-domain-entry-count-mismatch'))
check('open or challenged state is carried, not promoted', projectDebtDeathInventoryEvidence(
  evidenceId, { ...inventory, status: 'challenged' },
).status === 'challenged')
check('pending remains visible in canonical inventory and is not rewritten', inventory.entries[0].disposition === 'pending')
const officeAppointment = brandedId<'AppointmentId'>('office-appointment')
const officeAuthorization = brandedId<'AuthorizationId'>('office-authorization')
const officeInventoryId = brandedId<'DeathOfficeInventoryId'>('office-inventory')
const officeAppointmentEntry = brandedId<'DeathOfficeInventoryEntryId'>('office-appointment-entry')
const officeAuthorizationEntry = brandedId<'DeathOfficeInventoryEntryId'>('office-authorization-entry')
const officeInventory: DeathOfficeInventory = {
  id: officeInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  appointments: [{ id: officeAppointmentEntry, appointment: officeAppointment, disposition: 'ended-before-death' }],
  authorizations: [{ id: officeAuthorizationEntry, authorization: officeAuthorization, disposition: 'inactive-before-death' }],
}
const officeEvidence = projectDeathOfficeInventoryEvidence(evidenceId, officeInventory)
const officeCanonical = {
  id: officeInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete' as const,
  entries: [
    { id: officeAppointmentEntry, itemRef: `appointment:${officeAppointment}` },
    { id: officeAuthorizationEntry, itemRef: `authorization:${officeAuthorization}` },
  ],
}
check('office projection preserves both appointment and authorization references', officeEvidence.appointments[0] === officeAppointment
  && officeEvidence.authorizations[0] === officeAuthorization && officeEvidence.entries.length === 2)
check('office evidence aligns with canonical typed inventory', validateDeathSettlementDomainEvidence(
  officeEvidence, officeCanonical, refs, deathAt,
).length === 0)
check('office evidence rejects swapped canonical entry mapping', validateDeathSettlementDomainEvidence(
  officeEvidence, { ...officeCanonical, entries: [...officeCanonical.entries].reverse() }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))

const membershipId = brandedId<'MembershipId'>('membership')
const membershipInventoryId = brandedId<'MembershipDeathInventoryId'>('membership-inventory')
const membershipEntryId = brandedId<'MembershipDeathInventoryEntryId'>('membership-entry')
const membershipInventory: MembershipDeathInventory = {
  id: membershipInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  memberships: [{ id: membershipEntryId, membership: membershipId, disposition: 'ended-before-death' }],
}
const membershipEvidence = projectMembershipDeathInventoryEvidence(evidenceId, membershipInventory)
const membershipCanonical = {
  id: membershipInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete' as const,
  entries: [{ id: membershipEntryId, itemRef: `membership:${membershipId}` }],
}
check('membership projection preserves canonical membership identity', membershipEvidence.memberships[0] === membershipId
  && membershipEvidence.entries[0].id === membershipEntryId)
check('membership evidence aligns with canonical typed inventory', validateDeathSettlementDomainEvidence(
  membershipEvidence, membershipCanonical, refs, deathAt,
).length === 0)
check('membership evidence rejects a wrong canonical membership reference', validateDeathSettlementDomainEvidence(
  membershipEvidence, { ...membershipCanonical, entries: [{ id: membershipEntryId, itemRef: 'membership:other' }] }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))
check('office and membership inventory states are carried without promotion',
  projectDeathOfficeInventoryEvidence(evidenceId, { ...officeInventory, status: 'challenged' }).status === 'challenged'
  && projectMembershipDeathInventoryEvidence(evidenceId, { ...membershipInventory, status: 'open' }).status === 'open')


const relationId = brandedId<'RelationId'>('relation')
const relationInventoryId = brandedId<'RelationDeathInventoryId'>('relation-inventory')
const relationEntryId = brandedId<'RelationDeathInventoryEntryId'>('relation-entry')
const relationInventory: RelationDeathInventory = {
  id: relationInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  relations: [{ id: relationEntryId, relation: relationId, outcome: 'preserved' }],
}
const relationEvidence = projectRelationDeathInventoryEvidence(evidenceId, relationInventory)
const relationCanonical = {
  id: relationInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete' as const,
  entries: [{ id: relationEntryId, itemRef: `relation:${relationId}` }],
}
check('relation projection preserves canonical relation identity and entry', relationEvidence.relations[0] === relationId
  && relationEvidence.entries[0].id === relationEntryId)
check('relation evidence aligns with canonical typed inventory', validateDeathSettlementDomainEvidence(
  relationEvidence, relationCanonical, refs, deathAt,
).length === 0)
check('relation evidence rejects wrong canonical relation reference', validateDeathSettlementDomainEvidence(
  relationEvidence, { ...relationCanonical, entries: [{ id: relationEntryId, itemRef: 'relation:other' }] }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))

const goalId = brandedId<'GoalId'>('goal')
const goalInventoryId = brandedId<'GoalDeathInventoryId'>('goal-inventory')
const goalEntryId = brandedId<'GoalDeathInventoryEntryId'>('goal-entry')
const goalInventory: GoalDeathInventory = {
  id: goalInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  goals: [{ id: goalEntryId, goal: goalId, outcome: 'undertaken' }],
}
const goalEvidence = projectGoalDeathInventoryEvidence(evidenceId, goalInventory)
const goalCanonical = {
  id: goalInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete' as const,
  entries: [{ id: goalEntryId, itemRef: `goal:${goalId}` }],
}
check('goal projection preserves canonical NPC goal identity and entry', goalEvidence.goals[0] === goalId
  && goalEvidence.entries[0].id === goalEntryId)
check('goal evidence aligns with canonical typed inventory', validateDeathSettlementDomainEvidence(
  goalEvidence, goalCanonical, refs, deathAt,
).length === 0)
check('goal evidence rejects wrong canonical goal reference', validateDeathSettlementDomainEvidence(
  goalEvidence, { ...goalCanonical, entries: [{ id: goalEntryId, itemRef: 'goal:other' }] }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))
check('relation and goal inventory states are carried without promotion',
  projectRelationDeathInventoryEvidence(evidenceId, { ...relationInventory, status: 'challenged' }).status === 'challenged'
  && projectGoalDeathInventoryEvidence(evidenceId, { ...goalInventory, status: 'open' }).status === 'open')



const estateAssetId = brandedId<'AssetId'>('estate-asset')
const estateInventoryId = brandedId<'EstateAssetInventoryId'>('estate-inventory')
const estateEntryId = brandedId<'EstateAssetInventoryEntryId'>('estate-entry')
const estateInventory: EstateAssetInventory = {
  id: estateInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete',
  entries: [{
    id: estateEntryId, asset: estateAssetId, ownershipAtDeath: 'deceased',
    sourceOwnershipGrants: [], disposition: 'pending', resolutionEvent: null, transfer: null,
  }],
}
const estateEvidence = projectEstateAssetDeathInventoryEvidence(evidenceId, estateInventory)
const estateCanonical = {
  id: estateInventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: 'complete' as const,
  entries: [{ id: estateEntryId, itemRef: `asset:${estateAssetId}` }],
}
check('asset projection preserves canonical asset identity and entry', estateEvidence.assets[0] === estateAssetId
  && estateEvidence.entries[0].id === estateEntryId)
check('asset evidence aligns with canonical typed estate inventory', validateDeathSettlementDomainEvidence(
  estateEvidence, estateCanonical, refs, deathAt,
).length === 0)
check('asset evidence rejects wrong canonical asset reference', validateDeathSettlementDomainEvidence(
  estateEvidence, { ...estateCanonical, entries: [{ id: estateEntryId, itemRef: 'asset:other' }] }, refs, deathAt,
).includes('death-settlement-evidence-domain-reference-mismatch'))
check('asset inventory status is carried without promotion',
  projectEstateAssetDeathInventoryEvidence(evidenceId, { ...estateInventory, status: 'challenged' }).status === 'challenged')
check('asset disposition remains solely in canonical estate inventory',
  estateInventory.entries[0].disposition === 'pending' && !('dispositions' in estateEvidence))

if (failed) throw new Error('Death evidence envelope tests failed: ' + failed + '/' + (passed + failed))
console.log('Death evidence envelope contracts: ' + passed + '/' + (passed + failed) + ' passed')
