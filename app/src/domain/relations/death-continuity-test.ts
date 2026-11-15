import { brandedId, field } from '../index'
import type { EventId, PersonId, RelationId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Relation } from './model'
import { validateRelationDeathContinuity, type RelationDeathDisposition } from './death-continuity'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}
const deadId = brandedId<'PersonId'>('rel-dead')
const livingId = brandedId<'PersonId'>('rel-living')
const secondDeadId = brandedId<'PersonId'>('rel-second-dead')
const relationId = brandedId<'RelationId'>('rel-edge')
const start = brandedId<'EventId'>('rel-start')
const deathEvent = brandedId<'EventId'>('rel-death')
const secondDeath = brandedId<'EventId'>('rel-second-death')
const end = brandedId<'EventId'>('rel-end')
const startAt: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 8, period: '午' }
const secondDeathAt: WorldTime = { day: 12, period: '暮' }
const endAt: WorldTime = { day: 15, period: '夜' }
const refs = { events: [start, deathEvent, secondDeath, end], eventTimes: new Map<EventId, WorldTime>([
  [start, startAt], [deathEvent, deathAt], [secondDeath, secondDeathAt], [end, endAt],
]) }
function person(id: PersonId, dead: boolean, at = deathAt, event = deathEvent): Person {
  return {
    id, displayName: id, birth: field.notApplicable, lifeState: dead ? 'dead' : 'alive',
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
const living = person(livingId, false)
const laterDeceased = person(secondDeadId, true, secondDeathAt, secondDeath)
const edge: Relation = {
  id: relationId, from: deadId, to: livingId, type: 'kinship' as Relation['type'],
  lifecycle: { status: 'active', validFrom: start, validTo: 'open' },
  sourceEvent: start, visibility: { observer: 'player', level: 'public' },
}
const preserved: RelationDeathDisposition = {
  id: brandedId<'RelationDeathDispositionId'>('rel-disposition-1'),
  relation: relationId, deceased: deadId, deathEvent, outcome: 'preserved',
}
const closedEdge: Relation = { ...edge, lifecycle: { status: 'severed', validFrom: start, validTo: deathEvent } }
const ended: RelationDeathDisposition = { ...preserved, outcome: 'ended' }

check('preserved relation remains a historical fact', validateRelationDeathContinuity([edge], [preserved], [deceased, living], refs).length === 0)
check('open relation at death requires explicit disposition', validateRelationDeathContinuity([edge], [], [deceased, living], refs).includes('relation-death-disposition-missing'))
check('ended relation closes at death event and is severed', validateRelationDeathContinuity([closedEdge], [ended], [deceased, living], refs).length === 0)
check('ended disposition rejects open interval', validateRelationDeathContinuity([edge], [ended], [deceased, living], refs).includes('relation-death-ended-not-closed'))
check('ended disposition requires severed status', validateRelationDeathContinuity([{ ...closedEdge, lifecycle: { ...closedEdge.lifecycle, status: 'active' } }], [ended], [deceased, living], refs).includes('relation-death-ended-not-severed'))
check('preserved disposition rejects severed status', validateRelationDeathContinuity([closedEdge], [preserved], [deceased, living], refs).includes('relation-death-preserved-but-severed'))
check('relation ended before death remains historical without disposition', validateRelationDeathContinuity([{ ...edge, lifecycle: { status: 'severed', validFrom: start, validTo: end } }], [], [deceased, living], refs).length === 0)
check('disposition is unnecessary when relation ended before death', validateRelationDeathContinuity([{ ...edge, lifecycle: { status: 'severed', validFrom: start, validTo: start } }], [preserved], [deceased, living], refs).includes('relation-death-disposition-unnecessary'))
check('later relation end requires preserved disposition', validateRelationDeathContinuity([{ ...edge, lifecycle: { ...edge.lifecycle, validTo: end } }], [], [deceased, living], refs).includes('relation-death-disposition-missing'))
check('preserved relation can have a later end event', validateRelationDeathContinuity([{ ...edge, lifecycle: { ...edge.lifecycle, validTo: end } }], [preserved], [deceased, living], refs).length === 0)
check('relation cannot begin at or after endpoint death', validateRelationDeathContinuity([{ ...edge, lifecycle: { ...edge.lifecycle, validFrom: deathEvent } }], [preserved], [deceased, living], refs).includes('relation-death-starts-at-or-after-death'))
check('same-time end must use the death event', validateRelationDeathContinuity([{ ...edge, lifecycle: { ...edge.lifecycle, validTo: secondDeath } }], [ended], [deceased, living], { ...refs, eventTimes: new Map(refs.eventTimes).set(secondDeath, deathAt) }).includes('relation-death-end-not-death-event'))
check('disposition person must be an endpoint', validateRelationDeathContinuity([edge], [{ ...preserved, deceased: brandedId<'PersonId'>('not-endpoint') }], [deceased, living], refs).includes('relation-death-person-not-endpoint'))
check('missing relation is rejected', validateRelationDeathContinuity([], [preserved], [deceased, living], refs).includes('relation-death-relation-missing'))
check('ambiguous relation is rejected', validateRelationDeathContinuity([edge, edge], [preserved], [deceased, living], refs).includes('relation-death-relation-ambiguous'))
check('missing deceased person is rejected', validateRelationDeathContinuity([edge], [preserved], [living], refs).includes('relation-death-person-missing'))
check('ambiguous deceased person is rejected', validateRelationDeathContinuity([edge], [preserved], [deceased, deceased, living], refs).includes('relation-death-person-ambiguous'))
check('living endpoint cannot receive death disposition', validateRelationDeathContinuity([edge], [preserved], [living, person(deadId, false)], refs).includes('relation-death-record-missing'))
check('death event must match death record', validateRelationDeathContinuity([edge], [{ ...preserved, deathEvent: secondDeath }], [deceased, living], refs).includes('relation-death-event-time-mismatch'))
check('death event time must match death record', validateRelationDeathContinuity([edge], [preserved], [deceased, living], { ...refs, eventTimes: new Map(refs.eventTimes).set(deathEvent, endAt) }).includes('relation-death-event-time-mismatch'))
check('duplicate disposition IDs are rejected', validateRelationDeathContinuity([edge], [preserved, preserved], [deceased, living], refs).includes('relation-death-disposition-duplicate-id'))
check('duplicate relation/deceased disposition is rejected', validateRelationDeathContinuity([edge], [preserved, { ...preserved, id: brandedId<'RelationDeathDispositionId'>('rel-duplicate') }], [deceased, living], refs).includes('relation-death-disposition-duplicate-endpoint'))
check('two endpoints can be preserved then ended at later death', validateRelationDeathContinuity([edge], [
  preserved, { ...preserved, id: brandedId<'RelationDeathDispositionId'>('rel-disposition-2'), deceased: secondDeadId, deathEvent: secondDeath, outcome: 'ended' },
], [deceased, laterDeceased], refs).length === 0)
check('terminal end makes later endpoint disposition unnecessary', validateRelationDeathContinuity([closedEdge], [
  ended, { ...preserved, id: brandedId<'RelationDeathDispositionId'>('rel-late'), deceased: secondDeadId, deathEvent: secondDeath },
], [deceased, laterDeceased], refs).includes('relation-death-disposition-unnecessary'))
check('validation does not mutate source data', edge.lifecycle.validTo === 'open' && deceased.lifeState === 'dead' && preserved.outcome === 'preserved')

if (failed > 0) throw new Error('Relation death continuity tests failed: ' + failed + '/' + (passed + failed))
console.log('Relation death continuity contracts: ' + passed + '/' + (passed + failed) + ' passed')
