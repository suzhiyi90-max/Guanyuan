import {
  brandedId,
  field,
  type WorldTime,
} from '../src/domain'
import {
  createInMemoryWorldAdapter,
  createGoalCreatedEventInput,
  createScheduleEntryPlannedEventInput,
  createLifeStateFactRecordedEventInput,
  initializeWorldThroughPorts,
  toLedgerEventInput,
  createDeterministicWorldScheduler,
  createScheduleTaskSource,
  createCompositeWorldSimulationTaskSource,
  createLifeStateMaintenanceTaskSource,
} from '../src/application'
import type { WorldBootstrapRequest, WorldCommandPort } from '../src/application'
import { resolveWorldSimulationPolicies, validateWorldSimulationRuleset } from '../src/application'

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
const lateTime: WorldTime = { day: 2, period: '暮' }
const nextMorning: WorldTime = { day: 3, period: '晨' }
const maintenanceTime: WorldTime = { day: 4, period: '晨' }
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
  const compositeQueue = createCompositeWorldSimulationTaskSource(
    {
      listDueTasks: () => [{
        taskId: 'rule:later',
        requestId: 'rule:later',
        dueAt: lateTime,
        priority: 1,
        actor: 'system',
        source: 'rule' as const,
        intentKind: 'goal.create',
        payload: {},
      }],
    },
    {
      listDueTasks: () => [{
        taskId: 'rule:earlier',
        requestId: 'rule:earlier',
        dueAt: start,
        priority: 1,
        actor: 'system',
        source: 'rule' as const,
        intentKind: 'goal.create',
        payload: {},
      }],
    },
  )
  const compositeTasks = await compositeQueue.listDueTasks({
    worldId,
    from: start,
    to: lateTime,
    lod: 'near-field',
    maxEvents: 4,
  }, beforePlan)
  check('composite task sources merge and sort deterministically independent of source order',
    compositeTasks.map(task => task.taskId).join(',') === 'rule:earlier,rule:later')

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
    requestWorldTime: lateTime,
    clientRequestId: 'scheduler-test:action:complete-duty',
  }))
  let rejectFirstSettlement = true
  const commands: WorldCommandPort = {
    async submit(command) {
      if (command.intentKind === 'schedule.entry.execution' && rejectFirstSettlement) {
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

  const budgetDeferred = await scheduler.advance({
    worldId,
    from: start,
    to: lateTime,
    lod: 'near-field',
    maxEvents: 2,
  })
  const beforeBudgetAdvance = (await adapter.queries.read(worldId))!
  check('event budget reserves the clock append and leaves unprocessed schedules untouched',
    budgetDeferred.status === 'partial'
    && budgetDeferred.pendingTaskIds.includes(`schedule:${scheduleId}`)
    && beforeBudgetAdvance.worldTime.day === start.day
    && beforeBudgetAdvance.worldTime.period === start.period
    && beforeBudgetAdvance.streamHead.seq === planReceipt.streamHead.seq)

  const deferredLod = await scheduler.advance({
    worldId,
    from: start,
    to: lateTime,
    lod: 'remote-world',
    maxEvents: 2,
  })
  const afterRemoteTick = (await adapter.queries.read(worldId))!
  check('remote LOD advances the canonical clock while deferring local schedule facts',
    deferredLod.status === 'advanced'
    && afterRemoteTick.worldTime.day === lateTime.day
    && afterRemoteTick.worldTime.period === lateTime.period
    && afterRemoteTick.planning.scheduleEntries[0]?.execution.kind === 'n/a'
    && afterRemoteTick.planning.goals.every(item => item.id !== goalId))
  const unknownScheduleAggregate = {
    ...afterRemoteTick,
    planning: {
      ...afterRemoteTick.planning,
      scheduleEntries: afterRemoteTick.planning.scheduleEntries.map(entry => ({
        ...entry,
        execution: field.unknown,
      })),
    },
  }
  const unknownScheduleTasks = await createScheduleTaskSource({
    resolve: () => ({ actor: 'system', intentKind: goal.intentKind, payload: goal.payload, priority: 10 }),
  }).listDueTasks({
    worldId,
    from: lateTime,
    to: nextMorning,
    lod: 'near-field',
    maxEvents: 3,
  }, unknownScheduleAggregate)
  check('unknown schedule settlement state is never assumed to mean pending execution',
    unknownScheduleTasks.length === 0)

  const repeatedRemoteTick = await scheduler.advance({
    worldId,
    from: start,
    to: lateTime,
    lod: 'remote-world',
    maxEvents: 2,
  })
  check('repeating an already committed clock interval is idempotent',
    repeatedRemoteTick.status === 'unchanged'
    && repeatedRemoteTick.streamHead.seq === afterRemoteTick.streamHead.seq)

  const first = await scheduler.advance({
    worldId,
    from: lateTime,
    to: nextMorning,
    lod: 'near-field',
    maxEvents: 3,
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
    to: nextMorning,
    lod: 'near-field',
    maxEvents: 3,
  })
  const final = (await adapter.queries.read(worldId))!
  check('retry reuses the stable action request and commits exactly one schedule settlement',
    resumed.status === 'advanced'
    && resumed.emittedEventIds.length === 3
    && final.planning.goals.filter(item => item.id === goalId).length === 1
    && final.planning.scheduleEntries[0]?.execution.kind === 'value'
    && final.planning.scheduleEntries[0]?.execution.value === firstActionEventId
    && adapter.readLedger().head === afterPartial.streamHead.seq + 2)

  const stale = await scheduler.advance({
    worldId,
    from: start,
    to: due,
    lod: 'near-field',
    maxEvents: 2,
  })
  check('scheduler rejects stale time windows rather than replaying an old simulation interval',
    stale.status === 'rejected' && stale.reason === 'world-simulation-stale-from-time')

  const beforeMaintenance = (await adapter.queries.read(worldId))!
  const baselineFactId = brandedId<'LifeStateFactId'>('life-state:scheduler:baseline-stamina')
  const baselineInput = toLedgerEventInput(createLifeStateFactRecordedEventInput({
    id: baselineFactId,
    person: person.id,
    domain: 'body',
    scope: person.stateDomains.body,
    dimension: 'stamina',
    value: field.value({ kind: 'qualitative', code: 'test-baseline' }),
    supersedes: field.notApplicable,
    visibility: { observer: 'player', level: 'private' },
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: nextMorning,
    clientRequestId: 'scheduler-test:life-state:baseline',
  }))
  const baselineReceipt = await adapter.commands.submit({
    worldId,
    clientRequestId: baselineInput.clientRequestId,
    actor: 'system',
    source: 'rule',
    intentKind: baselineInput.intentKind,
    requestedAt: nextMorning,
    expectedHead: beforeMaintenance.streamHead,
    payload: baselineInput.payload,
  })
  check('life-state maintenance fixture records its prior fact through the command port',
    baselineReceipt.status === 'committed')

  const maintainedFactId = brandedId<'LifeStateFactId'>('life-state:scheduler:maintained-stamina')
  let maintenanceResolverCalls = 0
  const maintenanceSource = createLifeStateMaintenanceTaskSource({
    resolve({ person: target, previousFact }) {
      maintenanceResolverCalls += 1
      return {
        priority: 7,
        fact: {
          id: maintainedFactId,
          person: target.id,
          domain: 'body',
          scope: target.stateDomains.body,
          dimension: 'stamina',
          value: field.value({ kind: 'qualitative', code: 'test-maintained' }),
          supersedes: field.value(previousFact.id),
          visibility: { observer: 'player', level: 'private' },
        },
      }
    },
  })
  const maintenanceScheduler = createDeterministicWorldScheduler({
    commands: adapter.commands,
    queries: adapter.queries,
    tasks: maintenanceSource,
  })
  const maintenanceResult = await maintenanceScheduler.advance({
    worldId,
    from: nextMorning,
    to: maintenanceTime,
    lod: 'near-field',
    maxEvents: 2,
  })
  const afterMaintenance = (await adapter.queries.read(worldId))!
  check('life-state maintenance commits a superseding fact and advances the clock through the scheduler',
    maintenanceResult.status === 'advanced'
    && afterMaintenance.life.stateFacts.some(fact => fact.id === maintainedFactId
      && fact.supersedes.kind === 'value' && fact.supersedes.value === baselineFactId
      && fact.sourceEvent === maintenanceResult.emittedEventIds[0]
      && fact.at.day === maintenanceTime.day && fact.at.period === maintenanceTime.period)
    && afterMaintenance.worldTime.day === maintenanceTime.day
    && afterMaintenance.worldTime.period === maintenanceTime.period)

  const callsBeforeSameTickRetry = maintenanceResolverCalls
  const sameTickTasks = await maintenanceSource.listDueTasks({
    worldId,
    from: maintenanceTime,
    to: maintenanceTime,
    lod: 'near-field',
    maxEvents: 2,
  }, afterMaintenance)
  check('life-state maintenance does not generate a second fact for an already-maintained tick',
    sameTickTasks.length === 0 && maintenanceResolverCalls === callsBeforeSameTickRetry)

  const policyRuleset = {
    schemaVersion: 'w6-simulation-policy/1' as const,
    rulesetId: 'county-simulation',
    revision: '2026-11-18.1',
    maxEvents: 12,
    rules: [
      {
        policyId: 'l0-nearfield-goal',
        level: 'L0' as const,
        source: 'rule' as const,
        intentKind: 'goal.create',
        priority: 8,
        lods: ['near-field'] as const,
        enabled: true,
      },
      {
        policyId: 'l2-regional-schedule',
        level: 'L2' as const,
        source: 'schedule' as const,
        intentKind: 'schedule.entry.execution',
        priority: 3,
        lods: ['regional'] as const,
        enabled: true,
      },
    ],
  }
  check('versioned simulation ruleset accepts explicit selectors and resource budget',
    validateWorldSimulationRuleset(policyRuleset).length === 0)
  const policyResolution = resolveWorldSimulationPolicies(policyRuleset, [
    { candidateId: 'candidate:near', level: 'L0', source: 'rule', intentKind: 'goal.create', lod: 'near-field', payload: {} },
    { candidateId: 'candidate:defer', level: 'L0', source: 'rule', intentKind: 'goal.create', lod: 'remote-world', payload: {} },
    { candidateId: 'candidate:unknown-level', level: 'L4', source: 'rule', intentKind: 'goal.create', lod: 'near-field', payload: {} },
    { candidateId: 'candidate:unsupported', level: 'L1', source: 'rule', intentKind: 'unregistered.intent', lod: 'near-field', payload: {} },
    { candidateId: 'candidate:unknown-source', level: 'L0', source: 'ai-candidate', intentKind: 'goal.create', lod: 'near-field', payload: {} },
  ])
  check('policy resolver accepts exact matches, defers disallowed LOD and rejects unknown/unsupported inputs',
    policyResolution.status === 'valid'
    && policyResolution.maxEvents === 12
    && policyResolution.decisions.find(item => item.candidateId === 'candidate:near')?.status === 'accepted'
    && policyResolution.decisions.find(item => item.candidateId === 'candidate:defer')?.status === 'deferred'
    && policyResolution.decisions.find(item => item.candidateId === 'candidate:unknown-level')?.status === 'rejected'
    && policyResolution.decisions.find(item => item.candidateId === 'candidate:unsupported')?.status === 'rejected'
    && policyResolution.decisions.find(item => item.candidateId === 'candidate:unknown-source')?.status === 'rejected')
  const conflictingRuleset = {
    ...policyRuleset,
    rules: [...policyRuleset.rules, { ...policyRuleset.rules[0]!, policyId: 'duplicate-selector' }],
  }
  const conflictResult = resolveWorldSimulationPolicies(conflictingRuleset, [])
  check('conflicting policy selectors invalidate the whole ruleset instead of choosing by array order',
    conflictResult.status === 'invalid-ruleset'
    && conflictResult.issues.includes('policy-selector-conflict'))
  const duplicateCandidates = resolveWorldSimulationPolicies(policyRuleset, [
    { candidateId: 'same-id', level: 'L0', source: 'rule', intentKind: 'goal.create', lod: 'near-field', payload: {} },
    { candidateId: 'same-id', level: 'L0', source: 'rule', intentKind: 'goal.create', lod: 'near-field', payload: {} },
  ])
  check('duplicate candidate identities are rejected rather than producing ambiguous task identity',
    duplicateCandidates.status === 'valid'
    && duplicateCandidates.decisions.every(item => item.status === 'rejected' && item.reason === 'candidate-identity-conflict'))

  const malformedCandidate = resolveWorldSimulationPolicies(policyRuleset, [
    { candidateId: ' ', level: 'L0', source: 'rule', intentKind: 'goal.create', lod: 'near-field', payload: {} },
  ])
  check('policy resolver rejects candidates without a stable identity',
    malformedCandidate.status === 'valid'
    && malformedCandidate.decisions[0]?.status === 'rejected'
    && malformedCandidate.decisions[0]?.reason === 'invalid-candidate-id')

  if (failed > 0) throw new Error(`Deterministic world scheduler tests failed: ${failed}/${passed + failed}`)
  console.log(`Deterministic world scheduler tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => {
  console.error(error)
  throw error
})
