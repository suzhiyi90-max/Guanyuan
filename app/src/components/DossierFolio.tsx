import { useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Archive, ArrowRight, BookOpen, Check, CircleDashed, Files, Link2, LockKeyhole, Printer, ScrollText, Stamp } from 'lucide-react'
import type { GameState } from '../game/useGame'
import type { DocMode, OfficialActionId } from '../types'
import { printSurface } from '../printSurface'
import { DocumentKindChain } from './DocumentKindChain'

type EntryId = 'document' | 'review' | 'evidence' | 'outcome'

interface Props {
  state: GameState
  onOpenDocument: (mode: DocMode) => void
  onOpenReview: () => void
  onOpenEvidence: () => void
  onOpenEpilogue: () => void
  onOpenBrief?: () => void
}

const actionNames: Record<OfficialActionId, string> = {
  endorse: '批驳', commissioner: '委员覆勘', files: '调卷传询', citation: '考语', impeach: '揭参', suppress: '压案',
}

const entryOrder: EntryId[] = ['document', 'review', 'evidence', 'outcome']

export function DossierFolio({ state, onOpenDocument, onOpenReview, onOpenEvidence, onOpenEpilogue, onOpenBrief }: Props) {
  const [selected, setSelected] = useState<EntryId>('document')
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const doneActions = state.officialActions.map(id => actionNames[id])
  const entries = [
    { id: 'document' as EntryId, index: '壹', type: '呈文', title: '东堤渗水呈文', ref: 'V-001 / V-002', status: '两版有改', meta: '河工书办呈 · 县署案卷', icon: ScrollText, available: true },
    { id: 'review' as EntryId, index: '贰', type: '批札 / 回文', title: '知府批与县署回文', ref: 'S-13 / 上宪来文', status: doneActions.length ? `回文 ${doneActions.length} 项` : '府札候答', meta: '委员覆勘 · 料价再核', icon: Stamp, available: true },
    { id: 'evidence' as EntryId, index: '叁', type: '并置附纸', title: '疑点与账证并置', ref: 'S-05 / 情报留痕', status: state.comparisons.length ? `${state.comparisons.length} 条在卷` : '尚未并置', meta: '只记所疑 · 不代定罪', icon: Link2, available: state.comparisons.length > 0 },
    { id: 'outcome' as EntryId, index: '肆', type: '题销 / 行状', title: '验收题销与考语', ref: 'S-10 / 章末文书', status: state.outcome ? `第${state.outcome.day}日 · ${state.outcome.grade}` : '未届题销', meta: '无验收不预写末端', icon: Files, available: Boolean(state.outcome) },
  ]
  const active = entries.find(entry => entry.id === selected) ?? entries[0]
  const ActiveIcon = active.icon
  const flow = [
    { id: 'document' as EntryId, label: '呈文', status: '已收件' },
    { id: 'review' as EntryId, label: '府札', status: doneActions.length ? '批答在卷' : '候回文' },
    { id: 'evidence' as EntryId, label: '附纸', status: state.comparisons.length ? `${state.comparisons.length} 条` : '留白' },
    { id: 'outcome' as EntryId, label: '题销', status: state.outcome ? state.outcome.grade : '未届' },
  ]

  const select = (id: EntryId) => setSelected(id)
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-entry-id]')
    if (!target) return
    event.preventDefault()
    const current = entryOrder.indexOf(selected)
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entryOrder.length - 1 : (current + (backward ? -1 : 1) + entryOrder.length) % entryOrder.length
    const id = entryOrder[next]
    select(id)
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`.dossier-registry [data-entry-id="${id}"]`)?.focus())
  }

  const openActive = () => {
    if (selected === 'document') onOpenDocument('original')
    else if (selected === 'review') onOpenReview()
    else if (selected === 'evidence' && active.available) onOpenEvidence()
    else if (selected === 'outcome' && active.available) onOpenEpilogue()
  }

  return (
    <div ref={rootRef} className="dossier-folio" onKeyDown={handleKeys} data-dossier-entry={selected}>
      <section className="dossier-cover" data-casefolder="true" aria-label="东堤河工卷宗封面">
        <div className="dossier-binding" aria-hidden="true"><i /><i /><b /></div>
        <div className="dossier-spine"><span>河工字</span><b>001</b></div>
        <div className="dossier-cover-body">
          <span className="eyebrow">永济县署 / 河工卷宗</span>
          <div className="dossier-title-slip"><h3>东堤<br />渗水案</h3></div>
          <p>呈文有版本 批答有来去<br />疑点有附纸 末端不预写</p>
          <span className="dossier-cover-note" aria-hidden="true">封面布面 · 待补专图（暂借素面）</span>
          <div className="dossier-cover-register">
            <span>在卷四类</span>
            <span className="dossier-cover-marks" aria-hidden="true">{entries.map(entry => <i key={entry.id} className={entry.available ? 'is-in' : ''}>{entry.index}</i>)}</span>
            <b>{1 + Number(doneActions.length > 0) + Number(state.comparisons.length > 0) + Number(Boolean(state.outcome))} / 4</b>
          </div>
          <span className="dossier-cover-seal">县署<br />存卷</span>
        </div>
        <footer><Archive size={14} /><span>只作归卷与回查 不新增文书事实</span></footer>
      </section>

      <div className="dossier-content">
        <nav className="dossier-flow" aria-label="文书流转链">
          {flow.map((item, index) => <button key={item.id} data-entry-id={item.id} className={selected === item.id ? 'selected' : ''} aria-pressed={selected === item.id} onClick={() => select(item.id)}>
            <span>{item.label}</span><i className={item.status === '留白' || item.status === '未届' ? 'is-empty' : ''}>{item.status === '留白' || item.status === '未届' ? <CircleDashed size={11} /> : <Check size={11} />}</i><small>{item.status}</small>{index < flow.length - 1 && <b aria-hidden="true" />}
          </button>)}
        </nav>

        <div className="dossier-workspace">
          <section className="dossier-registry" aria-label="卷宗目录">
            <header><span>卷内目录</span><span className="dossier-registry-tools"><small>方向键移签</small><button type="button" className="dossier-registry-print" onClick={() => printSurface('dossier-registry')} aria-label="印卷内目录" title="印目录"><Printer size={12} aria-hidden="true" />印目录</button></span></header>
            {entries.map(entry => <button key={entry.id} data-entry-id={entry.id} className={`${selected === entry.id ? 'selected' : ''} ${!entry.available ? 'is-empty' : ''}`} aria-pressed={selected === entry.id} onClick={() => select(entry.id)}>
              <span className="dossier-entry-index">{entry.index}</span>
              <div><small>{entry.type}</small><h4>{entry.title}</h4><p>{entry.ref}</p></div>
              <span className="dossier-entry-status">{entry.status}</span>
            </button>)}
          </section>

          <aside className="dossier-inspector" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section key={selected} initial={{ opacity: 0, x: reduceMotion ? 0 : 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                <header><span>{active.type} / {active.ref}</span><ActiveIcon size={18} /></header>
                <div className="dossier-inspector-title"><ActiveIcon size={23} /><div><small>{active.meta}</small><h3>{active.title}</h3></div></div>
                {selected === 'document' && <>
                  <p>初稿与定稿同时留存，版本差异不替代经手人的说明。回原件可继续批红，回对勘恢复原证据钉。</p>
                  <dl><div><dt>签发</dt><dd>河工书办</dd></div><div><dt>版本</dt><dd>V-001 初稿 / V-002 定稿</dd></div><div><dt>边界</dt><dd>不补写副本与未载持有人</dd></div></dl>
                </>}
                {selected === 'review' && <>
                  <p>府札与县署已行动作分开呈现。已入卷只表示原动作已经留痕，不预告覆勘、揭参或考语结果。</p>
                  {doneActions.length ? <div className="dossier-action-slips">{doneActions.map((name, index) => <span key={name}><Check size={11} />{String(index + 1).padStart(2, '0')} · {name} 已入卷</span>)}</div> : <div className="dossier-empty"><Stamp size={22} /><b>尚无县署回文</b><small>府札仍在卷，可回原上宪工作面查验六法。</small></div>}
                </>}
                {selected === 'evidence' && <>
                  <p>附纸只收集正式并置过的疑点，来源仍回案卷、账房或东堤，不把“有附纸”写成“已核实”。</p>
                  {state.comparisons.length ? <div className="dossier-comparison-list">{state.comparisons.slice(0, 3).map(item => <span key={item.id}><Link2 size={11} />{item.id} · {item.refs.join(' / ')}</span>)}</div> : <div className="dossier-empty"><Link2 size={22} /><b>附纸仍为空</b><small>先到呈文对勘或账房选两处，正式记疑后才会归卷。</small></div>}
                </>}
                {selected === 'outcome' && <>
                  <p>题销册是文书链末端。没有验收结果时保留空页，不用计划、投入或知府批语提前替代。</p>
                  {state.outcome ? <div className="dossier-outcome"><span>第{state.outcome.day}日 · 验收</span><b>{state.outcome.grade}</b><p>{state.outcome.symptom}</p></div> : <div className="dossier-empty"><BookOpen size={22} /><b>题销未届</b><small>到第十日验收后，仍回原 S-10 考语与行状。</small></div>}
                </>}
                <div className="dossier-inspector-actions">
                  <button className="primary-button" disabled={!active.available} onClick={openActive}>{selected === 'document' ? '回呈文批阅' : selected === 'review' ? '回上宪来文' : selected === 'evidence' ? '回证据并置' : '回考语行状'}<ArrowRight size={14} /></button>
                  {selected === 'document' && <button className="text-link" onClick={() => onOpenDocument('compare')}>直接回对勘 <ArrowRight size={12} /></button>}
                  {onOpenBrief && <button className="text-link" onClick={onOpenBrief}>据卷拟稿 · 详文/禀帖/揭 <ArrowRight size={12} /></button>}
                </div>
              </motion.section>
            </AnimatePresence>
            <footer><LockKeyhole size={12} /><span>目录只读原状态 · 回查不耗时 · 不写存档</span></footer>
          </aside>
        </div>
        <DocumentKindChain state={state} onOpenBrief={onOpenBrief} onOpenReview={onOpenReview} onOpenDocument={onOpenDocument} />
      </div>
    </div>
  )
}
