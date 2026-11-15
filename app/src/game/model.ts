import type { TaskOutcome } from './schedule'
import type { Clue, Comparison, GameLog, OfficialActionId, RiverPlan, TaskStage, ToastMessage } from '../types'

export interface GameState {
  goalId: string | null
  day: number
  periodIndex: number
  clues: Clue[]
  comparisons: Comparison[]
  unlocked: string[]
  asked: string[]
  completedActions: string[]
  plan: RiverPlan | null
  officialActions: OfficialActionId[]
  officialRead: boolean
  material: { arrived: number; transit: number; unsent: number }
  outcome: TaskOutcome | null
  handledEvents: string[]
  pendingEvent: string | null
  probeKnown: boolean
  privateFunds: number
  giftEntries: string[]
  log: GameLog
}

export type { TaskStage, ToastMessage }
