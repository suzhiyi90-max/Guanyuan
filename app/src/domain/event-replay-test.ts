import { appendLedgerEvent, createEventLedger, type EventLedger, type LedgerEvent, type WorldId } from './event-ledger'
import { createEventRegistry, freezeEventRegistry, registerEventSchema } from './event-registry'
import { rebuildReadOnlyProjection, replayEventRange, type StreamCursor } from './event-replay'
import { brandedId, type EventId } from './shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

type Kind = 'person.created' | 'candidate.validated'
const worldId = brandedId<'WorldId'>('replay-world') as WorldId
const t1 = { day: 1, period: '晨' } as const
const t2 = { day: 1, period: '午' } as const
let registry = createEventRegistry<Kind>('replay-test', '1.0.0')
const registered = registerEventSchema(registry, {
  kind: 'person.created',
  schemaVersion: 1,
  validate: payload => payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && typeof (payload as { readonly [key: string]: unknown }).name === 'string',
})
if (registered.status !== 'registered') throw new Error('test-registry-register-failed')
registry = registered.registry
const frozen = freezeEventRegistry(registry)
if (frozen.status !== 'frozen') throw new Error('test-registry-freeze-failed')
registry = frozen.registry

let ledger: EventLedger<Kind> = createEventLedger<Kind>(worldId)
const first = appendLedgerEvent(ledger, {
  source: 'player-command', kind: 'person.created', intentKind: 'create-person',
  actor: 'player', requestWorldTime: t1, clientRequestId: 'r1', payload: { name: '甲' },
}, t1)
if (first.status !== 'appended') throw new Error('test-first-append-failed')
ledger = first.ledger
const second = appendLedgerEvent(ledger, {
  source: 'rule', kind: 'person.created', intentKind: 'register-person',
  actor: 'system', requestWorldTime: t2, clientRequestId: 'r2', payload: { name: '乙' },
}, t2)
if (second.status !== 'appended') throw new Error('test-second-append-failed')
ledger = second.ledger

const genesis: StreamCursor = { kind: 'genesis', seq: 0 }
const c1: StreamCursor = { kind: 'event', seq: 1, eventId: first.event.id }
const c2: StreamCursor = { kind: 'event', seq: 2, eventId: second.event.id }
const addNames = (state: import('./event-ledger').JsonValue, event: LedgerEvent<Kind>) => {
  const names = state as readonly string[]
  const payload = event.payload as { readonly name: string }
  return [...names, payload.name]
}

const full = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c2, events: ledger.events,
  registry, initialState: [], reduce: addNames,
})
check('genesis replay rebuilds complete ordered state', full.status === 'replayed'
  && full.applied === 2 && JSON.stringify(full.state) === '["甲","乙"]'
  && full.cursor.kind === 'event' && full.cursor.seq === 2)

const partial = replayEventRange({
  worldId, fromExclusive: c1, toInclusive: c2, anchorEvent: first.event,
  events: [second.event], registry, initialState: ['甲'], reduce: addNames,
})
check('checkpoint replay applies exactly the exclusive/inclusive segment', partial.status === 'replayed'
  && partial.applied === 1 && JSON.stringify(partial.state) === '["甲","乙"]')

const empty = replayEventRange({
  worldId, fromExclusive: c2, toInclusive: c2, anchorEvent: second.event,
  events: [], registry, initialState: ['甲', '乙'], reduce: addNames,
})
check('empty range preserves state and cursor', empty.status === 'replayed'
  && empty.applied === 0 && empty.cursor.kind === 'event' && empty.cursor.eventId === second.event.id)

const emptyWorld = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: genesis, events: [],
  registry, initialState: [], reduce: addNames,
})
check('empty genesis stream is valid', emptyWorld.status === 'replayed' && emptyWorld.applied === 0)

const gap = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c2, events: [second.event],
  registry, initialState: [], reduce: addNames,
})
check('missing event sequence is rejected', gap.status === 'rejected'
  && gap.issue === 'replay-event-count-mismatch')

