import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Clock3, MapPin, UsersRound, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import type { WorldEvent } from '../game/schedule'

export function WorldEventCard({ event, onChoose, onLater }: { event: WorldEvent, onChoose: (optionId: string) => void, onLater: () => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop world-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="world-card" role="dialog" aria-modal="true" aria-labelledby="world-event-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 24, opacity: 0, rotate: reduceMotion ? 0 : .3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: reduceMotion ? 0 : 14, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 27 }}>
        <header className="world-head">
          <div><span className="eyebrow">第{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][event.day - 1]}日 · 世界自己来敲门</span><h2 id="world-event-title">{event.title}</h2></div>
          <button className="icon-button" onClick={onLater} aria-label="先回案头"><X size={19} /></button>
        </header>
        <div className="world-layout">
          <div className="world-narrative">
            <div className="world-scene"><MapPin size={14} /><span>{event.scene}</span><i /><Clock3 size={14} /><span>事件暂停 不推进时段</span></div>
            <p className="world-body">{event.body}</p>
            <div className="world-facts">
              <div><UsersRound size={14} /><span>谁在场</span><p>{event.present}</p></div>
              <div><span>你知道什么</span><p>{event.known}</p></div>
            </div>
          </div>
          <div className="world-options-column">
            <div className="world-options-heading"><span>当场回话</span><small>点选即定 也可先回案头</small></div>
            <div className="world-options">
              {event.options.map((option, index) => (
                <motion.button key={option.id} onClick={() => onChoose(option.id)} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: .12 + index * .07 }} whileTap={{ scale: .99 }}>
                  <span className="option-index">{['甲', '乙'][index]}</span>
                  <div><b>{option.label}</b><small>{option.hint}</small></div>
                  <ArrowRight size={16} />
                </motion.button>
              ))}
            </div>
          </div>
        </div>
        <button className="text-link world-later" onClick={onLater}>先回案头 此事挂起不消失</button>
      </motion.div>
    </motion.section>
  )
}
