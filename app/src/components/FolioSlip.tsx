/**
 * C-107 卷页题签：一套「回原处」纸签与「第几页」页序题签。
 * 只读装裱；页序刻口是「翻过哪几页」的淡墨点，不是进度数值条。
 * 翻页记忆由调用方走 viewMemory（仅内存、刷新即散），本组件不落盘、不写存档。
 */
import { ArrowRight } from 'lucide-react'

export function FolioSlip({ label, detail, mark = '回', onClick, compact = false, current = false, className = '' }: {
  label: string
  detail?: string
  mark?: string
  onClick: () => void
  compact?: boolean
  current?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={`folio-slip ${compact ? 'is-compact' : ''} ${current ? 'is-current' : ''} ${className}`.trim()}
      data-folio-mount="true"
      data-folio-current={current ? 'true' : undefined}
      onClick={onClick}
      aria-label={`回原处 · ${label}${detail ? ` · ${detail}` : ''}`}
    >
      <i aria-hidden="true">{mark}</i>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
      <ArrowRight size={10} aria-hidden="true" />
    </button>
  )
}

export function FolioProgress({ index, total, label, visited = [], onOpen, active = false }: {
  index: number
  total: number
  label: string
  visited?: number[]
  onOpen?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <i aria-hidden="true">卷</i>
      <span>第 {String(index).padStart(2, '0')} / {String(total).padStart(2, '0')} 页</span>
      <b>{label}</b>
      <em className="folio-progress-nicks" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <i key={i} className={visited.includes(i + 1) ? 'is-read' : ''} />)}
      </em>
      <small>只读页序</small>
    </>
  )
  const className = `folio-progress ${onOpen ? 'is-link' : ''} ${active ? 'is-active' : ''}`.replace(/\s+/g, ' ').trim()
  const hint = '卷页题签 · 只读页序，刻口只记翻过哪几页'
  return onOpen
    ? <button type="button" className={className} data-folio-mount="true" data-folio-active={active ? 'true' : undefined} title={hint} onClick={onOpen} aria-label={`卷页题签 · 第 ${index} / ${total} 页 · ${label} · 回此处`}>{body}</button>
    : <span className={className} data-folio-mount="true" data-folio-active={active ? 'true' : undefined} title={hint} aria-label={`卷页题签 · 第 ${index} / ${total} 页 · ${label}`}>{body}</span>
}
