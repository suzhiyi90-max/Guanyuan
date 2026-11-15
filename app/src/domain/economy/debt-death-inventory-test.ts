import {
  brandedId, field, isDebtDeathInventoryReadyForSettlement, validateDebtDeathInventory,
} from '../index'
import type { DebtDeathInventory, DebtDeathInventoryEntry } from './debt-death-inventory'
import type { Debt, DebtPartySuccession } from './model'
import type { Person } from '../person/model'
import type { EventId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const deceasedId = brandedId<'PersonId'>('inventory-deceased')
const creditorId = brandedId<'PersonId'>('inventory-creditor')
const heirId = brandedId<'PersonId'>('inventory-heir')
const deathEvent = brandedId<'EventId'>('inventory-death')
const inventoryEvent = brandedId<'EventId'>('inventory-review')
const sourceEvent = brandedId<'EventId'>('inventory-debt-source')
const successionEvent = brandedId<'EventId'>('inventory-succession')
const paidBeforeEvent = brandedId<'EventId'>('inventory-paid-before')
const paidAfterEvent = brandedId<'EventId'>('inventory-paid-after')
const debtId = brandedId<'DebtId'>('inventory-debt')
const debtTwoId = brandedId<'DebtId'>('inventory-debt-two')
const deathAt: WorldTime = { day: 8, period: '午' }
const reviewAt: WorldTime = { day: 12, period: '暮' }
const sourceAt: WorldTime = { day: 2, period: '晨' }
const successionAt: WorldTime = { day: 9, period: '晨' }
const paidBeforeAt: WorldTime = { day: 7, period: '暮' }
const paidAfterAt: WorldTime = { day: 10, period: '午' }

function person(id: PersonId, dead = false): Person {
  return {
    id, displayName: String(id), birth: field.value({ day: 1, period: '晨' }),
    lifeState: dead ? 'dead' : 'alive', archiveState: 'active',
    death: dead ? field.value({
      at: deathAt, causeEvent: deathEvent,
      estateSettlements: ['office','debt','asset','membership','relation','goal'].map(domain => ({
        domain: domain as 'office'|'debt'|'asset'|'membership'|'relation'|'goal',
        settlementEvent: inventoryEvent, status: 'pending' as const,
      })),
    }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>(`cap-${id}`),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>(`body-${id}`),
      mind: brandedId<'MindScopeRef'>(`mind-${id}`),
      knowledge: brandedId<'KnowledgeScopeId'>(`knowledge-${id}`),
      goals: [], scheduleScope: brandedId<'ScheduleScopeId'>(`schedule-${id}`),
      economy: brandedId<'EconomyScopeId'>(`economy-${id}`),
      location: brandedId<'LocationStateRef'>(`location-${id}`),
    },
    history: brandedId<'LifeHistoryRef'>(`history-${id}`),
  }
}
const deceased = person(deceasedId, true)
const creditor = person(creditorId)
const heir = person(heirId)
const baseDebt: Debt = {
  id: debtId, creditor: deceasedId, debtor: creditorId, principal: 90,
  kind: '借银', sourceEvent, status: 'open', settlements: [],
}
const secondDebt: Debt = {
  ...baseDebt, id: debtTwoId, creditor: creditorId, debtor: deceasedId,
}
const successions: DebtPartySuccession[] = [{
  id: brandedId<'DebtPartySuccessionId'>('inventory-succession-id'),
  debt: debtId, role: 'creditor', deceased: deceasedId, successor: heirId,
  shareNumerator: 1, shareDenominator: 1, deathEvent, successionEvent,
}]
const refs = {
  persons: [deceased, creditor, heir],
  events: [deathEvent, inventoryEvent, sourceEvent, successionEvent, paidBeforeEvent, paidAfterEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt], [inventoryEvent, reviewAt], [sourceEvent, sourceAt],
    [successionEvent, successionAt], [paidBeforeEvent, paidBeforeAt], [paidAfterEvent, paidAfterAt],
  ]),
}
function entry(
  id: string, debt: Debt, role: 'creditor'|'debtor',
  disposition: DebtDeathInventoryEntry['disposition'],
  ids: readonly DebtPartySuccession['id'][] = [],
): DebtDeathInventoryEntry {
  return { id: brandedId<'DebtDeathInventoryEntryId'>(id), debt: debt.id, role, disposition, successions: ids }
}
function inventory(entries: readonly DebtDeathInventoryEntry[], status: DebtDeathInventory['status']='complete'): DebtDeathInventory {
  return {
    id: brandedId<'DebtDeathInventoryId'>('inventory-id'),
    deceased: deceasedId, deathEvent, inventoryEvent, status, entries,
  }
}

