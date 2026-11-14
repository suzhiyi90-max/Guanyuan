import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Field } from '../shared/field'
import type { AssetId, DebtId, EventId, OrgId, PersonId, RightGrantId } from '../shared/ids'
import type { Asset, AssetRightKind, Debt, EconomyIssue, RightGrant, RightHolder, RightRevocation } from './model'

export interface EconomyReferences {
  readonly persons: readonly PersonId[]
  readonly organizations: readonly OrgId[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime>
  readonly revocations: readonly RightRevocation[]
}

function duplicateIds<T>(items: readonly T[], getId: (item: T) => string): boolean {
  const seen = new Set<string>()
  for (const item of items) {
    const id = getId(item)
    if (seen.has(id)) return true
    seen.add(id)
  }
  return false
}

function isKnownHolder(holder: RightHolder, refs: EconomyReferences): boolean {
  return refs.persons.includes(holder as PersonId) || refs.organizations.includes(holder as OrgId)
}

function revocationTime(grantId: RightGrantId, refs: EconomyReferences): import('../shared/world-time').WorldTime | undefined {
  const revocation = refs.revocations.find(item => item.grant === grantId)
  if (!revocation || !refs.events.includes(revocation.revokedBy)) return undefined
  return refs.eventTimes.get(revocation.revokedBy)
}

function grantIsEffective(grant: RightGrant, at: import('../shared/world-time').WorldTime, refs: EconomyReferences): boolean {
  const grantedAt = refs.eventTimes.get(grant.grantedBy)
  if (!grantedAt || !isValidWorldTime(grantedAt) || !isValidWorldTime(at)) return false
  if (compareWorldTime(grantedAt, at) > 0) return false
  const revokedAt = revocationTime(grant.id, refs)
  if (revokedAt && isValidWorldTime(revokedAt) && compareWorldTime(revokedAt, at) <= 0) return false
  if (grant.expires.kind === 'n/a') return true
  if (grant.expires.kind === 'value') {
    return isValidWorldTime(grant.expires.value) && compareWorldTime(at, grant.expires.value) < 0
  }
  // unknown/not-generated expiry cannot confer a currently provable right.
  return false
}

function allGrantEntries(asset: Asset): Array<{ kind: AssetRightKind; grant: RightGrant }> {
  return (['ownership', 'control', 'handling', 'disposal'] as const)
    .flatMap(kind => asset.rights[kind].map(grant => ({ kind, grant })))
}

function sameField<T extends {}>(left: Field<T>, right: Field<T>): boolean {
  if (left.kind !== right.kind) return false
  return left.kind !== 'value' || (right.kind === 'value' && left.value === right.value)
}

/** Derive owner from effective ownership grants; never infer ownership from other rights. */
export function deriveAssetOwner(
  ownership: readonly RightGrant[],
  at: import('../shared/world-time').WorldTime,
  refs: EconomyReferences,
): Field<PersonId> {
  const holders = new Set<string>()
  for (const grant of ownership) {
    if (grantIsEffective(grant, at, refs)) holders.add(grant.holder)
  }
  const people = [...holders].filter(holder =>
    refs.persons.includes(holder as PersonId) && !refs.organizations.includes(holder as OrgId))
  if (holders.size === 1 && people.length === 1) {
    return { kind: 'value', value: people[0] as PersonId }
  }
  return { kind: 'n/a' }
}

function validateGrant(grant: RightGrant, refs: EconomyReferences): EconomyIssue[] {
  const issues: EconomyIssue[] = []
  if (!isKnownHolder(grant.holder, refs)) issues.push('asset-right-grant-holder-missing')
  if (!refs.events.includes(grant.grantedBy)) issues.push('asset-right-grant-event-missing')
  const grantedAt = refs.eventTimes.get(grant.grantedBy)
  if (!grantedAt || !isValidWorldTime(grantedAt)) issues.push('asset-right-grant-time-missing')
  if (!grant.scope.trim()) issues.push('asset-right-grant-empty-scope')
  if (typeof grant.revocable !== 'boolean' || typeof grant.transferable !== 'boolean') {
    issues.push('asset-right-grant-invalid-flags')
  }
  if (grant.expires.kind === 'value') {
    if (!isValidWorldTime(grant.expires.value)) issues.push('asset-right-grant-expiry-before-grant')
    else if (grantedAt && isValidWorldTime(grantedAt) && compareWorldTime(grant.expires.value, grantedAt) < 0) {
      issues.push('asset-right-grant-expiry-before-grant')
    }
  }
  return issues
}

export function validateAsset(
  asset: Asset,
  refs: EconomyReferences,
  at: import('../shared/world-time').WorldTime,
): EconomyIssue[] {
  const issues: EconomyIssue[] = []
  if (!asset.kind.trim()) issues.push('asset-empty-kind')
  if (!Number.isFinite(asset.quantity) || asset.quantity <= 0) issues.push('asset-invalid-quantity')
  if (asset.valuation.kind === 'value' && (!Number.isFinite(asset.valuation.value) || asset.valuation.value < 0)) {
    issues.push('asset-invalid-valuation')
  }
  if (asset.custody.kind === 'value' && !refs.persons.includes(asset.custody.value)) {
    issues.push('asset-custody-person-missing')
  }
  const grants = allGrantEntries(asset)
  if (duplicateIds(grants, item => item.grant.id)) issues.push('asset-right-grant-duplicate-id')
  for (const { grant } of grants) issues.push(...validateGrant(grant, refs))
  for (const kind of ['ownership', 'control', 'handling', 'disposal'] as const) {
    const active = asset.rights[kind].filter(grant => grantIsEffective(grant, at, refs))
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        if (active[i].scope === active[j].scope && active[i].holder !== active[j].holder) {
          issues.push('asset-right-grant-scope-conflict')
        }
      }
    }
  }
  const derived = deriveAssetOwner(asset.rights.ownership, at, refs)
  if (asset.owner.kind !== 'value' && asset.owner.kind !== 'n/a') {
    issues.push('asset-owner-summary-invalid')
  } else if (!sameField(asset.owner, derived)) {
    issues.push('asset-owner-summary-mismatch')
  }
  return issues
}

