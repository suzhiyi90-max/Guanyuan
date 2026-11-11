import { useState, type KeyboardEvent } from 'react'

/** C-68 认知档位图例：只读既有档位，筛选是本地视觉状态，不改地点数据。 */
export const knowledgeTiers = ['亲至', '见图', '听说', '未详'] as const
export type KnowledgeFilter = '全部' | (typeof knowledgeTiers)[number]
const tierClass: Record<string, string> = { 亲至: 'known', 见图: 'seen', 听说: 'heard', 未详: 'unknown' }

export function KnowledgeLegend({ value, onChange, note, className = '' }: {
  value?: KnowledgeFilter
  onChange?: (value: KnowledgeFilter) => void
  note?: string
  className?: string
}) {
  const [inner, setInner] = useState<KnowledgeFilter>('全部')
  const current = value ?? inner
  const select = (next: KnowledgeFilter) => { setInner(next); onChange?.(next) }
  const items: KnowledgeFilter[] = ['全部', ...knowledgeTiers]
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = items.indexOf(current)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    select(items[next])
  }
  return (
    <div className={`knowledge-legend ${className}`} role="group" aria-label="认知档位筛选 · 界面投影" data-knowledge-filter={current} onKeyDown={onKey}>
      {items.map(item => <button key={item} type="button" aria-pressed={current === item} className={current === item ? 'active' : ''} onClick={() => select(item)}>
        {item !== '全部' && <i className={tierClass[item]} />}{item}
      </button>)}
      {note && <small>{note}</small>}
    </div>
  )
}
