/**
 * FE-157 本地效果目录；FE-161 改为纯映射：effect id → command 声明（含是否耗时段）。
 * AI 只能「选 id」，不能写数值、不能改判定口径。
 * 结算逻辑全部在 game/commands.ts（前置校验 → 成本 → 原子结算 → 拒绝原因），本文件不持有结算。
 * 成本口径（FE-161 用户施工单授权）：改变正式业务状态（解锁凭据 / 行正式批答）必须耗时段，与 UI 入口一致；
 * 纯叙述类（log-*）与认知层立疑点（clue-*）cost:'none'。模型给的句子只进 log 与 clue.text。
 */
import type { GameState } from '../game/useGame'
import type { ClueSource, OfficialActionId } from '../types'

export interface EffectPayload {
  line: string
  refs: string[]
}

/** 命令声明：纯数据，由 game/commands.ts 解释执行；本目录不写任何结算逻辑。 */
export type EffectCommand =
  | { type: 'log'; field: 'done' | 'rumor' | 'stuck' }
  | { type: 'clue'; source: ClueSource }
  | { type: 'unlock'; evidence: string }
  | { type: 'official'; key: OfficialActionId; evidence: string }

export interface EffectSpec {
  id: string
  /** 给模型看的语义说明。 */
  label: string
  /** 选项上「代价 / 后果」的本地权威口径，追加在模型措辞之后。 */
  hint: string
  kind: 'log' | 'clue' | 'unlock' | 'official'
  /** FE-161 成本口径：action＝耗一个时段（正式业务状态）；none＝纯叙述 / 认知记录。 */
  cost: 'action' | 'none'
  /** cost:'action' 时的 spendAction 幂等键；official 类与 UI 入口共享 `official-<key>`，跨入口互斥。 */
  costKey?: string
  /** 命令声明（纯映射）。 */
  command: EffectCommand
  available(state: GameState, officialAvailable: boolean): boolean
}

export const effectCatalog: EffectSpec[] = [
  {
    id: 'log-done', label: '只记一笔已办，不留凭据', hint: '入「已办」· 不立疑点', kind: 'log',
    // cost:none —— 纯叙述：只写 log.done 一行，不改正式业务状态（与 FE-156 家人事件「只写 log、不耗时段」同口径）。
    cost: 'none', command: { type: 'log', field: 'done' },
    available: () => true,
  },
  {
    id: 'log-rumor', label: '只落街面风评，不入公账', hint: '入「风闻」· 喂考语与回声', kind: 'log',
    // cost:none —— 纯叙述：只写 log.rumor 一行，风评是叙事层记录，不是正式业务行动。
    cost: 'none', command: { type: 'log', field: 'rumor' },
    available: () => true,
  },
  {
    id: 'log-stuck', label: '留一处未决，日后须再核', hint: '入「未决」· 不推进事务', kind: 'log',
    // cost:none —— 纯叙述：只写 log.stuck 一行，不推进事务、不改正式业务状态。
    cost: 'none', command: { type: 'log', field: 'stuck' },
    available: () => true,
  },
  {
    id: 'clue-document', label: '从文书上立一条疑点', hint: '疑点 +1 · 来源文书', kind: 'clue',
    // cost:none —— 立疑点是认知层记录（信息），不是正式业务行动；与世界事件「复秤立疑点不耗时段」同口径。
    cost: 'none', command: { type: 'clue', source: 'document' },
    available: () => true,
  },
  {
    id: 'clue-ledger', label: '从账目上立一条疑点', hint: '疑点 +1 · 来源账目', kind: 'clue',
    // cost:none —— 同上：认知层记录，与世界事件「并置立疑点不耗时段」同口径。
    cost: 'none', command: { type: 'clue', source: 'ledger' },
    available: () => true,
  },
  {
    id: 'clue-river', label: '从堤工现场立一条疑点', hint: '疑点 +1 · 来源河工', kind: 'clue',
    // cost:none —— 同上：认知层记录，与世界事件「暴雨立疑点不耗时段」同口径。
    cost: 'none', command: { type: 'clue', source: 'river' },
    available: () => true,
  },
  {
    id: 'unlock-e008', label: '取得委员勘报 E-008 入卷', hint: '勘报 E-008 入卷 · 须已发起抢护 · 耗一个时段', kind: 'unlock',
    // cost:action —— 解锁正式凭据＝改变正式业务状态，必须与 UI 入口一致耗时段（FE-161 修复免费执行路径）。
    // hint 尾注「耗一个时段」为授权成本变化的如实披露（FE-157「玩家看到的后果永远是真的」），非无关文案改动。
    cost: 'action', costKey: 'effect-unlock-e008', command: { type: 'unlock', evidence: 'E-008' },
    available: state => Boolean(state.plan) && !state.unlocked.includes('E-008'),
  },
  {
    id: 'official-commissioner', label: '请委员赴东堤覆勘', hint: '行「委员覆勘」· 勘报入卷 · 耗一个时段', kind: 'official',
    // cost:action —— 行正式批答＝改变正式业务状态；costKey 与 UI runOfficialAction('commissioner') 共享，跨入口幂等。
    // hint 尾注同上：成本披露随授权行为变化同步。
    cost: 'action', costKey: 'official-commissioner', command: { type: 'official', key: 'commissioner', evidence: 'E-008' },
    available: (state, officialAvailable) => officialAvailable && !state.officialActions.includes('commissioner'),
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