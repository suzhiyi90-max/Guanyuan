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
  && registry.registryVersion === '0.1.0')
check('preview registry contains all current non-AI runtime action schemas', registry.schemas.length === 12)
check('candidate.validated remains the built-in ledger protocol, not a business schema',
  validateEventPayload(registry, 'candidate.validated', {}).status === 'schema-not-found')
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
append('document.remembered', { selectedIds: ['cause-initial', 'doc-final'] }, t1)
append('ledger.remembered', { selectedIds: ['E-002', 'E-003'] }, t1)
append('person.asked', { personId: 'liangshang' }, t1)
append('records.audited', {}, t2)
append('river.probed', {}, t3)
append('banquet.choice', { choice: 'attend' }, t4)
append('day.advanced', {}, t5)
append('world.event.resolved', { eventId: 'material-arrival', optionId: 'weigh' }, t5)
append('plan.previewed', {}, t5)
append('river.plan.confirmed', {
  plan: { leader: 'county', leaderName: '县丞', material: 8, labor: 24, supervisor: '工头', detail: '分段抢护并昼夜巡守' },
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
  && state.pendingEvent === null && state.plan?.leader === 'county'
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

if (failed > 0) throw new Error(`preview-runtime-projection: ${failed} failed, ${passed} passed`)
console.log(`preview-runtime-projection: ${passed}/${passed} passed`)
