import { brandedId, field } from '../index'
import type { Person } from '../person/model'
import type { Asset, RightGrant } from './model'
import type { EstateAssetInventory, EstateAssetInventoryEntry } from './estate-inventory'
import { isEstateAssetInventoryReadyForSettlement, validateEstateAssetInventory } from './estate-inventory'
import type { AssetInheritanceReferences, AssetInheritanceTransfer } from './inheritance'
import type { EventId, PersonId } from '../shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const deceasedId = brandedId<'PersonId'>('estate-deceased')
const successorId = brandedId<'PersonId'>('estate-successor')
const otherId = brandedId<'PersonId'>('estate-other')
const orgId = brandedId<'OrgId'>('estate-org')
const deathEvent = brandedId<'EventId'>('estate-death')
const inventoryEvent = brandedId<'EventId'>('estate-inventory')
const transferEvent = brandedId<'EventId'>('estate-transfer')
const exclusionEvent = brandedId<'EventId'>('estate-exclusion')
const disputeEvent = brandedId<'EventId'>('estate-dispute')
const acquisitionEvent = brandedId<'EventId'>('estate-acquisition')
const otherAcquisitionEvent = brandedId<'EventId'>('estate-other-acquisition')
const deceasedShareEvent = brandedId<'EventId'>('estate-deceased-share')
const assetId = brandedId<'AssetId'>('estate-house')
const otherAssetId = brandedId<'AssetId'>('estate-other-house')
const ambiguousAssetId = brandedId<'AssetId'>('estate-shared-house')
const sourceGrantId = brandedId<'RightGrantId'>('estate-source-grant')
const otherGrantId = brandedId<'RightGrantId'>('estate-other-grant')
const deceasedShareGrantId = brandedId<'RightGrantId'>('estate-deceased-share-grant')
const successorGrantId = brandedId<'RightGrantId'>('estate-successor-grant')
const transferId = brandedId<'AssetInheritanceId'>('estate-transfer-record')
const deathAt = { day: 5, period: '午' } as const
const inventoryAt = { day: 6, period: '晨' } as const
const transferAt = { day: 6, period: '午' } as const

function person(id: PersonId, lifeState: 'alive' | 'dead'): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable, lifeState, archiveState: 'active',
    death: lifeState === 'dead' ? field.value({
      at: deathAt, causeEvent: deathEvent,
      estateSettlements: [
        { domain: 'office', settlementEvent: deathEvent, status: 'pending' },
        { domain: 'debt', settlementEvent: deathEvent, status: 'pending' },
        { domain: 'asset', settlementEvent: deathEvent, status: 'pending' },
        { domain: 'membership', settlementEvent: deathEvent, status: 'pending' },
        { domain: 'relation', settlementEvent: deathEvent, status: 'pending' },
        { domain: 'goal', settlementEvent: deathEvent, status: 'pending' },
      ],
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

const deceased = person(deceasedId, 'dead')
const successor = person(successorId, 'alive')
const other = person(otherId, 'alive')
const sourceGrant: RightGrant = {
  id: sourceGrantId, holder: deceasedId, grantedBy: acquisitionEvent, scope: 'whole',
  revocable: true, transferable: true, expires: field.notApplicable,
}
const otherGrant: RightGrant = {
  id: otherGrantId, holder: otherId, grantedBy: otherAcquisitionEvent, scope: 'whole',
  revocable: true, transferable: true, expires: field.notApplicable,
}
const deceasedShareGrant: RightGrant = {
  id: deceasedShareGrantId, holder: deceasedId, grantedBy: deceasedShareEvent, scope: 'whole',
  revocable: true, transferable: true, expires: field.notApplicable,
}
const asset: Asset = {
  id: assetId, kind: '宅院', quantity: 1,
  rights: { ownership: [sourceGrant, { ...sourceGrant, id: successorGrantId, holder: successorId, grantedBy: transferEvent }], control: [], handling: [], disposal: [] },
  owner: field.value(successorId), custody: field.value(deceasedId), valuation: field.value(500),
}
const otherAsset: Asset = {
  id: otherAssetId, kind: '铺面', quantity: 1,
  rights: { ownership: [otherGrant], control: [], handling: [], disposal: [] },
  owner: field.value(otherId), custody: field.value(otherId), valuation: field.value(200),
}
const ambiguousAsset: Asset = {
  id: ambiguousAssetId, kind: '共有田产', quantity: 1,
  rights: { ownership: [deceasedShareGrant, otherGrant], control: [], handling: [], disposal: [] },
  owner: field.notApplicable, custody: field.value(otherId), valuation: field.value(300),
}
const transfer: AssetInheritanceTransfer = {
  id: transferId, asset: assetId, deceased: deceasedId, successor: successorId,
  sourceGrant: sourceGrantId, deathEvent, transferEvent, successorGrant: successorGrantId,
}
const refs: AssetInheritanceReferences & { readonly transfers: readonly AssetInheritanceTransfer[] } = {
  persons: [deceased, successor, other], organizations: [orgId],
  events: [acquisitionEvent, otherAcquisitionEvent, deceasedShareEvent, deathEvent, inventoryEvent, transferEvent, exclusionEvent, disputeEvent],
  eventTimes: new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
    [acquisitionEvent, { day: 1, period: '晨' }],
    [otherAcquisitionEvent, { day: 1, period: '晨' }],
    [deceasedShareEvent, { day: 1, period: '晨' }],
    [deathEvent, deathAt],
    [inventoryEvent, inventoryAt],
    [transferEvent, transferAt],
    [exclusionEvent, inventoryAt],
    [disputeEvent, inventoryAt],
  ]),
  revocations: [{ grant: sourceGrantId, revokedBy: transferEvent }],
  transfers: [transfer],
}
const transferredEntry: EstateAssetInventoryEntry = {
  id: brandedId<'EstateAssetInventoryEntryId'>('estate-entry-house'),
  asset: assetId, ownershipAtDeath: 'deceased', sourceOwnershipGrants: [sourceGrantId],
  disposition: 'transferred', resolutionEvent: transferEvent, transfer: transferId,
}
const excludedEntry: EstateAssetInventoryEntry = {
  id: brandedId<'EstateAssetInventoryEntryId'>('estate-entry-other'),
  asset: otherAssetId, ownershipAtDeath: 'other', sourceOwnershipGrants: [],
  disposition: 'excluded', resolutionEvent: exclusionEvent, transfer: null,
}
const disputedEntry: EstateAssetInventoryEntry = {
  id: brandedId<'EstateAssetInventoryEntryId'>('estate-entry-shared'),
  asset: ambiguousAssetId, ownershipAtDeath: 'undetermined',
  sourceOwnershipGrants: [deceasedShareGrantId], disposition: 'disputed',
  resolutionEvent: disputeEvent, transfer: null,
}
const inventory: EstateAssetInventory = {
  id: brandedId<'EstateAssetInventoryId'>('estate-inventory-1'),
  deceased: deceasedId, deathEvent, inventoryEvent, status: 'complete',
  entries: [transferredEntry, excludedEntry, disputedEntry],
}
const assets = [asset, otherAsset, ambiguousAsset]
const validIssues = validateEstateAssetInventory(inventory, assets, refs)
check('valid complete inventory records transferred, excluded and disputed assets', validIssues.length === 0)
check('unresolved shared ownership prevents settlement readiness',
  !isEstateAssetInventoryReadyForSettlement(inventory, validIssues))
