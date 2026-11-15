import { createPreviewRuntimeSession, dispatchPreviewRuntimeIntent } from '../src/game/runtime-orchestrator'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

let session = createPreviewRuntimeSession('w5-c1-contract-world')
check('new world starts at genesis with an empty ledger', session.ledger.head === 0
  && session.ledger.events.length === 0 && session.state.day === 1
  && session.state.periodIndex === 0)
check('initial projection is deeply immutable', Object.isFrozen(session.state)
  && Object.isFrozen(session.state.clues) && Object.isFrozen(session.state.material))
check('runtime registry is frozen before commands can be accepted', session.registry.frozen
  && Object.isFrozen(session.registry.schemas))

const goal = { kind: 'goal.selected', payload: { goalId: 'achievement' } } as const
const first = dispatchPreviewRuntimeIntent(session, goal, 'same-goal-request')
check('valid intent appends one event and updates projection atomically', first.status === 'appended'
  && first.session.ledger.head === 1 && first.session.state.goalId === 'achievement')
if (first.status !== 'appended') throw new Error('goal-append-fixture-failed')
session = first.session

const retry = dispatchPreviewRuntimeIntent(session, goal, 'same-goal-request')
check('same request id and same payload returns the original event', retry.status === 'duplicate'
  && retry.session.ledger.head === 1 && retry.status === 'duplicate' && retry.event.id === first.event.id)
if (retry.status !== 'duplicate') throw new Error('duplicate-fixture-failed')
session = retry.session

const conflict = dispatchPreviewRuntimeIntent(session, {
  kind: 'goal.selected', payload: { goalId: 'integrity' },
}, 'same-goal-request')
check('same idempotency key with changed payload is rejected as conflict', conflict.status === 'rejected'
  && conflict.reason === 'idempotency-conflict' && conflict.session.ledger.head === 1)
session = conflict.session

const asked = dispatchPreviewRuntimeIntent(session, {
  kind: 'person.asked', payload: { personId: 'liangshang' },
}, 'ask-liangshang')
check('person contact is a ledger fact and action cost is projected once', asked.status === 'appended'
  && asked.session.ledger.head === 2 && asked.session.state.asked.includes('liangshang')
  && asked.session.state.periodIndex === 1)
if (asked.status !== 'appended') throw new Error('person-ask-fixture-failed')
session = asked.session

const repeatedPerson = dispatchPreviewRuntimeIntent(session, {
  kind: 'person.asked', payload: { personId: 'liangshang' },
}, 'ask-liangshang-again')
check('semantic duplicate with a new request id is rejected without appending', repeatedPerson.status === 'rejected'
  && repeatedPerson.session.ledger.head === 2 && repeatedPerson.session.state.asked.length === 1)
session = repeatedPerson.session

const invalidSchema = dispatchPreviewRuntimeIntent(session, {
  kind: 'document.remembered', payload: { selectedIds: ['only-one'] },
}, 'invalid-document')
check('schema-invalid intent leaves ledger and projection untouched', invalidSchema.status === 'rejected'
  && invalidSchema.reason === 'schema-payload-invalid'
  && invalidSchema.session.ledger.head === 2
  && invalidSchema.session.state.comparisons.length === 0)
session = invalidSchema.session

const unknownPerson = dispatchPreviewRuntimeIntent(session, {
  kind: 'person.asked', payload: { personId: 'not-in-the-world' },
}, 'unknown-person')
check('reducer-invalid committed candidate is discarded atomically', unknownPerson.status === 'rejected'
  && unknownPerson.reason === 'replay-rejected' && unknownPerson.session.ledger.head === 2
  && unknownPerson.session.state.asked.length === 1)
session = unknownPerson.session

const banquetTooEarly = dispatchPreviewRuntimeIntent(session, {
  kind: 'banquet.choice', payload: { choice: 'attend' },
}, 'banquet-before-night')
check('business precondition failure does not append a fact', banquetTooEarly.status === 'rejected'
  && banquetTooEarly.session.ledger.head === 2
  && banquetTooEarly.session.state.privateFunds === 60)
session = banquetTooEarly.session

const official = dispatchPreviewRuntimeIntent(session, {
  kind: 'official.action', payload: { key: 'endorse' },
}, 'official-endorse')
check('official action reuses existing command settlement through replay', official.status === 'appended'
  && official.session.state.officialRead && official.session.state.officialActions.includes('endorse'))
if (official.status !== 'appended') throw new Error('official-fixture-failed')
session = official.session

const resetWorld = createPreviewRuntimeSession('w5-c1-new-world')
check('new WorldId starts an independent empty fact stream', resetWorld.worldId !== session.worldId
  && resetWorld.ledger.head === 0 && resetWorld.state.goalId === null
  && resetWorld.state.asked.length === 0)

check('candidate.validated remains outside the business preview registry',
  !session.registry.schemas.some(schema => schema.kind === 'candidate.validated'))

if (failed > 0) throw new Error(`runtime-orchestrator: ${failed} failed, ${passed} passed`)
console.log(`runtime-orchestrator: ${passed}/${passed} passed`)
