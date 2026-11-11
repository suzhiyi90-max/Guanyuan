/**
 * C-95 卷内书签带：右缘一条窄丝带，跟着「当前这张长纸」的滚动走。
 * 只读滚动位置：点一下移一屏、按住可拖、聚焦后方向键 / PageUp / PageDown / Home / End 可移。
 * 不改任何屏的结构与内容、不写存档；不新增依赖。图未到时退为素带（标「暂借」）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// 只认「向下读」的长纸：原件是竖排横卷，不为它挂竖丝带。
const SCOPES = ['.career-page', '.reading-view', '.compare-view', '.debt-body', '.paper-workspace']
const ART_SRC = '/assets/ribbon-bookmark.png'
const RIBBON_MAX = 128

interface RibbonState {
  top: number
  left: number
  height: number
  ratio: number
}

function pickScroller(): HTMLElement | null {
  for (const selector of SCOPES) {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (node.offsetParent === null) continue
      if (node.scrollHeight - node.clientHeight < 40) continue
      if (node.getBoundingClientRect().height < 220) continue
      return node
    }
  }
  return null
}

export function ReadingRibbon({ watch = '' }: { watch?: string }) {
  const [state, setState] = useState<RibbonState | null>(null)
  const [artOk, setArtOk] = useState(true)
  const targetRef = useRef<HTMLElement | null>(null)
  const observedRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const frame = useRef(0)
  const drag = useRef<{ y: number; top: number; moved: number } | null>(null)

  const measure = useCallback(() => {
    frame.current = 0
    const el = pickScroller()
    targetRef.current = el
    if (!el) { setState(null); return }
    // 纸一换、内容一长，重新量；不靠轮询。
    if (observedRef.current !== el) {
      observerRef.current?.disconnect()
      const observer = new ResizeObserver(() => { if (!frame.current) frame.current = window.requestAnimationFrame(measure) })
      observer.observe(el)
      for (const child of Array.from(el.children)) observer.observe(child)
      observerRef.current = observer
      observedRef.current = el
    }
    const rect = el.getBoundingClientRect()
    const max = el.scrollHeight - el.clientHeight
    const ratio = Math.min(1, Math.max(0, el.scrollTop / max))
    const height = Math.max(76, Math.min(RIBBON_MAX, rect.height * 0.32))
    const top = rect.top + 10 + ratio * Math.max(0, rect.height - height - 20)
    setState({ top, left: rect.right - 12, height, ratio })
  }, [])

  useEffect(() => {
    const onScroll = () => { if (!frame.current) frame.current = window.requestAnimationFrame(measure) }
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const timer = window.setTimeout(measure, 120)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.clearTimeout(timer)
      if (frame.current) window.cancelAnimationFrame(frame.current)
    }
  }, [measure])

  // 表面一换（叠层 / 分节 / 视图），跟进几次：叠层进退场期间高度还会变。
  useEffect(() => {
    const timers = [120, 300, 560, 900].map(delay => window.setTimeout(measure, delay))
    return () => timers.forEach(id => window.clearTimeout(id))
  }, [watch, measure])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const scrollBy = (delta: number) => {
    const el = targetRef.current
    if (!el) return
    el.scrollBy({ top: delta })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = targetRef.current
    if (!el) return
    const page = el.clientHeight * 0.86
    const keys: Record<string, () => void> = {
      ArrowDown: () => scrollBy(48),
      ArrowUp: () => scrollBy(-48),
      PageDown: () => scrollBy(page),
      PageUp: () => scrollBy(-page),
      Home: () => { el.scrollTop = 0 },
      End: () => { el.scrollTop = el.scrollHeight },
    }
    const run = keys[event.key]
    if (!run) return
    event.preventDefault()
    event.stopPropagation()
    run()
    measure()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = targetRef.current
    if (!el) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { y: event.clientY, top: el.scrollTop, moved: 0 }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = targetRef.current
    const current = drag.current
    if (!el || !current || !state) return
    const delta = event.clientY - current.y
    current.moved = Math.max(current.moved, Math.abs(delta))
    const usable = Math.max(1, el.clientHeight - state.height - 20)
    el.scrollTop = current.top + (delta / usable) * (el.scrollHeight - el.clientHeight)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    drag.current = null
    if (!current || current.moved > 4) return
    // 没拖动即当「点一下」：点在丝带上半移上一屏，下半移下一屏。
    const rect = event.currentTarget.getBoundingClientRect()
    scrollBy(event.clientY - rect.top < rect.height / 2 ? -targetHeight() : targetHeight())
    measure()
  }

  const targetHeight = () => (targetRef.current?.clientHeight ?? 600) * 0.86

  if (!state) return null

  return (
    <div
      className="reading-ribbon"
      style={{ top: `${state.top}px`, left: `${state.left}px`, height: `${state.height}px` }}
      role="scrollbar"
      aria-label="卷内书签带 · 拖动或按方向键翻卷"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(state.ratio * 100)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
      data-ribbon={artOk ? 'art' : 'plain'}
    >
      {artOk
        ? <img className="reading-ribbon-art" src={ART_SRC} alt="" draggable={false} onError={() => setArtOk(false)} />
        : <span className="reading-ribbon-plain" aria-hidden="true" />}
      <span className="reading-ribbon-knot" aria-hidden="true" />
      <span className="reading-ribbon-tip" aria-hidden="true">{artOk ? '书签带' : '书签带 · 暂借素带'}</span>
    </div>
  )
}
