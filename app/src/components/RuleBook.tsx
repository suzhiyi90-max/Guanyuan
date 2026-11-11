import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, CircleHelp, FileWarning, Fingerprint, Link2, LockKeyhole, Scale, Stamp, X } from 'lucide-react'
import type { GameState } from '../game/useGame'
import { clauseById, clausesOf, ruleBasisSummary, ruleClauses, ruleVolumes, type VolumeId } from '../rules'
import { useRuleBook } from '../ruleContext'
import { useOverlayDialog } from './useOverlayDialog'

const spring = { type: 'spring' as const, stiffness: 390, damping: 34 }

/** C-45 依何条小签：各屏共用，只负责打开则例册的对应条文。 */
export function RuleChip({ clause, label, compact = false }: { clause: string; label?: string; compact?: boolean }) {
  const { openRule } = useRuleBook()
  const found = clauseById(clause)
  return (
    <button className={`rb-chip ${compact ? 'is-compact' : ''}`} onClick={() => openRule(clause)} title={`查则例 · ${found?.basis ?? ''}`} aria-label={`查则例 ${found?.title ?? '条文'}`}>
      <Scale size={11} />
      <span>{label ?? `依 ${found?.basis.split(' / ')[0].replace('总纲 ', '') ?? '则例'}`}</span>
      <ArrowRight size={10} />
    </button>
  )
}

/** C-46 为什么不能条：只解释既有受阻原因，点则例回到条文，不改变确认/时段流程。 */
export function WhyNot({ title, reason, clause, alternative }: { title: string; reason: string; clause: string; alternative?: string }) {
  const { openRule } = useRuleBook()
  return (
    <aside className="rb-why-not" aria-label={`为什么不能 · ${title}`}>
      <i className="rb-why-seam" aria-hidden="true"><span>骑缝</span></i>
      <div>
        <header><CircleHelp size={13} /><b>{title}</b><em>为什么不能</em></header>
        <p>{reason}</p>
        {alternative && <small>替代 · {alternative}</small>}
      </div>
      <button className="rb-why-link" onClick={() => openRule(clause)}>查则例<ArrowRight size={11} /></button>
    </aside>
  )
}

interface Props {
  state: GameState
  initialClause?: string
  onClose: () => void
}

