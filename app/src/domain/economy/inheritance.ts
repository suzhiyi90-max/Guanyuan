import { field } from '../shared/field'
import type { AssetId, AssetInheritanceId, EventId, PersonId, RightGrantId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Asset, EconomyIssue, RightGrant, RightRevocation } from './model'
import { deriveAssetOwner, validateAsset } from './validation'
import type { EconomyReferences } from './validation'

export interface AssetInheritanceTransfer {
  readonly id: AssetInheritanceId
  readonly asset: AssetId
  readonly deceased: PersonId
  readonly successor: PersonId
  readonly sourceGrant: RightGrantId
  readonly deathEvent: EventId
  readonly transferEvent: EventId
  readonly successorGrant: RightGrantId
}

export interface AssetInheritanceReferences extends Omit<EconomyReferences, 'persons'> {
  readonly persons: readonly Person[]
}

export type InheritanceIssue =
  | 'inheritance-deceased-person-missing'
  | 'inheritance-deceased-not-dead'
  | 'inheritance-death-record-missing'
  | 'inheritance-successor-missing'
  | 'inheritance-successor-not-alive'
  | 'inheritance-asset-mismatch'
  | 'inheritance-death-event-mismatch'
  | 'inheritance-death-event-missing'
  | 'inheritance-death-time-mismatch'
  | 'inheritance-transfer-event-missing'
  | 'inheritance-transfer-time-missing'
  | 'inheritance-transfer-before-death'
  | 'inheritance-source-grant-missing'
  | 'inheritance-source-grant-not-owned'
  | 'inheritance-source-grant-not-transferable'
  | 'inheritance-source-grant-already-revoked'
  | 'inheritance-successor-grant-id-duplicate'

export type AssetInheritanceIssue = InheritanceIssue | EconomyIssue

export interface AssetInheritanceResult {
  readonly asset: Asset
  readonly transfer: AssetInheritanceTransfer
  readonly revocation: RightRevocation | undefined
  readonly successorGrant: RightGrant | undefined
  readonly issues: readonly AssetInheritanceIssue[]
}

function allGrantIds(asset: Asset): Set<string> {
  return new Set([
    ...asset.rights.ownership,
    ...asset.rights.control,
    ...asset.rights.handling,
    ...asset.rights.disposal,
  ].map(grant => grant.id))
}

function sameTime(left: WorldTime, right: WorldTime): boolean {
  return isValidWorldTime(left) && isValidWorldTime(right)
    && compareWorldTime(left, right) === 0
}

/**
 * Transfers one explicitly identified, transferable ownership grant after death.
 * It does not choose heirs, infer kinship, split shares, settle debts, or close the
 * aggregate estate-asset domain. The caller must supply the legally selected heir.
 */
export function applyAssetInheritance(
  asset: Asset,
  transfer: AssetInheritanceTransfer,
  refs: AssetInheritanceReferences,
): AssetInheritanceResult {
  const issues: AssetInheritanceIssue[] = []
  const deceased = refs.persons.find(person => person.id === transfer.deceased)
  const successor = refs.persons.find(person => person.id === transfer.successor)

  if (!deceased) issues.push('inheritance-deceased-person-missing')
  else if (deceased.lifeState !== 'dead') issues.push('inheritance-deceased-not-dead')
  if (!deceased || deceased.death.kind !== 'value') {
    issues.push('inheritance-death-record-missing')
  }
  if (!successor) issues.push('inheritance-successor-missing')
  else if (successor.lifeState !== 'alive') issues.push('inheritance-successor-not-alive')
  if (asset.id !== transfer.asset) issues.push('inheritance-asset-mismatch')

  const deathRecord = deceased?.death.kind === 'value' ? deceased.death.value : undefined
  if (deathRecord) {
    if (deathRecord.causeEvent !== transfer.deathEvent) issues.push('inheritance-death-event-mismatch')
    if (!refs.events.includes(transfer.deathEvent)) issues.push('inheritance-death-event-missing')
    const sourceDeathTime = refs.eventTimes.get(transfer.deathEvent)
    if (!sourceDeathTime || !sameTime(sourceDeathTime, deathRecord.at)) {
      issues.push('inheritance-death-time-mismatch')
    }
  }

  if (!refs.events.includes(transfer.transferEvent)) issues.push('inheritance-transfer-event-missing')
  const transferAt = refs.eventTimes.get(transfer.transferEvent)
  if (!transferAt || !isValidWorldTime(transferAt)) issues.push('inheritance-transfer-time-missing')
  if (deathRecord && transferAt && isValidWorldTime(transferAt)
    && isValidWorldTime(deathRecord.at)
    && compareWorldTime(transferAt, deathRecord.at) < 0) {
    issues.push('inheritance-transfer-before-death')
  }

  const sourceGrant = asset.rights.ownership.find(grant => grant.id === transfer.sourceGrant)
  if (!sourceGrant) issues.push('inheritance-source-grant-missing')
  else {
    if (sourceGrant.holder !== transfer.deceased) issues.push('inheritance-source-grant-not-owned')
    if (sourceGrant.transferable !== true) issues.push('inheritance-source-grant-not-transferable')
  }
  if (refs.revocations.some(item => item.grant === transfer.sourceGrant)) {
    issues.push('inheritance-source-grant-already-revoked')
  }
  if (allGrantIds(asset).has(transfer.successorGrant)) {
    issues.push('inheritance-successor-grant-id-duplicate')
  }

  const economyRefs: EconomyReferences = {
    persons: refs.persons.map(person => person.id),
    organizations: refs.organizations,
    events: refs.events,
    eventTimes: refs.eventTimes,
    revocations: refs.revocations,
  }
  if (deathRecord && isValidWorldTime(deathRecord.at)) {
    issues.push(...validateAsset(asset, economyRefs, deathRecord.at))
  }

  if (issues.length > 0 || !sourceGrant || !successor || !transferAt
    || !isValidWorldTime(transferAt) || !deathRecord) {
    return { asset, transfer, revocation: undefined, successorGrant: undefined, issues }
  }

  const successorGrant: RightGrant = {
    ...sourceGrant,
    id: transfer.successorGrant,
    holder: successor.id,
    grantedBy: transfer.transferEvent,
  }
  const revocation: RightRevocation = {
    grant: sourceGrant.id,
    revokedBy: transfer.transferEvent,
  }
  const nextRevocations = [...refs.revocations, revocation]
  const nextEconomyRefs: EconomyReferences = { ...economyRefs, revocations: nextRevocations }
  const nextAssetDraft: Asset = {
    ...asset,
    rights: {
      ...asset.rights,
      ownership: [...asset.rights.ownership, successorGrant],
    },
    owner: field.notApplicable,
  }
  const nextAsset: Asset = {
    ...nextAssetDraft,
    owner: deriveAssetOwner(nextAssetDraft.rights.ownership, transferAt, nextEconomyRefs),
  }
  const finalIssues = validateAsset(nextAsset, nextEconomyRefs, transferAt)
  if (finalIssues.length > 0) {
    return { asset, transfer, revocation: undefined, successorGrant: undefined, issues: finalIssues }
  }
  return { asset: nextAsset, transfer, revocation, successorGrant, issues: [] }
}
