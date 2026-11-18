import {
  brandedId,
  field,
  type StreamCursor,
  type WorldId,
  type WorldTime,
  type JsonValue,
} from '../src/domain'
import {
  createInMemoryWorldAdapter,
  createPersonCreatedEventInput,
  initializeWorldThroughPorts,
  toLedgerEventInput,
  createGoalCreatedEventInput,
  createGoalStatusChangedEventInput,
  createScheduleEntryPlannedEventInput,
  createDebtRecordedEventInput,
  createDebtSettledEventInput,
  createAssetRegisteredEventInput,
  createAssetRightGrantedEventInput,
  createAssetRightRevokedEventInput,
} from '../src/application'
import type { PersonCreationData, WorldBootstrapRequest, WorldCommandRequest } from '../src/application'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world-in-memory-adapter-test') as WorldId
const worldTime = { day: 1, period: '晨' } as const
const request: WorldBootstrapRequest = {
  worldId,
  seed: 'in-memory-adapter-seed',
  scenarioPackId: 'scenario:adapter-test',
  rulesetVersion: 'ruleset-adapter-1',
  contentPackVersion: 'content-adapter-1',
  worldTime,
  locationCode: 'adapter-county',
  roleSlots: [{ roleCode: 'county-runner', tier: 'county', minCount: 2, maxCount: 2 }],
  namePool: {
    surnames: ['王', '李', '张', '赵'],
    givenNames: ['守仁', '文远', '景初', '仲平'],
  },
  historicalMinisters: [{
    personId: brandedId<'PersonId'>('person:historical:adapter-minister'),
    displayName: '测试名臣',
    category: 'famous-minister',
    evidenceStatus: 'verified',
    evidenceRefs: ['source:test:minister'],
    validFrom: worldTime,
    validThrough: null,
    scope: { kind: 'world' },
  }],
}

