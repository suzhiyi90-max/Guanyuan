/**
 * FE-157 三族适配器（20 三）：openai-compat / anthropic / gemini。
 * 厂家差异全部收在本文件内，业务层只认 NarratorProvider。
 * 适配器只吐原始文本增量与用量；beat 提取、校验、超时、降级由运行时负责。
 * 任何错误都转成可读原因，绝不回传 key、prompt 或响应头。
 */
import { systemPrompt, temperatureFor } from './context'
import type { NarrationContext, NarratorChunk, NarratorProfile, NarratorProvider, ProviderCaps, ProviderFamily } from './types'

export class NarratorError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'NarratorError'
  }
}

export function readableFailure(error: unknown): { code: string; note: string } {
  if (error instanceof NarratorError) return { code: error.code, note: error.message }
  if (error instanceof DOMException && error.name === 'AbortError') return { code: 'abort', note: '这一笔已搁下' }
  if (error instanceof TypeError) return { code: 'network', note: '网络或跨域不通 · 请改用客户端或自填中转地址' }
  return { code: 'unknown', note: '笔墨未至' }
}

function statusNote(status: number, family: ProviderFamily): string {
  if (status === 401 || status === 403) return '钥匙不对或无权限（401/403）· 请核对 key 与厂家'
  if (status === 404) return '地址或模型名不对（404）· 请核对 baseURL 与模型名'
  if (status === 429) return '请求过密或余额不足（429）· 稍后再试或查看厂家余额'
  if (status === 400 || status === 422) return '请求被拒（400）· 多为模型名或参数不合该厂家'
  if (status >= 500) return `厂家暂时不可用（${status}）· 稍后再试`
  return `厂家返回 ${status} · 请核对配置`
}

function trimBase(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

/** SSE 逐行读取：只取 data: 负载，忽略注释与空行。 */
async function* ssePayloads(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  const body = response.body
  if (!body) throw new NarratorError('stream', '这家不支持流式返回')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let cut = buffer.indexOf('\n')
      while (cut >= 0) {
        const line = buffer.slice(0, cut).replace(/\r$/, '')
        buffer = buffer.slice(cut + 1)
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (payload && payload !== '[DONE]') yield payload
        }
        cut = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, family: ProviderFamily): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new NarratorError('network', '网络或跨域不通 · 浏览器直连多被厂家拒绝，请改用 PC 客户端或自填中转地址')
  }
  if (!response.ok) {
    // 只读状态码，不读响应体：厂家错误体里可能回显请求头。
    throw new NarratorError(`http-${statusGroup(response.status)}`, statusNote(response.status, family))
  }
  return response
}

function statusGroup(status: number): string {
  return status === 401 || status === 403 ? 'auth' : status === 429 ? 'quota' : status === 404 ? 'route' : 'other'
}

