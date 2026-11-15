import type { WorldTime } from '../shared/world-time'
import type { AssetInheritanceId, AssetId, EventId, EstateAssetInventoryEntryId, EstateAssetInventoryId, PersonId, RightGrantId } from '../shared/ids'
import type { Asset, RightGrant } from './model'
import type { AssetInheritanceReferences, AssetInheritanceTransfer } from './inheritance'
import { deriveAssetOwner, isAssetRightGrantEffectiveAt } from './validation'

export type EstateAssetOwnershipAtDeath = 'deceased' | 'other' | 'undetermined'
export type EstateAssetDisposition = 'pending' | 'transferred' | 'excluded' | 'disputed'

export interface EstateAssetInventoryEntry {
  readonly id: EstateAssetInventoryEntryId
  readonly asset: AssetId
  /** A recorded classification; validator recomputes it from rights effective at death. */
  readonly ownershipAtDeath: EstateAssetOwnershipAtDeath
  /** Exact effective ownership grants held by the deceased at the death instant. */
  readonly sourceOwnershipGrants: readonly RightGrantId[]
  readonly disposition: EstateAssetDisposition
  /** Required only for transferred/excluded resolutions. */
  readonly resolutionEvent: EventId | null
  readonly transfer: AssetInheritanceId | null
}

export interface EstateAssetInventory {
  readonly id: EstateAssetInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  /** complete is an explicit inventory attestation, not proof that hidden assets do not exist. */
  readonly status: 'open' | 'complete' | 'challenged'
  readonly entries: readonly EstateAssetInventoryEntry[]
}

export type EstateAssetInventoryIssue =
  | 'estate-inventory-invalid-status'
  | 'estate-inventory-deceased-missing'
  | 'estate-inventory-deceased-not-dead'
  | 'estate-inventory-death-record-missing'
  | 'estate-inventory-death-event-mismatch'
  | 'estate-inventory-death-event-missing'
  | 'estate-inventory-death-time-mismatch'
  | 'estate-inventory-event-missing'
  | 'estate-inventory-event-time-missing'
  | 'estate-inventory-before-death'
  | 'estate-inventory-duplicate-entry-id'
  | 'estate-inventory-duplicate-asset-entry'
  | 'estate-inventory-asset-missing'
  | 'estate-inventory-asset-ambiguous'
  | 'estate-inventory-ownership-classification-mismatch'
  | 'estate-inventory-source-grants-mismatch'
  | 'estate-inventory-invalid-disposition'
  | 'estate-inventory-transfer-reference-invalid'
  | 'estate-inventory-transfer-missing'
  | 'estate-inventory-transfer-duplicate-reference'
  | 'estate-inventory-transfer-not-matching'
  | 'estate-inventory-transfer-invalid'
  | 'estate-inventory-resolution-event-missing'
  | 'estate-inventory-resolution-time-invalid'
  | 'estate-inventory-resolution-before-death'
  | 'estate-inventory-resolution-after-inventory'
  | 'estate-inventory-exclusion-not-supported'
  | 'estate-inventory-transfer-not-supported'
  | 'estate-inventory-complete-coverage-missing'
  | 'estate-inventory-orphan-transfer'

export interface EstateAssetInventoryReferences extends AssetInheritanceReferences {
  readonly transfers: readonly AssetInheritanceTransfer[]
}

function sameTime(left: WorldTime, right: WorldTime): boolean {
  const compare = (a: WorldTime, b: WorldTime): number => {
    if (a.day !== b.day) return a.day - b.day
    const order = ['晨', '午', '暮', '夜']
    return order.indexOf(a.period) - order.indexOf(b.period)
  }
  return Number.isSafeInteger(left.day) && Number.isSafeInteger(right.day)
    && orderIsValid(left.period) && orderIsValid(right.period)
    && compare(left, right) === 0
}

function orderIsValid(period: string): boolean {
  return period === '晨' || period === '午' || period === '暮' || period === '夜'
}

