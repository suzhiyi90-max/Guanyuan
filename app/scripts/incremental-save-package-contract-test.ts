import { brandedId, type EventId } from '../src/domain/shared/ids'
import { appendLedgerEvent, createEventLedger, type EventLedger, type JsonValue, type LedgerEvent, type WorldId } from '../src/domain/event-ledger'
import { createEventRegistry, freezeEventRegistry, registerEventSchema } from '../src/domain/event-registry'
import { replayEventRange, type StreamCursor } from '../src/domain/event-replay'
import { createWorldSnapshot } from '../src/domain/world-snapshot'
import { candidatePayloadDigest } from '../src/domain/ai-candidate'
import { createFullSavePackage, type FullSavePackageInput } from '../src/domain/save-package'
import {
  createIncrementalSavePackage,
  validateIncrementalSavePackage,
  validateSavePackageChain,
  type IncrementalSavePackageInput,
} from '../src/domain/incremental-save-package'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

type Kind = 'person.created' | 'candidate.validated'
const worldId = brandedId<'WorldId'>('incremental-world') as WorldId
const t1 = { day: 1, period: '晨' } as const
const t2 = { day: 1, period: '午' } as const
const t3 = { day: 1, period: '暮' } as const
const genesis: StreamCursor = { kind: 'genesis', seq: 0 }
let registry = createEventRegistry<Kind>('incremental-test', '1.0.0')
const registered = registerEventSchema(registry, {
  kind: 'person.created',
  schemaVersion: 1,
  validate: payload => payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && typeof (payload as { readonly [key: string]: unknown }).name === 'string',
})
if (registered.status !== 'registered') throw new Error('incremental-test-registry-register-failed')
registry = registered.registry
const frozen = freezeEventRegistry(registry)
if (frozen.status !== 'frozen') throw new Error('incremental-test-registry-freeze-failed')
registry = frozen.registry

let ledger: EventLedger<Kind> = createEventLedger<Kind>(worldId)
const first = appendLedgerEvent(ledger, {
  source: 'player-command', kind: 'person.created', intentKind: 'create-person',
  actor: 'player', requestWorldTime: t1, clientRequestId: 'i1', payload: { name: '甲' },
}, t1)
if (first.status !== 'appended') throw new Error('incremental-test-first-event-failed')
const firstEvent = first.event
ledger = first.ledger
const second = appendLedgerEvent(ledger, {
  source: 'rule', kind: 'person.created', intentKind: 'create-person',
  actor: 'system', requestWorldTime: t2, clientRequestId: 'i2', payload: { name: '乙' },
}, t2)
if (second.status !== 'appended') throw new Error('incremental-test-second-event-failed')
const secondEvent = second.event
ledger = second.ledger
const third = appendLedgerEvent(ledger, {
  source: 'player-command', kind: 'person.created', intentKind: 'create-person',
  actor: 'player', requestWorldTime: t3, clientRequestId: 'i3', payload: { name: '丙' },
}, t3)
if (third.status !== 'appended') throw new Error('incremental-test-third-event-failed')
const thirdEvent = third.event

const head2: StreamCursor = { kind: 'event', seq: 2, eventId: secondEvent.id }
const head3: StreamCursor = { kind: 'event', seq: 3, eventId: thirdEvent.id }
const reduce = (state: JsonValue, event: LedgerEvent<Kind>): JsonValue => {
  if (event.kind === 'candidate.validated') return state
  return [...(state as readonly string[]), (event.payload as { readonly name: string }).name]
}
const baseReplay = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: head2, events: [firstEvent, secondEvent],
  registry, initialState: [], reduce,
})
if (baseReplay.status !== 'replayed') throw new Error('incremental-test-base-replay-failed')
const baseSnapshot = createWorldSnapshot({
  schemaVersion: 1, worldId, streamHead: head2, checkpointAt: t2, materialized: baseReplay.state,
})
if (baseSnapshot.status !== 'valid') throw new Error('incremental-test-base-snapshot-failed')
const verification = { registry, initialState: [] as JsonValue, reduce }

