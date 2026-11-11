/**
 * FE-157 候墨卡：与WorldEventCard 同壳，承载「未备笔 → 配置 → 三段候墨 → 成卷」一条完整路径。
 * 不新增 OverlayId，复用既有 'world' 叠层；未备笔时就地配置，不必先翻立志纸。
 */
import { motion, useReducedMotion } from 'framer-motion'
import { Feather, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOverlayDialog } from './Overlays'
import { NarrationStage } from './NarrationStage'
import { intentTone, type NarrationIntent, type NarrationRun } from '../narrative/types'

const intents: NarrationIntent[] = ['问事', '闲谈', '请示', '旁白']

export function NarrationCard({ run, ready, intent, onIntent, onAwait, onSkip, onCancel, configSlot }: {
  run: NarrationRun
  ready: boolean
  intent: NarrationIntent
  onIntent: (intent: NarrationIntent) => void
  onAwait: () => void
  onSkip: () => void
  onCancel: () => void
  configSlot?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const running = run.phase !== 'idle' && run.phase !== 'settled'

  return (
    <motion.section className="overlay-backdrop world-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="world-card narration-card" role="dialog" aria-modal="true" aria-labelledby="narration-title" tabIndex={-1}
        initial={{ y: reduceMotion ? 0 : 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : 14, opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 27 }}>
        <header className="world-head">
          <div>
            <span className="eyebrow">案上候墨 · 只写叙述 不改判定</span>
            <h2 id="narration-title">{running ? '这一笔正在写' : ready ? '候一笔新的' : '先备笔'}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="回案头"><X size={19} /></button>
        </header>

        {!running && (
          <div className="narration-intents" role="group" aria-label="本次意图">
            {intents.map(item => (
              <button key={item} type="button" className={`narration-intent ${intent === item ? 'is-active' : ''}`}
                aria-pressed={intent === item} onClick={() => onIntent(item)} disabled={!ready}>
                <b>{item}</b><small>{intentTone[item]}</small>
              </button>
            ))}
          </div>
        )}

        {running ? (
          <NarrationStage run={run} onSkip={onSkip} onCancel={onCancel} />
        ) : (
          <>
            {ready ? (
              <div className="narration-ready">
                <p>模型只写剧情、对白、氛围与选项措辞；<b>成败、数值、时段与存档仍由本地结算</b>。两个选项的代价由本地效果目录兜底，写在选项上。</p>
                <button type="button" className="primary-button narration-await" onClick={onAwait}>
                  <Feather size={16} aria-hidden="true" /><span>落笔 · {intent}</span>
                </button>
                <small>首字八秒不至即搁笔，总时长三十秒封顶；失败不弹错，本日照旧。</small>
              </div>
            ) : (
              <p className="narration-unready-note">尚未开启或未备钥匙。游戏本身<b>完全照旧可玩</b>，AI 只是额外的一支笔。</p>
            )}
            <div className="narration-config-slot">{configSlot}</div>
          </>
        )}
      </motion.div>
    </motion.section>
  )
}