function compareTime(left: WorldTime, right: WorldTime): number {
  if (left.day !== right.day) return left.day - right.day
  const order = ['晨', '午', '暮', '夜']
  return order.indexOf(left.period) - order.indexOf(right.period)
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}


function sameExpiry(left: RightGrant['expires'], right: RightGrant['expires']): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind !== 'value') return true
  return right.kind === 'value' && sameTime(left.value, right.value)
}

function personAliveAt(person: EstateAssetInventoryReferences['persons'][number], at: WorldTime): boolean {
  if (!Number.isSafeInteger(at.day) || !orderIsValid(at.period)) return false
  if (person.birth.kind === 'value'
    && (!Number.isSafeInteger(person.birth.value.day) || !orderIsValid(person.birth.value.period)
      || compareTime(at, person.birth.value) < 0)) return false
  if (person.lifeState === 'alive') return person.death.kind === 'n/a'
  return person.death.kind === 'value' && compareTime(at, person.death.value.at) < 0
}

function recordedTransferIsValid(
  asset: Asset,
  transfer: AssetInheritanceTransfer,
  deceased: PersonId,
  deathEvent: EventId,
  deathAt: WorldTime,
  refs: EstateAssetInventoryReferences,
): boolean {
  const source = asset.rights.ownership.filter(grant => grant.id === transfer.sourceGrant)
  const successorGrants = asset.rights.ownership.filter(grant => grant.id === transfer.successorGrant)
  const revocations = refs.revocations.filter(item => item.grant === transfer.sourceGrant)
  const successor = refs.persons.filter(person => person.id === transfer.successor)
  const transferAt = refs.eventTimes.get(transfer.transferEvent)
  if (transfer.deceased !== deceased || transfer.deathEvent !== deathEvent
    || transfer.asset !== asset.id || transfer.successor === deceased) return false
  if (source.length !== 1 || successorGrants.length !== 1 || revocations.length !== 1 || successor.length !== 1) return false
  const sourceGrant = source[0]
  const successorGrant = successorGrants[0]
  if (sourceGrant.holder !== deceased || sourceGrant.transferable !== true || sourceGrant.revocable !== true) return false
  if (successorGrant.holder !== transfer.successor || successorGrant.grantedBy !== transfer.transferEvent
    || successorGrant.scope !== sourceGrant.scope || successorGrant.revocable !== sourceGrant.revocable
    || successorGrant.transferable !== sourceGrant.transferable || !sameExpiry(successorGrant.expires, sourceGrant.expires)) return false
  if (revocations[0].revokedBy !== transfer.transferEvent) return false
  if (!refs.events.includes(transfer.transferEvent) || !transferAt
    || !Number.isSafeInteger(transferAt.day) || !orderIsValid(transferAt.period)
    || compareTime(transferAt, deathAt) < 0) return false
  return personAliveAt(successor[0], transferAt)
}

function effectiveDeceasedGrants(
  asset: Asset,
  deceased: PersonId,
  at: WorldTime,
  refs: EstateAssetInventoryReferences,
): RightGrant[] {
  const economyRefs = {
    persons: refs.persons.map(person => person.id),
    organizations: refs.organizations,
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: refs.revocations,
  }
  return asset.rights.ownership.filter(grant =>
    grant.holder === deceased && isAssetRightGrantEffectiveAt(grant, at, economyRefs))
}

function classifyOwnership(
  asset: Asset,
  deceased: PersonId,
  at: WorldTime,
  refs: EstateAssetInventoryReferences,
): EstateAssetOwnershipAtDeath {
  const economyRefs = {
    persons: refs.persons.map(person => person.id),
    organizations: refs.organizations,
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: refs.revocations,
  }
  const owner = deriveAssetOwner(asset.rights.ownership, at, economyRefs)
  if (owner.kind === 'value') return owner.value === deceased ? 'deceased' : 'other'
  const activeHolders = new Set(asset.rights.ownership
    .filter(grant => isAssetRightGrantEffectiveAt(grant, at, economyRefs))
    .map(grant => grant.holder))
  if (activeHolders.size === 1) {
    const holder = [...activeHolders][0]
    if (holder !== deceased && (refs.persons.some(person => person.id === holder)
      || refs.organizations.includes(holder as import('../shared/ids').OrgId))) return 'other'
  }
  return 'undetermined'
}

