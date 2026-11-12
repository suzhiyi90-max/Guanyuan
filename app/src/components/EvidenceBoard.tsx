import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Check, ChevronDown, FileText, HelpCircle, Link2, LockKeyhole, Printer, ScrollText, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import { ledgerRows } from '../data'
import type { GameState } from '../game/useGame'
import type { ClueSource } from '../types'
import { printSurface } from '../printSurface'

interface Props {
  state: GameState
  onClose: () => void
  onOpenSource: (source: ClueSource, refs?: string[]) => void
  initialRef?: string | null
}

const chain = [
  { id: 'E-001', label: '库房账册', role: '记作运输损耗', tone: '账面' },
  { id: 'E-002', label: '主簿借领状', role: '记作垫付夫役工食', tone: '借领' },
  { id: 'E-003', label: '粮商旧欠票据', role: '记作上年料价尾欠', tone: '旧欠' },
]

const chainQuestions = [
  { needs: ['E-001', 'E-002'], text: '同一笔三百两 库账写损耗 借领状写垫付 哪一个名目是经手人亲笔？' },
  { needs: ['E-002', 'E-003'], text: '借领三百与旧欠三百数额相同 是同一笔的两次记法 还是两笔各三百？' },
  { needs: ['E-001', 'E-002', 'E-003'], text: '若垫付工食与偿还旧欠是一回事 损耗一栏就该划去 谁有权划这一笔？' },
  { needs: ['E-004'], text: '修造册上旧闸料数与今次拨料逐垛对核 虚松之垛从哪一年开始？' },
  { needs: ['E-004', 'E-008'], text: '修造册与委员勘报相合 则书办「毋庸拆验」不只是判断 是失察 谁担这个失察？' },
]

