/**
 * FE-157 本地效果目录：AI 只能「选 id」，不能写数值、不能改判定口径。
 * 每个效果都复用既有引擎已经做过的事（记 log / 立疑点 / 解锁既有凭据 / 行既有批答），
 * 不引入任何新的经济数值、时段消耗或判定阈值。模型给的句子只进 log 与 clue.text。
 */
import type { GameState } from '../game/useGame'
import type { ClueSource } from '../types'
import type { GeneratedEvent } from './types'

export interface EffectPayload {
  line: string
  refs: string[]
}

export interface EffectSpec {
  id: string
  /** 给模型看的语义说明。 */
  label: string
  /** 选项上「代价 / 后果」的本地权威口径，追加在模型措辞之后。 */
  hint: string
  kind: 'log' | 'clue' | 'unlock' | 'official'
  available(state: GameState, officialAvailable: boolean): boolean
  apply(base: GameState, payload: EffectPayload): GameState
}

function withClue(source: ClueSource) {
  return (base: GameState, payload: EffectPayload): GameState => ({
    ...base,
    clues: [...base.clues, {
      id: `C-${base.clues.length + 1}`,
      text: payload.line,
      source,
      refs: payload.refs,
      day: base.day,
    }],
    log: { ...base.log, done: payload.line },
  })
}

export const effectCatalog: EffectSpec[] = [
  {
    id: 'log-done', label: '只记一笔已办，不留凭据', hint: '入「已办」· 不立疑点', kind: 'log',
    available: () => true,
    apply: (base, p) => ({ ...base, log: { ...base.log, done: p.line } }),
  },
  {
    id: 'log-rumor', label: '只落街面风评，不入公账', hint: '入「风闻」· 喂考语与回声', kind: 'log',
    available: () => true,
    apply: (base, p) => ({ ...base, log: { ...base.log, rumor: p.line } }),
  },
  {
    id: 'log-stuck', label: '留一处未决，日后须再核', hint: '入「未决」· 不推进事务', kind: 'log',
    available: () => true,
    apply: (base, p) => ({ ...base, log: { ...base.log, stuck: p.line } }),
  },
  {
    id: 'clue-document', label: '从文书上立一条疑点', hint: '疑点 +1 · 来源文书', kind: 'clue',
    available: () => true, apply: withClue('document'),
  },
  {
    id: 'clue-ledger', label: '从账目上立一条疑点', hint: '疑点 +1 · 来源账目', kind: 'clue',
    available: () => true, apply: withClue('ledger'),
  },
  {
    id: 'clue-river', label: '从堤工现场立一条疑点', hint: '疑点 +1 · 来源河工', kind: 'clue',
    available: () => true, apply: withClue('river'),
  },
  {
    id: 'unlock-e008', label: '取得委员勘报 E-008 入卷', hint: '勘报 E-008 入卷 · 须已发起抢护', kind: 'unlock',
    available: state => Boolean(state.plan) && !state.unlocked.includes('E-008'),
    apply: (base, p) => ({
      ...base,
      unlocked: [...new Set([...base.unlocked, 'E-008'])],
      log: { ...base.log, done: p.line },
    }),
  },
  {
    id: 'official-commissioner', label: '请委员赴东堤覆勘', hint: '行「委员覆勘」· 勘报入卷', kind: 'official',
    available: (state, officialAvailable) => officialAvailable && !state.officialActions.includes('commissioner'),
    apply: (base, p) => ({
      ...base,
      officialRead: true,
      officialActions: [...base.officialActions, 'commissioner'],
      unlocked: [...new Set([...base.unlocked, 'E-008'])],
      log: { ...base.log, done: p.line },
    }),
  },
]

export function effectById(id: string): EffectSpec | undefined {
  return effectCatalog.find(effect => effect.id === id)
}

/** 本次可用的效果 id；只把可用项交给模型，越界即整段丢弃。 */
export function availableEffectIds(state: GameState, officialAvailable: boolean): string[] {
  return effectCatalog.filter(effect => effect.available(state, officialAvailable)).map(effect => effect.id)
}

export function effectMenu(state: GameState, officialAvailable: boolean): string {
  return effectCatalog
    .filter(effect => effect.available(state, officialAvailable))
    .map(effect => `- ${effect.id}：${effect.label}（${effect.hint}）`)
    .join('\n')
}

/**
 * 结算生成事件的一个选项。判定与数值全部走本地目录；
 * 模型措辞只作 log / clue 文本，选项 hint 由本地口径兜底，玩家看到的后果永远是真的。
 */
export function applyGeneratedOption(base: GameState, event: GeneratedEvent, optionId: string): GameState {
  const option = event.options.find(item => item.id === optionId)
  if (!option) return base
  const effect = effectById(option.effect)
  if (!effect) return { ...base, log: { ...base.log, rumor: option.label } }
  return effect.apply(base, { line: option.result || option.label, refs: option.refs ?? [] })
}