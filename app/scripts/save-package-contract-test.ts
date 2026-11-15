import { brandedId } from '../src/domain/shared/ids'
import { appendLedgerEvent, createEventLedger, type EventLedger, type LedgerEvent, type WorldId } from '../src/domain/event-ledger'
import { createEventRegistry, freezeEventRegistry, registerEventSchema } from '../src/domain/event-registry'
import { replayEventRange, type StreamCursor } from '../src/domain/event-replay'
import { createWorldSnapshot } from '../src/domain/world-snapshot'
import { createFullSavePackage, validateFullSavePackage, type FullSavePackageInput } from '../src/domain/save-package'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

type Kind = 'person.created'
const worldId = brandedId<'WorldId'>('save-world') as WorldId
const t1 = { day: 1, period: '晨' } as const
const t2 = { day: 1, period: '午' } as const
const genesis: StreamCursor = { kind: 'genesis', seq: 0 }
let registry = createEventRegistry<Kind>('save-test', '1.0.0')
const registered = registerEventSchema(registry, {
  kind: 'person.created',
  schemaVersion: 1,
  validate: payload => payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && typeof (payload as { readonly [key: string]: unknown }).name === 'string',
})
if (registered.status !== 'registered') throw new Error('save-test-registry-register-failed')
registry = registered.registry
const frozen = freezeEventRegistry(registry)
if (frozen.status !== 'frozen') throw new Error('save-test-registry-freeze-failed')
registry = frozen.registry

let ledger: EventLedger<Kind> = createEventLedger<Kind>(worldId)
const first = appendLedgerEvent(ledger, {
  source: 'player-command', kind: 'person.created', intentKind: 'create-person',
  actor: 'player', requestWorldTime: t1, clientRequestId: 's1', payload: { name: '甲' },
}, t1)
if (first.status !== 'appended') throw new Error('save-test-first-event-failed')
ledger = first.ledger
const second = appendLedgerEvent(ledger, {
  source: 'rule', kind: 'person.created', intentKind: 'create-person',
  actor: 'system', requestWorldTime: t2, clientRequestId: 's2', payload: { name: '乙' },
}, t2)
if (second.status !== 'appended') throw new Error('save-test-second-event-failed')
ledger = second.ledger

const head: StreamCursor = { kind: 'event', seq: 2, eventId: second.event.id }
const reduce = (state: import('../src/domain/event-ledger').JsonValue, event: LedgerEvent<Kind>) => [
  ...(state as readonly string[]),
  (event.payload as { readonly name: string }).name,
]
const replay = replayEventRange({
  worldId, fromExclusive: genesis, toInclusive: head, events: ledger.events,
  registry, initialState: [], reduce,
})
if (replay.status !== 'replayed') throw new Error('save-test-replay-failed')
const snapshotResult = createWorldSnapshot({
  schemaVersion: 1, worldId, streamHead: head, checkpointAt: t2, materialized: replay.state,
})
if (snapshotResult.status !== 'valid') throw new Error('save-test-snapshot-failed')

const verification = { registry, initialState: [] as readonly string[] as unknown as import('../src/domain/event-ledger').JsonValue, reduce }
const fullInput: FullSavePackageInput = {
  packageKind: 'full',
  worldId,
  schemaVersion: 1,
  streamRange: { fromExclusive: genesis, toInclusive: head },
  events: ledger.events,
  snapshot: snapshotResult.snapshot,
}

