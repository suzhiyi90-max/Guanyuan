/**
 * FE-157 AI 叙事框架 · 契约层（依 20-AI叙事与模型接入.md 三 / 六 / 十一）。
 * 模型只产出叙述层内容；判定、数值、时段、存档一律由本地引擎结算。
 * 事件效果只能从 effects.ts 的本地目录里选 id，模型不得自造数值。
 */
import type { WorldEvent, WorldEventOption } from '../game/schedule'

export type ProviderFamily = 'openai-compat' | 'anthropic' | 'gemini'

export interface ProviderCaps {
  stream: boolean
  jsonMode: boolean
  contextWindow: number
}

export interface TokenUsage {
  prompt: number
  completion: number
}

export type NarrationIntent = '问事' | '闲谈' | '请示' | '旁白'

/** 结构化节拍：先到，界面据此先摆好场景与在场者。 */
export interface StoryBeat {
  scene: string
  present: string[]
  mood: string
}

/** 每次只给四样（20 五）：静态事实表 / 状态快照 / 滚动摘要 / 本次意图。 */
export interface NarrationContext {
  facts: string
  snapshot: string
  summary: string
  intent: NarrationIntent
  tone: string
  maxChars: number
  seed: number
  /** 本次允许模型选用的效果 id；越界即整段丢弃。 */
  allowedEffects: string[]
  /** 效果目录的语义说明，随上下文一起交给模型。 */
  effectMenu: string
}

export type NarratorChunk =
  | { type: 'meta'; model: string; usage?: TokenUsage }
  | { type: 'beat'; beat: StoryBeat }
  | { type: 'text'; delta: string }
  | { type: 'done'; finishReason: string }

export interface NarratorProvider {
  id: string
  label: string
  family: ProviderFamily
  capabilities(): Promise<ProviderCaps>
  stream(ctx: NarrationContext, signal: AbortSignal): AsyncIterable<NarratorChunk>
}

export type ProfileTier = 'daily' | 'chapter'

/** 非密配置：可导出、可落盘。key 不在此结构内。 */
export interface NarratorProfile {
  id: string
  label: string
  family: ProviderFamily
  baseURL: string
  model: string
  tier: ProfileTier
}

export interface GeneratedEventOption extends WorldEventOption {
  /** 本地效果目录 id；结算时由 effects.ts 执行，模型无权写数值。 */
  effect: string
  /** 模型写的落笔句，只进 log / clue.text。 */
  result: string
  /** 凭据号，须在白名单内；clue 类效果用作 refs。 */
  refs?: string[]
}

export interface GeneratedEvent extends WorldEvent {
  options: GeneratedEventOption[]
  origin: 'ai'
  seed: number
  createdAt: number
  profileId: string
  mood: string
}

export type NarrationPhase = 'idle' | 'archive' | 'draft' | 'ink' | 'settled' | 'quiet'

export interface NarrationRun {
  phase: NarrationPhase
  beat: StoryBeat | null
  /** 已洇开的正文（rAF 合批后的可见文本）。 */
  ink: string
  event: GeneratedEvent | null
  /** 静默回落时的世界内说法，不暴露厂家 / 模型 / prompt。 */
  quietNote: string | null
  elapsed: number
  fromCache: boolean
}

export interface UsageEntry {
  day: number
  prompt: number
  completion: number
  at: number
}

export const intentTone: Record<NarrationIntent, string> = {
  问事: '克制、就事论事，先给事实再给态度',
  闲谈: '松弛、有市井气，不推进任何事务',
  请示: '下对上，恭谨而有算计，话留三分',
  旁白: '冷峻白描，只写看见的，不替人物下判断',
}

export const intentMaxChars: Record<NarrationIntent, number> = {
  问事: 220,
  闲谈: 180,
  请示: 220,
  旁白: 260,
}