import type { GameState } from './model'

export function createInitialGameState(): GameState {
  return {
    goalId: null,
    day: 1,
    periodIndex: 0,
    clues: [],
    comparisons: [],
    unlocked: ['E-001', 'P-006'],
    asked: [],
    completedActions: [],
    plan: null,
    officialActions: [],
    officialRead: false,
    material: { arrived: 30, transit: 10, unsent: 10 },
    outcome: null,
    handledEvents: [],
    pendingEvent: null,
    probeKnown: false,
    privateFunds: 60,
    giftEntries: [],
    log: {
      done: '接印，收东堤渗水呈文一件',
      stuck: '渗水因由未明，三人口供尚待接触',
      rumor: '茶楼有人说“修衙署”，暂无凭据',
    },
  }
}