async function main(): Promise<void> {
  const created = await createFullSavePackage(fullInput, verification)
  check('full package from genesis with complete event stream is accepted', created.status === 'valid'
    && created.package.packageKind === 'full' && created.package.events.length === 2
    && created.package.streamRange.fromExclusive.kind === 'genesis'
    && created.package.streamRange.toInclusive.kind === 'event'
    && created.package.streamRange.toInclusive.seq === 2)
  check('validated package and nested payloads are immutable', created.status === 'valid'
    && Object.isFrozen(created.package) && Object.isFrozen(created.package.events)
    && Object.isFrozen(created.package.events[0]) && Object.isFrozen(created.package.events[0].payload)
    && Object.isFrozen(created.package.snapshot.materialized))
  check('package checksum uses sha256 hex envelope', created.status === 'valid'
    && /^sha256:[0-9a-f]{64}$/u.test(created.package.checksum))

  if (created.status !== 'valid') throw new Error('save-test-cannot-continue-without-valid-package')
  const validPackage = created.package
  const tampered = {
    ...validPackage,
    events: [validPackage.events[0], { ...validPackage.events[1], payload: { name: '篡改' } }],
  }
  const tamperResult = await validateFullSavePackage(tampered, verification)
  check('event payload tampering is rejected by checksum before replay', tamperResult.status === 'rejected'
    && tamperResult.issue === 'save-package-checksum-invalid')

  const gapInput: FullSavePackageInput = { ...fullInput, events: [second.event, second.event] }
  const gap = await createFullSavePackage(gapInput, verification)
  check('duplicate or discontinuous full event range is rejected', gap.status === 'rejected'
    && gap.issue === 'save-package-event-replay-rejected')

  const badStateSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId, streamHead: head, checkpointAt: t2, materialized: ['甲', '錯'],
  })
  if (badStateSnapshot.status !== 'valid') throw new Error('save-test-bad-state-snapshot-construction-failed')
  const mismatch = await createFullSavePackage({ ...fullInput, snapshot: badStateSnapshot.snapshot }, verification)
  check('snapshot materialized state must equal full event replay', mismatch.status === 'rejected'
    && mismatch.issue === 'save-package-snapshot-state-mismatch')

  const wrongRange = await createFullSavePackage({
    ...fullInput,
    streamRange: { fromExclusive: { kind: 'event', seq: 1, eventId: first.event.id }, toInclusive: head },
  }, verification)
  check('full package must begin at genesis', wrongRange.status === 'rejected'
    && wrongRange.issue === 'save-package-full-range-invalid')

  const wrongHeadSnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId, streamHead: { kind: 'event', seq: 1, eventId: first.event.id },
    checkpointAt: t2, materialized: ['甲'],
  })
  if (wrongHeadSnapshot.status !== 'valid') throw new Error('save-test-wrong-head-snapshot-failed')
  const wrongHead = await createFullSavePackage({ ...fullInput, snapshot: wrongHeadSnapshot.snapshot }, verification)
  check('snapshot cursor must equal package toInclusive cursor', wrongHead.status === 'rejected'
    && wrongHead.issue === 'save-package-snapshot-invalid')

  const withBase = await validateFullSavePackage({ ...validPackage, basePackage: null }, verification)
  check('full package cannot carry a base package', withBase.status === 'rejected'
    && withBase.issue === 'save-package-envelope-invalid')
  const withUnknownField = await validateFullSavePackage({ ...validPackage, extra: true }, verification)
  check('unknown package envelope fields are rejected', withUnknownField.status === 'rejected'
    && withUnknownField.issue === 'save-package-envelope-invalid')

  let emptyLedger = createEventLedger<Kind>(worldId)
  const emptySnapshot = createWorldSnapshot({
    schemaVersion: 1, worldId, streamHead: genesis, checkpointAt: t1, materialized: [],
  })
  if (emptySnapshot.status !== 'valid') throw new Error('save-test-empty-snapshot-failed')
  const emptyInput: FullSavePackageInput = {
    packageKind: 'full', worldId, schemaVersion: 1,
    streamRange: { fromExclusive: genesis, toInclusive: genesis },
    events: emptyLedger.events, snapshot: emptySnapshot.snapshot,
  }
  const emptyPackage = await createFullSavePackage(emptyInput, verification)
  check('empty world full package allows genesis-to-genesis with no events', emptyPackage.status === 'valid'
    && emptyPackage.package.events.length === 0 && emptyPackage.package.snapshot.streamHead.kind === 'genesis')

  const wrongWorld = await createFullSavePackage({
    ...fullInput,
    worldId: brandedId<'WorldId'>('other-save-world') as WorldId,
  }, verification)
  check('package and snapshot cannot cross world boundaries', wrongWorld.status === 'rejected'
    && wrongWorld.issue === 'save-package-snapshot-invalid')

  if (failed > 0) throw new Error(`save-package: ${failed} failed, ${passed} passed`)
  console.log(`save-package: ${passed}/${passed} passed`)
}

void main().catch(error => { console.error(error); throw error })