const fullCreditorEntry = entry('creditor-position', baseDebt, 'creditor', 'succession-recorded',
  [successions[0].id])
check('full creditor succession is accepted', validateDebtDeathInventory(
  inventory([fullCreditorEntry]), [baseDebt], successions, refs).length === 0)
check('full inventory readiness requires complete coverage and valid evidence', isDebtDeathInventoryReadyForSettlement(
  inventory([fullCreditorEntry]), validateDebtDeathInventory(inventory([fullCreditorEntry]), [baseDebt], successions, refs)))
check('no succession is not silently treated as complete', validateDebtDeathInventory(
  inventory([entry('pending-position', baseDebt, 'creditor', 'pending')]), [baseDebt], [], refs).length === 0
  && !isDebtDeathInventoryReadyForSettlement(
    inventory([entry('pending-position-2', baseDebt, 'creditor', 'pending')]), []))
const partialSuccession = { ...successions[0], shareNumerator: 1, shareDenominator: 2 }
const partialEntry = entry('partial-position', baseDebt, 'creditor', 'pending', [partialSuccession.id])
const partialInventory = inventory([partialEntry])
check('partial succession remains explicitly pending, not settled', validateDebtDeathInventory(
  partialInventory, [baseDebt], [partialSuccession], refs).length === 0
  && !isDebtDeathInventoryReadyForSettlement(partialInventory,
    validateDebtDeathInventory(partialInventory, [baseDebt], [partialSuccession], refs)))
check('a complete inventory must cover creditor and debtor roles separately', validateDebtDeathInventory(
  inventory([fullCreditorEntry]), [baseDebt, secondDebt], successions, refs)
  .includes('debt-death-inventory-complete-coverage-missing'))
check('reverse party position is inventoried independently', validateDebtDeathInventory(
  inventory([
    fullCreditorEntry,
    entry('reverse-debtor-position', secondDebt, 'debtor', 'pending'),
  ]), [baseDebt, secondDebt], successions, refs).length === 0)
check('explicit empty complete inventory is valid for an empty supplied debt universe', validateDebtDeathInventory(
  inventory([]), [], [], refs).length === 0)
check('empty open inventory is not ready', !isDebtDeathInventoryReadyForSettlement(
  inventory([], 'open'), []))
check('empty complete inventory can be ready only with explicit review evidence', isDebtDeathInventoryReadyForSettlement(
  inventory([]), []))
check('missing debt party position is detected', validateDebtDeathInventory(
  inventory([]), [baseDebt], [], refs).includes('debt-death-inventory-complete-coverage-missing'))
check('duplicate position is rejected', validateDebtDeathInventory(
  inventory([fullCreditorEntry, fullCreditorEntry]), [baseDebt], successions, refs)
  .includes('debt-death-inventory-duplicate-position'))
check('wrong role cannot be inventoried as deceased creditor', validateDebtDeathInventory(
  inventory([entry('wrong-role', baseDebt, 'debtor', 'pending')]), [baseDebt], [], refs)
  .includes('debt-death-inventory-party-role-mismatch'))
