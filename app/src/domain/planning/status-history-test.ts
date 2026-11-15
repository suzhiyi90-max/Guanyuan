import { brandedId, field } from '../index'
import type { EventId, GoalId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Goal, GoalDeathDisposition, GoalStatusTransition } from './model'
import { validateGoalStatusHistory } from './status-history'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}

const ownerId = brandedId<'PersonId'>('goal-history-owner')
const deceasedId = brandedId<'PersonId'>('goal-history-deceased')
const goalId = brandedId<'GoalId'>('goal-history-goal')
const deadGoalId = brandedId<'GoalId'>('goal-history-dead-goal')
const sourceEvent = brandedId<'EventId'>('goal-history-source')
const transitionEvent = brandedId<'EventId'>('goal-history-transition')
const deathEvent = brandedId<'EventId'>('goal-history-death')
const dispositionEvent = brandedId<'EventId'>('goal-history-disposition')
const sourceAt: WorldTime = { day: 1, period: '晨' }
const transitionAt: WorldTime = { day: 2, period: '午' }
const deathAt: WorldTime = { day: 3, period: '午' }
const dispositionAt: WorldTime = { day: 4, period: '晨' }
const refs = {
  events: [sourceEvent, transitionEvent, deathEvent, dispositionEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [sourceEvent, sourceAt], [transitionEvent, transitionAt],
    [deathEvent, deathAt], [dispositionEvent, dispositionAt],
  ]),
}

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
      goals: id === ownerId ? [goalId] : id === deceasedId ? [deadGoalId] : [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id),
      location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}

const owner = person(ownerId)
const deceased = person(deceasedId, true)
const activeGoal: Goal = {
  id: goalId, person: ownerId, statement: '完成河堤修复', priority: 5,
  status: 'active', sourceEvent, visibility: { observer: 'player', level: 'private' },
}
const achievedGoal: Goal = { ...activeGoal, status: 'achieved' }
const transition: GoalStatusTransition = {
  id: brandedId<'GoalStatusTransitionId'>('goal-history-transition-id'),
  goal: goalId, fromStatus: 'active', toStatus: 'achieved', event: transitionEvent,
}
const deadGoal: Goal = {
  ...activeGoal, id: deadGoalId, person: deceasedId, status: 'abandoned',
}
const deathDisposition: GoalDeathDisposition = {
  id: brandedId<'GoalDeathDispositionId'>('goal-history-death-disposition'),
  goal: deadGoalId, deceased: deceasedId, deathEvent, dispositionEvent,
  outcome: 'abandoned', successorGoal: field.notApplicable,
}

check('active goal without transition passes', validateGoalStatusHistory(
  [activeGoal], [], [owner], [], refs,
).length === 0)
check('ordinary terminal goal requires a transition', validateGoalStatusHistory(
  [achievedGoal], [], [owner], [], refs,
).includes('goal-status-history-missing-terminal-transition'))
check('matching achieved transition passes', validateGoalStatusHistory(
  [achievedGoal], [transition], [owner], [], refs,
).length === 0)
check('transition must follow goal source event', validateGoalStatusHistory(
  [achievedGoal], [{ ...transition, event: sourceEvent }], [owner], [], refs,
).includes('goal-status-transition-not-after-source'))
check('transition event must exist', validateGoalStatusHistory(
  [achievedGoal], [transition], [owner], [], { ...refs, events: [sourceEvent] },
).includes('goal-status-transition-event-missing'))
check('transition event time must be valid', validateGoalStatusHistory(
  [achievedGoal], [transition], [owner], [], {
    ...refs, eventTimes: new Map(refs.eventTimes).set(transitionEvent, { day: 0, period: '午' } as WorldTime),
  },
).includes('goal-status-transition-event-time-invalid'))
check('goal snapshot must match final transition', validateGoalStatusHistory(
  [{ ...achievedGoal, status: 'failed' }], [transition], [owner], [], refs,
).includes('goal-status-transition-status-mismatch'))
check('transition from a non-active state is rejected', validateGoalStatusHistory(
  [achievedGoal], [{ ...transition, fromStatus: 'abandoned' as never }], [owner], [], refs,
).includes('goal-status-transition-invalid-from-status'))
check('closed-by-death cannot use ordinary transition', validateGoalStatusHistory(
  [{ ...achievedGoal, status: 'closed-by-death' }], [transition], [owner], [], refs,
).includes('goal-status-transition-invalid-to-status'))
check('living person cannot have death disposition', validateGoalStatusHistory(
  [achievedGoal], [transition], [owner], [deathDisposition], refs,
).includes('goal-status-transition-death-disposition-conflict'))
check('goal abandoned by death disposition needs no ordinary transition', validateGoalStatusHistory(
  [deadGoal], [], [deceased], [deathDisposition], refs,
).length === 0)
check('duplicate transition id rejected', validateGoalStatusHistory(
  [achievedGoal], [transition, transition], [owner], [], refs,
).includes('goal-status-transition-duplicate-id'))
check('multiple transitions for one goal rejected', validateGoalStatusHistory(
  [achievedGoal], [transition, { ...transition, id: brandedId<'GoalStatusTransitionId'>('second') }], [owner], [], refs,
).includes('goal-status-transition-duplicate-goal'))
check('transition after owner death rejected', validateGoalStatusHistory(
  [achievedGoal], [{ ...transition, event: dispositionEvent }], [deceased], [], refs,
).includes('goal-status-transition-owner-not-alive'))
check('dead goal without death disposition still requires history', validateGoalStatusHistory(
  [deadGoal], [], [deceased], [], refs,
).includes('goal-status-history-missing-terminal-transition'))
check('validation is read-only', activeGoal.status === 'active' && transition.toStatus === 'achieved')

if (failed > 0) throw new Error('Goal status history tests failed: ' + failed + '/' + (passed + failed))
console.log('Goal status history contracts: ' + passed + '/' + (passed + failed) + ' passed')
