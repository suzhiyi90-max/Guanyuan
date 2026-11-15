import { createPreviewRuntimeSession, dispatchPreviewRuntimeIntent, type PreviewRuntimeIntent, type PreviewRuntimeSession } from './runtime-orchestrator'

export type RuntimeSmokeFixture = 'day8' | 'day9' | 'day10' | 'day10-night'

function apply(session: PreviewRuntimeSession, intent: PreviewRuntimeIntent, sequence: number): PreviewRuntimeSession {
  const result = dispatchPreviewRuntimeIntent(session, intent, `smoke-fixture-${sequence}`)
  if (result.status === 'rejected') throw new Error(`runtime-smoke-fixture-rejected:${intent.kind}:${result.reason}`)
  return result.session
}

/**
 * Dev-only browser fixture. It constructs a real, validated EventLedger by
 * dispatching the same intents as the UI; it never seeds GameState directly.
 */
export function createRuntimeSmokeFixture(target: RuntimeSmokeFixture): PreviewRuntimeSession {
  let session = createPreviewRuntimeSession(`smoke-world-${target}`)
  let sequence = 0
  const send = (intent: PreviewRuntimeIntent) => {
    sequence += 1
    session = apply(session, intent, sequence)
  }

  send({ kind: 'goal.selected', payload: { goalId: 'achievement' } })
  send({ kind: 'document.remembered', payload: { selectedIds: ['cause-initial', 'doc-final'] } })
  send({ kind: 'ledger.remembered', payload: { selectedIds: ['E-002', 'E-003'] } })
  send({ kind: 'person.asked', payload: { personId: 'liangshang' } })
  send({ kind: 'person.asked', payload: { personId: 'gentry' } })
  send({
    kind: 'river.plan.confirmed',
    payload: {
      plan: {
        leader: 'expert',
        leaderName: '顾逢源',
        material: 8,
        labor: 24,
        supervisor: '县丞会勘',
        detail: '分段抢护并昼夜巡守',
      },
    },
  })
  send({ kind: 'banquet.choice', payload: { choice: 'attend' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'material-arrival', optionId: 'weigh' } })
  send({ kind: 'person.asked', payload: { personId: 'xiancheng' } })
  send({ kind: 'person.asked', payload: { personId: 'expert' } })
  send({ kind: 'person.asked', payload: { personId: 'zhubu' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'zhubu-visit', optionId: 'confront' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'commissioner-arrival', optionId: 'report' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'gate-gift', optionId: 'forbid' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'day.advanced', payload: {} })

  if (session.state.day !== 8 || session.state.pendingEvent !== 'storm'
    || !session.state.plan || !session.state.outcome) {
    throw new Error('runtime-smoke-fixture-day8-invariant-failed')
  }

  if (target === 'day8') return session

  send({ kind: 'world.event.resolved', payload: { eventId: 'storm', optionId: 'inspect' } })
  send({ kind: 'day.advanced', payload: {} })
  if (target === 'day9') return session

  send({ kind: 'day.advanced', payload: {} })
  if (target === 'day10') return session

  send({ kind: 'official.action', payload: { key: 'commissioner' } })
  send({ kind: 'official.action', payload: { key: 'files' } })
  send({ kind: 'official.action', payload: { key: 'impeach' } })
  if (session.state.day !== 10 || session.state.periodIndex !== 3) {
    throw new Error('runtime-smoke-fixture-day10-night-invariant-failed')
  }
  return session
}
