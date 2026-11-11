/**
 * FE-157 严格校验（20 五 / 六）：结构先到、正文后到；未登记实体或越权效果整段丢弃。
 * 校验只放行「本地目录能结算」的事件，任何数值字段都不接受模型输入。
 */
import { evidenceIds, presentRegistered, sceneRegistered, unregisteredEntities } from './lexicon'
import type { GeneratedEvent, GeneratedEventOption, StoryBeat } from './types'

export interface ParseOptions {
  day: number
  seed: number
  profileId: string
  allowedEffects: string[]
  maxChars: number
}

export type ParseResult =
  | { ok: true; event: GeneratedEvent }
  | { ok: false; reason: string }

/** 去掉代码围栏与前后散文，取出第一个完整 JSON 对象。 */
export function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = fenced ? fenced[1] : raw
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** 流式增量：从尚未闭合的 JSON 里读出某个字符串字段已到的部分。 */
export function extractStringField(raw: string, key: string): string | null {
  const marker = `"${key}"`
  const at = raw.indexOf(marker)
  if (at < 0) return null
  const colon = raw.indexOf(':', at + marker.length)
  if (colon < 0) return null
  let i = colon + 1
  while (i < raw.length && /\s/.test(raw[i])) i += 1
  if (raw[i] !== '"') return null
  i += 1
  let out = ''
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next === undefined) break
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6)
        if (hex.length < 4) break
        out += String.fromCharCode(Number.parseInt(hex, 16))
        i += 6
        continue
      }
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      i += 2
      continue
    }
    if (ch === '"') break
    out += ch
    i += 1
  }
  return out
}

/** 流式增量：读出已闭合的 beat 对象。 */
export function extractBeat(raw: string): StoryBeat | null {
  const marker = '"beat"'
  const at = raw.indexOf(marker)
  if (at < 0) return null
  const start = raw.indexOf('{', at + marker.length)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          const value = JSON.parse(raw.slice(start, i + 1)) as Partial<StoryBeat>
          if (typeof value.scene !== 'string' || !Array.isArray(value.present)) return null
          return {
            scene: value.scene,
            present: value.present.filter((item): item is string => typeof item === 'string').slice(0, 6),
            mood: typeof value.mood === 'string' ? value.mood.slice(0, 12) : '',
          }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function str(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length < min || text.length > max) return null
  return text
}

const leakPattern = /sk-[A-Za-z0-9]{8,}|api[_-]?key|bearer\s+[A-Za-z0-9]|system\s*prompt| <|prompt\s*[:：]/i

export function parseGeneratedEvent(raw: string, opts: ParseOptions): ParseResult {
  const json = extractJsonObject(raw)
  if (!json) return { ok: false, reason: '未拿到完整结构' }
  let value: Record<string, unknown>
  try {
    value = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { ok: false, reason: '结构无法解析' }
  }
  if (leakPattern.test(json)) return { ok: false, reason: '正文含不该出现的东西' }

  const title = str(value.title, 2, 20)
  const scene = str(value.scene, 2, 24)
  const present = str(value.present, 2, 48)
  const known = str(value.known, 4, 140)
  const body = str(value.body, 20, opts.maxChars + 80)
  const mood = str(value.mood ?? '平', 1, 12) ?? '平'
  if (!title || !scene || !present || !known || !body) return { ok: false, reason: '字段缺失或篇幅越界' }
  if (!sceneRegistered(scene)) return { ok: false, reason: '地名未登记' }
  if (!presentRegistered(present)) return { ok: false, reason: '在场者未登记' }

  if (!Array.isArray(value.options) || value.options.length !== 2) return { ok: false, reason: '须恰好两个选项' }
  const options: GeneratedEventOption[] = []
  for (const [index, item] of value.options.entries()) {
    const row = (item ?? {}) as Record<string, unknown>
    const label = str(row.label, 2, 26)
    const hint = str(row.hint, 2, 48)
    const result = str(row.result, 4, 140)
    const effect = typeof row.effect === 'string' ? row.effect : ''
    if (!label || !hint || !result) return { ok: false, reason: `第${index + 1}个选项措辞越界` }
    if (!opts.allowedEffects.includes(effect)) return { ok: false, reason: '效果不在本地目录内' }
    const refs = Array.isArray(row.refs)
      ? row.refs.filter((ref): ref is string => typeof ref === 'string' && evidenceIds.includes(ref)).slice(0, 4)
      : []
    if (Array.isArray(row.refs) && row.refs.length > 0 && refs.length === 0) return { ok: false, reason: '凭据号未登记' }
    options.push({ id: index === 0 ? 'jia' : 'yi', label, hint, effect, result, refs })
  }

  const prose = [title, known, body, ...options.flatMap(option => [option.label, option.result])].join('\n')
  const strangers = unregisteredEntities(prose)
  if (strangers.length) return { ok: false, reason: `未登记实体：${strangers.slice(0, 3).join('、')}` }

  const event: GeneratedEvent = {
    id: `ai-${opts.day}-${opts.seed.toString(36)}`,
    day: opts.day,
    title,
    scene,
    present,
    known,
    body,
    options,
    origin: 'ai',
    seed: opts.seed,
    createdAt: Date.now(),
    profileId: opts.profileId,
    mood,
  }
  return { ok: true, event }
}