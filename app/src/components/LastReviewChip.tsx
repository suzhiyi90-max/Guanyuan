/**
 * C-104b 同源批阅签：只记「上次在卷宗里看到哪一组」，点开回原组。
 * 会话内内存，刷新即散；不改选证顺序、文书内容与判定。
 * FE-097：只读互链——多一枚「来自 · 某表面」与「回那处」小签，只交换界面焦点。
 */
import { ArrowUpRight } from 'lucide-react'
import { hasView, readView } from '../viewMemory'
import { reviewGroupOf } from '../review'
import { originLabels, type ReviewOrigin } from '../reviewTrail'
import { FolioSlip } from './FolioSlip'

export function LastReviewChip({ onOpen, compact = false, origin, onBack }: { onOpen: (focus: string) => void, compact?: boolean, origin?: ReviewOrigin, onBack?: () => void }) {
  if (!hasView('document-focus')) return null
  const focus = readView('document-focus', 'cause-initial')
  const group = reviewGroupOf(focus)
  return (
    <span className="last-review-pair">
      <button type="button" className={`last-review-chip ${compact ? 'is-compact' : ''}`} onClick={() => onOpen(focus)} title={`回卷宗 · 批阅尺 ${group.label}`}>
        <span>上次批阅</span>
        <b>{group.mark} · {group.label}</b>
        <ArrowUpRight size={11} />
      </button>
      {origin && <span className="last-review-origin">来自 · {originLabels[origin]}</span>}
      {onBack && <FolioSlip compact mark="来" label="回那处" detail={origin ? originLabels[origin] : undefined} onClick={onBack} />}
    </span>
  )
}