async function main(): Promise<void> {
  const adapter = createInMemoryWorldAdapter({ worldId, worldStartTime: worldTime })
  let notifications = 0
  const unsubscribe = adapter.queries.subscribe(worldId, () => { notifications += 1 })

  const initialized = await initializeWorldThroughPorts(request, adapter)
  const aggregate = await adapter.queries.read(worldId)
  const ledger = adapter.readLedger()
  const initialPlayerView = await adapter.observerQueries.read(worldId, 'player')
  check('player-facing observer query does not expose unconnected bootstrap population',
    initialPlayerView !== null
    && initialPlayerView.self === null
    && initialPlayerView.knownPersons.length === 0)
  check('in-memory command adapter executes bootstrap through canonical ledger and replay',
    initialized.status === 'ready'
    && aggregate?.bootstrap?.seed === request.seed
    && aggregate.persons.length === 3
    && aggregate.personOrigins.filter(item => item.origin.kind === 'seeded-random').length === 2
    && aggregate.personOrigins.some(item => item.origin.kind === 'historical-minister')
    && ledger.head === 4)
  check('query subscribers are notified only after each valid committed event', notifications === 4)

  const repeated = await initializeWorldThroughPorts(request, adapter)
  if (repeated.status !== 'ready' || repeated.createdPersonIds.length !== 0
    || repeated.existingPersonCount !== 3 || adapter.readLedger().head !== 4) {
    console.error('Repeat initialization diagnostic:', JSON.stringify({
      repeated,
      bootstrap: aggregate?.bootstrap,
      persons: aggregate?.persons.map(person => ({ id: person.id, name: person.displayName })),
      origins: aggregate?.personOrigins,
      ledgerHead: adapter.readLedger().head,
    }))
  }
  check('repeated initialization observes the materialized world and appends no duplicate facts',
    repeated.status === 'ready'
    && repeated.createdPersonIds.length === 0
    && repeated.existingPersonCount === 3
    && adapter.readLedger().head === 4)

  const tail = ledger.events[ledger.events.length - 1]
  if (!tail) throw new Error('adapter-test-ledger-tail-missing')
  const staleCursor: StreamCursor = { kind: 'genesis', seq: 0 }
  const extraPerson: PersonCreationData = {
    id: brandedId<'PersonId'>('person:adapter:stale-command'),
    displayName: '不应写入的候选',
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>('cap:adapter:stale'),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body:adapter:stale'),
      mind: brandedId<'MindScopeRef'>('mind:adapter:stale'),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge:adapter:stale'),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>('schedule:adapter:stale'),
      economy: brandedId<'EconomyScopeId'>('economy:adapter:stale'),
      location: brandedId<'LocationStateRef'>('location:adapter:stale'),
    },
    history: brandedId<'LifeHistoryRef'>('history:adapter:stale'),
  }
  const eventInput = toLedgerEventInput(createPersonCreatedEventInput(extraPerson, {
    kind: 'seeded-random',
    candidateId: extraPerson.id,
    seedFingerprint: request.seed,
    roleCode: 'county-runner',
    populationTier: 'county',
  }, {
    actor: 'system',
    source: 'rule',
    requestWorldTime: worldTime,
    clientRequestId: 'adapter-stale-person-create',
  }))
  const conflict = await adapter.commands.submit({
    worldId,
    clientRequestId: eventInput.clientRequestId,
    actor: 'system',
    source: 'rule',
    intentKind: 'person.create',
    requestedAt: worldTime,
    expectedHead: staleCursor,
    payload: eventInput.payload,
  })
  check('stale expected-head command is rejected without appending or notifying',
    conflict.status === 'conflict'
    && adapter.readLedger().head === 4
    && notifications === 4)

  const unsupported = await adapter.commands.submit({
    worldId,
    clientRequestId: 'adapter-unsupported-command',
    actor: 'system',
    source: 'rule',
    intentKind: 'unregistered.intent',
    requestedAt: worldTime,
    expectedHead: aggregate!.streamHead,
    payload: {},
  })
  check('unregistered command intent cannot bypass the event catalogue', unsupported.status === 'rejected')

  const rebuilt = await adapter.projector.rebuild({
    ledger: adapter.readLedger(),
    target: aggregate!.streamHead,
  })
  check('public projector port independently rebuilds and validates the same aggregate',
    rebuilt.status === 'valid'
    && rebuilt.aggregate.persons.length === 3
    && rebuilt.aggregate.streamHead.seq === 4)

  async function submitInput(input: {
    readonly source: WorldCommandRequest['source']
    readonly clientRequestId: string
    readonly actor: string
    readonly intentKind: string
    readonly requestWorldTime: WorldTime
    readonly payload: JsonValue
  }) {
    const current = await adapter.queries.read(worldId)
    if (!current) throw new Error('adapter-world-query-missing')
    return adapter.commands.submit({
      worldId,
      clientRequestId: input.clientRequestId,
      actor: input.actor,
      source: input.source,
      intentKind: input.intentKind,
      requestedAt: input.requestWorldTime,
      expectedHead: current.streamHead,
      payload: input.payload,
    })
  }

  const people = (await adapter.queries.read(worldId))!.persons
  const actor = people[0]!
  const counterpart = people[1]!
  const goalId = brandedId<'GoalId'>('goal:adapter:independent-life')
  const goalEvent = toLedgerEventInput(createGoalCreatedEventInput({
    id: goalId,
    person: actor.id,
    statement: '积累足以安家的资财',
    priority: 2,
    visibility: { observer: 'player', level: 'private' },
  }, {
    actor: 'system', source: 'rule', requestWorldTime: worldTime, clientRequestId: 'adapter-goal-create',
  }))
  const goalReceipt = await submitInput({
    source: 'rule', clientRequestId: goalEvent.clientRequestId, actor: goalEvent.actor,
    intentKind: goalEvent.intentKind, requestWorldTime: goalEvent.requestWorldTime,
    payload: goalEvent.payload,
  })
  const nextMorning: WorldTime = { day: 2, period: '晨' }
  const goalStatusEvent = toLedgerEventInput(createGoalStatusChangedEventInput(goalId, 'achieved', {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-goal-achieve',
  }))
  const goalStatusReceipt = await submitInput({
    source: 'rule', clientRequestId: goalStatusEvent.clientRequestId, actor: goalStatusEvent.actor,
    intentKind: goalStatusEvent.intentKind, requestWorldTime: goalStatusEvent.requestWorldTime,
    payload: goalStatusEvent.payload,
  })

  const scheduleEvent = toLedgerEventInput(createScheduleEntryPlannedEventInput({
    id: brandedId<'ScheduleId'>('schedule:adapter:work-afternoon'),
    scope: actor.stateDomains.scheduleScope,
    person: actor.id,
    day: 2,
    period: '午',
    action: brandedId<'ActionRef'>('action:adapter:work'),
    place: brandedId<'PlaceId'>('place:adapter:county-office'),
    visibility: { observer: 'player', level: 'private' },
  }, {
    actor: 'system', source: 'schedule', requestWorldTime: nextMorning, clientRequestId: 'adapter-schedule-plan',
  }))
  const scheduleReceipt = await submitInput({
    source: 'schedule', clientRequestId: scheduleEvent.clientRequestId, actor: scheduleEvent.actor,
    intentKind: scheduleEvent.intentKind, requestWorldTime: scheduleEvent.requestWorldTime,
    payload: scheduleEvent.payload,
  })

  const debtId = brandedId<'DebtId'>('debt:adapter:personal-loan')
  const debtEvent = toLedgerEventInput(createDebtRecordedEventInput({
    id: debtId,
    creditor: actor.id,
    debtor: counterpart.id,
    principal: 20,
    kind: 'personal-loan',
  }, {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-debt-record',
  }))
  const debtReceipt = await submitInput({
    source: 'rule', clientRequestId: debtEvent.clientRequestId, actor: debtEvent.actor,
    intentKind: debtEvent.intentKind, requestWorldTime: debtEvent.requestWorldTime,
    payload: debtEvent.payload,
  })
  const debtSettleEvent = toLedgerEventInput(createDebtSettledEventInput(debtId, {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-debt-settle',
  }))
  const debtSettleReceipt = await submitInput({
    source: 'rule', clientRequestId: debtSettleEvent.clientRequestId, actor: debtSettleEvent.actor,
    intentKind: debtSettleEvent.intentKind, requestWorldTime: debtSettleEvent.requestWorldTime,
    payload: debtSettleEvent.payload,
  })

  const assetId = brandedId<'AssetId'>('asset:adapter:small-field')
  const assetEvent = toLedgerEventInput(createAssetRegisteredEventInput({
    id: assetId,
    kind: '田地',
    quantity: 1,
    custody: field.value(actor.id),
    valuation: field.value(100),
  }, {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-asset-register',
  }))
  const assetReceipt = await submitInput({
    source: 'rule', clientRequestId: assetEvent.clientRequestId, actor: assetEvent.actor,
    intentKind: assetEvent.intentKind, requestWorldTime: assetEvent.requestWorldTime,
    payload: assetEvent.payload,
  })
  const grantId = brandedId<'RightGrantId'>('right:adapter:asset-owner')
  const grantEvent = toLedgerEventInput(createAssetRightGrantedEventInput(assetId, 'ownership', {
    id: grantId,
    holder: actor.id,
    scope: 'asset:adapter:small-field',
    revocable: true,
    transferable: true,
    expires: field.notApplicable,
  }, {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-asset-right-grant',
  }))
  const grantReceipt = await submitInput({
    source: 'rule', clientRequestId: grantEvent.clientRequestId, actor: grantEvent.actor,
    intentKind: grantEvent.intentKind, requestWorldTime: grantEvent.requestWorldTime,
    payload: grantEvent.payload,
  })
  const revokeEvent = toLedgerEventInput(createAssetRightRevokedEventInput(grantId, {
    actor: 'system', source: 'rule', requestWorldTime: nextMorning, clientRequestId: 'adapter-asset-right-revoke',
  }))
  const revokeReceipt = await submitInput({
    source: 'rule', clientRequestId: revokeEvent.clientRequestId, actor: revokeEvent.actor,
    intentKind: revokeEvent.intentKind, requestWorldTime: revokeEvent.requestWorldTime,
    payload: revokeEvent.payload,
  })

  const fullyUpdated = await adapter.queries.read(worldId)
  check('adapter command map executes goal, schedule, debt and asset-right intents through replay',
    [goalReceipt, goalStatusReceipt, scheduleReceipt, debtReceipt, debtSettleReceipt, assetReceipt, grantReceipt, revokeReceipt]
      .every(receipt => receipt.status === 'committed')
    && fullyUpdated?.planning.goals.find(item => item.id === goalId)?.status === 'achieved'
    && fullyUpdated.planning.scheduleEntries.length === 1
    && fullyUpdated.economy.debts.find(item => item.id === debtId)?.status === 'settled'
    && fullyUpdated.economy.assets.find(item => item.id === assetId)?.rights.ownership.length === 1
    && fullyUpdated.economy.assets.find(item => item.id === assetId)?.owner.kind === 'n/a')
  check('adapter publishes every newly committed command to subscribers',
    notifications === 12
    && adapter.readLedger().head === 12)

  const finalReplay = await adapter.projector.rebuild({
    ledger: adapter.readLedger(),
    target: (await adapter.queries.read(worldId))!.streamHead,
  })
  check('new planning and economy commands survive an independent full replay',
    finalReplay.status === 'valid'
    && finalReplay.aggregate.planning.goals.find(item => item.id === goalId)?.status === 'achieved'
    && finalReplay.aggregate.planning.scheduleEntries.length === 1
    && finalReplay.aggregate.economy.debts.find(item => item.id === debtId)?.status === 'settled'
    && finalReplay.aggregate.economy.assets.find(item => item.id === assetId)?.owner.kind === 'n/a')

  unsubscribe()
  if (failed > 0) throw new Error(`In-memory world adapter tests failed: ${failed}/${passed + failed}`)
  console.log(`In-memory world adapter tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => {
  console.error(error)
  throw error
})
