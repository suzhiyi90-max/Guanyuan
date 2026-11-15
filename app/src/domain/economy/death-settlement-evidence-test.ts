import { brandedId } from '../shared/ids'
import type { DebtDeathInventory } from './debt-death-inventory'
import {
  projectDebtDeathInventoryEvidence,
  validateDeathSettlementDomainEvidence,
} from './death-settlement-evidence'
import type { EventId, DebtDeathInventoryEntryId, DebtDeathInventoryId, DebtId, PersonId, DeathSettlementEvidenceId } from '../shared/ids'
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
const evidence = projectDebtDeathInventoryEvidence(evidenceId, inventory)\nconst canonical = { id: inventoryId, deceased, deathEvent, inventoryEvent: reviewEvent, status: inventory.status, entryIds: inventory.entries.map(item => item.id) }
check('debt projection preserves inventory identity and scope', evidence.inventory === inventoryId
  && evidence.deceased === deceased && evidence.entries[0].id === entryId)
check('debt projection preserves typed creditor/debtor position', evidence.positions[0].debt === debtId
  && evidence.positions[0].role === 'creditor')
check('valid envelope passes structural validation', validateDeathSettlementDomainEvidence(
  evidence, canonical, refs, deathAt,
).length === 0)
check('missing canonical inventory is rejected', validateDeathSettlementDomainEvidence(
  evidence, null, refs, deathAt,
).includes('death-settlement-evidence-inventory-reference-missing'))
check('review event before death is rejected', validateDeathSettlementDomainEvidence(
  evidence, canonical, { ...refs, eventTimes: new Map([[deathEvent, deathAt], [reviewEvent, { day: 2, period: '夜' }]]) }, deathAt,
).includes('death-settlement-evidence-inventory-before-death'))
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
if (failed) throw new Error('Death evidence envelope tests failed: ' + failed + '/' + (passed + failed))
console.log('Death evidence envelope contracts: ' + passed + '/' + (passed + failed) + ' passed')
