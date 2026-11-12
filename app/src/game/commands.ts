/**
 * FE-161 / FE-162 统一命令层（G1.5）：UI 正式批答 / 世界事件 / AI 生成事件三入口的唯一结算入口。
 * 四步集中在此：前置条件校验 → 成本（spendAction）→ 原子结算（一次返回新 state，不中途 setState）→ 拒绝原因。
 * UI 只组装 command 与提示，不持有结算；effects.ts 只映射 effect id → command 声明（含是否耗时段）。
 * 数值 / 阈值 / 文案一条未改；唯一成本变化＝AI 入口的正式业务行动与 UI 入口一致耗时段（用户施工单授权）。
 * 判定口径单源（红线 29/32）：可用性谓词来自 effects 目录与 engine，命令层不另算一套。
 */
import type { GameState } from './useGame'
import type { OfficialActionId } from '../types'
import type { GeneratedEvent } from '../narrative/types'
import { officialAvailableOf, resolveWorldOptionPure, spendAction } from './engine'
import { worldEvents } from './schedule'
import { effectById, type EffectCommand, type EffectPayload } from '../narrative/effects'

export type Command =
  | { kind: 'official'; key: OfficialActionId }
  | { kind: 'event'; eventId: string; optionId: string }
  | { kind: 'generated'; event: GeneratedEvent; optionId: string }

export interface CommandResult {
  state: GameState
  /** 拒绝原因；rejected 时 state 原样返回（引用不变），保证原子性。 */
  rejected?: string
}

const officialKeys: OfficialActionId[] = ['endorse', 'commissioner', 'files', 'citation', 'impeach', 'suppress']

export function executeCommand(state: GameState, command: Command): CommandResult {
  if (command.kind === 'official') return executeOfficial(state, command.key)
  if (command.kind === 'event') return executeWorldEvent(state, command.eventId, command.optionId)
  if (command.kind === 'generated') return executeGenerated(state, command.event, command.optionId)
  return { state, rejected: 'unknown-command' }
}

/** UI 正式批答入口：语义与原 useGame.runOfficialAction 逐字一致（批/压/考三法既有即不耗段）。 */
function executeOfficial(state: GameState, key: OfficialActionId): CommandResult {
  if (!officialKeys.includes(key)) return { state, rejected: 'unknown-official' }
  if (state.officialActions.includes(key)) return { state, rejected: 'repeated' }
  const base: GameState = { ...state, officialRead: true, officialActions: [...state.officialActions, key] }
  if (key === 'endorse') {
    return { state: { ...base, log: { ...state.log, rumor: '知府批「查」字已到县 书办忙着把初稿抽出去' } } }
  }
  if (key === 'suppress') {
    return { state: { ...base, log: { ...state.log, rumor: '你把上宪来文压在匣底 幕友看见了 却没说话' } } }
  }
  if (key === 'citation') {
    return { state: { ...base, log: { ...state.log, rumor: '幕友把实迹拟成考语 一句话会在册子里留很多年' } } }
  }
  const spent = spendAction(base, `official-${key}`)
  if (!spent) return { state, rejected: 'repeated' }
  if (key === 'commissioner') {
    return {
      state: {
        ...spent,
        unlocked: [...new Set([...spent.unlocked, 'E-008'])],
        log: { ...spent.log, done: '请委员覆勘东堤 勘报与你探挖相合', stuck: '闸底淘空已复核 抢护合式与否候委员定论', rumor: '委员到县 主簿先把旧册锁进了库房' },
      },
    }
  }
  if (key === 'files') {
    return {
      state: {
        ...spent,
        unlocked: [...new Set([...spent.unlocked, 'E-004'])],
        log: { ...spent.log, done: '调河厅旧修造册并传询书办 旧工料数在册', stuck: '修造册与今次拨料须逐垛对核 书办口径已录', rumor: '书办被传询一次 见人便说「年久册乱」' },
      },
    }
  }
  return {
    state: {
      ...spent,
      log: { ...spent.log, done: '具揭参劾书办失察 稿已封发', stuck: '揭参已上 县衙上下各寻退路', rumor: '有人说你刻 有人说你清 委员尚未表态' },
    },
  }
}

/** 世界事件入口：FE-162 幂等与合法性校验在此集中；结算仍走引擎纯函数，不耗时段（既有口径）。 */
function executeWorldEvent(state: GameState, eventId: string, optionId: string): CommandResult {
  // 幂等：同一 eventId 不可二次结算（handledEvents 命中即拒绝，不重复立疑点、不重复写 log）。
  if (state.handledEvents.includes(eventId)) return { state, rejected: 'already-handled' }
  // 合法性：世界事件必须正是当前待决事件；生成事件（ai- 前缀）不走本入口。
  if (state.pendingEvent !== eventId) return { state, rejected: 'not-pending' }
  const event = worldEvents.find(item => item.id === eventId)
  if (!event) return { state, rejected: 'unknown-event' }
  if (!event.options.some(option => option.id === optionId)) return { state, rejected: 'unknown-option' }
  return { state: resolveWorldOptionPure(state, eventId, optionId) }
}

/** AI 生成事件入口：不入存档结构，只借既有 handledEvents 记已决；FE-161 在此统一成本口径。 */
function executeGenerated(state: GameState, event: GeneratedEvent, optionId: string): CommandResult {
  // 生成事件 id 以 ai- 开头、不经 pendingEvent 字段；非 ai- id 不得借本入口绕过世界事件校验。
  if (!event.id.startsWith('ai-')) return { state, rejected: 'not-generated' }
  // 幂等：同一 eventId 不可二次结算（与 UI 世界事件同口径）。
  if (state.handledEvents.includes(event.id)) return { state, rejected: 'already-handled' }
  const option = event.options.find(item => item.id === optionId)
  if (!option) return { state, rejected: 'unknown-option' }
  const effect = effectById(option.effect)
  // 越权 / 未登记效果一律拒绝，不静默降级为风闻（FE-161）。
  if (!effect) return { state, rejected: 'unknown-effect' }
  if (!effect.available(state, officialAvailableOf(state))) return { state, rejected: 'effect-unavailable' }
  let base: GameState = { ...state, handledEvents: [...state.handledEvents, event.id], pendingEvent: null }
  // 成本：正式业务行动耗一个时段，与 UI 入口一致；幂等键 official 类与 UI 共享。
  if (effect.cost === 'action') {
    const spent = spendAction(base, effect.costKey ?? `effect-${effect.id}`)
    if (!spent) return { state, rejected: 'repeated' }
    base = spent
  }
  return { state: settleEffect(base, effect.command, { line: option.result || option.label, refs: option.refs ?? [] }) }
}

/** 解释效果命令声明：与既有引擎语义同形（记 log / 立疑点 / 解锁凭据 / 行批答），数值与文案一条不改。 */
function settleEffect(base: GameState, command: EffectCommand, payload: EffectPayload): GameState {
  if (command.type === 'log') {
    return { ...base, log: { ...base.log, [command.field]: payload.line } }
  }
  if (command.type === 'clue') {
    return {
      ...base,
      clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: payload.line, source: command.source, refs: payload.refs, day: base.day }],
      log: { ...base.log, done: payload.line },
    }
  }
  if (command.type === 'unlock') {
    return { ...base, unlocked: [...new Set([...base.unlocked, command.evidence])], log: { ...base.log, done: payload.line } }
  }
  return {
    ...base,
    officialRead: true,
    officialActions: [...base.officialActions, command.key],
    unlocked: [...new Set([...base.unlocked, command.evidence])],
    log: { ...base.log, done: payload.line },
  }
}