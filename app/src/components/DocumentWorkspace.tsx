import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Columns2, FileText, Link2, MapPin, PenLine, ScrollText, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import { documentVersions } from '../data'
import type { DocMode } from '../types'

interface Props {
  mode: DocMode
  onModeChange: (mode: DocMode) => void
  selected: string[]
  onToggle: (id: string) => void
  onRemember: () => void
  remembered: boolean
  onClose: () => void
}

const compareRows = [
  { id: 'cause', label: '渗水因由', initial: '查系连日水涨，堤土未实所致。', final: '闸底情形未明，须探挖勘明。', note: '因由有改，并置两版再记。' },
  { id: 'scope', label: '险工范围', initial: '堤身渗水，约四十步。', final: '渗水四十步，湿痕三处，最大约二尺。', note: '尺寸有增补，不以初稿遮定稿。' },
  { id: 'work', label: '处置工法', initial: '培土帮戗，闸底似可毋庸拆验。', final: '先雇夫抢护；旧闸是否拆修，汛后另案。', note: '工法措辞不同，先查所据。' },
  { id: 'material', label: '拨料数目', initial: '拨料八垛，先行抢修。', final: '先拨料八至十垛，三日内补报。', note: '料数改为区间，仍须到账核对。' },
]

const docTabs = [
  { id: 'original' as DocMode, label: '原件', icon: ScrollText },
  { id: 'reading' as DocMode, label: '释文', icon: FileText },
  { id: 'compare' as DocMode, label: '对勘', icon: Columns2 },
]

const reviewOrder = compareRows.flatMap(row => [`${row.id}-initial`, `${row.id}-final`])
const groupOf = (id: string) => id.replace(/-(initial|final)$/, '')