/**
 * Validates the deceased person's asset inventory against the supplied asset universe.
 * A complete inventory must account for every deceased-owned or ownership-ambiguous asset.
 * It never mutates assets, transfers, Person.death, or the six-domain settlement status.
 */
export function validateEstateAssetInventory(
  inventory: EstateAssetInventory,
  assets: readonly Asset[],
  refs: EstateAssetInventoryReferences,
): EstateAssetInventoryIssue[] {
  const issues: EstateAssetInventoryIssue[] = []
  const deceasedRecords = refs.persons.filter(person => person.id === inventory.deceased)
  const deceased = deceasedRecords.length === 1 ? deceasedRecords[0] : undefined
  if (!deceased) issues.push('estate-inventory-deceased-missing')
  else if (deceased.lifeState !== 'dead') issues.push('estate-inventory-deceased-not-dead')
  if (!deceased || deceased.death.kind !== 'value') {
    issues.push('estate-inventory-death-record-missing')
  }
  if (!['open', 'complete', 'challenged'].includes(inventory.status)) {
    issues.push('estate-inventory-invalid-status')
  }
  if (deceased?.death.kind !== 'value') return [...new Set(issues)]

  const death = deceased.death.value
  if (death.causeEvent !== inventory.deathEvent) issues.push('estate-inventory-death-event-mismatch')
  if (!refs.events.includes(inventory.deathEvent)) issues.push('estate-inventory-death-event-missing')
  const deathEventAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathEventAt || !sameTime(deathEventAt, death.at)) {
    issues.push('estate-inventory-death-time-mismatch')
  }

  if (!refs.events.includes(inventory.inventoryEvent)) {
    issues.push('estate-inventory-event-missing')
  }
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !orderIsValid(inventoryAt.period) || !Number.isSafeInteger(inventoryAt.day)) {
    issues.push('estate-inventory-event-time-missing')
  } else if (compareTime(inventoryAt, death.at) < 0) {
    issues.push('estate-inventory-before-death')
  }

  if (!unique(inventory.entries.map(entry => entry.id))) {
    issues.push('estate-inventory-duplicate-entry-id')
  }
  if (!unique(inventory.entries.map(entry => entry.asset))) {
    issues.push('estate-inventory-duplicate-asset-entry')
  }
  if (!unique(assets.map(asset => asset.id))) issues.push('estate-inventory-asset-ambiguous')

  const assetsById = new Map(assets.map(asset => [asset.id, asset]))
  const referencedTransfers = new Set<AssetInheritanceId>()
  for (const entry of inventory.entries) {
    const asset = assetsById.get(entry.asset)
    if (!asset) {
      issues.push('estate-inventory-asset-missing')
      continue
    }
    const ownership = classifyOwnership(asset, deceased.id, death.at, refs)
    if (entry.ownershipAtDeath !== ownership) {
      issues.push('estate-inventory-ownership-classification-mismatch')
    }
    const expectedGrantIds = effectiveDeceasedGrants(asset, deceased.id, death.at, refs)
      .map(grant => grant.id).sort()
    const actualGrantIds = [...entry.sourceOwnershipGrants].sort()
    if (!unique(entry.sourceOwnershipGrants) || expectedGrantIds.join('|') !== actualGrantIds.join('|')) {
      issues.push('estate-inventory-source-grants-mismatch')
    }

    if (!['pending', 'transferred', 'excluded', 'disputed'].includes(entry.disposition)) {
      issues.push('estate-inventory-invalid-disposition')
      continue
    }
    if (entry.disposition === 'transferred') {
      if (!entry.transfer) {
        issues.push('estate-inventory-transfer-reference-invalid')
        continue
      }
      if (referencedTransfers.has(entry.transfer)) issues.push('estate-inventory-transfer-duplicate-reference')
      referencedTransfers.add(entry.transfer)
      const matches = refs.transfers.filter(transfer => transfer.id === entry.transfer)
      if (matches.length !== 1) {
        issues.push('estate-inventory-transfer-missing')
        continue
      }
      const transfer = matches[0]
      if (ownership !== 'deceased' || transfer.asset !== entry.asset
        || transfer.deceased !== inventory.deceased || transfer.deathEvent !== inventory.deathEvent
        || !entry.sourceOwnershipGrants.includes(transfer.sourceGrant)
        || entry.resolutionEvent !== transfer.transferEvent) {
        issues.push('estate-inventory-transfer-not-matching')
      }
      if (ownership !== 'deceased') issues.push('estate-inventory-transfer-not-supported')
      if (!recordedTransferIsValid(asset, transfer, inventory.deceased, inventory.deathEvent, death.at, refs)) {
        issues.push('estate-inventory-transfer-invalid')
      }
      const transferAt = refs.eventTimes.get(transfer.transferEvent)
      if (inventoryAt && transferAt && compareTime(transferAt, inventoryAt) > 0) {
        issues.push('estate-inventory-resolution-after-inventory')
      }
    } else {
      if (entry.transfer !== null) issues.push('estate-inventory-transfer-reference-invalid')
      if (entry.disposition === 'excluded' && ownership !== 'other') {
        issues.push('estate-inventory-exclusion-not-supported')
      }
      if (entry.disposition === 'excluded' || entry.resolutionEvent !== null) {
        if (!entry.resolutionEvent || !refs.events.includes(entry.resolutionEvent)) {
          issues.push('estate-inventory-resolution-event-missing')
        } else {
          const resolutionAt = refs.eventTimes.get(entry.resolutionEvent)
          if (!resolutionAt || !orderIsValid(resolutionAt.period) || !Number.isSafeInteger(resolutionAt.day)) {
            issues.push('estate-inventory-resolution-time-invalid')
          } else if (compareTime(resolutionAt, death.at) < 0) {
            issues.push('estate-inventory-resolution-before-death')
          } else if (inventoryAt && compareTime(resolutionAt, inventoryAt) > 0) {
            issues.push('estate-inventory-resolution-after-inventory')
          }
        }
      }
    }
  }

  if (inventory.status === 'complete') {
    for (const asset of assets) {
      const ownership = classifyOwnership(asset, deceased.id, death.at, refs)
      if (ownership !== 'other' && !inventory.entries.some(entry => entry.asset === asset.id)) {
        issues.push('estate-inventory-complete-coverage-missing')
      }
    }
  }

  for (const transfer of refs.transfers) {
    if (transfer.deceased === inventory.deceased && transfer.deathEvent === inventory.deathEvent
      && !referencedTransfers.has(transfer.id)) {
      issues.push('estate-inventory-orphan-transfer')
    }
  }
  return [...new Set(issues)]
}

/**
 * This is only a readiness predicate. It does not mark DeathRecord.asset as settled.
 * Callers must also supply a successful validation result for the inventory.
 */
export function isEstateAssetInventoryReadyForSettlement(
  inventory: EstateAssetInventory,
  validationIssues: readonly EstateAssetInventoryIssue[],
): boolean {
  if (validationIssues.length > 0 || inventory.status !== 'complete') return false
  return inventory.entries.every(entry =>
    (entry.ownershipAtDeath === 'deceased' && entry.disposition === 'transferred')
    || (entry.ownershipAtDeath === 'other' && entry.disposition === 'excluded'))
}
