import {
  brandedId,
  type WorldTime,
} from '../src/domain'
import {
  createInMemoryWorldAdapter,
  createGoalCreatedEventInput,
  createScheduleEntryPlannedEventInput,
  initializeWorldThroughPorts,
  toLedgerEventInput,
  createDeterministicWorldScheduler,
  createScheduleTaskSource,
} from '../src/application'
import type { WorldBootstrapRequest, WorldCommandPort } from '../src/application'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world-deterministic-scheduler-test')
const start: WorldTime = { day: 1, period: '晨' }
const due: WorldTime = { day: 2, period: '午' }
const request: WorldBootstrapRequest = {
  worldId,
  seed: 'scheduler-test-seed',
  scenarioPackId: 'scenario:scheduler-test',
  rulesetVersion: 'ruleset-scheduler-1',
  contentPackVersion: 'content-scheduler-1',
  worldTime: start,
  locationCode: 'scheduler-county',
  roleSlots: [{ roleCode: 'county-clerk', tier: 'county', minCount: 1, maxCount: 1 }],
  namePool: { surnames: ['王'], givenNames: ['守仁'] },
  historicalMinisters: [],
}

async function main(): Promise<void> {
  const adapter = createInMemoryWorldAdapter({ worldId, worldStartTime: start })
  const initialized = await initializeWorldThroughPorts(request, adapter)
  check('scheduler fixture world initializes through canonical application ports', initialized.status === 'ready')
  if (initialized.status !== 'ready') throw new Error('scheduler-test-world-initialization-failed')

  const beforePlan = (await adapter.queries.read(worldId))!
  const person = beforePlan.persons[0]!
  const scheduleId = brandedId<'ScheduleId'>('schedule:scheduler-test:afternoon-duty')
  const planned = toLedgerEventInput(createScheduleEntryPlannedEventInput({
    id: scheduleId,
    scope: person.stateDomains.scheduleScope,
    person: person.id,
    day: due.day,
    period: due.period,
    action: brandedId<'ActionRef'>('action:scheduler-test:county-duty'),
    place: brandedId<'PlaceId'>('place:scheduler-test:county-office'),
    visibility: { observer: 'player', level: 'private' },
  }, {
    actor: 'system',
    source: 'schedule',
    requestWorldTime: start,
    clientRequestId: 'scheduler-test:plan-afternoon-duty',
  }))
  const planReceipt = await adapter.commands.submit({
    worldId,
    clientRequestId: planned.clientRequestId,
    actor: 'system',
    source: 'schedule',
    intentKind: planned.intentKind,
    requestedAt: planned.requestWorldTime,
    expectedHead: beforePlan.streamHead,
    payload: planned.payload,
  })
  check('schedule plan is recorded before simulation', planReceipt.status === 'committed')
  if (planReceipt.status !== 'committed') throw new Error('scheduler-test-plan-not-committed')

  const goalId = brandedId<'GoalId'>('goal:scheduler-test:complete-duty')
  const goal = toLedgerEventInput(createGoalCreatedEventInput({
    id: goalId,
    person: person.id,
    statement: '完成县衙当值',
    priority: 3,
    visibility: { observer: 'player', level: 'private' },
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: due,
    clientRequestId: 'scheduler-test:action:complete-duty',
  }))
  let rejectFirstSettlement = true
  const commands: WorldCommandPort = {
    async submit(command) {
      if (command.intentKind === 'schedule.entry.execution.recorded' && rejectFirstSettlement) {
        rejectFirstSettlement = false
        const current = await adapter.queries.read(worldId)
        return {
          status: 'rejected',
          worldId: command.worldId,
          clientRequestId: command.clientRequestId,
          reason: 'test-transient-settlement-failure',
          streamHead: current!.streamHead,
        }
      }
      return adapter.commands.submit(command)
    },
  }
  const scheduler = createDeterministicWorldScheduler({
    commands,
    queries: adapter.queries,
    tasks: createScheduleTaskSource({
      resolve(entry, aggregate, lod) {
        return entry.id === scheduleId && lod === 'near-field' && aggregate.worldId === worldId
          ? { actor: 'system', intentKind: goal.intentKind, payload: goal.payload, priority: 10 }
          : null
      },
    }),
  })

  const deferredLod = await scheduler.advance({
    worldId,
    from: start,
    to: due,
    lod: 'remote-world',
    maxEvents: 2,
  })
  check('LOD resolver can defer a local schedule without advancing or writing facts',
    deferredLod.status === 'unchanged'
    && adapter.readLedger().head === planReceipt.streamHead.seq)

  const first = await scheduler.advance({
    worldId,
    from: start,
    to: due,
    lod: 'near-field',
    maxEvents: 2,
  })
  if (first.status !== 'partial') throw new Error(`scheduler-test-expected-partial-result:${JSON.stringify(first)}`)
  const firstActionEventId = first.emittedEventIds[0]
  if (!firstActionEventId) throw new Error('scheduler-test-action-event-id-missing')
  const afterPartial = (await adapter.queries.read(worldId))!
  check('scheduler reports a resumable partial result when settlement fails after action commit',
    first.status === 'partial'
    && first.pendingTaskIds.includes(`schedule:${scheduleId}`)
    && first.emittedEventIds.length === 1
    && afterPartial.planning.goals.some(item => item.id === goalId)
    && afterPartial.planning.scheduleEntries[0]?.execution.kind === 'n/a')

  const resumed = await scheduler.advance({
    worldId,
    from: afterPartial.worldTime,
    to: { day: 2, period: '暮' },
    lod: 'near-field',
    maxEvents: 2,
  })
  const final = (await adapter.queries.read(worldId))!
  check('retry reuses the stable action request and commits exactly one schedule settlement',
    resumed.status === 'advanced'
    && resumed.emittedEventIds.length === 2
    && final.planning.goals.filter(item => item.id === goalId).length === 1
    && final.planning.scheduleEntries[0]?.execution.kind === 'value'
    && final.planning.scheduleEntries[0]?.execution.value === firstActionEventId
    && adapter.readLedger().head === afterPartial.streamHead.seq + 1)

  const stale = await scheduler.advance({
    worldId,
    from: start,
    to: due,
    lod: 'near-field',
    maxEvents: 2,
  })
  check('scheduler rejects stale time windows rather than replaying an old simulation interval',
    stale.status === 'rejected' && stale.reason === 'world-simulation-stale-from-time')

  if (failed > 0) throw new Error(`Deterministic world scheduler tests failed: ${failed}/${passed + failed}`)
  console.log(`Deterministic world scheduler tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => {
  console.error(error)
  throw error
})
