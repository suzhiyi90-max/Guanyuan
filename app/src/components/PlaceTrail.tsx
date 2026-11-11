/**
 * C-106 今日动线：一条只记「去过」的驿路签。
 * 点站回既有场景 / 舆图 / 街市；当前站不重复进入。
 * FE-101：可选 collapsible 只在窄屏 / 案头收束显示条数，不新增场所、不记里程。
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { placeSpecs, usePlaceTrail, type PlaceId } from '../placeTrail'

export function PlaceTrail({ current, variant = 'strip', limit = 5, onOpen, reviewMarks, collapsible = false }: { current?: PlaceId, variant?: 'strip' | 'line', limit?: number, onOpen?: (id: PlaceId) => void, reviewMarks?: PlaceId[], collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLOListElement | null>(null)
  const trail = usePlaceTrail()
  // C-114：方向键 / Home / End 在可回的站签间巡览，点击回调与业务一律不动。
  const handleKeys = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('li > button:not(:disabled)') ?? [])
    if (!buttons.length) return
    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }
  const all = trail.length > limit ? trail.slice(trail.length - limit) : trail
  const base = collapsible && !expanded ? Math.min(3, all.length) : all.length
  const visible = all.slice(all.length - base)
  if (!visible.length) return null
  const hidden = trail.length - all.length + (all.length - visible.length)
  const tabbable = visible.findIndex(id => onOpen && current !== id)

  return (
    <section className={`place-trail is-${variant}`} aria-label="今日动线 · 只记去过的场所" data-trail-mount="true" data-trail-expanded={collapsible ? (expanded ? 'true' : 'false') : undefined}>
      <header><span>今日动线</span><small>只记去过 · 不记里程</small>{hidden > 0 && <em>前 {hidden} 处略</em>}</header>
      <ol ref={listRef} onKeyDown={handleKeys} data-key-nav="true" aria-label="今日动线 · 方向键 / Home / End 巡览">
        {visible.map((id, index) => {
          const spec = placeSpecs[id]
          const active = current === id
          return (
            <li key={id} className={active ? 'is-current' : ''} data-review-mark={reviewMarks?.includes(id) ? 'true' : undefined}>
              <button type="button" disabled={!onOpen || active} tabIndex={index === (tabbable < 0 ? 0 : tabbable) ? 0 : -1} onClick={() => onOpen?.(id)} aria-current={active ? 'location' : undefined} aria-label={`${spec.label}${active ? ' · 当前' : ' · 回此处'}${reviewMarks?.includes(id) ? ' · 曾在此批阅' : ''}`}>
                <i>{spec.mark}</i>
                <span>{spec.label}</span>
                {reviewMarks?.includes(id) && <b className="place-review-mark" aria-hidden="true">批</b>}
                {onOpen && !active && <em>回</em>}
              </button>
            </li>
          )
        })}
      </ol>
      {collapsible && all.length > 3 && <div className="place-trail-more">
        <button type="button" data-folio-mount="true" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起 · 只看最近三处' : `展开余下 ${all.length - 3} 处`}
        </button>
        <span>只换显示条数 · 不记新行程</span>
      </div>}
    </section>
  )
}
