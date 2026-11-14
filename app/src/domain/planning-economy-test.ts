import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { Goal, PlayerGoal, ScheduleEntry, ScheduleScope } from './planning/model'
import { validateGoalSet, validatePlayerGoal, validateScheduleSet } from './planning/validation'
import type { Asset, Debt, RightGrant } from './economy/model'
import {
  canDisposeAsset,
  deriveAssetOwner,
  validateAsset,
  validateAssetSet,
  validateDebt,
} from './economy/validation'
import type { EconomyReferences } from './economy/validation'
import type { EventId, GoalId, PersonId, ScheduleScopeId } from './shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const p1 = brandedId<'PersonId'>('person-1')
const p2 = brandedId<'PersonId'>('person-2')
const org1 = brandedId<'OrgId'>('org-1')
const event1 = brandedId<'EventId'>('event-1')
const event2 = brandedId<'EventId'>('event-2')
const event3 = brandedId<'EventId'>('event-3')
const goalId = brandedId<'GoalId'>('goal-1')
const scope1 = brandedId<'ScheduleScopeId'>('schedule-scope-1')
const scope2 = brandedId<'ScheduleScopeId'>('schedule-scope-2')
const now = { day: 2, period: '午' } as const
const visibility = { observer: 'player' as const, level: 'private' as const }

function person(id: PersonId, goals: readonly GoalId[], scheduleScope: ScheduleScopeId): Person {
  return {
    id,
    displayName: String(id),
    birth: field.notApplicable,
    lifeState: 'alive',
    archiveState: 'active',
    death: field.notApplicable,
    capability: brandedId<'CapabilityRef'>(`cap-${id}`),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>(`body-${id}`),
      mind: brandedId<'MindScopeRef'>(`mind-${id}`),
      knowledge: brandedId<'KnowledgeScopeId'>(`knowledge-${id}`),
      goals,
      scheduleScope,
      economy: brandedId<'EconomyScopeId'>(`economy-${id}`),
      location: brandedId<'LocationStateRef'>(`location-${id}`),
    },
    history: brandedId<'LifeHistoryRef'>(`history-${id}`),
  }
}

const people = [person(p1, [goalId], scope1), person(p2, [], scope2)]
const goal: Goal = {
  id: goalId, person: p1, statement: '修复东堤险段', priority: 5,
  status: 'active', sourceEvent: event1, visibility,
}
check('valid person goal accepted', validateGoalSet([goal], people, [event1]).length === 0)
check('goal requires its person index entry', validateGoalSet([goal], [person(p1, [], scope1)], [event1]).includes('goal-person-index-mismatch'))
check('goal rejects missing source event', validateGoalSet([goal], people, []).includes('goal-source-event-missing'))
check('goal rejects invalid priority', validateGoalSet([{ ...goal, priority: Number.NaN }], people, [event1]).includes('goal-invalid-priority'))
check('goal rejects duplicate IDs', validateGoalSet([goal, goal], people, [event1]).includes('goal-duplicate-id'))

const playerGoal: PlayerGoal = {
  id: 'player', aspirationCode: 'county-magistrate', statement: '成为能任事的清官', chosenAt: now,
}
check('player aspiration is separate and valid', validatePlayerGoal(playerGoal).length === 0)
check('player aspiration requires a statement', validatePlayerGoal({ ...playerGoal, statement: ' ' }).includes('player-goal-empty-statement'))

const scopes: ScheduleScope[] = [{ id: scope1, person: p1 }, { id: scope2, person: p2 }]
const entry: ScheduleEntry = {
  id: brandedId<'ScheduleId'>('schedule-1'), scope: scope1, person: p1,
  day: 3, period: '晨', action: brandedId<'ActionRef'>('court-hearing'),
  place: brandedId<'PlaceId'>('county-yamen'), intent: 'planned',
  execution: field.notGenerated, deviation: field.notGenerated, visibility,
}
check('one scope per person and matching entry accepted', validateScheduleSet(scopes, [entry], people, [event1]).length === 0)
check('schedule rejects cross-person entry', validateScheduleSet(scopes, [{ ...entry, person: p2 }], people, [event1]).includes('schedule-entry-scope-person-mismatch'))
check('schedule rejects second scope for same person', validateScheduleSet([...scopes, { id: brandedId<'ScheduleScopeId'>('scope-extra'), person: p1 }], [entry], people, [event1]).includes('schedule-person-multiple-scopes'))
check('person scope pointer must resolve', validateScheduleSet([scopes[1]], [entry], people, [event1]).includes('schedule-person-scope-mismatch'))
check('schedule rejects invalid day', validateScheduleSet(scopes, [{ ...entry, day: 0 }], people, [event1]).includes('schedule-entry-invalid-day'))
check('schedule execution event must resolve', validateScheduleSet(scopes, [{ ...entry, execution: field.value(brandedId<'EventId'>('missing')) }], people, [event1]).includes('schedule-entry-execution-event-missing'))
check('schedule duplicate IDs rejected', validateScheduleSet(scopes, [entry, entry], people, [event1]).includes('schedule-entry-duplicate-id'))

