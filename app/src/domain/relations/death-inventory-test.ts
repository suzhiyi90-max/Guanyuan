import { brandedId, field } from '../index'
import type {
  EventId, MembershipDeathHandoffId, MembershipDeathInventoryEntryId,
  MembershipDeathInventoryId, MembershipId, OrgId, PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Membership } from './model'
import {
  isMembershipDeathInventoryReadyForSettlement,
  validateMembershipDeathInventory,
  type MembershipDeathInventory,
  type MembershipDeathInventoryEntry,
} from './death-inventory'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}

const deceasedId = brandedId<'PersonId'>('membership-inventory-deceased')
const successorId = brandedId<'PersonId'>('membership-inventory-successor')
const otherId = brandedId<'PersonId'>('membership-inventory-other')
const orgId = brandedId<'OrgId'>('membership-inventory-org')
const deathEvent = brandedId<'EventId'>('membership-inventory-death')
const reviewEvent = brandedId<'EventId'>('membership-inventory-review')
const startEvent = brandedId<'EventId'>('membership-inventory-start')
const priorEndEvent = brandedId<'EventId'>('membership-inventory-prior-end')
const handoffEvent = brandedId<'EventId'>('membership-inventory-handoff')
const sourceId = brandedId<'MembershipId'>('membership-inventory-source')
const priorId = brandedId<'MembershipId'>('membership-inventory-prior')
const successorMembershipId = brandedId<'MembershipId'>('membership-inventory-successor-record')
const deathAt: WorldTime = { day: 8, period: '午' }
const reviewAt: WorldTime = { day: 8, period: '暮' }
const startAt: WorldTime = { day: 1, period: '晨' }
const priorEndAt: WorldTime = { day: 7, period: '暮' }
const handoffAt: WorldTime = { day: 8, period: '暮' }

function person(id: PersonId, dead = false): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable,
    lifeState: dead ? 'dead' : 'alive', archiveState: 'active',
    death: dead ? field.value({ at: deathAt, causeEvent: deathEvent, estateSettlements: [] }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>('cap-' + id),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body-' + id),
      mind: brandedId<'MindScopeRef'>('mind-' + id),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge-' + id),
      goals: [], scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id),
      location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}
const deceased = person(deceasedId, true)
const successor = person(successorId)
const other = person(otherId)
const activeAtDeath: Membership = {
  id: sourceId, organization: orgId, person: deceasedId, role: '会首',
  obligations: ['议事'], validFrom: startEvent, validTo: deathEvent, sourceEvent: startEvent,
}
const endedBefore: Membership = {
  id: priorId, organization: orgId, person: deceasedId, role: '账房',
  obligations: ['核账'], validFrom: startEvent, validTo: priorEndEvent, sourceEvent: startEvent,
}
const successorMembership: Membership = {
  id: successorMembershipId, organization: orgId, person: successorId, role: '新任会首',
  obligations: ['主持议事'], validFrom: handoffEvent, validTo: 'open', sourceEvent: handoffEvent,
}
const handoff = {
  id: brandedId<'MembershipDeathHandoffId'>('membership-inventory-handoff') as MembershipDeathHandoffId,
  sourceMembership: sourceId, deceased: deceasedId, deathEvent,
  successorMembership: successorMembershipId, handoffEvent,
}
const refs = {
  events: [deathEvent, reviewEvent, startEvent, priorEndEvent, handoffEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt], [reviewEvent, reviewAt], [startEvent, startAt],
    [priorEndEvent, priorEndAt], [handoffEvent, handoffAt],
  ]),
}
function entry(id: string, membership: Membership, disposition: MembershipDeathInventoryEntry['disposition']): MembershipDeathInventoryEntry {
  return {
    id: brandedId<'MembershipDeathInventoryEntryId'>(id) as MembershipDeathInventoryEntryId,
    membership: membership.id, disposition,
  }
}
function inventory(
  entries: readonly MembershipDeathInventoryEntry[],
  status: MembershipDeathInventory['status'] = 'complete',
): MembershipDeathInventory {
  return {
    id: brandedId<'MembershipDeathInventoryId'>('membership-inventory-id') as MembershipDeathInventoryId,
    deceased: deceasedId, deathEvent, inventoryEvent: reviewEvent, status, memberships: entries,
  }
}
const entries = [
  entry('entry-death-closed', activeAtDeath, 'closed-by-death'),
  entry('entry-prior-ended', endedBefore, 'ended-before-death'),
]
const records = [activeAtDeath, endedBefore, successorMembership]
const people = [deceased, successor, other]
const valid = inventory(entries)
const validIssues = validateMembershipDeathInventory(valid, records, [handoff], people, refs)

