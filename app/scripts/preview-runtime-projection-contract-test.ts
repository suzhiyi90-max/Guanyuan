import { brandedId } from '../src/domain/shared/ids'
import { appendLedgerEvent, createEventLedger, type EventLedger, type JsonValue, type WorldId } from '../src/domain/event-ledger'
import { validateEventPayload } from '../src/domain/event-registry'
import { createPreviewRuntimeRegistry, type PreviewRuntimeEventKind } from '../src/game/runtime-registry'
import { rebuildPreviewRuntimeProjection } from '../src/game/runtime-projection'
import type { GameState } from '../src/game/model'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const registry = createPreviewRuntimeRegistry()
check('preview runtime registry is frozen and versioned', registry.frozen
  && registry.registryId === 'guanyuan.preview-runtime'
  && registry.registryVersion === '0.2.0')
check('preview registry contains all current non-AI runtime action schemas', registry.schemas.length === 13)
check('candidate.validated remains the built-in ledger protocol, not a business schema',
  validateEventPayload(registry, 'candidate.validated', {}).status === 'schema-not-found')
check('AI generated-event resolution has a strict registered payload schema',
  validateEventPayload(registry, 'ai.generated-event.resolved', {
    generatedEventId: 'ai-1-1', optionId: 'jia', effect: 'log-done',
    result: '已记下', refs: [],
  }).status === 'valid'
  && validateEventPayload(registry, 'ai.generated-event.resolved', {
    generatedEventId: 'ai-1-1', optionId: 'jia', effect: 'log-done',
    result: '已记下', refs: ['E-001', 'E-002', 'E-003', 'E-004', 'E-005'],
  }).status === 'payload-invalid')
check('document comparison schema rejects fewer than two evidence references',
  validateEventPayload(registry, 'document.remembered', { selectedIds: ['E-001'] }).status === 'payload-invalid')
check('plan schema rejects negative quantities',
  validateEventPayload(registry, 'river.plan.confirmed', {
    plan: { leader: 'county', leaderName: '县丞', material: -1, labor: 3, supervisor: '工头', detail: '抢护' },
  }).status === 'payload-invalid')
check('empty-action schema rejects unexpected payload keys',
  validateEventPayload(registry, 'day.advanced', { day: 2 }).status === 'payload-invalid')

const worldId = brandedId<'WorldId'>('preview-runtime-world') as WorldId
const t1 = { day: 1, period: '晨' } as const
const t2 = { day: 1, period: '午' } as const
const t3 = { day: 1, period: '暮' } as const
const t4 = { day: 1, period: '夜' } as const
const t5 = { day: 2, period: '晨' } as const
const t6 = { day: 2, period: '午' } as const
let ledger: EventLedger<PreviewRuntimeEventKind> = createEventLedger<PreviewRuntimeEventKind>(worldId)
let request = 0
function append(kind: Exclude<PreviewRuntimeEventKind, 'candidate.validated'>, payload: JsonValue, time: typeof t1 | typeof t2 | typeof t3 | typeof t4 | typeof t5 | typeof t6): void {
  request += 1
  const result = appendLedgerEvent(ledger, {
    source: 'player-command',
    kind,
    intentKind: kind,
    actor: 'player',
    requestWorldTime: time,
    clientRequestId: `preview-${request}`,
    payload,
  }, time)
  if (result.status !== 'appended') throw new Error(`preview-runtime-append-failed:${kind}`)
  ledger = result.ledger
}

append('goal.selected', { goalId: 'achievement' }, t1)
append('document.remembered', { selectedIds: ['cause-initial', 'scope-final'] }, t1)
append('ledger.remembered', { selectedIds: ['E-002', 'E-003'] }, t1)
append('person.asked', { personId: 'liangshang' }, t1)
append('records.audited', {}, t2)
append('river.probed', {}, t3)
append('banquet.choice', { choice: 'attend' }, t4)
append('day.advanced', {}, t5)
append('world.event.resolved', { eventId: 'material-arrival', optionId: 'weigh' }, t5)
append('plan.previewed', {}, t5)
append('river.plan.confirmed', {
  plan: {
    leader: 'foreman', leaderName: '赵九河', material: 8, labor: 30,
    supervisor: '县丞会勘 · 工头监作',
    detail: '赵九河主办 · 料8垛 · 夫30人 · 县丞会勘 · 工头监作',
    guarantee: true,
  },
}, t5)
append('official.action', { key: 'files' }, t6)

const head = { kind: 'event', seq: ledger.events.length, eventId: ledger.events[ledger.events.length - 1].id } as const
const projection = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: head, events: ledger.events, registry,
})
check('full preview runtime event stream rebuilds from genesis', projection.status === 'rebuilt'
  && projection.applied === 12 && projection.cursor.seq === 12)

if (projection.status !== 'rebuilt') throw new Error('preview-runtime-projection-failed')
const state = projection.state as unknown as GameState
check('projection includes selected goal and comparison evidence', state.goalId === 'achievement'
  && state.completedActions.includes('doc-remembered')
  && state.completedActions.includes('ledger-remembered')
  && state.comparisons.length === 2)
check('projection applies action costs and person relationships deterministically', state.asked.includes('liangshang')
  && state.periodIndex === 2 && state.day === 2)
check('projection applies banquet and official-action facts', state.giftEntries.length === 1
  && state.privateFunds === 40 && state.officialActions.includes('files')
  && state.unlocked.includes('E-004'))
check('projection settles world event and river plan', state.handledEvents.includes('material-arrival')
  && state.pendingEvent === null && state.plan?.leader === 'foreman'
  && state.probeKnown && state.unlocked.includes('E-007'))
