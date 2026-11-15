import { brandedId, field } from '../index'
import type {
  EventId, GoalDeathDispositionId, GoalDeathInventoryEntryId, GoalDeathInventoryId,
  GoalId, GoalStatusTransitionId, PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Goal, GoalDeathDisposition, GoalStatusTransition } from './model'
import {
  validateGoalDeathInventory,
  isGoalDeathInventoryReadyForSettlement,
  type GoalDeathInventory,
  type GoalDeathInventoryEntry,
  type GoalDeathInventoryOutcome,
} from './death-inventory'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}

const deceasedId = brandedId<'PersonId'>('inventory-deceased')
const successorId = brandedId<'PersonId'>('inventory-successor')
const otherId = brandedId<'PersonId'>('inventory-other')
const activeId = brandedId<'GoalId'>('inventory-active')
const achievedId = brandedId<'GoalId'>('inventory-achieved')
const historicalId = brandedId<'GoalId'>('inventory-historical')
const successorGoalId = brandedId<'GoalId'>('inventory-successor-goal')
const startEvent = brandedId<'EventId'>('inventory-start')
const deathEvent = brandedId<'EventId'>('inventory-death')
const afterDeath = brandedId<'EventId'>('inventory-after-death')
const reviewEvent = brandedId<'EventId'>('inventory-review')
const achievedEvent = brandedId<'EventId'>('inventory-achieved-event')
const beforeDeath: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 5, period: '午' }
const afterAt: WorldTime = { day: 6, period: '晨' }
const reviewAt: WorldTime = { day: 7, period: '午' }
const refs = {
  events: [startEvent, deathEvent, afterDeath, reviewEvent, achievedEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [startEvent, beforeDeath], [deathEvent, deathAt], [afterDeath, afterAt],
    [reviewEvent, reviewAt], [achievedEvent, { day: 3, period: '午' }],
  ]),
}
function person(id: PersonId, dead: boolean): Person {
  return {
    id, displayName: String(id), birth: field.notApplicable,
    lifeState: dead ? 'dead' : 'alive', archiveState: 'active',
    death: dead ? field.value({ at: deathAt, causeEvent: deathEvent, estateSettlements: [] }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>('cap-' + id),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body-' + id), mind: brandedId<'MindScopeRef'>('mind-' + id),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge-' + id),
      goals: id === deceasedId ? [activeId, achievedId, historicalId] : id === successorId ? [successorGoalId] : [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id),
      location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}
const deceased = person(deceasedId, true)
const successor = person(successorId, false)
const other = person(otherId, false)
function goal(id: GoalId, owner: PersonId, status: Goal['status'], source = startEvent): Goal {
  return {
    id, person: owner, statement: '修复东堤险段', priority: 5, status,
    sourceEvent: source, visibility: { observer: 'player', level: 'private' },
  }
}
const activeGoal = goal(activeId, deceasedId, 'closed-by-death')
const achievedGoal = goal(achievedId, deceasedId, 'achieved')
const historicalGoal = goal(historicalId, deceasedId, 'closed-by-death')
const successorGoal = goal(successorGoalId, successorId, 'active', afterDeath)
const transition: GoalStatusTransition = {
  id: brandedId<'GoalStatusTransitionId'>('inventory-transition'),
  goal: achievedId, fromStatus: 'active', toStatus: 'achieved', event: achievedEvent,
}
const historical: GoalDeathDisposition = {
  id: brandedId<'GoalDeathDispositionId'>('inventory-historical-disposition'),
  goal: historicalId, deceased: deceasedId, deathEvent, dispositionEvent: deathEvent,
  outcome: 'historical', successorGoal: field.notApplicable,
}
const undertaken: GoalDeathDisposition = {
  id: brandedId<'GoalDeathDispositionId'>('inventory-undertaken-disposition'),
  goal: activeId, deceased: deceasedId, deathEvent, dispositionEvent: afterDeath,
  outcome: 'undertaken', successorGoal: field.value(successorGoalId),
}
function entry(id: string, goalId: GoalId, outcome: GoalDeathInventoryOutcome): GoalDeathInventoryEntry {
  return { id: brandedId<'GoalDeathInventoryEntryId'>(id), goal: goalId, outcome }
}
function inventory(goals: readonly GoalDeathInventoryEntry[], status: GoalDeathInventory['status'] = 'complete'): GoalDeathInventory {
  return {
    id: brandedId<'GoalDeathInventoryId'>('goal-death-inventory'),
    deceased: deceasedId, deathEvent, inventoryEvent: reviewEvent, status, goals,
  }
}
const allGoals = [activeGoal, achievedGoal, historicalGoal, successorGoal]
const allDispositions = [historical, undertaken]
const entries = [
  entry('active-undertaken', activeId, 'undertaken'),
  entry('completed-before-death', achievedId, 'terminal-before-death'),
  entry('historical-unfinished', historicalId, 'historical'),
]
const valid = inventory(entries)
const issues = validateGoalDeathInventory(valid, allGoals, allDispositions, [transition], [deceased, successor, other], refs)

check('complete inventory covers all deceased NPC goals and mixed outcomes', issues.length === 0)
check('valid complete inventory is settlement-ready', isGoalDeathInventoryReadyForSettlement(valid, issues))
check('ordinary achieved goal needs an event-backed pre-death transition', validateGoalDeathInventory(
  inventory([entry('bad-terminal', achievedId, 'terminal-before-death')]),
  allGoals, allDispositions, [], [deceased, successor], refs,
).includes('goal-death-inventory-terminal-evidence-mismatch'))
check('active goal cannot be classified as terminal-before-death', validateGoalDeathInventory(
  inventory([entry('bad-active', activeId, 'terminal-before-death')]),
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-terminal-evidence-mismatch'))
check('death disposition must match each inventory outcome', validateGoalDeathInventory(
  inventory([entry('wrong-outcome', activeId, 'failed')]),
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-disposition-mismatch'))
check('undertaking requires distinct successor goal', validateGoalDeathInventory(
  valid, [activeGoal, achievedGoal, historicalGoal], allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-successor-goal-missing'))
check('successor goal must be independently owned by a living person', validateGoalDeathInventory(
  valid, allGoals, [{ ...undertaken, successorGoal: field.value(activeId) }, historical],
  [transition], [deceased, successor], refs,
).includes('goal-death-successor-same-goal'))
check('terminal transition must occur before death', validateGoalDeathInventory(
  valid, allGoals, allDispositions, [{ ...transition, event: afterDeath }], [deceased, successor], refs,
).includes('goal-status-transition-owner-not-alive'))
check('complete inventory must cover every deceased NPC goal', validateGoalDeathInventory(
  inventory(entries.slice(0, 2)), allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-coverage-mismatch'))
check('empty complete inventory is an explicit reviewed empty scope', validateGoalDeathInventory(
  inventory([]), [successorGoal], [], [], [deceased, successor], refs,
).length === 0)
check('open inventory cannot be settlement-ready', !isGoalDeathInventoryReadyForSettlement(inventory([], 'open'), []))
check('challenged inventory cannot be settlement-ready', !isGoalDeathInventoryReadyForSettlement(inventory([], 'challenged'), []))
check('pending item cannot be settlement-ready', !isGoalDeathInventoryReadyForSettlement(
  inventory([entry('pending', activeId, 'pending')]), [],
))
check('review event must exist', validateGoalDeathInventory(
  { ...valid, inventoryEvent: brandedId<'EventId'>('missing-review') },
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-review-event-missing'))
check('review event cannot predate death', validateGoalDeathInventory(
  { ...valid, inventoryEvent: startEvent },
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-before-death'))
check('death event must match death record', validateGoalDeathInventory(
  { ...valid, deathEvent: startEvent },
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-death-event-mismatch'))
check('duplicate inventory entries rejected', validateGoalDeathInventory(
  inventory([entries[0], { ...entries[0], id: brandedId<'GoalDeathInventoryEntryId'>('duplicate') }]),
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-goal-reference-duplicate'))
check('duplicate source goal IDs rejected', validateGoalDeathInventory(
  valid, [...allGoals, activeGoal], allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-input-goal-duplicate-id'))
check("entry for another person's goal rejected", validateGoalDeathInventory(
  inventory([entry('foreign', successorGoalId, 'terminal-before-death')]),
  allGoals, allDispositions, [transition], [deceased, successor], refs,
).includes('goal-death-inventory-goal-owner-mismatch'))
check('ordinary terminal and death disposition cannot be double expressed', validateGoalDeathInventory(
  valid, allGoals, [...allDispositions, { ...undertaken, goal: achievedId, outcome: 'abandoned' }],
  [transition], [deceased, successor], refs,
).includes('goal-status-transition-death-disposition-conflict'))
check('validator does not mutate goal or person records', activeGoal.status === 'closed-by-death'
  && achievedGoal.status === 'achieved' && deceased.lifeState === 'dead')

if (failed > 0) throw new Error('Goal death inventory contracts failed: ' + failed + '/' + (passed + failed))
console.log('Goal death inventory contracts: ' + passed + '/' + (passed + failed) + ' passed')
