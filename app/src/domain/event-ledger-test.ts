import {
  appendLedgerEvent,
  createEventLedger,
  readLedgerEvents,
  type LedgerEventInput,
  type WorldId,
} from './event-ledger'
import { brandedId } from './shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const worldA = brandedId<'WorldId'>('world-a') as WorldId
const worldB = brandedId<'WorldId'>('world-b') as WorldId
const t1 = { day: 1, period: '晨' } as const
const t2 = { day: 1, period: '午' } as const
const baseInput: LedgerEventInput<'person.created'> = {
  source: 'player-command',
  kind: 'person.created',
  intentKind: 'create-person',
  actor: 'player',
  requestWorldTime: t1,
  clientRequestId: 'request-001',
  payload: { displayName: '甲', nested: { score: 1 }, tags: ['new'] },
}

let ledger = createEventLedger<'person.created' | 'person.moved'>(worldA)
const first = appendLedgerEvent(ledger, baseInput, t1)
check('first append allocates seq 1 and world-scoped event id', first.status === 'appended'
  && first.event.seq === 1 && first.event.id === 'evt:world-a:1')
if (first.status === 'appended') ledger = first.ledger

const secondInput: LedgerEventInput<'person.moved'> = {
  ...baseInput,
  kind: 'person.moved',
  intentKind: 'move-person',
  clientRequestId: 'request-002',
  requestWorldTime: t2,
  payload: { place: '县衙' },
}
const second = appendLedgerEvent(ledger, secondInput, t2)
check('sequence is continuous across different event kinds', second.status === 'appended'
  && second.event.seq === 2 && second.event.id === 'evt:world-a:2')
if (second.status === 'appended') ledger = second.ledger

const beforeDuplicate = ledger
const duplicate = appendLedgerEvent(ledger, baseInput, t2)
check('same world request retry returns duplicate without append', duplicate.status === 'duplicate'
  && duplicate.event.id === 'evt:world-a:1' && duplicate.ledger === ledger
  && duplicate.ledger.events.length === 2)

const conflict = appendLedgerEvent(ledger, {
  ...baseInput,
  payload: { displayName: '乙', nested: { score: 1 }, tags: ['new'] },
}, t2)
check('same idempotency key with changed payload is a conflict', conflict.status === 'idempotency-conflict'
  && conflict.ledger === ledger && conflict.event.id === 'evt:world-a:1')

const otherWorld = appendLedgerEvent(createEventLedger(worldB), baseInput, t1)
check('same client request id in another world is not a duplicate', otherWorld.status === 'appended'
  && otherWorld.event.id === 'evt:world-b:1')

const invalidTime = appendLedgerEvent(ledger, {
  ...baseInput,
  clientRequestId: 'request-invalid-time',
  requestWorldTime: { day: 0, period: '晨' } as never,
}, t1)
check('invalid request world time is rejected atomically', invalidTime.status === 'rejected'
  && invalidTime.issues.includes('ledger-request-time-invalid') && invalidTime.ledger === ledger)

const beforeRequest = appendLedgerEvent(ledger, {
  ...baseInput,
  clientRequestId: 'request-before-time',
  requestWorldTime: t2,
}, t1)
check('commit time cannot precede request world time', beforeRequest.status === 'rejected'
  && beforeRequest.issues.includes('ledger-commit-time-before-request'))

const invalidPayload = appendLedgerEvent(ledger, {
  ...baseInput,
  clientRequestId: 'request-invalid-payload',
  payload: { bad: Number.NaN },
}, t2)
check('non-JSON payload is rejected', invalidPayload.status === 'rejected'
  && invalidPayload.issues.includes('ledger-payload-not-json'))

const cyclic: Record<string, unknown> = {}
cyclic.self = cyclic
const cyclicPayload = appendLedgerEvent(ledger, {
  ...baseInput,
  clientRequestId: 'request-cyclic-payload',
  payload: cyclic as never,
}, t2)
check('cyclic payload is rejected', cyclicPayload.status === 'rejected'
  && cyclicPayload.issues.includes('ledger-payload-not-json'))

check('event envelope and nested payload are immutable', first.status === 'appended'
  && Object.isFrozen(first.event) && Object.isFrozen(first.event.payload)
  && Object.isFrozen((first.event.payload as { nested: object }).nested))

const range = readLedgerEvents(ledger, 1, 2)
check('exclusive/inclusive stream range returns only the requested event', range.length === 1
  && range[0].seq === 2)
check('genesis range is an empty event segment', readLedgerEvents(ledger, 0, 0).length === 0)

let invalidRangeRejected = false
try { readLedgerEvents(ledger, -1, 2) } catch { invalidRangeRejected = true }
check('invalid stream range is rejected', invalidRangeRejected)

check('append preserves previous ledger snapshot immutably', beforeDuplicate.events.length === 2
  && beforeDuplicate.head === 2 && ledger.events.length === 2)

if (failed > 0) throw new Error(`Event ledger core contracts failed: ${failed}/${passed + failed}`)
console.log(`Event ledger core contracts: ${passed}/${passed + failed} passed`)
