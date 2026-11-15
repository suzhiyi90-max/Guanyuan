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

  // Mirror the smoke's actual first-day route: compare the document, ask the
  // county deputy, issue a foreman-led plan, ask the clerk, then audit at night.
  send({ kind: 'goal.selected', payload: { goalId: 'achievement' } })
  send({ kind: 'document.remembered', payload: { selectedIds: ['cause-initial', 'cause-final'] } })
  send({ kind: 'person.asked', payload: { personId: 'xiancheng' } })
  send({
    kind: 'river.plan.confirmed',
    payload: {
      plan: {
        leader: 'foreman',
        leaderName: '赵九河',
        material: 8,
        labor: 30,
        supervisor: '县丞会勘 · 工头监作',
        detail: '赵九河主办 · 料8垛 · 夫30人 · 县丞会勘 · 工头监作',
      },
    },
  })
  send({ kind: 'person.asked', payload: { personId: 'zhubu' } })
  send({ kind: 'banquet.choice', payload: { choice: 'audit' } })
  send({ kind: 'day.advanced', payload: {} })

  // Day two: receive and weigh material; the two upper-government actions
  // are recorded before the next day, exactly as the playable smoke path.
  send({ kind: 'world.event.resolved', payload: { eventId: 'material-arrival', optionId: 'weigh' } })
  send({ kind: 'official.action', payload: { key: 'commissioner' } })
  send({ kind: 'official.action', payload: { key: 'files' } })
  send({ kind: 'day.advanced', payload: {} })

  // Day three: confront the clerk, then formally contact the merchant and
  // gentry. The merchant contact unlocks E-003, which is material to the
  // later outcome and the factual citation.
  send({ kind: 'world.event.resolved', payload: { eventId: 'zhubu-visit', optionId: 'confront' } })
  send({ kind: 'person.asked', payload: { personId: 'liangshang' } })
  send({ kind: 'person.asked', payload: { personId: 'gentry' } })
  send({ kind: 'records.audited', payload: {} })
  send({ kind: 'banquet.choice', payload: { choice: 'delegate' } })
  send({ kind: 'day.advanced', payload: {} })

  // The fourth-day outcome is now computed from the complete fact stream.
  send({ kind: 'official.action', payload: { key: 'citation' } })
  send({ kind: 'official.action', payload: { key: 'impeach' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'commissioner-arrival', optionId: 'inspect' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'world.event.resolved', payload: { eventId: 'gate-gift', optionId: 'forbid' } })
  send({ kind: 'day.advanced', payload: {} })
  send({ kind: 'day.advanced', payload: {} })

  if (session.state.day !== 8 || session.state.pendingEvent !== 'storm'
    || !session.state.plan || !session.state.outcome
    || !session.state.unlocked.includes('E-003')
    || session.state.outcome.grade !== '合龙'
    || !session.state.giftEntries.some(entry => entry.includes('闭门查旧册'))) {
    throw new Error('runtime-smoke-fixture-day8-invariant-failed')
  }

  if (target === 'day8') return session

  send({ kind: 'world.event.resolved', payload: { eventId: 'storm', optionId: 'inspect' } })
  send({ kind: 'day.advanced', payload: {} })
  if (target === 'day9') return session

  send({ kind: 'day.advanced', payload: {} })
  if (target === 'day10') return session

  // Three remaining action-costing intents provide a genuine night cursor;
  // the fixture still reaches it through append + replay, not state seeding.
  send({ kind: 'person.asked', payload: { personId: 'expert' } })
  send({ kind: 'person.asked', payload: { personId: 'foreman' } })
  send({ kind: 'river.probed', payload: {} })
  if (Number(session.state.day) !== 10 || session.state.periodIndex !== 3) {
    throw new Error('runtime-smoke-fixture-day10-night-invariant-failed')
  }
  return session
}
