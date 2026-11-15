import { dispatchPreviewRuntimeCandidate, dispatchPreviewRuntimeIntent, createPreviewRuntimeSession } from '../src/game/runtime-orchestrator'
import type { GeneratedEvent } from '../src/narrative/types'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

function event(day = 1, effect = 'log-done', refs: string[] = []): GeneratedEvent {
  return {
    id: `ai-${day}-1`, day, title: '堤边问话', scene: '东堤', present: '工头赵九河',
    known: '所知有限', body: '有人在堤边低声议论，似乎另有隐情。',
    options: [
      { id: 'jia', label: '记下所闻', hint: '只作记录', effect, result: '堤边有人提及旧闸。', refs },
      { id: 'yi', label: '暂且搁置', hint: '不作处置', effect: 'log-stuck', result: '此事暂未查明。', refs: [] },
    ],
    origin: 'ai', seed: 1, createdAt: 1, profileId: 'test-profile', mood: '平',
  }
}

async function run(): Promise<void> {
  let session = createPreviewRuntimeSession('w5-c2a-candidate-world')
  const generated = event()
  const first = await dispatchPreviewRuntimeCandidate(session, generated, 'jia')
  check('AI option is submitted as a candidate and validated by the frozen runtime registry',
    first.status === 'appended' && first.session.candidateLog.candidates[0]?.status === 'validated')
  check('validation receipt precedes the ai-candidate fact in the same ledger',
    first.status === 'appended' && first.session.ledger.head === 2
      && first.session.ledger.events[0].kind === 'candidate.validated'
      && first.session.ledger.events[0].source === 'rule'
      && first.session.ledger.events[1].source === 'ai-candidate'
      && first.session.ledger.events[1].validationRef === first.session.ledger.events[0].id)
  check('replayed AI fact applies the existing local effect and marks the generated event handled',
    first.status === 'appended' && first.session.state.log.done === '堤边有人提及旧闸。'
      && first.session.state.handledEvents.includes(generated.id))
  if (first.status !== 'appended') throw new Error(`candidate-append-fixture-failed:${first.reason}`)
  session = first.session

  const retry = await dispatchPreviewRuntimeCandidate(session, generated, 'jia')
  check('same generated option retry returns duplicate without a second fact',
    retry.status === 'duplicate' && retry.session.ledger.head === 2
      && retry.event.id === first.event.id)

  let actionSession = createPreviewRuntimeSession('w5-c2a-costed-effect-world')
  const planned = dispatchPreviewRuntimeIntent(actionSession, {
    kind: 'river.plan.confirmed',
    payload: { plan: {
      leader: 'foreman', leaderName: '赵九河', material: 8, labor: 30,
      supervisor: '县丞会勘 · 工头监作', detail: '先行抢护计划',
    } },
  }, 'create-plan-for-ai-effect')
  if (planned.status === 'rejected') throw new Error('costed-effect-plan-fixture-failed')
  actionSession = planned.session
  const costedEvent = event(1, 'unlock-e008')
  const costed = await dispatchPreviewRuntimeCandidate(actionSession, costedEvent, 'jia')
  check('AI official effect reuses the existing action-cost rule and unlocks its evidence',
    costed.status === 'appended' && costed.session.state.unlocked.includes('E-008')
      && costed.session.state.periodIndex === 2)
  if (costed.status !== 'appended') throw new Error('costed-effect-fixture-failed')
  const costedRetry = await dispatchPreviewRuntimeCandidate(costed.session, costedEvent, 'jia')
  check('costed AI retry remains duplicate after world time advanced and effect became unavailable',
    costedRetry.status === 'duplicate' && costedRetry.session.ledger.head === costed.session.ledger.head)
  const alteredRetry = await dispatchPreviewRuntimeCandidate(costed.session, event(1, 'log-done'), 'jia')
  check('same candidate identity cannot replace its validated payload',
    alteredRetry.status === 'rejected' && alteredRetry.reason === 'candidate-payload-conflict'
      && alteredRetry.session.ledger.head === costed.session.ledger.head)

  const invalidEffect = await dispatchPreviewRuntimeCandidate(
    createPreviewRuntimeSession('w5-c2a-invalid-effect'), event(1, 'unregistered-effect'), 'jia',
  )
  check('unregistered AI effect is rejected before receipt or fact append',
    invalidEffect.status === 'rejected' && invalidEffect.reason === 'unknown-effect'
      && invalidEffect.session.ledger.head === 0)

  const invalidRefs = await dispatchPreviewRuntimeCandidate(
    createPreviewRuntimeSession('w5-c2a-invalid-refs'), event(1, 'log-done', ['E-DOES-NOT-EXIST']), 'jia',
  )
  check('unregistered evidence references are rejected before candidate submission',
    invalidRefs.status === 'rejected' && invalidRefs.reason === 'candidate-payload-invalid'
      && invalidRefs.session.ledger.head === 0)

  let dayTwo = createPreviewRuntimeSession('w5-c2a-pending-world-event')
  const advanced = dispatchPreviewRuntimeIntent(dayTwo, { kind: 'day.advanced', payload: {} }, 'advance-to-day-two')
  if (advanced.status === 'rejected') throw new Error('day-advance-fixture-failed')
  dayTwo = advanced.session
  const blocked = await dispatchPreviewRuntimeCandidate(dayTwo, event(2), 'jia')
  check('AI candidate cannot pre-empt a pending formal world event',
    blocked.status === 'rejected' && blocked.reason === 'world-event-pending'
      && blocked.session.ledger.head === dayTwo.ledger.head)

  const stale = await dispatchPreviewRuntimeCandidate(
    createPreviewRuntimeSession('w5-c2a-stale-world'), event(2), 'jia',
  )
  check('stale or future AI candidate cannot be committed against another world day',
    stale.status === 'rejected' && stale.reason === 'not-generated-or-stale'
      && stale.session.ledger.head === 0)

  if (failed > 0) throw new Error(`runtime-ai-candidate: ${failed} failed, ${passed} passed`)
  console.log(`runtime-ai-candidate: ${passed}/${passed} passed`)
}

void run().catch(error => {
  console.error(error)
  throw error
})
