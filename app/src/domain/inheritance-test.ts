import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { Asset, RightGrant } from './economy/model'
import type { AssetInheritanceTransfer, AssetInheritanceReferences } from './economy/inheritance'
import { applyAssetInheritance } from './economy/inheritance'
import type { EventId, PersonId } from './shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const deceasedId = brandedId<'PersonId'>('inherit-deceased')
const successorId = brandedId<'PersonId'>('inherit-successor')
const deathEvent = brandedId<'EventId'>('inherit-death-event')
const transferEvent = brandedId<'EventId'>('inherit-transfer-event')
const sourceGrantId = brandedId<'RightGrantId'>('inherit-source-grant')
const successorGrantId = brandedId<'RightGrantId'>('inherit-successor-grant')
const assetId = brandedId<'AssetId'>('inherit-asset')
const deathAt = { day: 5, period: '午' } as const
const transferAt = { day: 5, period: '暮' } as const

function person(id: PersonId, lifeState: 'alive' | 'dead'): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable, lifeState,
    archiveState: 'active',
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
const sourceGrant: RightGrant = {
  id: sourceGrantId, holder: deceasedId, grantedBy: brandedId<'EventId'>('inherit-acquisition'),
  scope: 'whole-asset', revocable: true, transferable: true, expires: field.notApplicable,
}
const acquisitionEvent = sourceGrant.grantedBy
const asset: Asset = {
  id: assetId, kind: '家宅', quantity: 1,
  rights: { ownership: [sourceGrant], control: [], handling: [], disposal: [] },
  owner: field.value(deceasedId), custody: field.value(deceasedId), valuation: field.value(500),
}
const refs: AssetInheritanceReferences = {
  persons: [deceased, successor], organizations: [],
  events: [acquisitionEvent, deathEvent, transferEvent],
  eventTimes: new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
    [acquisitionEvent, { day: 1, period: '晨' }],
    [deathEvent, deathAt],
    [transferEvent, transferAt],
  ]),
  revocations: [],
}
const transfer: AssetInheritanceTransfer = {
  id: brandedId<'AssetInheritanceId'>('inheritance-transfer-1'),
  asset: assetId, deceased: deceasedId, successor: successorId,
  sourceGrant: sourceGrantId, deathEvent, transferEvent, successorGrant: successorGrantId,
}
const result = applyAssetInheritance(asset, transfer, refs)
check('valid inheritance transfers ownership', result.issues.length === 0
  && result.asset.owner.kind === 'value' && result.asset.owner.value === successorId)
check('source ownership grant remains auditable and is revoked by transfer event',
  result.asset.rights.ownership.length === 2
  && result.revocation?.grant === sourceGrantId
  && result.revocation.revokedBy === transferEvent)
check('successor grant preserves scope and provenance', result.successorGrant?.holder === successorId
  && result.successorGrant.grantedBy === transferEvent
  && result.successorGrant.scope === sourceGrant.scope)
check('inheritance does not mutate the original asset', asset.rights.ownership.length === 1
  && asset.owner.kind === 'value' && asset.owner.value === deceasedId)
check('asset domain is not marked settled by a single unscoped transfer',
  deceased.death.kind === 'value'
  && deceased.death.value.estateSettlements.find(item => item.domain === 'asset')?.status === 'pending')
check('living owner cannot inherit from themselves', applyAssetInheritance(asset, transfer, {
  ...refs, persons: [person(deceasedId, 'alive'), successor],
}).issues.includes('inheritance-deceased-not-dead'))
check('dead successor is rejected', applyAssetInheritance(asset, transfer, {
  ...refs, persons: [deceased, person(successorId, 'dead')],
}).issues.includes('inheritance-successor-not-alive'))
check('non-transferable ownership cannot be inherited', applyAssetInheritance({
  ...asset, rights: { ...asset.rights, ownership: [{ ...sourceGrant, transferable: false }] },
}, transfer, refs).issues.includes('inheritance-source-grant-not-transferable'))
check('unknown source grant is rejected', applyAssetInheritance(asset, {
  ...transfer, sourceGrant: brandedId<'RightGrantId'>('missing-grant'),
}, refs).issues.includes('inheritance-source-grant-missing'))
check('transfer cannot precede death', applyAssetInheritance(asset, transfer, {
  ...refs, eventTimes: new Map(refs.eventTimes).set(transferEvent, { day: 5, period: '晨' }),
}).issues.includes('inheritance-transfer-before-death'))
check('transfer must cite the actual death event', applyAssetInheritance(asset, {
  ...transfer, deathEvent: brandedId<'EventId'>('other-death'),
}, refs).issues.includes('inheritance-death-event-mismatch'))
check('duplicate successor grant ID is rejected', applyAssetInheritance(asset, {
  ...transfer, successorGrant: sourceGrantId,
}, refs).issues.includes('inheritance-successor-grant-id-duplicate'))
check('prior revocation prevents double inheritance', applyAssetInheritance(asset, transfer, {
  ...refs, revocations: [{ grant: sourceGrantId, revokedBy: transferEvent }],
}).issues.includes('inheritance-source-grant-already-revoked'))

if (failed > 0) throw new Error(`Inheritance contract tests failed: ${failed}/${passed + failed}`)
console.log(`Inheritance contract tests: ${passed}/${passed + failed} passed`)