check('complete inventory covers all deceased memberships and validates explicit handoff', validIssues.length === 0)
check('valid membership inventory is settlement-ready', isMembershipDeathInventoryReadyForSettlement(valid, validIssues))
check('membership ended before death is preserved as history', validateMembershipDeathInventory(
  inventory([entries[1]]), [endedBefore], [], people, refs).length === 0)
check('membership active at death must close with the death event', validateMembershipDeathInventory(
  inventory([entry('wrong-close', { ...activeAtDeath, validTo: priorEndEvent }, 'closed-by-death')]),
  [{ ...activeAtDeath, validTo: priorEndEvent }], [], people, refs)
  .includes('membership-death-inventory-disposition-mismatch'))
check('open membership at death remains pending and blocks readiness', validateMembershipDeathInventory(
  inventory([entry('open-membership', { ...activeAtDeath, validTo: 'open' }, 'pending')]),
  [{ ...activeAtDeath, validTo: 'open' }], [], people, refs).length > 0)
check('complete inventory must include every deceased membership', validateMembershipDeathInventory(
  inventory([]), [activeAtDeath], [], people, refs)
  .includes('membership-death-inventory-coverage-missing'))
check('empty complete inventory is an explicit reviewed empty scope', validateMembershipDeathInventory(
  inventory([]), [], [], people, refs).length === 0)
check('open empty inventory is not settlement-ready', !isMembershipDeathInventoryReadyForSettlement(
  inventory([], 'open'), []))
check('challenged inventory is not settlement-ready', !isMembershipDeathInventoryReadyForSettlement(
  inventory(entries, 'challenged'), []))
check('inventory review event must exist', validateMembershipDeathInventory(
  { ...valid, inventoryEvent: brandedId<'EventId'>('missing-review') }, records, [handoff], people, refs)
  .includes('membership-death-inventory-review-event-missing'))
check('inventory review cannot predate death', validateMembershipDeathInventory(
  { ...valid, inventoryEvent: startEvent }, records, [handoff], people, refs)
  .includes('membership-death-inventory-before-death'))
check('inventory death event must match death record', validateMembershipDeathInventory(
  { ...valid, deathEvent: startEvent }, records, [], people, refs)
  .includes('membership-death-inventory-death-event-mismatch'))
check('membership entry cannot reference another person', validateMembershipDeathInventory(
  inventory([entry('other-person', { ...activeAtDeath, person: otherId }, 'closed-by-death')]),
  [{ ...activeAtDeath, person: otherId }], [], people, refs)
  .includes('membership-death-inventory-membership-person-mismatch'))
check('duplicate membership entry references are rejected', validateMembershipDeathInventory(
  inventory([entries[0], { ...entries[0], id: brandedId<'MembershipDeathInventoryEntryId'>('entry-duplicate') }]),
  [activeAtDeath], [], people, refs)
  .includes('membership-death-inventory-membership-reference-duplicate'))
check('duplicate membership IDs in source collection are rejected', validateMembershipDeathInventory(
  inventory([entries[0]]), [activeAtDeath, activeAtDeath], [], people, refs)
  .includes('membership-death-inventory-input-membership-duplicate-id'))
check('handoff source must be present in inventory', validateMembershipDeathInventory(
  inventory([entries[1]]), records, [handoff], people, refs)
  .includes('membership-death-inventory-handoff-source-not-in-inventory'))
check('handoff source must be classified closed by death', validateMembershipDeathInventory(
  inventory([entry('handoff-prior', endedBefore, 'ended-before-death')]),
  [endedBefore], [{ ...handoff, sourceMembership: priorId }], people, refs)
  .includes('membership-death-inventory-handoff-source-not-death-closed'))
check('successor membership is separate and does not inherit source role or obligations',
  successorMembership.id !== activeAtDeath.id
    && successorMembership.role !== activeAtDeath.role
    && successorMembership.obligations.join() !== activeAtDeath.obligations.join())
check('validation never rewrites membership or organization records',
  activeAtDeath.validTo === deathEvent && activeAtDeath.role === '会首'
    && successorMembership.role === '新任会首' && successorMembership.validTo === 'open')

if (failed > 0) throw new Error('Membership death inventory tests failed: ' + failed + '/' + (passed + failed))
console.log('Membership death inventory contracts: ' + passed + '/' + (passed + failed) + ' passed')
