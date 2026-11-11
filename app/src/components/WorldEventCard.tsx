import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Clock3, Eye, MapPin, UsersRound, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import { worldEvents, type WorldEvent } from '../game/schedule'
import { ScenePlate } from './ScenePlate'
import { worldEventPlateOf, narrationPlateOf } from '../sceneArt'

export function WorldEventCard({ event, onChoose, onLater, currentDay, onLocateDay, generated = false, optionNotes }: { event: WorldEvent, onChoose: (optionId: string) => void, onLater: () => void, currentDay?: number, onLocateDay?: (day: number) => void, generated?: boolean, optionNotes?: Record<string, string> }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const [showExposure, setShowExposure] = useState(false)
  const days = Array.from({ length: 10 }, (_, index) => index + 1)
  return (
    <motion.section className="overlay-backdrop world-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="world-card" role="dialog" aria-modal="true" aria-labelledby="world-event-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 24, opacity: 0, rotate: reduceMotion ? 0 : .3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: reduceMotion ? 0 : 14, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 27 }}>
        <header className="world-head">
          <div><span className="eyebrow">第{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][event.day - 1]}日 · {generated ? '案上候墨 · 叙述由模型 判定在本地' : '世界自己来敲门'}</span><h2 id="world-event-title">{event.title}</h2></div>
          <div className="world-head-side">
            {generated && <span className="world-ai-slip" title="模型只写叙述层；效果由本地目录结算">AI 叙述 · 本地判定</span>}
            <button className="icon-button" onClick={onLater} aria-label="先回案头"><X size={19} /></button>
          </div>
        </header>
        <div className="world-date-band" aria-label="一汛十日 · 点日到世界时钟查验">
          <div className="world-date-lead"><span>一汛十日</span><small>点日查验 · 不改日程</small></div>
          <div className="world-date-rail">
            {days.map(day => {
              const isEvent = day === event.day
              const isPublic = worldEvents.some(item => item.day === day)
              return <button key={day} type="button" className={`${isEvent ? 'is-event' : ''} ${day === currentDay ? 'is-today' : ''} ${day < (currentDay ?? 0) ? 'is-passed' : ''}`} onClick={() => onLocateDay?.(day)}
                aria-label={`在十日世界时钟里看第${day}日${isPublic ? ' · 有公开日程' : ''}`} aria-pressed={isEvent}>
                {isEvent && <motion.span className="world-date-ink" layoutId={`world-date-ink-${event.id}`} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} aria-hidden="true" />}
                <span>{String(day).padStart(2, '0')}</span><i className={isPublic ? 'is-public' : ''} />
              </button>
            })}
          </div>
          <span className="world-date-note">此事在第{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][event.day - 1]}日{currentDay ? ` · 今日第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][currentDay - 1]}日` : ''}</span>
        </div>
        <div className="world-plate-band">
          <ScenePlate id={generated ? narrationPlateOf(event.scene) : worldEventPlateOf(event.id)} className="world-art-plate" />
          <div className="world-plate-caption"><span>{event.scene}</span><small>事件暂停 · 不推进时段</small></div>
        </div>
        <div className="world-layout">
          <div className="world-narrative">
            <div className="world-scene"><MapPin size={14} /><span>{event.scene}</span><i /><Clock3 size={14} /><span>事件暂停 不推进时段</span></div>
            <p className="world-body">{event.body}</p>
            <div className="world-facts">
              <div><UsersRound size={14} /><span>谁在场</span><p>{event.present}</p></div>
              <div><span>你知道什么</span><p>{event.known}</p></div>
            </div>
            <div className="world-exposure">
              <button className="world-exposure-toggle" onClick={() => setShowExposure(current => !current)} aria-expanded={showExposure} aria-controls="world-exposure-sheet">
                <Eye size={13} /><span>谁知道了 · 曝光四档</span><small>界面 · 投影 / 依 13.5.2</small>
              </button>
              {showExposure && <motion.div id="world-exposure-sheet" className="world-exposure-sheet" initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                <div><span>在场 · 本局事实</span><b>{event.present}</b></div>
                <div><span>你所知 · 本局事实</span><b>{event.known}</b></div>
                <div className="world-exposure-tiers"><span>四档口径 · 不作本局判定</span><p>私密 / 目睹 / 文书 / 公开。没有见证、记录与传播的行为，不自动改变受众态度。</p></div>
                <footer>只说明总纲 13.5.2 的档位口径，不推断本局谁知道了、相信哪个版本或因此怎么做。</footer>
              </motion.div>}
            </div>
          </div>
          <div className="world-options-column">
            <div className="world-options-heading"><span>当场回话</span><small>点选即定 也可先回案头</small></div>
            <div className="world-options">
              {event.options.map((option, index) => (
                <motion.button key={option.id} onClick={() => onChoose(option.id)} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: .12 + index * .07 }} whileTap={{ scale: .99 }}>
                  <span className="option-index">{['甲', '乙'][index]}</span>
                  <div><b>{option.label}</b><small>{option.hint}</small>{optionNotes?.[option.id] && <small className="option-local-note">{optionNotes[option.id]}</small>}</div>
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