export function validateAssetSet(
  assets: readonly Asset[],
  refs: EconomyReferences,
  at: import('../shared/world-time').WorldTime,
): EconomyIssue[] {
  const issues: EconomyIssue[] = []
  if (duplicateIds(assets, item => item.id)) issues.push('asset-duplicate-id')
  const allGrants = assets.flatMap(allGrantEntries)
  if (duplicateIds(allGrants, item => item.grant.id)) issues.push('asset-right-grant-duplicate-id')
  const revocationTargets = new Set<string>()
  for (const revocation of refs.revocations) {
    if (revocationTargets.has(revocation.grant)) issues.push('asset-revocation-duplicate')
    revocationTargets.add(revocation.grant)
    const grant = allGrants.find(item => item.grant.id === revocation.grant)?.grant
    if (!grant) {
      issues.push('asset-revocation-grant-missing')
      continue
    }
    if (!refs.events.includes(revocation.revokedBy)) issues.push('asset-revocation-event-missing')
    const revokedAt = refs.eventTimes.get(revocation.revokedBy)
    const grantedAt = refs.eventTimes.get(grant.grantedBy)
    if (!revokedAt || !isValidWorldTime(revokedAt)) issues.push('asset-revocation-time-missing')
    if (grant.revocable !== true) issues.push('asset-revocation-not-permitted')
    if (revokedAt && isValidWorldTime(revokedAt) && grantedAt && isValidWorldTime(grantedAt)
      && compareWorldTime(revokedAt, grantedAt) < 0) {
      issues.push('asset-revocation-before-grant')
    }
  }
  for (const asset of assets) issues.push(...validateAsset(asset, refs, at))
  return issues
}

/** Disposal requires ownership or an explicit disposal grant; control/handling never substitute. */
export function canDisposeAsset(
  asset: Asset,
  holder: RightHolder,
  at: import('../shared/world-time').WorldTime,
  refs: EconomyReferences,
): boolean {
  return [...asset.rights.ownership, ...asset.rights.disposal]
    .some(grant => grant.holder === holder && grantIsEffective(grant, at, refs))
}

export function validateDebt(debt: Debt, refs: EconomyReferences): EconomyIssue[] {
  const issues: EconomyIssue[] = []
  if (!debt.kind.trim()) issues.push('debt-empty-kind')
  if (!Number.isFinite(debt.principal) || debt.principal <= 0) issues.push('debt-invalid-principal')
  if (!refs.persons.includes(debt.creditor)) issues.push('debt-creditor-missing')
  if (!refs.persons.includes(debt.debtor)) issues.push('debt-debtor-missing')
  if (!refs.events.includes(debt.sourceEvent)) issues.push('debt-source-event-missing')
  if (!['open', 'settled', 'disputed'].includes(debt.status)) issues.push('debt-invalid-status')
  if (duplicateIds(debt.settlements, item => item)) issues.push('debt-duplicate-settlement')
  for (const eventId of debt.settlements) {
    if (!refs.events.includes(eventId)) issues.push('debt-settlement-event-missing')
  }
  if (debt.status === 'settled' && debt.settlements.length === 0) issues.push('debt-settled-without-settlement')
  return issues
}

export function validateDebtSet(debts: readonly Debt[], refs: EconomyReferences): EconomyIssue[] {
  const issues: EconomyIssue[] = []
  if (duplicateIds(debts, item => item.id)) issues.push('debt-duplicate-id')
  for (const debt of debts) issues.push(...validateDebt(debt, refs))
  return issues
}

export type { AssetId, DebtId }
