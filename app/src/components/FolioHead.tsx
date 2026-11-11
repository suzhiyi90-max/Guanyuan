/**
 * C-116 卷首题签：与卷末纸带首尾成对的一枚只读小签。
 * C-120 焦点闭环：合卷索引跳转后目标表面订阅既有 folioEcho，把焦点落到本签并播报「已归位」。
 * C-121 层次：章末用 grand 大题签，其余三处用 compact 小签。
 * 只显示表面名与「翻过哪几页」，不新增内容、不写存档、不参与判定。
 */
import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useFolioEcho } from '../folioEcho'
import type { FolioKey } from '../folioIndex'

export function FolioHead({ label, index, total = 4, visited = [], onOpen, compact = false, showBorrow = false, folioKey, variant = 'compact', title }: {
  label: string
  index?: number
  total?: number
  visited?: number[]
  onOpen?: () => void
  compact?: boolean
  showBorrow?: boolean
  folioKey?: FolioKey
  variant?: 'compact' | 'grand'
  title?: string
}) {
  const echo = useFolioEcho()
  const [landed, setLanded] = useState(false)

  // 只在「本处是跳转目标」时落焦点；显示即收，不写任何存储、不改回调。
  useEffect(() => {
    if (!echo || !folioKey || echo.to !== folioKey) return
    document.querySelector<HTMLElement>(`[data-folio-landing="${folioKey}"]`)?.focus()
    setLanded(true)
    const timer = window.setTimeout(() => setLanded(false), 1200)
    return () => window.clearTimeout(timer)
  }, [echo?.nonce, folioKey])

  const borrowClass = `art-borrow art-borrow-${variant === 'grand' ? 'grand' : 'head'}`
  const borrowText = variant === 'grand' ? '暂借卷首题签纸 · 待卷首大题签纸' : '暂借卷页题签纸 · 待卷首题签纸'
  const body = <>
    <i aria-hidden="true">卷</i>
    <b>{title ?? label}</b>
    {variant === 'grand' && <small className="folio-head-sub">只读卷首</small>}
    {typeof index === 'number' && <span>第 {String(index).padStart(2, '0')} / {String(total).padStart(2, '0')} 页</span>}
    <em className="folio-head-nicks" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={`${visited.includes(i + 1) ? 'is-read' : ''} ${index === i + 1 ? 'is-current' : ''}`} />)}
    </em>
    {onOpen && <ArrowUpRight size={9} aria-hidden="true" />}
    {showBorrow && <small className={borrowClass}>{borrowText}</small>}
    <span className="folio-landing" role="status" aria-live="polite">{landed ? `已归位 · ${label}` : ''}</span>
  </>
  const className = `folio-head ${compact ? 'is-compact' : ''} ${variant === 'grand' ? 'is-grand' : ''} ${onOpen ? 'is-link' : ''}`.replace(/\s+/g, ' ').trim()
  const hint = `卷首题签 · ${label} · 只读页序，朱砂游标只标当前页`
  return onOpen
    ? <button type="button" className={className} data-folio-head="true" data-folio-page={index} data-folio-landing={folioKey} data-folio-variant={variant} data-folio-mount="true" title={hint} onClick={onOpen} aria-label={`${hint} · 回此处`}>{body}</button>
    : <span className={className} data-folio-head="true" data-folio-page={index} data-folio-landing={folioKey} data-folio-variant={variant} tabIndex={folioKey ? 0 : undefined} title={hint} aria-label={hint}>{body}</span>
}
