import { brandedId } from './shared/ids'
import type { WorldId } from './event-ledger'
import { createWorldSnapshot, validateWorldSnapshot, type WorldSnapshot } from './world-snapshot'
import type { StreamCursor } from './event-replay'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const worldId = brandedId<'WorldId'>('snapshot-world') as WorldId
const genesis: StreamCursor = { kind: 'genesis', seq: 0 }
const head: StreamCursor = { kind: 'event', seq: 3, eventId: brandedId<'EventId'>('evt:snapshot-world:3') }
const validInput: WorldSnapshot = {
  schemaVersion: 1,
  worldId,
  streamHead: head,
  checkpointAt: { day: 2, period: '午' },
  materialized: { people: [{ id: 'p1', alive: true }], funds: 12 },
}

const created = createWorldSnapshot(validInput)
check('valid event checkpoint snapshot is accepted', created.status === 'valid'
  && created.snapshot.streamHead.kind === 'event' && created.snapshot.streamHead.seq === 3)
check('snapshot envelope and nested materialized state are frozen', created.status === 'valid'
  && Object.isFrozen(created.snapshot) && Object.isFrozen(created.snapshot.streamHead)
  && Object.isFrozen(created.snapshot.materialized)
  && Object.isFrozen((created.snapshot.materialized as { people: readonly unknown[] }).people))

const expected = validateWorldSnapshot(validInput, { worldId, schemaVersion: 1, streamHead: head })
check('snapshot matches expected world, schema and stream head', expected.status === 'valid')
check('cross-world snapshot is rejected', validateWorldSnapshot(validInput, {
  worldId: brandedId<'WorldId'>('other-world') as WorldId, schemaVersion: 1, streamHead: head,
}).status === 'rejected')
check('schema version mismatch is rejected', validateWorldSnapshot(validInput, {
  worldId, schemaVersion: 2, streamHead: head,
}).status === 'rejected')
check('stream head mismatch is rejected', validateWorldSnapshot(validInput, {
  worldId, schemaVersion: 1, streamHead: genesis,
}).status === 'rejected')
check('event cursor id must be bound to world and sequence', validateWorldSnapshot({
  ...validInput, streamHead: { kind: 'event', seq: 3, eventId: 'evt:other-world:3' },
}).status === 'rejected')
check('genesis cursor is valid for an empty world snapshot', validateWorldSnapshot({
  ...validInput, streamHead: genesis,
}).status === 'valid')
check('invalid schema version is rejected', validateWorldSnapshot({ ...validInput, schemaVersion: 0 }).status === 'rejected')
check('invalid checkpoint world time is rejected', validateWorldSnapshot({
  ...validInput, checkpointAt: { day: 0, period: '晨' },
}).status === 'rejected')

const cyclic: Record<string, unknown> = {}
cyclic.self = cyclic
check('cyclic materialized state is rejected', validateWorldSnapshot({ ...validInput, materialized: cyclic }).status === 'rejected')
check('non-finite materialized numbers are rejected', validateWorldSnapshot({
  ...validInput, materialized: { amount: Number.NaN },
}).status === 'rejected')
check('non-JSON object prototypes are rejected', validateWorldSnapshot({
  ...validInput, materialized: new Date() as unknown as WorldSnapshot['materialized'],
}).status === 'rejected')
check('input materialized state is not frozen or mutated by validation', !Object.isFrozen(validInput.materialized)
  && !Object.isFrozen((validInput.materialized as { people: readonly unknown[] }).people))

if (failed > 0) throw new Error(`world-snapshot: ${failed} failed, ${passed} passed`)
console.log(`world-snapshot: ${passed}/${passed} passed`)