const eventTimes = new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
  [event1, { day: 1, period: '晨' }],
  [event2, { day: 1, period: '午' }],
  [event3, { day: 3, period: '晨' }],
])
const economyRefs: EconomyReferences = {
  persons: [p1, p2], organizations: [org1], events: [event1, event2, event3],
  eventTimes, revokedGrantIds: [],
}
const grant = (id: string, holder: typeof p1 | typeof p2 | typeof org1, scope: string, grantedBy = event1): RightGrant => ({
  id: brandedId<'RightGrantId'>(id), holder, grantedBy, scope,
  revocable: true, transferable: false, expires: field.notApplicable,
})
const ownerGrant = grant('grant-owner', p1, 'whole-asset')
const derivedOwner = deriveAssetOwner([ownerGrant], now, economyRefs)
const baseAsset: Asset = {
  id: brandedId<'AssetId'>('asset-1'), kind: '粮食', quantity: 100,
  rights: { ownership: [ownerGrant], control: [], handling: [], disposal: [] },
  owner: derivedOwner, custody: field.value(p1), valuation: field.value(80),
}
check('single effective person holder derives owner', derivedOwner.kind === 'value' && derivedOwner.value === p1)
check('same person with multiple scopes remains one owner', deriveAssetOwner([
  ownerGrant, grant('grant-owner-2', p1, 'warehouse'),
], now, economyRefs).kind === 'value')
check('organization ownership never becomes person owner', deriveAssetOwner([grant('grant-org', org1, 'whole')], now, economyRefs).kind === 'n/a')
check('multiple owners do not collapse to one person', deriveAssetOwner([
  ownerGrant, grant('grant-other', p2, 'shared'),
], now, economyRefs).kind === 'n/a')
check('revoked grant is excluded from derived owner', deriveAssetOwner([ownerGrant], now, {
  ...economyRefs, revokedGrantIds: [ownerGrant.id],
}).kind === 'n/a')
check('expired grant is excluded from derived owner', deriveAssetOwner([
  { ...ownerGrant, expires: field.value({ day: 2, period: '晨' }) },
], now, economyRefs).kind === 'n/a')
check('future grant is excluded from derived owner', deriveAssetOwner([
  grant('grant-future', p1, 'future', event3),
], now, economyRefs).kind === 'n/a')
check('asset owner summary must match derived rights', validateAsset({
  ...baseAsset, owner: field.value(p2),
}, economyRefs, now).includes('asset-owner-summary-mismatch'))
check('asset validates with consistent rights and owner', validateAsset(baseAsset, economyRefs, now).length === 0)
check('same-scope competing grants are not silently ordered', validateAsset({
  ...baseAsset,
  rights: { ...baseAsset.rights, ownership: [ownerGrant, grant('grant-competing', p2, 'whole-asset')] },
  owner: field.notApplicable,
}, economyRefs, now).includes('asset-right-grant-scope-conflict'))
check('duplicate right grant IDs rejected across rights', validateAsset({
  ...baseAsset,
  rights: { ...baseAsset.rights, control: [ownerGrant] },
}, economyRefs, now).includes('asset-right-grant-duplicate-id'))
const secondAsset: Asset = {
  ...baseAsset,
  id: brandedId<'AssetId'>('asset-2'),
  rights: { ownership: [], control: [], handling: [], disposal: [grant('grant-disposal-2', p1, 'whole')] },
  owner: field.notApplicable,
}
check('revocation references are checked across the whole asset set', validateAssetSet(
  [baseAsset, secondAsset],
  { ...economyRefs, revokedGrantIds: [brandedId<'RightGrantId'>('grant-disposal-2')] },
  now,
).length === 0)
check('unknown revocation target is rejected once at set boundary', validateAssetSet(
  [baseAsset], { ...economyRefs, revokedGrantIds: [brandedId<'RightGrantId'>('missing-grant')] }, now,
).includes('asset-revocation-grant-missing'))
check('handling does not confer disposal', !canDisposeAsset({
  ...baseAsset, rights: { ownership: [], control: [], handling: [grant('handling', p1, 'whole')], disposal: [] },
}, p1, now, economyRefs))
check('control does not confer disposal', !canDisposeAsset({
  ...baseAsset, rights: { ownership: [], control: [grant('control', p1, 'whole')], handling: [], disposal: [] },
}, p1, now, economyRefs))
check('explicit disposal grant confers disposal without ownership', canDisposeAsset({
  ...baseAsset, rights: { ownership: [], control: [], handling: [], disposal: [grant('disposal', p1, 'whole')] },
}, p1, now, economyRefs))
check('revoked disposal grant no longer confers disposal', !canDisposeAsset({
  ...baseAsset, rights: { ownership: [], control: [], handling: [], disposal: [grant('disposal-revoked', p1, 'whole')] },
}, p1, now, { ...economyRefs, revokedGrantIds: [brandedId<'RightGrantId'>('disposal-revoked')] }))

const debt: Debt = {
  id: brandedId<'DebtId'>('debt-1'), creditor: p1, debtor: p2, principal: 25,
  kind: '借银', sourceEvent: event1, status: 'open', settlements: [],
}
check('valid debt accepted', validateDebt(debt, economyRefs).length === 0)
check('debt requires positive principal', validateDebt({ ...debt, principal: 0 }, economyRefs).includes('debt-invalid-principal'))
check('settled debt requires settlement evidence', validateDebt({ ...debt, status: 'settled' }, economyRefs).includes('debt-settled-without-settlement'))
check('debt settlement event must resolve', validateDebt({ ...debt, settlements: [brandedId<'EventId'>('missing')] }, economyRefs).includes('debt-settlement-event-missing'))

// @ts-expect-error raw strings cannot be used as ScheduleId
const invalidScheduleId: import('./shared/ids').ScheduleId = 'raw'
// @ts-expect-error raw strings cannot be used as RightGrantId
const invalidGrantId: import('./shared/ids').RightGrantId = 'raw'
void invalidScheduleId
void invalidGrantId

if (failed > 0) throw new Error(`Planning/economy contract tests failed: ${failed}/${passed + failed}`)
console.log(`Planning/economy contract tests: ${passed}/${passed + failed} passed`)
