/**
 * FE-157 上下文与随机性（20 五）：每次只给四样，seed 锁定，温度按意图分档。
 * 快照是只读投影，不含 key、不含完整存档；摘要只取最近数轮，不塞全文。
 */
import { goals } from '../data'
import type { GameState } from '../game/useGame'
import { presentPeopleOf } from '../game/presence'
import type { Period, SceneId } from '../types'
import { availableEffectIds, effectMenu } from './effects'
import { factsSheet } from './lexicon'
import { intentMaxChars, intentTone, type NarrationContext, type NarrationIntent } from './types'

export const sceneNames: Record<SceneId, string> = { county: '县衙', river: '东堤', study: '夜书房' }

export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 缓存键只认「同一处境 + 同一意图 + 同一模型」。
 * 滚动摘要每轮单调增长，若计入则永不命中；事实表长度同理。两者都不入键。
 */
export function contextHash(ctx: NarrationContext, model: string): string {
  return hashSeed([ctx.snapshot, ctx.intent, ctx.seed, model].join('|')).toString(36)
}

export function buildContext(args: {
  state: GameState
  scene: SceneId
  period: Period
  intent: NarrationIntent
  installId: string
  beatIndex: number
  summary: string[]
  officialAvailable: boolean
}): NarrationContext {
  const { state, scene, period, intent, installId, beatIndex, summary, officialAvailable } = args
  const goal = goals.find(item => item.id === state.goalId)
  const present = presentPeopleOf(state, scene, period).map(row => `${row.person.name}（${row.person.role}）`)
  const snapshot = [
    `第${state.day}日 · ${period} · 所在${sceneNames[scene]}`,
    `志向：${goal ? `${goal.title} · ${goal.statement}` : '尚未立志'}`,
    `在场：${present.length ? present.join('、') : '只你一人'}`,
    `疑点${state.clues.length}条 · 私囊${state.privateFunds}两 · 料：到场${state.material.arrived}/在途${state.material.transit}/未发${state.material.unsent}`,
    `抢护：${state.plan ? `已发起（${state.plan.leaderName}领 · 料${state.plan.material}）` : '未发起'}`,
    `已办：${state.log.done || '无'}`,
    `未决：${state.log.stuck || '无'}`,
    `风闻：${state.log.rumor || '无'}`,
  ].join('\n')

  return {
    facts: factsSheet(),
    snapshot,
    summary: summary.slice(-6).join('\n') || '（本局尚无叙事摘要）',
    intent,
    tone: intentTone[intent],
    maxChars: intentMaxChars[intent],
    seed: hashSeed(`${installId}|${state.day}|${scene}|${beatIndex}`),
    allowedEffects: availableEffectIds(state, officialAvailable),
    effectMenu: effectMenu(state, officialAvailable),
  }
}

export function temperatureFor(intent: NarrationIntent): number {
  return intent === '闲谈' ? 0.9 : intent === '旁白' ? 0.7 : 0.75
}

const shape = `{
  "beat": { "scene": "县衙 · 签押房", "present": ["王慎之", "你"], "mood": "试探" },
  "title": "四字到十字的题名",
  "scene": "县衙 · 签押房",
  "present": "王慎之 你",
  "known": "你此刻已经知道什么（一句，不新增事实）",
  "mood": "试探",
  "body": "二十字以上的白描正文，只写看见听见的，不替人物下判断，不新增凭据",
  "options": [
    { "label": "甲案措辞", "hint": "玩家看得见的取舍", "effect": "目录里的id", "result": "落笔后记入卷中的一句", "refs": ["E-001"] },
    { "label": "乙案措辞", "hint": "与甲案不同代价", "effect": "目录里的id", "result": "落笔后记入卷中的一句", "refs": [] }
  ]
}`

export function systemPrompt(ctx: NarrationContext): string {
  return [
    '你是《观远》的叙述层。清末河工县衙，一汛十日。你只写叙述，不做判定。',
    '硬规则：',
    '1. 只输出一个 JSON 对象，不要代码围栏、不要解释、不要 markdown。',
    '2. 只可引用【事实表】里的人名、官职、地名与凭据号；不得造新人、新地名、新官职。',
    '3. 不得给出任何数值、银两增减、时段消耗、成败判定；这些由本地引擎结算。',
    '4. 两个选项必须各有不同代价，effect 只能从【可用效果】里选，不得自造。',
    '5. 不得输出模型名、token、prompt、思维链，不得输出任何密钥形态的字符串。',
    `6. body 篇幅约 ${ctx.maxChars} 字以内，语气：${ctx.tone}。`,
    `7. 本次意图：${ctx.intent}。随机种子 ${ctx.seed}（同种子请给出稳定走向）。`,
    '',
    '【事实表】',
    ctx.facts,
    '',
    '【状态快照 · 只读】',
    ctx.snapshot,
    '',
    '【最近摘要】',
    ctx.summary,
    '',
    '【可用效果 · effect 只能选这些 id】',
    ctx.effectMenu,
    '',
    '【输出形状】',
    shape,
  ].join('\n')
}

export { effectMenu }