export function EvidenceBoard({ state, onClose, onOpenSource, initialRef = null }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [focusedSource, setFocusedSource] = useState<string | null>(initialRef)
  const [activeComparison, setActiveComparison] = useState<string | null>(null)
  const unlockedChain = chain.filter(item => state.unlocked.includes(item.id))
  const visibleQuestions = chainQuestions.filter(q => q.needs.every(id => state.unlocked.includes(id)))
  const activeSource = focusedSource ?? expanded
  const activeItem = chain.find(item => item.id === expanded)
  const activeRow = ledgerRows.find(row => row.id === expanded)
  const activeComparisonItem = state.comparisons.find(item => item.id === activeComparison)
  const documentComparisons = state.comparisons.filter(item => item.source === 'document')
  const ledgerComparisons = state.comparisons.filter(item => item.source === 'ledger')
  const relatedComparisons = activeSource ? state.comparisons.filter(item => item.refs.includes(activeSource)) : []
  const sourcePath = activeComparisonItem?.source ?? (relatedComparisons[0]?.source || (activeSource && chain.some(item => item.id === activeSource) ? 'ledger' : null))
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()

  const handleChainKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const available = chain.filter(item => state.unlocked.includes(item.id))
    if (available.length === 0) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-chain-id]')
    const current = Math.max(0, available.findIndex(item => item.id === target?.dataset.chainId))
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (current + (backward ? -1 : 1) + available.length) % available.length
    const id = available[next].id
    setFocusedSource(id)
    setActiveComparison(null)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-chain-id="${id}"] .chain-card`)?.focus())
  }

  return (
    <motion.section className="overlay-backdrop evidence-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="evidence-board" role="dialog" aria-modal="true" aria-labelledby="evidence-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 26, opacity: 0, rotate: reduceMotion ? 0 : .3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: reduceMotion ? 0 : 16, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 27 }} data-source-focus={activeSource ?? 'none'}>
        <header className="evidence-head">
          <div><span className="eyebrow">并置 / 只呈现矛盾 不公布真相</span><h2 id="evidence-title">同一笔三百两</h2></div>
          <div className="evidence-head-actions">
            <button className="icon-button" onClick={() => printSurface('evidence')} aria-label="印此证据链" title="印此页"><Printer size={18} /></button>
            <button className="icon-button" onClick={onClose} aria-label="收起并置"><X size={20} /></button>
          </div>
        </header>

        <div className="evidence-scroll">
          {initialRef && <p className="eyebrow" data-evidence-origin-ref={initialRef}>人物档案回查 · {initialRef} · {state.unlocked.includes(initialRef) ? '已取得' : '尚未解锁'}</p>}
          <div className="chain-strip" data-focus-id="evidence-chain" onKeyDown={handleChainKey} aria-label="证据钉，方向键移证">
            {chain.map((item, index) => {
              const unlocked = state.unlocked.includes(item.id)
              const row = ledgerRows.find(r => r.id === item.id)
              const isOpen = expanded === item.id
              const isLinked = activeSource === item.id || Boolean(activeComparisonItem?.refs.includes(item.id))
              return (
                <motion.div key={item.id} data-chain-id={item.id} className={`chain-node ${unlocked ? 'is-unlocked' : ''} ${isLinked ? 'is-source-linked' : ''}`} initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .18, delay: reduceMotion ? 0 : index * .07 }}>
                  <span className="chain-tone">{item.tone}</span>
                  <motion.button className={`chain-card ${isOpen ? 'is-open' : ''}`} disabled={!unlocked} aria-expanded={isOpen} aria-controls="chain-inspector" onClick={() => { setExpanded(isOpen ? null : item.id); setActiveComparison(null) }} onFocus={() => { setFocusedSource(item.id); setActiveComparison(null) }} onBlur={() => setFocusedSource(current => current === item.id ? null : current)} onMouseEnter={() => setFocusedSource(item.id)} onMouseLeave={() => setFocusedSource(current => current === item.id ? null : current)} whileTap={unlocked ? { scale: .985 } : undefined}>
                    <header><b>{item.label}</b><span>{item.id}</span><ChevronDown size={14} /></header>
                    <p>{unlocked ? item.role : row?.source ?? '尚未接触'}</p>
                    <footer>{unlocked ? <><Check size={12} />{isOpen ? '查验中' : '已取得 · 点开查验'}</> : <><LockKeyhole size={12} />未接触</>}</footer>
                  </motion.button>
                  <details className="chain-source-pin"><summary>来源钉 · 只读</summary><p>{unlocked ? row?.source ?? item.role : '尚未接触 · 不补写来源'}</p></details>
                  {index < chain.length - 1 && <div className={`chain-link ${state.unlocked.includes(chain[index + 1].id) && unlocked ? 'is-lit' : ''}`}><Link2 size={14} /></div>}
                </motion.div>
              )
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {activeItem && activeRow && state.unlocked.includes(activeItem.id) && <motion.section id="chain-inspector" className="chain-inspector" key={activeItem.id} initial={{ opacity: 0, height: 0, y: reduceMotion ? 0 : -6 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
              <header><div><span className="eyebrow">原证查验 / {activeItem.id}</span><h3>{activeItem.label}</h3></div><button className="icon-button" onClick={() => setExpanded(null)} aria-label="收起原证查验"><ChevronDown size={16} /></button></header>
              <p>{activeRow.text}</p>
              <footer><span>{activeRow.source} · {activeRow.amount}</span><button className="text-link" onClick={() => onOpenSource('ledger', [activeItem.id])}>带回账房并置<ArrowUpRight size={13} /></button></footer>
            </motion.section>}
          </AnimatePresence>

          <section className="source-correspondence" aria-label="案卷、情报与账房来源联动" data-source-path={sourcePath ?? 'none'}>
            <header><span>回文路径 / 同源高亮</span><small>只表示所据相同 不等于已经核实</small></header>
            <div className="source-correspondence-grid">
              <button className={sourcePath === 'document' ? 'is-linked' : ''} disabled={documentComparisons.length === 0} onClick={() => documentComparisons[0] && onOpenSource('document', documentComparisons[0].refs)}>
                <FileText size={15} /><span><b>案卷</b><small>{documentComparisons.length ? `${documentComparisons.length} 条疑点可回查` : '暂无已记案卷疑点'}</small></span><ArrowUpRight size={13} />
              </button>
              <div className={activeComparisonItem || relatedComparisons.length ? 'is-linked' : ''}>
                <Link2 size={15} /><span><b>情报</b><small>{state.comparisons.length ? `板内 ${state.comparisons.length} 条正式并置` : '台账尚无正式并置'}</small></span><i>{state.comparisons.length}</i>
              </div>
              <button className={sourcePath === 'ledger' ? 'is-linked' : ''} disabled={!activeSource && ledgerComparisons.length === 0} onClick={() => activeSource ? onOpenSource('ledger', [activeSource]) : ledgerComparisons[0] && onOpenSource('ledger', ledgerComparisons[0].refs)}>
                <ScrollText size={15} /><span><b>账房</b><small>{activeSource ? `${activeSource} 原账回查` : ledgerComparisons.length ? `${ledgerComparisons.length} 条疑点可回查` : '先选一件已取得原证'}</small></span><ArrowUpRight size={13} />
              </button>
            </div>
          </section>

          <section className="chain-questions">
            <h3><HelpCircle size={15} />并置之后 可以拿去问人的话</h3>
            {visibleQuestions.length === 0 ? <p className="chain-empty empty-slip" data-empty-slip="true">先把库房账册与借领状并置 问题才会长出来</p> : visibleQuestions.map((q, index) => (
              <motion.article key={q.text} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .18, delay: reduceMotion ? 0 : .08 + index * .05 }}>
                <span>问 {String(index + 1).padStart(2, '0')}</span><p>{q.text}</p>
                <button className="text-link" aria-label={`回查问题 ${index + 1} 所据账证`} onClick={() => onOpenSource('ledger', q.needs.filter(id => ledgerRows.some(row => row.id === id)))}>查所据<ArrowUpRight size={13} /></button>
              </motion.article>
            ))}
            <small className="chain-note">已解锁 {unlockedChain.length} / 3 件 · 未解锁的票据仍可去问粮商或赴宴取得</small>
          </section>

          <section className="comparison-list">
            <h3><ScrollText size={15} />你正式并置过的疑点 <b>{state.comparisons.length}</b></h3>
            {state.comparisons.length === 0 ? <p className="chain-empty empty-slip" data-empty-slip="true">到呈文「对勘」或账房选两处 疑点会在这里留下可追问的形式</p> : state.comparisons.map((item, index) => {
              const isLinked = activeComparison === item.id || Boolean(activeSource && item.refs.includes(activeSource))
              return (
                <motion.article key={item.id} className={`comparison-card ${isLinked ? 'is-source-linked' : ''}`} data-comparison-id={item.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .18, delay: reduceMotion ? 0 : index * .045 }} onMouseEnter={() => { setActiveComparison(item.id); setFocusedSource(null) }} onMouseLeave={() => setActiveComparison(current => current === item.id ? null : current)} onFocusCapture={() => { setActiveComparison(item.id); setFocusedSource(null) }} onBlurCapture={() => setActiveComparison(current => current === item.id ? null : current)}>
                  <header><span>{item.id} · 第{item.day}日 · {item.source === 'document' ? '案卷' : item.source === 'ledger' ? '账房' : '东堤'} / 情报留痕</span><button className="text-link" onClick={() => onOpenSource(item.source, item.refs)}>{item.source === 'document' ? <FileText size={13} /> : <Link2 size={13} />}{item.source === 'document' ? '回呈文对勘' : item.source === 'ledger' ? '回账房并置' : '回东堤记录'}<ArrowUpRight size={13} /></button></header>
                  <div className="comparison-refs">{item.refs.map(ref => <i key={ref} className={activeSource === ref ? 'is-linked' : ''}>{ref}</i>)}</div><p>{item.question}</p>
                </motion.article>
              )
            })}
          </section>
        </div>

        <footer className="evidence-foot"><span>并置不等于定罪 每一件都要回到经手人</span><button className="primary-button" onClick={onClose}>记下 回到案头</button></footer>
      </motion.div>
    </motion.section>
  )
}
