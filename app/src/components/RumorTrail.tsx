/**
 * C-105 风闻行迹：同一条风闻只走「茶楼转述 → 情报听说 → 章末风评」三步。
 * 只读既有的 log.rumor 与 P-006 来源，不新增传闻、来源或事实。
 */
import { useRef, type KeyboardEvent } from 'react'
import { ArrowRight } from 'lucide-react'

type RumorStop = 'street' | 'intel' | 'epilogue'

const stops = [
  { id: 'street', mark: '茶', label: '街市 · 茶楼', note: '转述', detail: '只听见有人这样说' },
  { id: 'intel', mark: '闻', label: '情报台账', note: '听说', detail: '列入听说 · 未核实' },
  { id: 'epilogue', mark: '评', label: '章末 · 风评', note: '仍无凭据', detail: '不改写成事实' },
] as const

export function RumorTrail({ rumor, variant = 'strip', current, onOpen }: { rumor: string, variant?: 'strip' | 'page' | 'chip', current?: RumorStop, onOpen?: (target: 'street' | 'intel') => void }) {
  // hook 必须在 chip 早退之前调用，避免分支切换时 hook 数变化。
  const stopsRef = useRef<HTMLOListElement | null>(null)
  if (variant === 'chip') {
    return (
      <button type="button" className="rumor-chip" data-trail-mount="true" onClick={() => onOpen?.('street')} aria-label="风闻行迹 · 街市茶楼转述">
        <i>闻</i><span>风闻 · 茶楼转述</span><b>{rumor}</b><ArrowRight size={11} />
      </button>
    )
  }

  const canOpen = (id: RumorStop) => Boolean(onOpen && id !== 'epilogue' && current !== id)
  // C-114：方向键 / Home / End 在可回的两站间巡览；末站不可点、不改判定。
  const tabbable = stops.findIndex(stop => canOpen(stop.id))
  const handleKeys = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(stopsRef.current?.querySelectorAll<HTMLButtonElement>('li > button:not(:disabled)') ?? [])
    if (!buttons.length) return
    event.preventDefault()
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }

  return (
    <section className={`rumor-trail is-${variant}`} aria-label="风闻行迹 · 茶楼转述到章末风评" data-trail-mount="true">
      <header className="rumor-head">
        <span className="eyebrow">风闻行迹 / 只记走到哪里</span>
        {variant === 'page' && <h3>同一句话，只走到「听说过」。</h3>}
        <p className="rumor-quote">“{rumor}”</p>
        <small>茶楼转述 · 来源待查</small>
      </header>
      <ol className="rumor-stops" ref={stopsRef} onKeyDown={handleKeys} data-key-nav="true" aria-label="风闻行迹 · 方向键 / Home / End 巡览">
        {stops.map((stop, index) => {
          const isCurrent = current === stop.id
          const open = canOpen(stop.id)
          return (
            <li key={stop.id} className={`${isCurrent ? 'is-current' : ''} ${stop.id === 'epilogue' ? 'is-future' : ''}`}>
              <button type="button" disabled={!open} tabIndex={index === (tabbable < 0 ? 0 : tabbable) ? 0 : -1} aria-current={isCurrent ? 'location' : undefined} onClick={() => { if (open && stop.id !== 'epilogue') onOpen?.(stop.id) }} aria-label={`${stop.label} · ${stop.note}${open ? ' · 回原处' : ''}`}>
                <i>{stop.mark}</i>
                <span>{stop.label}</span>
                <b>{stop.note}</b>
                <small>{stop.detail}</small>
                {open && variant === 'page' && <ArrowRight size={11} />}
                <em aria-hidden="true">{String(index + 1).padStart(2, '0')}</em>
              </button>
            </li>
          )
        })}
      </ol>
      <footer><span>未核实 · 不写成事实</span><small>界面 · 只读行迹</small><small className="art-borrow art-borrow-trail">暂借旧纸 · 待行迹驿签纸</small></footer>
    </section>
  )
}
