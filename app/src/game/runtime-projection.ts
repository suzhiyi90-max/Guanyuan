import { people } from '../data'
import type { EventRegistry } from '../domain/event-registry'
import { rebuildReadOnlyProjection, type ReadOnlyProjection, type ReplayFailure, type StreamCursor } from '../domain/event-replay'
import type { JsonValue, LedgerEvent, WorldId } from '../domain/event-ledger'
import { executeCommand } from './commands'
import { advanceDay, periods, spendAction } from './engine'
import { createInitialGameState } from './initial-state'
import type { GameState } from './model'
import type { PreviewRuntimeEventKind } from './runtime-registry'
import type { RiverPlan } from '../types'

function rejectReplay(reason: string): never {
  throw new Error(`preview-runtime-reducer:${reason}`)
}

/**
 * Pure deterministic reducer for the currently playable preview.
 * Invalid committed actions throw so replay rejects the range atomically.
 */
export function reducePreviewRuntimeEvent(
  state: GameState,
  event: LedgerEvent<PreviewRuntimeEventKind>,
): GameState {
  if (event.kind === 'candidate.validated') return state
  const payload = event.payload as Record<string, JsonValue>

  switch (event.kind) {
    case 'goal.selected':
      return { ...state, goalId: payload.goalId as string }

    case 'document.remembered': {
      if (state.completedActions.includes('doc-remembered')) return rejectReplay('document-already-remembered')
      const selected = payload.selectedIds as string[]
      if (selected.length < 2) return rejectReplay('document-comparison-needs-two-sources')
      const hasCause = selected.some(id => id.startsWith('cause'))
      const text = hasCause
        ? '初稿断言“堤土未实”，定稿改称“闸底未明”：渗水因由并无勘查依据，书办为何先下结论？'
        : '东堤呈文两版在范围、料数或工法上有改动：改动依据未附，须找经手人问明。'
      const question = hasCause
        ? '未经探挖，初稿凭什么先定“堤土未实”？谁让书办这样写？'
        : '两版之间改了什么、谁来改、依据附在哪一页？'
      return {
        ...state,
        completedActions: [...state.completedActions, 'doc-remembered'],
        clues: [...state.clues, { id: `C-${state.clues.length + 1}`, text, source: 'document', refs: selected, day: state.day }],
        comparisons: [...state.comparisons, { id: `B-${state.comparisons.length + 1}`, source: 'document', refs: selected, question, day: state.day }],
        log: { ...state.log, stuck: '呈文因由有改，书办与闸底工法须再核' },
      }
    }

    case 'ledger.remembered': {
      if (state.completedActions.includes('ledger-remembered')) return rejectReplay('ledger-already-remembered')
      const selected = payload.selectedIds as string[]
      if (selected.length < 2) return rejectReplay('ledger-comparison-needs-two-sources')
      const ids = selected.join(' / ')
      return {
        ...state,
        completedActions: [...state.completedActions, 'ledger-remembered'],
        clues: [...state.clues, { id: `C-${state.clues.length + 1}`, text: `并置 ${ids}：三百两在库账、借领与旧欠中的名义不同，须核是否同一笔，不得重复计成六百两。`, source: 'ledger', refs: selected, day: state.day }],
        comparisons: [...state.comparisons, { id: `B-${state.comparisons.length + 1}`, source: 'ledger', refs: selected, question: '同一笔三百两，在几本账里各叫什么名字？经手人分别是谁？', day: state.day }],
        log: { ...state.log, stuck: '三百两名义不一，须核同一笔账的流转与责任' },
      }
    }

    case 'person.asked': {
      const personId = payload.personId as string
      if (!people.some(person => person.id === personId)) return rejectReplay('person-not-found')
      if (state.asked.includes(personId)) return rejectReplay('person-already-asked')
      const spent = spendAction(state, `ask-${personId}`)
      if (!spent) return rejectReplay('person-action-already-spent')
      return {
        ...spent,
        asked: [...spent.asked, personId],
        unlocked: personId === 'liangshang' ? [...new Set([...spent.unlocked, 'E-003'])] : spent.unlocked,
      }
    }

    case 'records.audited': {
      if (state.completedActions.includes('audit')) return rejectReplay('records-already-audited')
      const spent = spendAction(state, 'audit')
      if (!spent) return rejectReplay('audit-action-already-spent')
      return {
        ...spent,
        unlocked: [...new Set([...spent.unlocked, 'E-002'])],
        log: { ...spent.log, done: '细查旧册，找出主簿三百两借领状', stuck: '借领状与粮商旧欠是否同一笔，尚待互证' },
      }
    }

    case 'river.probed': {
      if (state.probeKnown) return rejectReplay('river-already-probed')
      const spent = spendAction(state, 'probe')
      if (!spent) return rejectReplay('probe-action-already-spent')
      return {
        ...spent,
        probeKnown: true,
        unlocked: [...new Set([...spent.unlocked, 'E-007'])],
        clues: [...spent.clues, { id: `C-${spent.clues.length + 1}`, text: 'E-007 探挖记录：旧闸底淘空三尺。书办“毋庸拆验”与现场记录不符，但其动机尚不能据此断定。', source: 'river', refs: ['E-007'], day: spent.day }],
        log: { ...spent.log, done: '亲勘东堤，探挖见闸底淘空三尺', stuck: '抢护可先行，拆修须汛后另案；料与夫仍有缺口' },
      }
    }

    case 'plan.previewed':
      if (state.completedActions.includes('plan-preview')) return rejectReplay('plan-already-previewed')
      return { ...state, completedActions: [...state.completedActions, 'plan-preview'] }

    case 'river.plan.confirmed': {
      if (state.plan) return rejectReplay('river-plan-already-confirmed')
      const spent = spendAction(state, 'plan-river')
      if (!spent) return rejectReplay('river-plan-action-already-spent')
      const plan = payload.plan as unknown as Omit<RiverPlan, 'day' | 'period'>
      return {
        ...spent,
        plan: { ...plan, day: state.day, period: periods[state.periodIndex] },
        log: { ...spent.log, done: '东堤抢护已签押发起，县丞会勘、工头监作', stuck: '抢护需三至四日；在途十垛与旧欠仍可能生变' },
      }
    }

    case 'banquet.choice': {
      if (state.periodIndex !== 3) return rejectReplay('banquet-choice-outside-night')
      const actionKey = `banquet-${state.day}`
      if (state.completedActions.includes(actionKey)) return rejectReplay('banquet-already-decided')
      const choice = payload.choice
      if (choice === 'attend') {
        return {
          ...state,
          completedActions: [...state.completedActions, actionKey],
          privateFunds: state.privateFunds - 20,
          giftEntries: [...state.giftEntries, '桑宅接风宴 · 亲赴，花费二十两'],
          unlocked: [...new Set([...state.unlocked, 'E-003'])],
          asked: [...new Set([...state.asked, 'liangshang', 'gentry'])],
          log: { done: '赴桑宅接风宴，取得旧欠票据与坟图线索', stuck: '三百两旧欠已有票据，偿还安排与坟地土源未定', rumor: '桑宅赞你通达；主簿整夜未发一言' },
        }
      }
      if (choice === 'delegate') {
        return {
          ...state,
          completedActions: [...state.completedActions, actionKey],
          privateFunds: state.privateFunds - 6,
          giftEntries: [...state.giftEntries, '桑宅接风宴 · 县丞代往，备礼六两'],
          asked: [...new Set([...state.asked, 'xiancheng'])],
          log: { done: '请县丞代赴桑宅宴，县衙礼数未失', stuck: '旧欠只听转述，坟地仍须亲自说合', rumor: '桑士绅嫌你生分；县丞却记下这份托付' },
        }
      }
      if (choice === 'audit') {
        return {
          ...state,
          completedActions: [...state.completedActions, actionKey],
          unlocked: [...new Set([...state.unlocked, 'E-002'])],
          giftEntries: [...state.giftEntries, '桑宅接风宴 · 未赴，闭门查旧册'],
          log: { done: '闭门查旧册，取得主簿三百两借领状', stuck: '借领用途已见，粮商旧欠与现场抢护仍待核', rumor: '桑宅面上无光；主簿连夜打听谁动过旧册' },
        }
      }
      return rejectReplay('banquet-choice-invalid')
    }

    case 'official.action': {
      const result = executeCommand(state, { kind: 'official', key: payload.key as never })
      if (result.rejected) return rejectReplay(`official-action-${result.rejected}`)
      return result.state
    }

    case 'world.event.resolved': {
      const result = executeCommand(state, {
        kind: 'event',
        eventId: payload.eventId as string,
        optionId: payload.optionId as string,
      })
      if (result.rejected) return rejectReplay(`world-event-${result.rejected}`)
      return result.state
    }

    case 'day.advanced':
      return advanceDay(state)

    default: {
      const unhandled: never = event.kind
      return rejectReplay(`event-kind-unhandled-${String(unhandled)}`)
    }
  }
}

export interface PreviewRuntimeReplayInput {
  readonly worldId: WorldId
  readonly toInclusive: StreamCursor
  readonly events: readonly LedgerEvent<PreviewRuntimeEventKind>[]
  readonly registry: EventRegistry<PreviewRuntimeEventKind>
}

/** Rebuilds the preview GameState from genesis; result state is deep-frozen and read-only. */
export function rebuildPreviewRuntimeProjection(
  input: PreviewRuntimeReplayInput,
): ReadOnlyProjection | ReplayFailure {
  return rebuildReadOnlyProjection({
    worldId: input.worldId,
    fromExclusive: { kind: 'genesis', seq: 0 },
    toInclusive: input.toInclusive,
    events: input.events,
    registry: input.registry,
    initialState: createInitialGameState() as unknown as JsonValue,
    reduce: (state, event) => reducePreviewRuntimeEvent(
      state as unknown as GameState,
      event,
    ) as unknown as JsonValue,
  })
}