export function DocumentWorkspace({ mode, onModeChange, selected, onToggle, onRemember, remembered, onClose }: Props) {
  const { initial, final } = documentVersions
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const [focused, setFocused] = useState(selected[0] ?? 'cause-initial')
  const [pageDirection, setPageDirection] = useState(1)
  const focusedRow = compareRows.find(row => row.id === groupOf(focused)) ?? compareRows[0]
  const focusedVersion = focused.endsWith('-final') ? '定稿' : '初稿'
  const focusedGroupSelected = selected.some(id => groupOf(id) === focusedRow.id)

  const changeMode = (nextMode: DocMode) => {
    if (nextMode === mode) return
    setPageDirection(docTabs.findIndex(tab => tab.id === nextMode) >= docTabs.findIndex(tab => tab.id === mode) ? 1 : -1)
    onModeChange(nextMode)
  }

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = docTabs.findIndex(tab => tab.id === mode)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? docTabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % docTabs.length : (current - 1 + docTabs.length) % docTabs.length
    const nextMode = docTabs[next].id
    changeMode(nextMode)
    requestAnimationFrame(() => document.getElementById(`document-tab-${nextMode}`)?.focus())
  }

  const stepReview = (direction: number) => {
    const current = reviewOrder.indexOf(focused)
    const next = (current + direction + reviewOrder.length) % reviewOrder.length
    setFocused(reviewOrder[next])
  }

  const handleReviewKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    stepReview(event.key === 'ArrowRight' ? 1 : -1)
  }

  const toggleEvidence = (id: string) => {
    setFocused(id)
    onToggle(id)
  }

  const evidenceClass = (id: string, groupFocus = false, inline = true) => [
    inline ? 'evidence-inline' : '',
    selected.includes(id) ? 'selected' : '',
    groupFocus && selected.some(item => groupOf(item) === groupOf(id)) ? 'is-linked' : '',
    (groupFocus ? groupOf(focused) === groupOf(id) : focused === id) ? 'is-focused' : '',
  ].filter(Boolean).join(' ')

  const pageMotion = {
    initial: { opacity: 0, x: reduceMotion ? 0 : pageDirection * 18 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduceMotion ? 0 : pageDirection * -12 },
    transition: { duration: reduceMotion ? 0 : .2, ease: 'easeOut' as const },
  }

  return (
    <motion.section className="document-workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="document-sheet" role="dialog" aria-modal="true" aria-labelledby="document-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 34, rotate: reduceMotion ? 0 : .4, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : 18, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 26 }} onKeyDown={handleReviewKey} data-review-focus={focused}>
        <header className="document-toolbar">
          <div className="document-heading">
            <span className="eyebrow">河工案卷 · 001</span>
            <h2 id="document-title">东堤渗水呈文</h2>
          </div>
          <div className="document-tabs" role="tablist" aria-label="文书查看方式">
            {docTabs.map(tab => <motion.button
              key={tab.id}
              id={`document-tab-${tab.id}`}
              className={mode === tab.id ? 'active' : ''}
              onClick={() => changeMode(tab.id)}
              onKeyDown={handleTabKey}
              role="tab"
              aria-selected={mode === tab.id}
              aria-controls="document-panel"
              tabIndex={mode === tab.id ? 0 : -1}
              whileTap={{ scale: .96 }}
            >
              {mode === tab.id && <motion.span className="document-tab-ink" layoutId="document-tab-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="document-tab-label"><tab.icon size={16} />{tab.label}</span>
              {tab.id === 'compare' && <span className="tiny-dot" />}
            </motion.button>)}
          </div>
          <button className="icon-button document-close" onClick={onClose} aria-label="收起文书"><X size={20} /></button>
        </header>

        <div className="document-meta">
          <span>第一日 · 辰时收件</span><span>河工书办呈</span><span>知县亲览</span>
          <div className="document-review-stepper" aria-label="批阅焦点，Alt 加左右方向键移证">
            <button onClick={() => stepReview(-1)} aria-label="上一处批阅" title="上一处（Alt+←）"><ChevronLeft size={13} /></button>
            <span aria-live="polite"><b>{focusedRow.label}</b><small>{focusedVersion} · {focusedGroupSelected ? '已选' : '查验'}</small></span>
            <button onClick={() => stepReview(1)} aria-label="下一处批阅" title="下一处（Alt+→）"><ChevronRight size={13} /></button>
          </div>
          <span className="doc-status">两版有改</span>
        </div>

        <div className="document-panel" id="document-panel" role="tabpanel" aria-labelledby={`document-tab-${mode}`} data-doc-mode={mode} data-review-group={focusedRow.id}>
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'original' && (
            <motion.div key="original" className="original-view" {...pageMotion}>
              <div className="vertical-document">
                <div className="vertical-title">为呈报东堤渗险情事</div>
                <p>据东堤堡夫报称，旧闸下游堤身渗水，约<button className={evidenceClass('scope-initial', true)} aria-pressed={selected.includes('scope-initial')} onClick={() => toggleEvidence('scope-initial')}>四十步</button>。查系连日水涨，<button className={evidenceClass('cause-initial', true)} aria-pressed={selected.includes('cause-initial')} onClick={() => toggleEvidence('cause-initial')}>堤土未实所致</button>。</p>
                <p>拟即<button className={evidenceClass('work-initial', true)} aria-pressed={selected.includes('work-initial')} onClick={() => toggleEvidence('work-initial')}>培土帮戗</button>，拨料<button className={evidenceClass('material-initial', true)} aria-pressed={selected.includes('material-initial')} onClick={() => toggleEvidence('material-initial')}>八垛</button>，先行抢修。闸底旧工，历经多年，<button className={evidenceClass('cause-initial', true)} aria-pressed={selected.includes('cause-initial')} onClick={() => toggleEvidence('cause-initial')}>似可毋庸拆验</button>。</p>
                <p>理合具文呈报，伏乞鉴核施行。</p>
                <div className="document-signature">河工书办 谨呈<span className="square-seal">河工<br />之记</span><small className="review-signoff">知县亲览 · 批红手记</small></div>
              </div>
              <aside className="original-note">
                <div className="vermilion-note-heading"><PenLine size={16} /><span>朱批 / {focusedRow.label}</span><i /></div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p key={focusedRow.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .16 }}>{focusedRow.note}</motion.p>
                </AnimatePresence>
                <div className="original-source-pin"><MapPin size={13} /><span>{focusedVersion} · {focusedGroupSelected ? '证据钉已选' : '只作查验焦点'}</span></div>
                <button className="text-link" onClick={() => changeMode('compare')}>去看改动 <Columns2 size={14} /></button>
              </aside>
            </motion.div>
          )}

          {mode === 'reading' && (
            <motion.div key="reading" className="reading-view" {...pageMotion}>
              <div className="reading-heading"><span>横排释文</span><small>仅转换版式，不更改原件文字</small></div>
              <h3>为呈报东堤渗险情事</h3>
              <p>据东堤堡夫报称，旧闸下游堤身渗水，约<button className={evidenceClass('scope-initial', true)} aria-pressed={selected.includes('scope-initial')} onClick={() => toggleEvidence('scope-initial')}>四十步</button>。查系连日水涨，堤土未实所致。</p>
              <p>拟即培土帮戗，拨料<button className={evidenceClass('material-initial', true)} aria-pressed={selected.includes('material-initial')} onClick={() => toggleEvidence('material-initial')}>八垛</button>，先行抢修。闸底旧工，历经多年，<button className={evidenceClass('cause-initial', true)} aria-pressed={selected.includes('cause-initial')} onClick={() => toggleEvidence('cause-initial')}>似可毋庸拆验</button>。</p>
              <p>理合具文呈报，伏乞鉴核施行。</p>
              <div className="reading-margin-note"><span>批</span>{focusedRow.note}</div>
            </motion.div>
          )}

          {mode === 'compare' && (
            <motion.div key="compare" className="compare-view" {...pageMotion}>
              <div className="compare-intro">
                <p>按点选顺序并置 选两处以上即可记下疑点</p>
                <motion.span key={selected.length} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">{selected.length ? `已选 ${selected.length} / 3 处` : '尚未选择'}</motion.span>
              </div>
              <div className="compare-grid compare-head"><span>对勘项</span><strong>{initial.id} · 初稿</strong><strong>{final.id} · 定稿</strong></div>
              {compareRows.map((row, index) => {
                const a = `${row.id}-initial`
                const b = `${row.id}-final`
                const selectionMark = (id: string) => selected.includes(id) ? <motion.span className="compare-selection-mark" initial={{ opacity: 0, scale: reduceMotion ? 1 : .6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : .6 }}><Check size={11} /><b>{selected.indexOf(id) + 1}</b></motion.span> : null
                return (
                  <motion.div className={`compare-grid compare-row ${focusedRow.id === row.id ? 'is-focused' : ''}`} key={row.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .18, delay: reduceMotion ? 0 : index * .035 }}>
                    <span><i className="compare-source-pin" />{row.label}</span>
                    <button className={evidenceClass(a, false, false)} aria-pressed={selected.includes(a)} onClick={() => toggleEvidence(a)}><i />{row.initial}<AnimatePresence>{selectionMark(a)}</AnimatePresence></button>
                    <button className={evidenceClass(b, false, false)} aria-pressed={selected.includes(b)} onClick={() => toggleEvidence(b)}><i />{row.final}<AnimatePresence>{selectionMark(b)}</AnimatePresence></button>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        <footer className="document-footer">
          <div className="evidence-source"><Link2 size={15} /><span>来源链</span><b>V-001</b><em>书办呈文</em><b>V-002</b><em>幕友改定</em></div>
          <button className={`primary-button remember-button ${remembered ? 'is-done' : ''}`} disabled={selected.length < 2 || remembered} onClick={onRemember}>
            {remembered ? <><Check size={17} />已记入情报台账</> : <><MapPin size={17} />{selected.length < 2 ? '选两处，记下疑点' : '记住疑点'}</>}
          </button>
        </footer>
      </motion.div>
    </motion.section>
  )
}
