import { brandedId } from '../shared/ids'
import type { DebtDeathInventory } from './debt-death-inventory'
import type { DeathOfficeInventory } from '../identity/death-inventory'
import type { MembershipDeathInventory } from '../relations/death-inventory'
import {
  projectDebtDeathInventoryEvidence,
  projectDeathOfficeInventoryEvidence,
  projectMembershipDeathInventoryEvidence,
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

if (failed) throw new Error('Death evidence envelope tests failed: ' + failed + '/' + (passed + failed))
console.log('Death evidence envelope contracts: ' + passed + '/' + (passed + failed) + ' passed')
