/**
 * FE-157 叙事运行时（20 六 / 七 / 八）。
 * 三段：查档（0–0.8s）→ 议拟（首字前）→ 落笔（流式洇开）。
 * 最短 1.2s 防闪屏；首字 8s 不至即搁笔；总时长 30s 封顶。
 * 每 token 不 setState：原始增量进 ref，rAF 合批按 26 字/秒洇开。
 * 失败不弹错、不暴露厂家与模型名，只落一枚世界内的「笔墨未至」小签，本日照旧。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/useGame'
import type { Period, SceneId } from '../types'
import { buildContext, contextHash } from './context'
import { createProvider, readableFailure } from './providers'
import { extractBeat, extractStringField, parseGeneratedEvent } from './schema'
import {
  activeProfile, cacheGet, cacheSet, getKey, getNarrative, recordRun, useNarrative, useNarrativeSecrets,
} from './store'
import type { GeneratedEvent, NarrationIntent, NarrationRun, StoryBeat, TokenUsage } from './types'

const ARCHIVE_MS = 800
const ARCHIVE_MIN_MS = 420
const DRAFT_MIN_MS = 300
const MIN_MS = 1200
const FIRST_TOKEN_MS = 8000
const TOTAL_MS = 30000
const INK_PER_SEC = 26

const idleRun: NarrationRun = {
  phase: 'idle', beat: null, ink: '', event: null, quietNote: null, elapsed: 0, fromCache: false,
}

export interface NarratorArgs {
  state: GameState
  scene: SceneId
  period: Period
  officialAvailable: boolean
}

export function useNarrator({ state, scene, period, officialAvailable }: NarratorArgs) {
  const store = useNarrative()
  // 钥匙单独一档订阅：收好钥匙后「可落笔」要立刻生效，不必等别的重渲染。
  useNarrativeSecrets()
  const [run, setRun] = useState<NarrationRun>(idleRun)

  const abortRef = useRef<AbortController | null>(null)
  const rafRef = useRef(0)
  const rawRef = useRef('')
  const firstTextRef = useRef(0)
  const startRef = useRef(0)
  const finishedRef = useRef(false)
  const skipRef = useRef(false)
  const visibleRef = useRef(0)
  const lastFrameRef = useRef(0)
  const beatRef = useRef<StoryBeat | null>(null)
  const usageRef = useRef<TokenUsage>({ prompt: 0, completion: 0 })
  const settledRef = useRef<GeneratedEvent | null>(null)
  const quietRef = useRef<string | null>(null)
  const cacheRef = useRef(false)
  const intentRef = useRef<NarrationIntent>('旁白')
  const stateRef = useRef(state)
  stateRef.current = state

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
  }, [])

  useEffect(() => stop, [stop])

  // 正式世界事件出现时立即撤销正在生成的 AI 叙事，避免旧上下文在待决事件后落笔。
  useEffect(() => {
    if (!state.pendingEvent) return
    stop()
    rawRef.current = ''
    settledRef.current = null
    quietRef.current = null
    finishedRef.current = false
    setRun(idleRun)
  }, [state.pendingEvent, stop])

  const profile = activeProfile()
  const ready = store.enabled && Boolean(profile) && Boolean(getKey(profile?.id ?? ''))

  const settle = useCallback((event: GeneratedEvent | null, note: string | null) => {
    settledRef.current = event
    quietRef.current = note
    finishedRef.current = true
  }, [])

  const consume = useCallback(async (attempt: number): Promise<void> => {
    const snapshot = stateRef.current
    if (snapshot.pendingEvent) return
    const currentProfile = activeProfile()
    if (!currentProfile) { settle(null, '案上无笔 · 本日照旧'); return }
    const key = getKey(currentProfile.id)
    if (!key) { settle(null, '尚未备笔 · 本日照旧'); return }

    const narrative = getNarrative()
    // beatIndex 只数「已决」的当日生成事件：未决而重候同一处境要命中旧稿，不重复计费。
    const beatIndex = snapshot.handledEvents.filter(id => id.startsWith(`ai-${snapshot.day}-`)).length
    const ctx = buildContext({
      state: snapshot, scene, period, intent: intentRef.current,
      installId: narrative.installId, beatIndex, summary: narrative.summary, officialAvailable,
    })
    const hash = contextHash(ctx, currentProfile.model)
    const cached = cacheGet(hash)
    if (cached && attempt === 0) {
      cacheRef.current = true
      rawRef.current = cached.raw
      firstTextRef.current = startRef.current + ARCHIVE_MS + 120
      beatRef.current = extractBeat(cached.raw)
      const parsed = parseGeneratedEvent(cached.raw, {
        day: snapshot.day, seed: ctx.seed, profileId: currentProfile.id,
        allowedEffects: ctx.allowedEffects, maxChars: ctx.maxChars,
      })
      if (parsed.ok && !stateRef.current.pendingEvent) { settle(parsed.event, null); return }
      cacheRef.current = false
      rawRef.current = ''
      firstTextRef.current = 0
    }

    const controller = new AbortController()
    abortRef.current = controller
    const provider = createProvider(currentProfile, { key })
    let raw = ''
    try {
      for await (const chunk of provider.stream(ctx, controller.signal)) {
        if (chunk.type === 'meta' && chunk.usage) {
          usageRef.current = {
            prompt: chunk.usage.prompt || usageRef.current.prompt,
            completion: chunk.usage.completion || usageRef.current.completion,
          }
        }
        if (chunk.type === 'text') {
          raw += chunk.delta
          rawRef.current = raw
          if (!firstTextRef.current) firstTextRef.current = performance.now()
          if (!beatRef.current) beatRef.current = extractBeat(raw)
        }
        if (chunk.type === 'done') break
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const { note } = readableFailure(error)
      settle(null, note.includes('跨域') ? '笔墨隔着一层纸 · 本日照旧' : '笔墨未至 · 本日照旧')
      return
    }
    if (controller.signal.aborted || stateRef.current.pendingEvent) return

    const parsed = parseGeneratedEvent(raw, {
      day: snapshot.day, seed: ctx.seed, profileId: currentProfile.id,
      allowedEffects: ctx.allowedEffects, maxChars: ctx.maxChars,
    })
    if (parsed.ok && !stateRef.current.pendingEvent) {
      cacheSet(hash, raw)
      if (!usageRef.current.completion) usageRef.current.completion = raw.length
      settle(parsed.event, null)
      return
    }
    if (attempt === 0) {
      rawRef.current = ''
      firstTextRef.current = 0
      beatRef.current = null
      visibleRef.current = 0
      await consumeRef.current(1)
      return
    }
    settle(null, '这一笔未能成卷 · 本日照旧')
  }, [officialAvailable, period, scene, settle])

  const consumeRef = useRef(consume)
  consumeRef.current = consume

  const awaitInk = useCallback((intent: NarrationIntent) => {
    stop()
    if (stateRef.current.pendingEvent) { setRun(idleRun); return }
    intentRef.current = intent
    rawRef.current = ''
    firstTextRef.current = 0
    visibleRef.current = 0
    beatRef.current = null
    usageRef.current = { prompt: 0, completion: 0 }
    settledRef.current = null
    quietRef.current = null
    finishedRef.current = false
    skipRef.current = false
    cacheRef.current = false
    startRef.current = performance.now()
    lastFrameRef.current = startRef.current
    setRun({ ...idleRun, phase: 'archive' })

    void consumeRef.current(0)

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const dt = Math.min(0.12, (now - lastFrameRef.current) / 1000)
      lastFrameRef.current = now
      const raw = rawRef.current
      const beat = beatRef.current
      const firstAt = firstTextRef.current && firstTextRef.current <= now ? firstTextRef.current : 0
      // 三段各有最短停留：厂家秒回也要让查档与议拟读得出来，正文只在落笔段洇开。
      const phase = elapsed < ARCHIVE_MIN_MS
        ? 'archive'
        : (!firstAt || elapsed < ARCHIVE_MIN_MS + DRAFT_MIN_MS) ? 'draft' : 'ink'
      const target = extractStringField(raw, 'body') ?? ''
      if (skipRef.current) visibleRef.current = target.length
      else if ((phase === 'ink' || finishedRef.current) && visibleRef.current < target.length) {
        visibleRef.current = Math.min(target.length, visibleRef.current + Math.max(1, Math.round(dt * INK_PER_SEC)))
      }
      const ink = target.slice(0, visibleRef.current)

      if (!finishedRef.current) {
        if (!firstAt && elapsed > FIRST_TOKEN_MS) {
          abortRef.current?.abort()
          settle(null, '候了八秒未见落笔 · 本日照旧')
        } else if (elapsed > TOTAL_MS) {
          abortRef.current?.abort()
          settle(null, '这一笔写得太久 · 本日照旧')
        }
      }

      const settled = settledRef.current
      const quiet = quietRef.current
      const canSettle = finishedRef.current && elapsed >= MIN_MS && (skipRef.current || visibleRef.current >= target.length || Boolean(quiet))

      if (canSettle && settled) {
        const snapshot = stateRef.current
        recordRun(
          settled,
          `第${snapshot.day}日 ${settled.scene} · ${settled.title}`,
          { day: snapshot.day, prompt: usageRef.current.prompt, completion: usageRef.current.completion, at: Date.now() },
        )
        setRun({ phase: 'settled', beat, ink: target, event: settled, quietNote: null, elapsed, fromCache: cacheRef.current })
        rafRef.current = 0
        return
      }
      if (canSettle && quiet) {
        setRun({ phase: 'quiet', beat, ink: '', event: null, quietNote: quiet, elapsed, fromCache: cacheRef.current })
        rafRef.current = 0
        return
      }

      setRun(previous => (
        previous.phase === phase && previous.ink === ink && previous.beat === beat && Math.abs(previous.elapsed - elapsed) < 90
          ? previous
          : { phase, beat, ink, event: null, quietNote: null, elapsed, fromCache: cacheRef.current }
      ))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stop])

  const skip = useCallback(() => { skipRef.current = true }, [])

  const cancel = useCallback(() => {
    stop()
    setRun(idleRun)
  }, [stop])

  const dismiss = useCallback(() => { setRun(idleRun) }, [])

  return { run, ready, enabled: store.enabled, profile, awaitInk, skip, cancel, dismiss }
}