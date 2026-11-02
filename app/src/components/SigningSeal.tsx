import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useOverlayDialog } from './Overlays'
import type { RiverPlan } from '../types'

export function SigningSeal({ plan, onDone }: { plan: RiverPlan; onDone: () => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  useEffect(() => {
    const timer = window.setTimeout(onDone, reduceMotion ? 0 : 2100)
    return () => window.clearTimeout(timer)
  }, [onDone, reduceMotion])

  return (
    <motion.div className="signing-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="signing-paper" role="dialog" aria-modal="true" aria-label="东堤抢护签押落印" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .26, ease: 'easeOut' }}>
        <span className="eyebrow">东堤抢护 · 发起文书</span>
        <h3>为抢护东堤险工事</h3>
        <div className="signing-lines">
          <p>主办 {plan.leaderName}</p>
          <p>拨料 {plan.material} 垛 夫役 {plan.labor} 人</p>
          <p>{plan.supervisor}</p>
          <p className="signing-date">第{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][plan.day - 1]}日 · {plan.period} 知县亲判</p>
        </div>
        <motion.div
          className="signing-seal"
          initial={{ scale: reduceMotion ? 1 : 1.75, opacity: reduceMotion ? 1 : 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: -6 }}
          transition={reduceMotion ? { duration: 0 } : { delay: .55, duration: .18, ease: [0.2, 0.7, 0.2, 1] }}
        >
          永济<br />县印
        </motion.div>
        <motion.span className="signing-caption" initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { delay: .85 }}>
          印已落 事已发起 其余交给日程
        </motion.span>
      </motion.div>
    </motion.div>
  )
}