const wrongWorld = { ...first.event, worldId: brandedId<'WorldId'>('other-world') as WorldId }
const crossWorld = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c1, events: [wrongWorld],
  registry, initialState: [], reduce: addNames,
})
check('cross-world event is rejected', crossWorld.status === 'rejected'
  && crossWorld.issue === 'replay-event-world-mismatch')

const wrongId = { ...first.event, id: brandedId<'EventId'>('evt:replay-world:99') as EventId }
const badId = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c1, events: [wrongId],
  registry, initialState: [], reduce: addNames,
})
check('event id must match its world and sequence', badId.status === 'rejected'
  && badId.issue === 'replay-event-id-mismatch')

const unknown = { ...first.event, kind: 'person.unknown' as Kind }
const unknownKind = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c1, events: [unknown],
  registry, initialState: [], reduce: addNames,
})
check('unknown event kind is rejected before reducing', unknownKind.status === 'rejected'
  && unknownKind.issue === 'replay-schema-invalid')

const reducerFailure = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: c2, events: ledger.events,
  registry, initialState: [], reduce: () => { throw new Error('reducer-failed') },
})
check('reducer failure returns no partial projection state', reducerFailure.status === 'rejected'
  && reducerFailure.issue === 'replay-reducer-failed' && reducerFailure.seq === 1
  && !('state' in reducerFailure))

let reducerSawFrozen = false
const readonlyProjection = rebuildReadOnlyProjection({
  worldId, fromExclusive: genesis, toInclusive: c2, events: ledger.events,
  registry, initialState: [],
  reduce: (state, event) => {
    reducerSawFrozen = Object.isFrozen(state) && Object.isFrozen(event) && Object.isFrozen(event.payload)
    return addNames(state, event)
  },
})
check('projection reducer receives frozen state and event', reducerSawFrozen)
check('projection rebuild is deterministic', readonlyProjection.status === 'rebuilt'
  && JSON.stringify(readonlyProjection.state) === JSON.stringify(full.status === 'replayed' ? full.state : null)
  && readonlyProjection.cursor.kind === 'event' && readonlyProjection.cursor.seq === 2)
check('projection result envelope is immutable', readonlyProjection.status === 'rebuilt'
  && Object.isFrozen(readonlyProjection) && Object.isFrozen(readonlyProjection.state))

const fakeReceipt: LedgerEvent<Kind> = Object.freeze({
  worldId, id: brandedId<'EventId'>('evt:replay-world:1'), seq: 1,
  source: 'rule', kind: 'candidate.validated', intentKind: 'candidate-validation',
  actor: 'system:candidate-validator', requestWorldTime: t1, committedAt: t1,
  clientRequestId: 'candidate-validation:c1',
  payload: {
    candidate: 'c1', targetKind: 'person.created', payloadDigest: `sha256:${'a'.repeat(64)}`,
    digestAlgorithm: 'sha-256/canonical-json-v1', registryVersion: '1.0.0', validatedBy: 'rule:test',
  },
})
const receiptCursor: StreamCursor = { kind: 'event', seq: 1, eventId: fakeReceipt.id }
const systemReceipt = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: receiptCursor, events: [fakeReceipt],
  registry, initialState: [], reduce: state => state,
})
check('built-in candidate validation receipt bypasses business registry only through fixed schema', systemReceipt.status === 'replayed')

const forgedReceipt = { ...fakeReceipt, source: 'player-command' as const }
const forged = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: receiptCursor, events: [forgedReceipt],
  registry, initialState: [], reduce: state => state,
})
check('candidate validation receipt cannot use non-rule source', forged.status === 'rejected'
  && forged.issue === 'replay-system-receipt-invalid')

const anchorMismatch = replayEventRange({
  worldId, fromExclusive: { kind: 'event', seq: 1, eventId: brandedId<'EventId'>('evt:replay-world:99') as EventId },
  toInclusive: c2, anchorEvent: first.event, events: [second.event], registry,
  initialState: ['甲'], reduce: addNames,
})
check('checkpoint cursor must match its anchor event', anchorMismatch.status === 'rejected'
  && anchorMismatch.issue === 'replay-anchor-mismatch')

if (failed > 0) throw new Error(`Event replay contracts failed: ${failed}/${passed + failed}`)
console.log(`Event replay contracts: ${passed}/${passed + failed} passed`)