export const familyLabels: Record<ProviderFamily, string> = {
  'openai-compat': 'OpenAI 兼容',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

export const familyDefaults: Record<ProviderFamily, { baseURL: string; model: string }> = {
  'openai-compat': { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-flash' },
}

const declaredCaps: Record<ProviderFamily, ProviderCaps> = {
  'openai-compat': { stream: true, jsonMode: true, contextWindow: 32768 },
  anthropic: { stream: true, jsonMode: false, contextWindow: 100000 },
  gemini: { stream: true, jsonMode: true, contextWindow: 100000 },
}

export interface ProviderSecrets {
  key: string
}

/** 统一请求体：system 走厂家各自的字段，user 只放一句意图指令。 */
export function createProvider(profile: NarratorProfile, secrets: ProviderSecrets): NarratorProvider {
  const base = trimBase(profile.baseURL)
  const key = secrets.key
  const caps = declaredCaps[profile.family]

  const requireKey = () => {
    if (!key) throw new NarratorError('no-key', '尚未填钥匙 · 可在存档案卷里补')
  }

  async function* stream(ctx: NarrationContext, signal: AbortSignal): AsyncIterable<NarratorChunk> {
    requireKey()
    const system = systemPrompt(ctx)
    const temperature = temperatureFor(ctx.intent)
    const maxTokens = Math.max(512, Math.ceil(ctx.maxChars * 2.4))
    const user = `按形状写这一笔：${ctx.intent}。语气${ctx.tone}。只输出 JSON。`
    yield { type: 'meta', model: profile.model }

    if (profile.family === 'anthropic') {
      const response = await post(`${base}/v1/messages`, {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }, { model: profile.model, max_tokens: maxTokens, temperature, system, stream: true, messages: [{ role: 'user', content: user }] }, signal, profile.family)
      let completion = 0
      for await (const payload of ssePayloads(response, signal)) {
        let event: Record<string, unknown>
        try { event = JSON.parse(payload) as Record<string, unknown> } catch { continue }
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { text?: string } | undefined
          if (delta?.text) { completion += delta.text.length; yield { type: 'text', delta: delta.text } }
        }
        if (event.type === 'message_delta') {
          const usage = event.usage as { output_tokens?: number } | undefined
          if (usage?.output_tokens) completion = usage.output_tokens
        }
        if (event.type === 'message_stop') {
          yield { type: 'meta', model: profile.model, usage: { prompt: 0, completion } }
          yield { type: 'done', finishReason: 'stop' }
          return
        }
      }
      yield { type: 'done', finishReason: 'stop' }
      return
    }

    if (profile.family === 'gemini') {
      const response = await post(`${base}/v1beta/models/${encodeURIComponent(profile.model)}:streamGenerateContent?alt=sse`, {
        'x-goog-api-key': key,
      }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }, signal, profile.family)
      let completion = 0
      for await (const payload of ssePayloads(response, signal)) {
        let event: Record<string, unknown>
        try { event = JSON.parse(payload) as Record<string, unknown> } catch { continue }
        const candidates = event.candidates as Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> | undefined
        const parts = candidates?.[0]?.content?.parts
        for (const part of parts ?? []) {
          if (part.text) { completion += part.text.length; yield { type: 'text', delta: part.text } }
        }
        if (candidates?.[0]?.finishReason) {
          yield { type: 'meta', model: profile.model, usage: { prompt: 0, completion } }
          yield { type: 'done', finishReason: String(candidates[0].finishReason) }
          return
        }
      }
      yield { type: 'done', finishReason: 'stop' }
      return
    }

    const response = await post(`${base}/chat/completions`, {
      authorization: `Bearer ${key}`,
    }, {
      model: profile.model,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      ...(caps.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      stream_options: { include_usage: true },
    }, signal, profile.family)
    let finish = 'stop'
    for await (const payload of ssePayloads(response, signal)) {
      let event: Record<string, unknown>
      try { event = JSON.parse(payload) as Record<string, unknown> } catch { continue }
      const usage = event.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
      if (usage) yield { type: 'meta', model: profile.model, usage: { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0 } }
      const choices = event.choices as Array<{ delta?: { content?: string }; finish_reason?: string | null }> | undefined
      const choice = choices?.[0]
      if (choice?.delta?.content) yield { type: 'text', delta: choice.delta.content }
      if (choice?.finish_reason) finish = choice.finish_reason
    }
    yield { type: 'done', finishReason: finish }
  }

  return {
    id: profile.id,
    label: profile.label,
    family: profile.family,
    capabilities: async () => caps,
    stream,
  }
}

/** 测试连通：发一条最小请求，只回可读原因，不回显任何请求内容。 */
export async function probeProvider(profile: NarratorProfile, key: string, signal: AbortSignal): Promise<{ ok: boolean; note: string; caps: ProviderCaps }> {
  const provider = createProvider(profile, { key })
  const ctx: NarrationContext = {
    facts: '（连通测试）', snapshot: '（连通测试）', summary: '', intent: '旁白',
    tone: '极简', maxChars: 24, seed: 1, allowedEffects: ['log-rumor'], effectMenu: '- log-rumor',
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 12000)
  const onOuterAbort = () => controller.abort()
  signal.addEventListener('abort', onOuterAbort)
  try {
    let chars = 0
    for await (const chunk of provider.stream(ctx, controller.signal)) {
      if (chunk.type === 'text') chars += chunk.delta.length
      if (chars > 0) break
    }
    return { ok: chars > 0, note: chars > 0 ? '笔墨已通' : '厂家通了但没吐字 · 请核对模型名', caps: declaredCaps[profile.family] }
  } catch (error) {
    const { code, note } = readableFailure(error)
    return { ok: false, note: code === 'abort' ? '十二秒未通 · 已搁下' : note, caps: declaredCaps[profile.family] }
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', onOuterAbort)
  }
}