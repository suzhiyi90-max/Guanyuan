import { createPreviewRuntimeSession } from '../src/game/runtime-orchestrator'
import { dispatchGeneratedEventForGame } from '../src/game/useGame'
import type { GeneratedEvent } from '../src/narrative/types'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

function event(day = 1, effect = 'log-done'): GeneratedEvent {
  return {
    id: `ai-${day}-hook`, day, title: '堤边问话', scene: '东堤', present: '工头赵九河',
    known: '所知有限', body: '有人在堤边低声议论。', options: [
      { id: 'jia', label: '记下所闻', hint: '只作记录', effect, result: '堤边有人提及旧闸。', refs: [] },
      { id: 'yi', label: '暂且搁置', hint: '不作处置', effect: 'log-stuck', result: '此事暂未查明。', refs: [] },
    ],
    origin: 'ai', seed: 7, createdAt: 1, profileId: 'hook-test-profile', mood: '平',
  }
}

async function run(): Promise<void> {
  const initial = createPreviewRuntimeSession('w5-c2b-hook-world')
  const generated = event()
  const first = await dispatchGeneratedEventForGame(initial, generated, 'jia')
  check('game adapter reports committed after trusted receipt, fact append, and replay',
    first.committed && !first.result.rejected && first.session.ledger.head === 2)
  check('game adapter returns the replayed state for React projection',
    first.result.state === first.session.state && first.result.state.log.done === '堤边有人提及旧闸。')
  check('candidate validation remains available in the session after hook dispatch',
    first.session.candidateLog.candidates.some(item => item.candidateId === `${generated.id}:jia` && item.status === 'validated'))

  const retry = await dispatchGeneratedEventForGame(first.session, generated, 'jia')
  check('same option retry is accepted as idempotent duplicate without a second state mutation',
    retry.committed && !retry.result.rejected && retry.session.ledger.head === first.session.ledger.head
      && retry.result.state === first.session.state)

  const stale = await dispatchGeneratedEventForGame(initial, event(2), 'jia')
  check('rejected candidate is returned as command feedback and never commits a world fact',
    !stale.committed && Boolean(stale.result.rejected)
      && stale.result.state === initial.state && stale.session.ledger.head === 0)

  if (failed > 0) throw new Error(`generated-event-hook: ${failed} failed, ${passed} passed`)
  console.log(`generated-event-hook: ${passed}/${passed} passed`)
}

void run().catch(error => {
  console.error(error)
  throw error
})