check('settlement readiness requires successful validation and complete status',
  !isEstateAssetInventoryReadyForSettlement({ ...inventory, status: 'open' }, []))
check('missing known deceased-owned asset breaks complete coverage',
  validateEstateAssetInventory({ ...inventory, entries: [excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-complete-coverage-missing'))
check('missing ambiguous asset breaks complete coverage',
  validateEstateAssetInventory({ ...inventory, entries: [transferredEntry, excludedEntry] }, assets, refs)
    .includes('estate-inventory-complete-coverage-missing'))
check('wrong ownership classification is rejected',
  validateEstateAssetInventory({ ...inventory, entries: [{ ...transferredEntry, ownershipAtDeath: 'other' }, excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-ownership-classification-mismatch'))
check('source grant snapshot must match effective grants at death',
  validateEstateAssetInventory({ ...inventory, entries: [{ ...transferredEntry, sourceOwnershipGrants: [] }, excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-source-grants-mismatch'))
check('estate-owned asset cannot be excluded',
  validateEstateAssetInventory({ ...inventory, entries: [{ ...transferredEntry, disposition: 'excluded', transfer: null, resolutionEvent: exclusionEvent }, excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-exclusion-not-supported'))
check('other-owned asset cannot be transferred as estate property',
  validateEstateAssetInventory({ ...inventory, entries: [transferredEntry, { ...excludedEntry, disposition: 'transferred', transfer: transferId, resolutionEvent: transferEvent }, disputedEntry] }, assets, refs)
    .includes('estate-inventory-transfer-not-supported'))
check('transfer must match the inventory entry asset and deceased',
  validateEstateAssetInventory({ ...inventory, entries: [{ ...transferredEntry, transfer: brandedId<'AssetInheritanceId'>('missing-transfer') }, excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-transfer-missing'))
check('transfer cannot be referenced twice',
  validateEstateAssetInventory({ ...inventory, entries: [transferredEntry, { ...transferredEntry, id: brandedId<'EstateAssetInventoryEntryId'>('duplicate-transfer-entry') }, excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-duplicate-asset-entry'))
check('inventory event cannot predate death',
  validateEstateAssetInventory({ ...inventory, inventoryEvent: deathEvent }, assets, refs)
    .includes('estate-inventory-before-death'))
check('death event must match death record',
  validateEstateAssetInventory({ ...inventory, deathEvent: brandedId<'EventId'>('wrong-death') }, assets, refs)
    .includes('estate-inventory-death-event-mismatch'))
check('orphan asset transfer must be linked into inventory',
  validateEstateAssetInventory({ ...inventory, entries: [excludedEntry, disputedEntry] }, assets, refs)
    .includes('estate-inventory-orphan-transfer'))
check('inventory validation does not mutate assets or death settlement status',
  asset.owner.kind === 'value' && asset.owner.value === successorId
  && deceased.death.kind === 'value'
  && deceased.death.value.estateSettlements.find(item => item.domain === 'asset')?.status === 'pending')
check('empty complete inventory is ready when no assets are in the supplied universe',
  isEstateAssetInventoryReadyForSettlement({
    ...inventory, entries: [],
  }, []))
check('invalid runtime inventory status is rejected',
  validateEstateAssetInventory({ ...inventory, status: 'finished' as EstateAssetInventory['status'] }, assets, refs)
    .includes('estate-inventory-invalid-status'))

if (failed > 0) throw new Error(`Estate asset inventory contracts failed: ${failed}/${passed + failed}`)
console.log(`Estate asset inventory contracts: ${passed}/${passed + failed} passed`)
