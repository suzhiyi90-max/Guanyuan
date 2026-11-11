/**
 * C-111 合卷索引：只读投影三处表面「翻过哪几页」，点条目只回既有表面。
 * C-114：方向键 / Home / End 巡览，焦点朱砂环；零点击回调改动。
 * C-115：跳转时记一枚会话内来处回声，目标表面短时显「自 · 某处 归此卷」。
 * 不合并记忆、不写 viewMemory、不落盘、不生成页序以外的任何内容。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { folioKeys, folioSpecs, useFolioIndex, type FolioKey } from '../folioIndex'
import { echoFromLabels, recordFolioEcho, useFolioEcho } from '../folioEcho'

export function FolioIndex({ variant = 'inline', active, onOpen }: {
  variant?: 'inline' | 'full'
  active?: FolioKey
  onOpen?: (key: FolioKey) => void
}) {
  const index = useFolioIndex()
  const echo = useFolioEcho()
  const [echoShown, setEchoShown] = useState(false)
  const rowsRef = useRef<HTMLDivElement | null>(null)

  // 归位纸角：只在本处是跳转目标时显 1.2s，显示即收，不写任何存储。
  useEffect(() => {
    if (!echo || echo.to !== active) { setEchoShown(false); return }
    setEchoShown(true)
    const timer = window.setTimeout(() => setEchoShown(false), 1200)
    return () => window.clearTimeout(timer)
  }, [echo?.nonce, active])

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(rowsRef.current?.querySelectorAll<HTMLButtonElement>('button.folio-index-row') ?? [])
    if (!buttons.length) return
    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }

  const rows = folioKeys.map((key, rowIndex) => {
    const spec = folioSpecs[key]
    const visited = index[key]
    const here = active === key
    const canOpen = Boolean(onOpen && !here)
    const body = <>
      <i aria-hidden="true">{spec.short.slice(0, 1)}</i>
      <span>{variant === 'full' ? spec.label : spec.short}</span>
      <em className="folio-index-nicks" aria-hidden="true">
        {Array.from({ length: spec.total }, (_, i) => <i key={i} className={visited.includes(i + 1) ? 'is-read' : ''} />)}
      </em>
      {here && <b className="folio-index-here">此处</b>}
      {canOpen && <ArrowUpRight size={9} aria-hidden="true" />}
    </>
    const label = `${spec.label} · 翻过 ${visited.length} 页${here ? ' · 当前表面' : canOpen ? ' · 回此处' : ''}`
    return canOpen
      ? <button key={key} type="button" className="folio-index-row" data-folio-index-key={key} data-folio-mount="true" tabIndex={rowIndex === 0 ? 0 : -1} onClick={() => { recordFolioEcho(active ?? 'desk', key); onOpen?.(key) }} aria-label={`合卷索引 · ${label}`} title={label}>{body}</button>
      : <span key={key} className={`folio-index-row ${here ? 'is-here' : ''}`} data-folio-index-key={key} aria-current={here ? 'location' : undefined} aria-label={`合卷索引 · ${label}`}>{body}</span>
  })

  return (
    <section className={`folio-index is-${variant}`} data-folio-index={variant} aria-label="合卷索引 · 只读翻页留痕">
      <header>
        <span>合卷索引</span><small>只记翻过哪几页</small>
        {echoShown && echo && <b className="folio-echo" role="status">自 · {echoFromLabels[echo.from]} 归此卷</b>}
      </header>
      <div className="folio-index-rows" ref={rowsRef} onKeyDown={handleKeys} data-key-nav="true" aria-label="合卷索引 · 方向键 / Home / End 巡览">{rows}</div>
      {variant === 'full' && <footer><span>界面 · 只读投影</span><small className="art-borrow art-borrow-slip">暂借公牍题签 · 待卷页题签纸</small><small className="art-borrow art-borrow-band">暂借卷页题签纸 · 待卷末题签带</small><small className="art-borrow art-borrow-hotspot">暂借卷首题签纸 · 待热点纸签纸</small><small className="art-borrow art-borrow-colhead">暂借长卷栏纸 · 待栏首小签纸</small></footer>}
    </section>
  )
}
