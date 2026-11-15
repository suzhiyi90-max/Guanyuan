import { brandedId, field } from '../index'
import type { EventId, GoalId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Goal, GoalDeathDisposition } from './model'
import { validateGoalDeathContinuity } from './death-continuity'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}
const deceasedId = brandedId<'PersonId'>('goal-deceased')
const successorId = brandedId<'PersonId'>('goal-successor')
const otherId = brandedId<'PersonId'>('goal-other')
const sourceGoalId = brandedId<'GoalId'>('goal-source')
const successorGoalId = brandedId<'GoalId'>('goal-successor-goal')
const startEvent = brandedId<'EventId'>('goal-start')
const deathEvent = brandedId<'EventId'>('goal-death')
const decisionEvent = brandedId<'EventId'>('goal-decision')
const beforeDeath: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 5, period: '午' }
const afterDeath: WorldTime = { day: 6, period: '晨' }
const refs = { events: [startEvent, deathEvent, decisionEvent], eventTimes: new Map<EventId, WorldTime>([
  [startEvent, beforeDeath], [deathEvent, deathAt], [decisionEvent, afterDeath],
]) }
function person(id: PersonId, dead: boolean): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable,
    lifeState: dead ? 'dead' : 'alive', archiveState: 'active',
    death: dead ? field.value({ at: deathAt, causeEvent: deathEvent, estateSettlements: [] }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>('cap-' + id),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body-' + id), mind: brandedId<'MindScopeRef'>('mind-' + id),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge-' + id), goals: id === deceasedId ? [sourceGoalId] : id === successorId ? [successorGoalId] : [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id), location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}
const deceased = person(deceasedId, true)
const successor = person(successorId, false)
const other = person(otherId, false)
const sourceGoal: Goal = {
  id: sourceGoalId, person: deceasedId, statement: '修复东堤险段', priority: 5,
  status: 'closed-by-death', sourceEvent: startEvent,
  visibility: { observer: 'player', level: 'private' },
}
const successorGoal: Goal = {
  id: successorGoalId, person: successorId, statement: '继续修复东堤险段', priority: 4,
  status: 'active', sourceEvent: decisionEvent,
  visibility: { observer: 'player', level: 'private' },
}
const historical: GoalDeathDisposition = {
  id: brandedId<'GoalDeathDispositionId'>('goal-disposition-historical'),
  goal: sourceGoalId, deceased: deceasedId, deathEvent, dispositionEvent: deathEvent,
  outcome: 'historical', successorGoal: field.notApplicable,
}
const undertaken: GoalDeathDisposition = {
  ...historical, id: brandedId<'GoalDeathDispositionId'>('goal-disposition-undertaken'),
  dispositionEvent: decisionEvent, outcome: 'undertaken', successorGoal: field.value(successorGoalId),
}
check('unfinished goal can be retained as historical', validateGoalDeathContinuity([sourceGoal], [historical], [deceased, successor], refs).length === 0)
check('dead owner active goal requires disposition', validateGoalDeathContinuity([{ ...sourceGoal, status: 'active' }], [], [deceased, successor], refs).includes('goal-death-disposition-missing'))
check('undertaking creates a separate successor goal', validateGoalDeathContinuity([sourceGoal, successorGoal], [undertaken], [deceased, successor], refs).length === 0)
check('original goal is not transferred or rewritten', sourceGoal.person === deceasedId && successorGoal.person === successorId && sourceGoal.statement !== successorGoal.statement)
check('abandonment requires matching terminal status and later event', validateGoalDeathContinuity([{ ...sourceGoal, status: 'abandoned' }], [
  { ...historical, outcome: 'abandoned', dispositionEvent: decisionEvent },
], [deceased, successor], refs).length === 0)
check('failure requires matching terminal status', validateGoalDeathContinuity([{ ...sourceGoal, status: 'failed' }], [
  { ...historical, outcome: 'failed', dispositionEvent: decisionEvent },
], [deceased, successor], refs).length === 0)
check('wrong owner rejected', validateGoalDeathContinuity([sourceGoal], [{ ...historical, deceased: otherId }], [deceased, successor, other], refs).includes('goal-death-person-mismatch'))
check('missing death event rejected', validateGoalDeathContinuity([sourceGoal], [historical], [deceased, successor], { ...refs, events: [startEvent, decisionEvent] }).includes('goal-death-event-missing'))
check('death event time must match record', validateGoalDeathContinuity([sourceGoal], [historical], [deceased, successor], { ...refs, eventTimes: new Map(refs.eventTimes).set(deathEvent, afterDeath) }).includes('goal-death-event-time-mismatch'))
check('goal source must predate death', validateGoalDeathContinuity([{ ...sourceGoal, sourceEvent: deathEvent }], [historical], [deceased, successor], refs).includes('goal-death-goal-starts-at-or-after-death'))
check('decision event must follow death', validateGoalDeathContinuity([sourceGoal], [
  { ...historical, outcome: 'abandoned', dispositionEvent: deathEvent },
], [deceased, successor], refs).includes('goal-death-disposition-before-death'))
check('successor goal must use undertaking event', validateGoalDeathContinuity([sourceGoal, { ...successorGoal, sourceEvent: startEvent }], [undertaken], [deceased, successor], refs).includes('goal-death-successor-source-event-mismatch'))
check('successor must be alive at undertaking time', validateGoalDeathContinuity([sourceGoal, successorGoal], [undertaken], [deceased, person(successorId, true)], refs).includes('goal-death-successor-not-alive'))
check('successor goal must belong to a different person', validateGoalDeathContinuity([sourceGoal, { ...successorGoal, person: deceasedId }], [undertaken], [deceased, successor], refs).includes('goal-death-successor-not-distinct'))
check('successor field is mandatory only for undertaking', validateGoalDeathContinuity([sourceGoal], [
  { ...historical, outcome: 'undertaken', dispositionEvent: decisionEvent },
], [deceased, successor], refs).includes('goal-death-successor-field-mismatch'))
check('duplicate disposition for one goal rejected', validateGoalDeathContinuity([sourceGoal], [historical, { ...historical, id: brandedId<'GoalDeathDispositionId'>('duplicate') }], [deceased, successor], refs).includes('goal-death-disposition-duplicate-goal'))
check('duplicate successor goal claims rejected', validateGoalDeathContinuity([sourceGoal, successorGoal], [
  undertaken, { ...undertaken, id: brandedId<'GoalDeathDispositionId'>('duplicate-undertaking'), goal: brandedId<'GoalId'>('goal-other-source') },
], [deceased, successor], refs).includes('goal-death-disposition-duplicate-successor'))
check('living person cannot have goal closed by death', validateGoalDeathContinuity([{ ...successorGoal, status: 'closed-by-death' }], [], [successor], refs).includes('goal-death-living-person-closed-goal'))
check('validation does not mutate goals or people', sourceGoal.status === 'closed-by-death' && deceased.lifeState === 'dead' && historical.outcome === 'historical')

if (failed > 0) throw new Error('Goal death continuity tests failed: ' + failed + '/' + (passed + failed))
console.log('Goal death continuity contracts: ' + passed + '/' + (passed + failed) + ' passed')
