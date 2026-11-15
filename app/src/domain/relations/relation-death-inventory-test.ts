import { brandedId, field } from '../index'
import type { EventId, PersonId, RelationDeathDispositionId, RelationDeathInventoryEntryId, RelationDeathInventoryId, RelationId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Relation } from './model'
import {
  isRelationDeathInventoryReadyForSettlement, validateRelationDeathInventory,
  type RelationDeathInventory, type RelationDeathInventoryEntry,
} from './relation-death-inventory'
import type { RelationDeathDisposition } from './death-continuity'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}
const deadId = brandedId<'PersonId'>('inventory-dead')
const livingId = brandedId<'PersonId'>('inventory-living')
const secondDeadId = brandedId<'PersonId'>('inventory-second-dead')
const otherId = brandedId<'PersonId'>('inventory-other')
const relationA = brandedId<'RelationId'>('inventory-relation-a')
const relationB = brandedId<'RelationId'>('inventory-relation-b')
const relationOld = brandedId<'RelationId'>('inventory-relation-old')
const start = brandedId<'EventId'>('inventory-start')
const deathEvent = brandedId<'EventId'>('inventory-death')
const reviewEvent = brandedId<'EventId'>('inventory-review')
const secondDeath = brandedId<'EventId'>('inventory-second-death')
const endOld = brandedId<'EventId'>('inventory-old-end')
const endLater = brandedId<'EventId'>('inventory-later-end')
const startAt: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 8, period: '午' }
const reviewAt: WorldTime = { day: 8, period: '暮' }
const secondDeathAt: WorldTime = { day: 12, period: '暮' }
const endOldAt: WorldTime = { day: 7, period: '暮' }
const endLaterAt: WorldTime = { day: 15, period: '夜' }
const refs = { events: [start, deathEvent, reviewEvent, secondDeath, endOld, endLater],
  eventTimes: new Map<EventId, WorldTime>([
    [start, startAt], [deathEvent, deathAt], [reviewEvent, reviewAt],
    [secondDeath, secondDeathAt], [endOld, endOldAt], [endLater, endLaterAt],
  ]) }
function person(id: PersonId, dead = false, at = deathAt, event = deathEvent): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable, lifeState: dead ? 'dead' : 'alive',
    archiveState: 'active',
    death: dead ? field.value({ at, causeEvent: event, estateSettlements: [] }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>('cap-' + id),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body-' + id), mind: brandedId<'MindScopeRef'>('mind-' + id),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge-' + id), goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id),
      location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}
const deceased = person(deadId, true)
const living = person(livingId)
const laterDeceased = person(secondDeadId, true, secondDeathAt, secondDeath)
const other = person(otherId)
function relation(id: RelationId, from: PersonId, to: PersonId, validTo: EventId | 'open' = 'open', status: Relation['lifecycle']['status'] = 'active'): Relation {
  return {
    id, from, to, type: 'open-code' as Relation['type'],
    lifecycle: { status, validFrom: start, validTo },
    sourceEvent: start, visibility: { observer: 'player', level: 'public' },
  }
}
const activeA = relation(relationA, deadId, livingId)
const activeB = relation(relationB, otherId, deadId, deathEvent, 'severed')
const historical = relation(relationOld, deadId, otherId, endOld, 'severed')
const preservedDisposition: RelationDeathDisposition = {
  id: brandedId<'RelationDeathDispositionId'>('inventory-disposition-a') as RelationDeathDispositionId,
  relation: relationA, deceased: deadId, deathEvent, outcome: 'preserved',
}
const endedDisposition: RelationDeathDisposition = {
  ...preservedDisposition, id: brandedId<'RelationDeathDispositionId'>('inventory-disposition-b'),
  relation: relationB, outcome: 'ended',
}
function entry(id: string, item: Relation, outcome: RelationDeathInventoryEntry['outcome']): RelationDeathInventoryEntry {
  return { id: brandedId<'RelationDeathInventoryEntryId'>(id) as RelationDeathInventoryEntryId, relation: item.id, outcome }
}
function inventory(entries: readonly RelationDeathInventoryEntry[], status: RelationDeathInventory['status'] = 'complete'): RelationDeathInventory {
  return {
    id: brandedId<'RelationDeathInventoryId'>('relation-inventory-id') as RelationDeathInventoryId,
    deceased: deadId, deathEvent, inventoryEvent: reviewEvent, status, relations: entries,
  }
}
const scope = [activeA, activeB, historical]
const complete = inventory([
  entry('entry-a', activeA, 'preserved'),
  entry('entry-b', activeB, 'ended'),
  entry('entry-old', historical, 'ended-before-death'),
])
const allDispositions = [preservedDisposition, endedDisposition]
const people = [deceased, living, laterDeceased, other]
const issues = validateRelationDeathInventory(complete, scope, allDispositions, people, refs)

