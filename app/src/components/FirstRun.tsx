/**
 * C-94 初到三签：首次进入时压在案头顶端的一张纸。
 * 只解释既有界面（一处一段 / 六个入口 / 三行日志），不生成任务、不推进时段、不改判定、不写存档。
 * 收起分两条路：「知道」永久收起（记在本机阅览偏好同档）、「先收起」折成一枚书签条，仍可再展开。
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { FocusTarget } from '../focusContext'

const lines: Array<{ mark: string, title: string, note: string, target: FocusTarget }> = [
  { mark: '一', title: '一段只做一件实事', note: '读、看、翻卷、走动不占时段；问人、亲勘、签押才占。', target: 'period-track' },
  { mark: '二', title: '六个入口各管一件事', note: '今日看场面，案卷读文书，事务看几条线在走。', target: 'main-nav' },
  { mark: '三', title: '三行日志替你记住', note: '成 / 卡 / 传——夜结算时照见这一天。', target: 'today-log' },
]

export function FirstRunSlip({ onDismiss, onPoint }: { onDismiss: () => void, onPoint?: (target: FocusTarget) => void }) {
  const [folded, setFolded] = useState(false)
  const reduceMotion = useReducedMotion()

  if (folded) {
    return (
      <button type="button" className="first-run-bookmark" onClick={() => setFolded(false)} aria-expanded="false" aria-label="展开初到三件事">
        <span>初到</span><b>三件事</b><ChevronDown size={12} aria-hidden="true" />
      </button>
    )
  }

  return (
    <AnimatePresence initial={false}>
      <motion.section
        className="first-run-slip"
        aria-label="初到县衙 · 三件事"
        initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }}
        transition={{ duration: reduceMotion ? 0 : .2 }}
      >
        <header className="first-run-head"><span>初到</span><b>三件事</b><i aria-hidden="true" /><small>只解释界面</small></header>
        <ol className="first-run-list">
          {lines.map(line => (
            <li key={line.mark}>
              <span className="first-run-mark" aria-hidden="true">{line.mark}</span>
              <div><b>{line.title}</b><small>{line.note}</small></div>
              {onPoint && <button type="button" className="first-run-point" onClick={() => onPoint(line.target)} aria-label={`指给我看：${line.title}`}>指</button>}
            </li>
          ))}
        </ol>
        <footer className="first-run-foot">
          <button type="button" className="first-run-know" onClick={onDismiss}>知道，不再提示</button>
          <button type="button" className="first-run-later" onClick={() => setFolded(true)}>先收起</button>
        </footer>
      </motion.section>
    </AnimatePresence>
  )
}
