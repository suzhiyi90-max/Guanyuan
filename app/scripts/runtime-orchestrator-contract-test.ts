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

const unknownGoal = dispatchPreviewRuntimeIntent(session, {
  kind: 'goal.selected', payload: { goalId: 'not-a-real-goal' },
}, 'unknown-goal')
check('schema-valid but unknown goal is rejected by replay without appending', unknownGoal.status === 'rejected'
  && unknownGoal.reason === 'replay-rejected' && unknownGoal.session.ledger.head === 1)
session = unknownGoal.session

const unknownDocumentSource = dispatchPreviewRuntimeIntent(session, {
  kind: 'document.remembered', payload: { selectedIds: ['cause-initial', 'not-a-document-source'] },
}, 'unknown-document-source')
check('schema-valid but unknown document references cannot become evidence', unknownDocumentSource.status === 'rejected'
  && unknownDocumentSource.reason === 'replay-rejected' && unknownDocumentSource.session.ledger.head === 1)
session = unknownDocumentSource.session

const unknownLedgerSource = dispatchPreviewRuntimeIntent(session, {
  kind: 'ledger.remembered', payload: { selectedIds: ['E-001', 'not-a-ledger-source'] },
}, 'unknown-ledger-source')
check('schema-valid but unknown ledger references cannot become evidence', unknownLedgerSource.status === 'rejected'
  && unknownLedgerSource.reason === 'replay-rejected' && unknownLedgerSource.session.ledger.head === 1)
session = unknownLedgerSource.session

const asked = dispatchPreviewRuntimeIntent(session, {
  kind: 'person.asked', payload: { personId: 'liangshang' },
}, 'ask-liangshang')
check('person contact is a ledger fact and action cost is projected once', asked.status === 'appended'
  && asked.session.ledger.head === 2 && asked.session.state.asked.includes('liangshang')
  && asked.session.state.periodIndex === 1)
if (asked.status !== 'appended') throw new Error('person-ask-fixture-failed')
session = asked.session

const earlyDayAdvance = dispatchPreviewRuntimeIntent(session, {
  kind: 'day.advanced', payload: {},
}, 'early-day-advance')
check('player may end a day early and advance from the current period', earlyDayAdvance.status === 'appended'
  && earlyDayAdvance.session.ledger.head === 3 && earlyDayAdvance.session.state.day === 2
  && earlyDayAdvance.session.state.pendingEvent === 'material-arrival')
if (earlyDayAdvance.status !== 'appended') throw new Error('early-day-advance-fixture-failed')
const skippedPendingEvent = dispatchPreviewRuntimeIntent(earlyDayAdvance.session, {
  kind: 'day.advanced', payload: {},
}, 'skip-pending-event')
check('a new day cannot begin while a formal world event remains pending', skippedPendingEvent.status === 'rejected'
  && skippedPendingEvent.reason === 'replay-rejected' && skippedPendingEvent.session.ledger.head === 3
  && skippedPendingEvent.session.state.day === 2 && skippedPendingEvent.session.state.pendingEvent === 'material-arrival')

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

const invalidPlanSession = createPreviewRuntimeSession('w5-c1-invalid-plan-world')
const missingGuarantee = dispatchPreviewRuntimeIntent(invalidPlanSession, {
  kind: 'river.plan.confirmed',
  payload: { plan: {
    leader: 'foreman', leaderName: '赵九河', material: 8, labor: 30,
    supervisor: '县丞会勘 · 工头监作',
    detail: '赵九河主办 · 料8垛 · 夫30人 · 县丞会勘 · 工头监作',
    guarantee: false,
  } },
}, 'plan-without-guarantee')
check('new plan commands cannot omit the required guarantee attestation', missingGuarantee.status === 'rejected'
  && missingGuarantee.reason === 'schema-payload-invalid' && missingGuarantee.session.ledger.head === 0)

let banquetSession = createPreviewRuntimeSession('w5-c1-banquet-world')
for (const [intent, id] of [
  [{ kind: 'person.asked', payload: { personId: 'xiancheng' } }, 'banquet-ask-1'],
  [{ kind: 'person.asked', payload: { personId: 'zhubu' } }, 'banquet-ask-2'],
  [{ kind: 'records.audited', payload: {} }, 'banquet-audit'],
  [{ kind: 'banquet.choice', payload: { choice: 'audit' } }, 'banquet-first'],
] as const) {
  const result = dispatchPreviewRuntimeIntent(banquetSession, intent as never, id)
  if (result.status === 'rejected') throw new Error(`banquet-fixture-failed:${result.reason}`)
  banquetSession = result.session
}
const duplicateBanquet = dispatchPreviewRuntimeIntent(banquetSession, {
  kind: 'banquet.choice', payload: { choice: 'delegate' },
}, 'banquet-second-choice')
check('a second banquet choice on the same world day is rejected atomically', duplicateBanquet.status === 'rejected'
  && duplicateBanquet.session.ledger.head === banquetSession.ledger.head
  && duplicateBanquet.session.state.giftEntries.length === 1
  && banquetSession.state.handledEvents.includes('banquet-choice-1'))

if (failed > 0) throw new Error(`runtime-orchestrator: ${failed} failed, ${passed} passed`)
console.log(`runtime-orchestrator: ${passed}/${passed} passed`)