check('complete inventory covers directed multi-edge relation scope', issues.length === 0)
check('valid complete inventory is settlement-ready', isRelationDeathInventoryReadyForSettlement(complete, issues))
check('historical relation is explicitly classified ended-before-death', validateRelationDeathInventory(
  inventory([entry('historical-only', historical, 'ended-before-death')]), [historical], [], people, refs).length === 0)
check('active relation without disposition is pending', validateRelationDeathInventory(
  inventory([entry('pending-a', activeA, 'pending')]), [activeA], [], people, refs)
  .includes('relation-death-inventory-item-pending'))
check('complete inventory must include every relation touching deceased', validateRelationDeathInventory(
  inventory([entry('only-a', activeA, 'preserved')]), [activeA, activeB], [preservedDisposition], people, refs)
  .includes('relation-death-inventory-coverage-mismatch'))
check('empty complete inventory is an explicit reviewed empty scope', validateRelationDeathInventory(
  inventory([]), [], [], people, refs).length === 0)
check('open inventory cannot be settlement-ready', !isRelationDeathInventoryReadyForSettlement(inventory([], 'open'), []))
check('challenged inventory cannot be settlement-ready', !isRelationDeathInventoryReadyForSettlement(inventory([], 'challenged'), []))
check('review event must exist', validateRelationDeathInventory(
  { ...complete, inventoryEvent: brandedId<'EventId'>('missing-review') }, scope, allDispositions, people, refs)
  .includes('relation-death-inventory-review-event-missing'))
check('review event cannot predate death', validateRelationDeathInventory(
  { ...complete, inventoryEvent: start }, scope, allDispositions, people, refs)
  .includes('relation-death-inventory-before-death'))
check('death event must match death record', validateRelationDeathInventory(
  { ...complete, deathEvent: start }, scope, allDispositions, people, refs)
  .includes('relation-death-inventory-death-event-mismatch'))
check('inventory entry cannot reference missing relation', validateRelationDeathInventory(
  inventory([{ ...complete.relations[0], relation: brandedId<'RelationId'>('missing-relation') }]), scope, allDispositions, people, refs)
  .includes('relation-death-inventory-relation-reference-missing'))
check('inventory entry cannot reference a relation without deceased endpoint', validateRelationDeathInventory(
  inventory([entry('wrong-endpoint', relation(relationA, livingId, otherId), 'ended-before-death')]),
  [relation(relationA, livingId, otherId)], [], people, refs)
  .includes('relation-death-inventory-relation-endpoint-mismatch'))
check('duplicate relation entries are rejected', validateRelationDeathInventory(
  inventory([complete.relations[0], { ...complete.relations[0], id: brandedId<'RelationDeathInventoryEntryId'>('duplicate-entry') }]),
  [activeA], [preservedDisposition], people, refs)
  .includes('relation-death-inventory-relation-reference-duplicate'))
check('duplicate source relation IDs are rejected', validateRelationDeathInventory(
  inventory([entry('dup-source', activeA, 'preserved')]), [activeA, activeA], [preservedDisposition], people, refs)
  .includes('relation-death-inventory-input-relation-duplicate-id'))
check('wrong disposition is rejected', validateRelationDeathInventory(
  inventory([entry('wrong-outcome', activeA, 'ended')]), [activeA], [preservedDisposition], people, refs)
  .includes('relation-death-inventory-disposition-mismatch'))
check('relation with endpoint start at death cannot be treated as completed', validateRelationDeathInventory(
  inventory([entry('post-start', { ...activeA, lifecycle: { ...activeA.lifecycle, validFrom: deathEvent } }, 'preserved')]),
  [{ ...activeA, lifecycle: { ...activeA.lifecycle, validFrom: deathEvent } }], [preservedDisposition], people, refs)
  .includes('relation-death-starts-at-or-after-death'))
const twoDeadRelation = relation(relationA, deadId, secondDeadId, secondDeath, 'severed')
check('two-deceased-endpoint relation can be preserved then ended at later death', validateRelationDeathInventory(
  inventory([entry('two-endpoint-a', twoDeadRelation, 'preserved')]),
  [twoDeadRelation], [
    preservedDisposition,
    { ...preservedDisposition, id: brandedId<'RelationDeathDispositionId'>('second-endpoint'), deceased: secondDeadId, deathEvent: secondDeath, outcome: 'ended' },
  ], people, refs).length === 0)
check('missing companion disposition for another deceased endpoint is rejected', validateRelationDeathInventory(
  inventory([entry('two-endpoint-b', twoDeadRelation, 'preserved')]),
  [twoDeadRelation], [preservedDisposition], people, refs)
  .includes('relation-death-disposition-missing'))
check('validation does not mutate relation source records', activeA.lifecycle.validTo === 'open'
  && historical.lifecycle.validTo === endOld && deceased.lifeState === 'dead')

if (failed > 0) throw new Error('Relation death inventory tests failed: ' + failed + '/' + (passed + failed))
console.log('Relation death inventory contracts: ' + passed + '/' + (passed + failed) + ' passed')