check('projection state is deeply immutable', Object.isFrozen(projection.state)
  && Object.isFrozen(state.clues) && Object.isFrozen(state.comparisons)
  && Object.isFrozen(state.material) && Object.isFrozen(state.log))

const repeated = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: head, events: ledger.events, registry,
})
check('same event stream deterministically rebuilds identical projection', repeated.status === 'rebuilt'
  && JSON.stringify(repeated.state) === JSON.stringify(projection.state))

let invalidLedger: EventLedger<PreviewRuntimeEventKind> = createEventLedger<PreviewRuntimeEventKind>(worldId)
for (let index = 0; index < 2; index += 1) {
  const result = appendLedgerEvent(invalidLedger, {
    source: 'player-command',
    kind: 'person.asked',
    intentKind: 'person.asked',
    actor: 'player',
    requestWorldTime: t1,
    clientRequestId: `duplicate-person-${index}`,
    payload: { personId: 'liangshang' },
  }, t1)
  if (result.status !== 'appended') throw new Error('duplicate-action-fixture-append-failed')
  invalidLedger = result.ledger
}
const invalidHead = {
  kind: 'event' as const,
  seq: invalidLedger.events.length,
  eventId: invalidLedger.events[invalidLedger.events.length - 1].id,
}
const invalidProjection = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: invalidHead, events: invalidLedger.events, registry,
})
check('semantically invalid committed action rejects replay atomically', invalidProjection.status === 'rejected'
  && invalidProjection.issue === 'replay-reducer-failed')

let invalidReferenceLedger: EventLedger<PreviewRuntimeEventKind> = createEventLedger<PreviewRuntimeEventKind>(worldId)
const invalidReferenceAppend = appendLedgerEvent(invalidReferenceLedger, {
  source: 'player-command',
  kind: 'ledger.remembered',
  intentKind: 'ledger.remembered',
  actor: 'player',
  requestWorldTime: t1,
  clientRequestId: 'invalid-ledger-reference',
  payload: { selectedIds: ['E-001', 'made-up-ledger-row'] },
}, t1)
if (invalidReferenceAppend.status !== 'appended') throw new Error('invalid-reference-fixture-append-failed')
invalidReferenceLedger = invalidReferenceAppend.ledger
const invalidReferenceHead = {
  kind: 'event' as const,
  seq: invalidReferenceLedger.events.length,
  eventId: invalidReferenceLedger.events[invalidReferenceLedger.events.length - 1].id,
}
const invalidReferenceProjection = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: invalidReferenceHead, events: invalidReferenceLedger.events, registry,
})
check('replay rejects schema-valid but nonexistent evidence references', invalidReferenceProjection.status === 'rejected'
  && invalidReferenceProjection.issue === 'replay-reducer-failed')

let pendingEventSkipLedger: EventLedger<PreviewRuntimeEventKind> = createEventLedger<PreviewRuntimeEventKind>(worldId)
for (const [time, requestId] of [[t1, 'early-sleep'], [t5, 'skip-pending-event']] as const) {
  const appended = appendLedgerEvent(pendingEventSkipLedger, {
    source: 'player-command',
    kind: 'day.advanced',
    intentKind: 'day.advanced',
    actor: 'player',
    requestWorldTime: time,
    clientRequestId: requestId,
    payload: {},
  }, time)
  if (appended.status !== 'appended') throw new Error(`pending-event-skip-fixture-append-failed:${requestId}`)
  pendingEventSkipLedger = appended.ledger
}
const pendingEventSkipHead = {
  kind: 'event' as const,
  seq: pendingEventSkipLedger.events.length,
  eventId: pendingEventSkipLedger.events[pendingEventSkipLedger.events.length - 1].id,
}
const pendingEventSkipProjection = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: pendingEventSkipHead, events: pendingEventSkipLedger.events, registry,
})
check('replay rejects skipping a pending world event while preserving early-sleep semantics', pendingEventSkipProjection.status === 'rejected'
  && pendingEventSkipProjection.issue === 'replay-reducer-failed')

let legacyPlanLedger: EventLedger<PreviewRuntimeEventKind> = createEventLedger<PreviewRuntimeEventKind>(worldId)
const legacyPlanAppend = appendLedgerEvent(legacyPlanLedger, {
  source: 'player-command',
  kind: 'river.plan.confirmed',
  intentKind: 'river.plan.confirmed',
  actor: 'player',
  requestWorldTime: t1,
  clientRequestId: 'legacy-plan-without-guarantee-field',
  payload: { plan: {
    leader: 'foreman', leaderName: '赵九河', material: 8, labor: 30,
    supervisor: '县丞会勘 · 工头监作',
    detail: '赵九河主办 · 料8垛 · 夫30人 · 县丞会勘 · 工头监作',
  } },
}, t1)
if (legacyPlanAppend.status !== 'appended') throw new Error('legacy-plan-fixture-append-failed')
legacyPlanLedger = legacyPlanAppend.ledger
const legacyPlanHead = {
  kind: 'event' as const,
  seq: legacyPlanLedger.events.length,
  eventId: legacyPlanLedger.events[legacyPlanLedger.events.length - 1].id,
}
const legacyPlanProjection = rebuildPreviewRuntimeProjection({
  worldId, toInclusive: legacyPlanHead, events: legacyPlanLedger.events, registry,
})
check('legacy plan events without guarantee field remain replay-compatible', legacyPlanProjection.status === 'rebuilt'
  && (legacyPlanProjection.state as unknown as GameState).plan?.leader === 'foreman')

if (failed > 0) throw new Error(`preview-runtime-projection: ${failed} failed, ${passed} passed`)
console.log(`preview-runtime-projection: ${passed}/${passed} passed`)