async function main(): Promise<void> {
  const fullInput: FullSavePackageInput = {
    packageKind: 'full', worldId, schemaVersion: 1,
    streamRange: { fromExclusive: genesis, toInclusive: head2 },
    events: [firstEvent, secondEvent], snapshot: baseSnapshot.snapshot,
  }
  const base = await createFullSavePackage(fullInput, verification)
  if (base.status !== 'valid') throw new Error('incremental-test-full-base-package-failed')

  const incrementalReplay = replayEventRange({
    worldId, fromExclusive: head2, toInclusive: head3,
    anchorEvent: secondEvent, events: [thirdEvent], registry,
    initialState: baseSnapshot.snapshot.materialized, reduce,
  })
  if (incrementalReplay.status !== 'replayed') throw new Error('incremental-test-range-replay-failed')
  const nextSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId, streamHead: head3, checkpointAt: t3, materialized: incrementalReplay.state,
  })
  if (nextSnapshot.status !== 'valid') throw new Error('incremental-test-next-snapshot-failed')

  const incrementalInput: IncrementalSavePackageInput = {
    packageKind: 'incremental', worldId, schemaVersion: 1,
    streamRange: { fromExclusive: head2, toInclusive: head3 },
    events: [thirdEvent], snapshot: nextSnapshot.snapshot, basePackage: base.package,
  }
  const created = await createIncrementalSavePackage(incrementalInput, verification)
  check('incremental package links to exact base snapshot head', created.status === 'valid'
    && created.package.packageKind === 'incremental'
    && created.package.streamRange.fromExclusive.kind === 'event'
    && created.package.streamRange.fromExclusive.seq === 2
    && created.package.streamRange.toInclusive.kind === 'event'
    && created.package.streamRange.toInclusive.seq === 3)
  check('incremental package and nested base chain are immutable', created.status === 'valid'
    && Object.isFrozen(created.package) && Object.isFrozen(created.package.events)
    && Object.isFrozen(created.package.events[0].payload)
    && Object.isFrozen(created.package.basePackage)
    && Object.isFrozen(created.package.basePackage.snapshot.materialized))
  check('incremental chain validates recursively', created.status === 'valid'
    && (await validateSavePackageChain(created.package, verification)).status === 'valid')

  if (created.status !== 'valid') throw new Error('incremental-test-cannot-continue-without-valid-package')
  const valid = created.package
  const tampered = {
    ...valid,
    events: [{ ...valid.events[0], payload: { name: '篡改' } }],
  }
  const tamperResult = await validateIncrementalSavePackage(tampered, verification)
  check('incremental event tampering is rejected by checksum', tamperResult.status === 'rejected'
    && tamperResult.issue === 'save-package-checksum-invalid')

  const wrongBaseHead = await createIncrementalSavePackage({
    ...incrementalInput,
    streamRange: { fromExclusive: { kind: 'event', seq: 1, eventId: firstEvent.id }, toInclusive: head3 },
    events: [secondEvent, thirdEvent],
  }, verification)
  check('incremental fromExclusive must equal base snapshot head', wrongBaseHead.status === 'rejected'
    && wrongBaseHead.issue === 'save-package-base-head-mismatch')

  const missingRangeEvent = await createIncrementalSavePackage({
    ...incrementalInput, events: [],
  }, verification)
  check('incremental event count must exactly cover stream range', missingRangeEvent.status === 'rejected'
    && missingRangeEvent.issue === 'save-package-incremental-event-count-mismatch')

  const discontinuous = await createIncrementalSavePackage({
    ...incrementalInput, events: [firstEvent],
  }, verification)
  check('incremental discontinuous event sequence is rejected', discontinuous.status === 'rejected'
    && discontinuous.issue === 'save-package-incremental-replay-rejected')

  const emptyIncremental = await createIncrementalSavePackage({
    ...incrementalInput,
    streamRange: { fromExclusive: head2, toInclusive: head2 },
    events: [],
    snapshot: baseSnapshot.snapshot,
  }, verification)
  check('empty incremental checkpoint preserves the base snapshot and cursor', emptyIncremental.status === 'valid'
    && emptyIncremental.package.streamRange.fromExclusive.seq === emptyIncremental.package.streamRange.toInclusive.seq)

  const otherWorld = brandedId<'WorldId'>('other-incremental-world') as WorldId
  const otherSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId: otherWorld, streamHead: genesis, checkpointAt: t1, materialized: [],
  })
  if (otherSnapshot.status !== 'valid') throw new Error('incremental-test-other-world-snapshot-failed')
  const otherBase = await createFullSavePackage({
    packageKind: 'full', worldId: otherWorld, schemaVersion: 1,
    streamRange: { fromExclusive: genesis, toInclusive: genesis },
    events: [], snapshot: otherSnapshot.snapshot,
  }, verification)
  if (otherBase.status !== 'valid') throw new Error('incremental-test-other-world-base-failed')
  const crossWorld = await createIncrementalSavePackage({
    ...incrementalInput, basePackage: otherBase.package,
  }, verification)
  check('incremental package cannot cross world boundaries', crossWorld.status === 'rejected'
    && crossWorld.issue === 'save-package-base-world-mismatch')

  const receiptWorld = brandedId<'WorldId'>('receipt-incremental-world') as WorldId
  const receiptDigest = await candidatePayloadDigest('person.created', '1.0.0', { name: '丙' })
  const receipt: LedgerEvent<Kind> = Object.freeze({
    worldId: receiptWorld,
    id: brandedId<'EventId'>('evt:receipt-incremental-world:1'),
    seq: 1,
    source: 'rule',
    kind: 'candidate.validated',
    intentKind: 'candidate-validation',
    actor: 'system:candidate-validator',
    requestWorldTime: t1,
    committedAt: t1,
    clientRequestId: 'candidate-validation:c1',
    payload: {
      candidate: 'c1',
      targetKind: 'person.created',
      payloadDigest: receiptDigest,
      digestAlgorithm: 'sha-256/canonical-json-v1',
      registryVersion: '1.0.0',
      validatedBy: 'rule:test',
    },
  })
  const receiptHead: StreamCursor = { kind: 'event', seq: 1, eventId: receipt.id }
  const receiptSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId: receiptWorld, streamHead: receiptHead, checkpointAt: t1, materialized: [],
  })
  if (receiptSnapshot.status !== 'valid') throw new Error('incremental-test-receipt-snapshot-failed')
  const receiptBase = await createFullSavePackage({
    packageKind: 'full', worldId: receiptWorld, schemaVersion: 1,
    streamRange: { fromExclusive: genesis, toInclusive: receiptHead },
    events: [receipt], snapshot: receiptSnapshot.snapshot,
  }, verification)
  if (receiptBase.status !== 'valid') throw new Error('incremental-test-receipt-base-failed')

  const aiFact: LedgerEvent<Kind> = Object.freeze({
    worldId: receiptWorld,
    id: brandedId<'EventId'>('evt:receipt-incremental-world:2'),
    seq: 2,
    source: 'ai-candidate',
    kind: 'person.created',
    intentKind: 'ai-person-create',
    actor: 'ai:candidate',
    requestWorldTime: t1,
    committedAt: t2,
    clientRequestId: 'ai-fact-001',
    candidateRef: 'c1',
    validationRef: receipt.id as EventId,
    payload: { name: '丙' },
  })
  const aiHead: StreamCursor = { kind: 'event', seq: 2, eventId: aiFact.id }
  const aiSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId: receiptWorld, streamHead: aiHead, checkpointAt: t2, materialized: ['丙'],
  })
  if (aiSnapshot.status !== 'valid') throw new Error('incremental-test-ai-snapshot-failed')
  const aiIncremental = await createIncrementalSavePackage({
    packageKind: 'incremental', worldId: receiptWorld, schemaVersion: 1,
    streamRange: { fromExclusive: receiptHead, toInclusive: aiHead },
    events: [aiFact], snapshot: aiSnapshot.snapshot, basePackage: receiptBase.package,
  }, verification)
  check('incremental replay carries earlier AI validation receipts from its base chain', aiIncremental.status === 'valid')

  if (failed > 0) throw new Error(`incremental-save-package: ${failed} failed, ${passed} passed`)
  console.log(`incremental-save-package: ${passed}/${passed} passed`)
}

void main().catch(error => { console.error(error); throw error })
