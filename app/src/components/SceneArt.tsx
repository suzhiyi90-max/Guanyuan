import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GameState } from '../game/useGame'
import type { Period, SceneId } from '../types'

const rainLines = Array.from({ length: 18 }, (_, index) => index)

export function PeriodLight({ period }: { period: Period }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={period}
        className={`period-light period-light-${period}`}
        data-period-light={period}
        aria-hidden="true"
        initial={{ opacity: 0, x: reduceMotion ? 0 : period === '暮' ? 26 : -18, clipPath: reduceMotion ? 'inset(0%)' : 'inset(0% 0% 0% 7%)' }}
        animate={{ opacity: 1, x: 0, clipPath: 'inset(0%)' }}
        exit={{ opacity: 0, x: reduceMotion ? 0 : period === '晨' ? 18 : -22, clipPath: reduceMotion ? 'inset(0%)' : 'inset(0% 6% 0% 0%)' }}
        transition={{ duration: reduceMotion ? 0 : .68, ease: [.22, 1, .36, 1] }}
      />
    </AnimatePresence>
  )
}

export function SceneArt({ scene, riverWorking = false }: { scene: SceneId, riverWorking?: boolean }) {
  const [studyFailed, setStudyFailed] = useState(false)
  const [workFailed, setWorkFailed] = useState(false)
  const reduceMotion = useReducedMotion()

  if (scene === 'river') {
    const working = riverWorking && !workFailed
    return (
      <motion.div className={`scene-art scene-photo river-photo ${working ? 'river-working' : ''}`} aria-hidden="true" initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.03 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : .55, ease: 'easeOut' }}>
        <img src={working ? '/assets/east-dike-work.jpg' : '/assets/east-dike-dawn.jpg'} alt="" onError={() => working && setWorkFailed(true)} />
      </motion.div>
    )
  }

  if (scene === 'study' && !studyFailed) {
    return (
      <motion.div className="scene-art scene-photo study-photo" aria-hidden="true" initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.03 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : .55, ease: 'easeOut' }}>
        <img src="/assets/study-night.jpg" alt="" onError={() => setStudyFailed(true)} />
        <div className="lamp-glow" />
      </motion.div>
    )
  }

  return (
    <motion.div className={`scene-art scene-photo ${scene === 'study' ? 'is-night' : ''}`} aria-hidden="true" initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : .5, ease: 'easeOut' }}>
      <img src="/assets/county-office-dawn.jpg" alt="" />
      {scene === 'study' && <div className="lamp-glow" />}
    </motion.div>
  )
}

export function RiverProjection({ state }: { state: GameState }) {
  const reduceMotion = useReducedMotion()
  const rainKnown = state.day >= 8
  const floodKnown = state.day >= 9
  const materialKnown = state.material.arrived > 0 || state.material.transit > 0 || state.material.unsent > 0
  const waterStage = floodKnown ? '洪峰过境' : rainKnown ? '暴雨涨水' : '未有汛报'

  return (
    <div
      className={`river-projection ${reduceMotion ? 'is-reduced' : ''} ${rainKnown ? 'has-rain' : ''} ${floodKnown ? 'has-flood' : ''}`}
      data-water-stage={waterStage}
      data-material-known={materialKnown}
      data-plan-known={Boolean(state.plan)}
      data-outcome-known={Boolean(state.outcome)}
      aria-label="东堤现场投影，仅呈现已有日程与记录"
    >
      <div className="river-seep-trace" aria-hidden="true"><i /><i /><i /></div>
      {materialKnown && <div className="river-material-trace" aria-hidden="true"><span><i /><i /><i /></span><small>料垛在场</small></div>}
      {state.plan && <div className="river-plan-trace" aria-hidden="true"><i /><span>抢护已发起</span></div>}
      {rainKnown && <>
        <div className="river-rain" aria-hidden="true">{rainLines.map(line => <i key={line} style={{ '--rain-index': line } as React.CSSProperties} />)}</div>
        <div className="river-flood-gauge" data-water-stage={waterStage} aria-label={floodKnown ? '第九日洪峰过境；原状态没有水位数值' : '第八日上游暴雨；原状态没有水位数值'}>
          <span>汛</span><div><i /><b /></div><small>{floodKnown ? '洪峰过境' : '上游暴雨'}</small>
        </div>
      </>}
      {state.outcome && <div className="river-outcome-trace" data-grade={state.outcome.grade} aria-hidden="true" />}
      <div className="river-evidence-strip">
        <span>{floodKnown ? '第九日 · 洪峰过境' : rainKnown ? '第八日后 · 上游暴雨' : '初勘 · 旧闸渗水'}</span>
        {state.plan && <span>第{state.plan.day}日{state.plan.period} · 抢护签押</span>}
        {state.outcome && <span>验收已入卷 · {state.outcome.grade}</span>}
      </div>
    </div>
  )
}
