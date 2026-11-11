/**
 * FE-157 三段等待（20 七）：查档 → 议拟 → 落笔。
 * 不显示「正在思考」，不暴露思维链 / prompt / 模型名；等待包装成世界内动作。
 * 动效全走 CSS 与 rAF 合批后的文本，不代码画场景；减少动效下直接淡入。
 */
import { motion, useReducedMotion } from 'framer-motion'
import { Feather, ScrollText, SkipForward, X } from 'lucide-react'
import type { NarrationRun } from '../narrative/types'

const stages = [
  { key: 'archive', label: '查档', note: '翻检旧卷' },
  { key: 'draft', label: '议拟', note: '斟酌措辞' },
  { key: 'ink', label: '落笔', note: '墨迹洇开' },
] as const

export function NarrationStage({ run, onSkip, onCancel }: { run: NarrationRun, onSkip: () => void, onCancel: () => void }) {
  const reduceMotion = useReducedMotion()
  const activeIndex = run.phase === 'archive' ? 0 : run.phase === 'draft' ? 1 : 2
  const ink = run.ink
  const head = ink.slice(0, Math.max(0, ink.length - 6))
  const tail = ink.slice(Math.max(0, ink.length - 6))

  if (run.phase === 'quiet') {
    return (
      <motion.div className="narration-quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .3 }} role="status">
        <span className="narration-quiet-seal" aria-hidden="true">照</span>
        <div>
          <b>{run.quietNote ?? '笔墨未至 · 本日照旧'}</b>
          <p>案上旧卷仍在，日程不改。要再候一笔，可先去存档案卷里备笔。</p>
        </div>
        <button type="button" className="text-link" onClick={onCancel}>回案头</button>
      </motion.div>
    )
  }

  return (
    <div className="narration-stage" data-phase={run.phase} data-cache={run.fromCache ? 'true' : 'false'}>
      <ol className="narration-rail" aria-label="候墨三段">
        {stages.map((stage, index) => (
          <li key={stage.key} className={index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : ''} aria-current={index === activeIndex ? 'step' : undefined}>
            <span className="narration-rail-dot" aria-hidden="true" />
            <b>{stage.label}</b>
            <small>{stage.note}</small>
          </li>
        ))}
      </ol>

      <div className="narration-visual" aria-hidden="true">
        {run.phase === 'archive' && (
          <div className="narration-archive">
            <span className="narration-slip s1" /><span className="narration-slip s2" /><span className="narration-slip s3" />
            <span className="narration-drawer" />
          </div>
        )}
        {run.phase === 'draft' && (
          <div className="narration-draft">
            <span className="narration-glow" />
            <span className="narration-brush"><i /></span>
            <span className="narration-drop" />
          </div>
        )}
        {run.phase === 'ink' && (
          <div className="narration-inkwell">
            <span className="narration-inkline" />
            <span className="narration-fibre" />
          </div>
        )}
      </div>

      <div className="narration-beat" aria-live="polite">
        {run.beat ? (
          <>
            <span className="narration-beat-scene"><ScrollText size={13} aria-hidden="true" />{run.beat.scene}</span>
            {run.beat.present.map(name => <span key={name} className="narration-beat-name">{name}</span>)}
            {run.beat.mood && <span className="narration-beat-mood">{run.beat.mood}</span>}
          </>
        ) : (
          <span className="narration-beat-wait">先摆案上旧卷 · 正文后到</span>
        )}
      </div>

      <p className="narration-body" aria-live="polite" aria-busy={run.phase !== 'settled'}>
        {ink ? (
          <>
            <span>{head}</span>
            {tail.split('').map((char, index) => (
              <span key={ink.length - tail.length + index} className="narration-char">{char}</span>
            ))}
            <span className="narration-caret" aria-hidden="true" />
          </>
        ) : (
          <span className="narration-placeholder">{run.phase === 'archive' ? '纸签翻动，卷宗抽出一角……' : '笔尖悬停，墨将落未落……'}</span>
        )}
      </p>

      <footer className="narration-acts">
        <span className="narration-elapsed">{run.fromCache ? '旧稿重放 · 不计费' : `已候 ${(run.elapsed / 1000).toFixed(1)} 秒`}</span>
        <button type="button" className="text-link" onClick={onSkip} disabled={run.phase === 'archive'}>
          <SkipForward size={13} aria-hidden="true" /><span>略过 · 直接看全文</span>
        </button>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="搁笔 · 回案头"><X size={17} /></button>
      </footer>
      <span className="narration-seal-mark" aria-hidden="true"><Feather size={12} /></span>
    </div>
  )
}