check('settled before death requires settlement event evidence', validateDebtDeathInventory(
  inventory([entry('settled-before', { ...baseDebt, status: 'settled', settlements: [paidBeforeEvent] },
    'creditor', 'settled-before-death')]),
  [{ ...baseDebt, status: 'settled', settlements: [paidBeforeEvent] }], [], refs).length === 0)
check('settled after death is distinguished from settled before death', validateDebtDeathInventory(
  inventory([entry('settled-after', { ...baseDebt, status: 'settled', settlements: [paidAfterEvent] },
    'creditor', 'settled-after-death')]),
  [{ ...baseDebt, status: 'settled', settlements: [paidAfterEvent] }], [], refs).length === 0)
check('post-death settlement cannot be mislabeled as pre-death', validateDebtDeathInventory(
  inventory([entry('mislabelled', { ...baseDebt, status: 'settled', settlements: [paidAfterEvent] },
    'creditor', 'settled-before-death')]),
  [{ ...baseDebt, status: 'settled', settlements: [paidAfterEvent] }], [], refs)
  .includes('debt-death-inventory-settlement-disposition-mismatch'))
check('settled debt cannot be labeled pending', validateDebtDeathInventory(
  inventory([entry('settled-pending', { ...baseDebt, status: 'settled', settlements: [paidBeforeEvent] },
    'creditor', 'pending')]),
  [{ ...baseDebt, status: 'settled', settlements: [paidBeforeEvent] }], [], refs)
  .includes('debt-death-inventory-pending-status-mismatch'))
check('disputed debt must remain explicitly disputed', validateDebtDeathInventory(
  inventory([entry('disputed-position', { ...baseDebt, status: 'disputed' }, 'creditor', 'disputed')]),
  [{ ...baseDebt, status: 'disputed' }], [], refs).length === 0)
check('disputed debt cannot be mislabeled as pending', validateDebtDeathInventory(
  inventory([entry('disputed-pending', { ...baseDebt, status: 'disputed' }, 'creditor', 'pending')]),
  [{ ...baseDebt, status: 'disputed' }], [], refs)
  .includes('debt-death-inventory-pending-status-mismatch'))
check('succession evidence must be referenced by exactly one position', validateDebtDeathInventory(
  inventory([entry('no-reference', baseDebt, 'creditor', 'pending')]), [baseDebt], successions, refs)
  .includes('debt-death-inventory-succession-unaccounted'))
check('unknown succession reference is rejected', validateDebtDeathInventory(
  inventory([entry('unknown-ref', baseDebt, 'creditor', 'pending', [
    brandedId<'DebtPartySuccessionId'>('unknown-succession'),
  ])]), [baseDebt], [], refs).includes('debt-death-inventory-succession-reference-missing'))
check('inventory must not predate death', validateDebtDeathInventory(
  { ...inventory([fullCreditorEntry]), inventoryEvent: sourceEvent },
  [baseDebt], successions, refs).includes('debt-death-inventory-before-death'))
check('death event must match deceased record', validateDebtDeathInventory(
  { ...inventory([fullCreditorEntry]), deathEvent: sourceEvent },
  [baseDebt], successions, refs).includes('debt-death-inventory-death-event-mismatch'))
check('debt ID ambiguity is rejected', validateDebtDeathInventory(
  inventory([fullCreditorEntry]), [baseDebt, baseDebt], successions, refs)
  .includes('debt-death-inventory-debt-duplicate-id'))
check('original debt remains immutable after audit', baseDebt.creditor === deceasedId
  && baseDebt.debtor === creditorId && baseDebt.status === 'open' && baseDebt.settlements.length === 0)
check('succession is not debt settlement', baseDebt.status === 'open' && baseDebt.settlements.length === 0)

if (failed > 0) throw new Error(`Debt death inventory tests failed: ${failed}/${passed + failed}`)
console.log(`Debt death inventory tests: ${passed}/${passed + failed} passed`)