export function RuleBook({ state, initialClause, onClose }: Props) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const initial = useMemo(() => clauseById(initialClause ?? '') ?? clausesOf('time')[0], [initialClause])
  const [volume, setVolume] = useState<VolumeId>(initial.volume)
  const [selected, setSelected] = useState(initial.id)
  // FE-141（C-150）：条文单一 Tab 停靠；方向键仍走既有「换选中 + 焦点」。
  const clauseListRef = useRef<HTMLDivElement | null>(null)
  const dockClauses = (node: HTMLDivElement | null) => {
    clauseListRef.current = node
    if (!node) return
    Array.from(node.querySelectorAll<HTMLButtonElement>('.rb-clause')).forEach((el, index) => { el.tabIndex = index === 0 ? 0 : -1 })
  }
  useEffect(() => { dockClauses(clauseListRef.current) }, [volume, selected])
  const clauses = clausesOf(volume)
  const active = clauseById(selected) ?? clauses[0]
  const activeVolume = ruleVolumes.find(item => item.id === volume) ?? ruleVolumes[0]
  const projection = active.project(state)

  const chooseVolume = (next: VolumeId) => {
    setVolume(next)
    setSelected(clausesOf(next)[0].id)
  }

  const handleVolumeKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = ruleVolumes.findIndex(item => item.id === volume)
    let next = current
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % ruleVolumes.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + ruleVolumes.length) % ruleVolumes.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ruleVolumes.length - 1
    else return
    event.preventDefault()
    chooseVolume(ruleVolumes[next].id)
    document.getElementById(`rb-volume-${ruleVolumes[next].id}`)?.focus()
  }

  const handleClauseKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const current = clauses.findIndex(item => item.id === selected)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? clauses.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + clauses.length) % clauses.length
    event.preventDefault()
    setSelected(clauses[next].id)
    document.getElementById(`rb-clause-${clauses[next].id}`)?.focus()
  }

  return (
    <motion.section className="overlay-backdrop rb-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="rb-folio" role="dialog" aria-modal="true" aria-labelledby="rb-title" tabIndex={-1} data-volume={volume} initial={{ y: reduceMotion ? 0 : 20, opacity: 0, scale: reduceMotion ? 1 : .99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: reduceMotion ? 0 : 12, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 235, damping: 28 }}>
        <span className="rule-base-note">则例底纸 · 待补专图（暂借素纸）</span>
        <header className="rb-head">
          <div>
            <span className="eyebrow" id="rb-title">S-12 / 则例册 · 规则摘录</span>
            <h2>为什么不能，写在纸上。</h2>
            <p>这里只摘录既有总纲条款。界面各处的纸面查验是投影，不是规则本身。</p>
          </div>
          <div className="rb-head-right">
            <span className="rb-rule-badge"><Fingerprint size={12} />规则 · 摘录</span>
            <button className="icon-button" onClick={onClose} aria-label="收起则例册"><X size={20} /></button>
          </div>
        </header>

        <div className="rb-body">
          <nav className="rb-volumes" role="tablist" aria-label="则例卷目" onKeyDown={handleVolumeKeys}>
            <header><BookOpen size={14} /><span>卷目</span><small>六卷 · {ruleClauses.length} 条</small></header>
            {ruleVolumes.map((item, index) => (
              <button key={item.id} id={`rb-volume-${item.id}`} role="tab" aria-selected={volume === item.id} aria-controls="rb-clause-panel" tabIndex={volume === item.id ? 0 : -1} data-sound="paper:leaf" onClick={() => chooseVolume(item.id)}>
                {volume === item.id && <motion.span className="rb-volume-ink" layoutId="rb-volume-ink" transition={reduceMotion ? { duration: 0 } : spring} aria-hidden="true" />}
                <span className="rb-volume-seal">{item.seal}</span>
                <span className="rb-volume-text"><b>{item.name}</b><small>{item.subtitle}</small></span>
                <i>{String(index + 1).padStart(2, '0')}</i>
              </button>
            ))}
            <footer><LockKeyhole size={11} /><span>只摘录 不改规则</span></footer>
          </nav>

          <section className="rb-clauses" id="rb-clause-panel" role="tabpanel" aria-labelledby={`rb-volume-${volume}`} onKeyDown={handleClauseKeys}>
            <header className="rb-clause-head">
              <div><span className="eyebrow">卷{['一', '二', '三', '四', '五', '六'][ruleVolumes.findIndex(item => item.id === volume)]} · {activeVolume.name}</span><h3>{activeVolume.subtitle}</h3></div>
              <span className="rb-basis">{activeVolume.basis}</span>
            </header>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div className="rb-clause-list" key={volume} ref={dockClauses} initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
                {clauses.map(item => (
                  <button key={item.id} id={`rb-clause-${item.id}`} className={`rb-clause ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} data-sound="paper:leaf" onClick={() => setSelected(item.id)}>
                    <span className="rb-clause-index">{item.index}</span>
                    <div>
                      <header><b>{item.title}</b><span>{item.basis}</span></header>
                      <p className="rb-clause-text">{item.text}</p>
                      <p className="rb-clause-gloss">{item.gloss}</p>
                    </div>
                    {selected === item.id && <motion.i className="rb-clause-mark" layoutId="rb-clause-mark" transition={reduceMotion ? { duration: 0 } : spring} aria-hidden="true"><Stamp size={12} /></motion.i>}
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
            <footer className="rb-clause-foot"><Scale size={11} /><span>条文均引自《设计总纲》与施工备案，不新增 D 级条目</span></footer>
          </section>

          <aside className="rb-correspondence" aria-label="本局对应">
            <header>
              <div><span className="eyebrow">本局对应 · 只读投影</span><h3>{active.title}</h3></div>
              <span className="rb-projection-badge">界面 · 投影</span>
            </header>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active.id} className="rb-projection-lines" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                {projection.map(item => (
                  <div className="rb-projection-line" data-tone={item.tone ?? 'ready'} key={item.label}>
                    <span>{item.label}</span>
                    <p>{item.value}</p>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
            <div className="rb-projection-seal" aria-hidden="true">据</div>
            <div className="rb-correspondence-note"><Link2 size={12} /><p>「本局对应」只取已发生的日志、文书、接触与验收状态；无依据处留白，不推断。</p></div>
          </aside>
        </div>

        <footer className="rb-foot">
          <span><FileWarning size={12} />{ruleBasisSummary}</span>
          <span className="rb-foot-legend">回查不耗时 · 不写存档 · 不启用新结算</span>
          <button className="primary-button" onClick={onClose}>收起则例<ArrowRight size={15} /></button>
        </footer>
      </motion.div>
    </motion.section>
  )
}
