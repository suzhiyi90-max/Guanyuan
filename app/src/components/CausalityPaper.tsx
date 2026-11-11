import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, FileWarning, Link2, ScrollText, Stamp, X } from 'lucide-react'
import type { GameState } from '../game/useGame'
import type { PowerHandler } from '../power'
import { useOverlayDialog } from './useOverlayDialog'
import { RuleChip } from './RuleBook'

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const actionNames: Record<string, string> = {
  endorse: '批驳', commissioner: '委员覆勘', files: '调卷传询', citation: '考语', impeach: '揭参', suppress: '压案',
}

interface CausalGroup {
  id: string
  label: string
  tone: 'plus' | 'minus' | 'mixed'
  items: Array<{ text: string; tone: 'plus' | 'minus' }>
  source: { label: string; handler?: PowerHandler }
}

/** 只把已发生的结算因素按原 label 归组，不重算、不补写。 */
export function causalGroupsOf(state: GameState): CausalGroup[] {
  const factors = state.outcome?.factors ?? []
  const order: Array<{ id: string; label: string; source: CausalGroup['source'] }> = [
    { id: 'invest', label: '投入', source: { label: '委牌 · 主办与夫役', handler: 'plan' } },
    { id: 'resource', label: '资源', source: { label: '料账 · 拨料与复秤', handler: 'ledger' } },
    { id: 'resistance', label: '阻力', source: { label: '批答 · 覆勘与旧欠', handler: 'review' } },
  ]
  return order.map(group => {
    const items = factors.filter(item => item.label === group.label).map(item => ({ text: item.detail, tone: item.tone }))
    const tone: CausalGroup['tone'] = items.every(item => item.tone === 'plus') ? 'plus' : items.every(item => item.tone === 'minus') ? 'minus' : 'mixed'
    return { id: group.id, label: group.label, tone, items, source: group.source }
  }).filter(group => group.items.length > 0)
}

interface EvidenceRow {
  id: string
  label: string
  value: string
  has: boolean
  handler?: PowerHandler
}

export function causalEvidenceOf(state: GameState): EvidenceRow[] {
  const done = state.officialActions
  return [
    {
      id: 'warrant', label: '委牌', has: Boolean(state.plan),
      value: state.plan ? `${state.plan.leaderName}主办 · 料 ${state.plan.material} 垛 · 夫 ${state.plan.labor} 人 · ${state.plan.supervisor}` : '未签押，无委牌可查',
      handler: 'plan',
    },
    {
      id: 'material', label: '料账', has: state.material.arrived + state.material.transit + state.material.unsent > 0,
      value: `到场 ${state.material.arrived} / 在途 ${state.material.transit} / 未发 ${state.material.unsent}`,
      handler: 'ledger',
    },
    {
      id: 'reply', label: '批答', has: done.length > 0,
      value: done.length ? done.map(id => actionNames[id] ?? id).join(' · ') : '府札候答，尚无县署回文',
      handler: 'review',
    },
    {
      id: 'debt', label: '旧欠', has: state.unlocked.includes('E-003'),
      value: state.unlocked.includes('E-003') ? '粮商旧欠票据已在手，同一笔可核' : '旧欠未清，最后十垛仍扣作保',
      handler: 'evidence',
    },
    {
      id: 'clock', label: '日程', has: Boolean(state.outcome),
      value: state.outcome ? `第${dayNames[state.outcome.day - 1]}日验收 · 暴雨第 8 日 · 洪峰第 9 日` : '验收未届，世界时钟仍按十日推进',
      handler: 'scene:river',
    },
  ]
}

/** C-49 因果纸：五因归组、据与回查；只读既有结算，不预告另一条路。 */
export function CausalitySheet({ state, onClose, onOpen }: { state: GameState; onClose: () => void; onOpen?: (handler: PowerHandler) => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const outcome = state.outcome
  const groups = causalGroupsOf(state)
  const evidence = causalEvidenceOf(state)
  const open = (handler?: PowerHandler) => { if (handler && onOpen) onOpen(handler) }

  return (
    <motion.section className="overlay-backdrop causal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="causal-folio" role="dialog" aria-modal="true" aria-labelledby="causal-title" tabIndex={-1} initial={{ y: reduceMotion ? 0 : 20, opacity: 0, scale: reduceMotion ? 1 : .99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: reduceMotion ? 0 : 12, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 235, damping: 28 }}>
        <header className="causal-head">
          <div>
            <span className="eyebrow" id="causal-title">S-22 / 因果纸 · 只读已发生的结算</span>
            <h2>结果不是一句话。</h2>
            <p>得与失各自有据；只呈现已经发生的因素，不预告另一条路。</p>
          </div>
          <div className="causal-head-right">
            <RuleChip clause="ledger-cause" label="依 10.5" />
            <button className="icon-button" onClick={onClose} aria-label="收起因果纸"><X size={20} /></button>
          </div>
        </header>

        <div className="causal-body">
          <section className={`causal-verdict ${outcome ? `grade-${outcome.grade}` : 'is-pending'}`} aria-label="结果">
            <span className="eyebrow">果 / 验收</span>
            {outcome ? <>
              <b className="causal-grade">{outcome.grade}</b>
              <small>第{dayNames[outcome.day - 1]}日 · 题销</small>
              <p>{outcome.symptom}</p>
            </> : <>
              <b className="causal-grade is-empty">未届</b>
              <small>验收未届</small>
              <p>题销册仍是空页。此处不预写结果，也不替世界先作判断。</p>
            </>}
            <i className="causal-seal" aria-hidden="true">据</i>
          </section>

          <section className="causal-reasons" aria-label="得失诸因">
            <header><div><span className="eyebrow">因 / 得失</span><h3>哪几件事把它推到这一步</h3></div><span>{groups.reduce((sum, group) => sum + group.items.length, 0)} 条</span></header>
            {groups.length ? groups.map(group => (
              <article className="causal-group" data-tone={group.tone} key={group.id}>
                <header>
                  <span className="causal-group-label">{group.label}</span>
                  <small>{group.items.filter(item => item.tone === 'plus').length} 得 · {group.items.filter(item => item.tone === 'minus').length} 失</small>
                  <button className="causal-source" onClick={() => open(group.source.handler)} disabled={!group.source.handler}>{group.source.label}<ArrowUpRight size={11} /></button>
                </header>
                {group.items.map(item => (
                  <p className="causal-item" data-tone={item.tone} key={item.text}><i>{item.tone === 'plus' ? '得' : '失'}</i>{item.text}</p>
                ))}
              </article>
            )) : <div className="causal-empty"><ScrollText size={20} /><p>验收未届，尚无得失可拆。<br /><span>发起抢护并在第 10 日题销后，这里才会落字。</span></p></div>}
          </section>

          <aside className="causal-evidence" aria-label="据与回查">
            <header><span className="eyebrow">据 / 回查</span><h3>这些结论回到哪一处</h3></header>
            {evidence.map(row => (
              <div className={`causal-evidence-row ${row.has ? '' : 'is-empty'}`} key={row.id}>
                <header><b>{row.label}</b><i>{row.has ? '有据' : '留白'}</i></header>
                <p>{row.value}</p>
                {row.handler && <button onClick={() => open(row.handler)} disabled={!row.has && row.id !== 'clock'}>回原处<ArrowRight size={11} /></button>}
              </div>
            ))}
            <footer><Link2 size={11} /><span>只回既有委牌、账房、上宪、证据与东堤，不改结算</span></footer>
          </aside>
        </div>

        <footer className="causal-foot">
          <span><FileWarning size={12} />不预告另一条路 · 不重算分数 · 不写存档</span>
          <button className="primary-button" onClick={onClose}>收起因果纸<ArrowRight size={15} /></button>
        </footer>
      </motion.div>
    </motion.section>
  )
}

/** S-01 案头的验收小条：只在已验收时出现，带一张既有现场图。 */
export function OutcomeSlip({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const outcome = state.outcome
  if (!outcome) return null
  return (
    <section className={`outcome-slip grade-${outcome.grade}`} aria-label="验收已下">
      <div className="outcome-slip-art">
        <img src="/assets/east-dike-work.jpg" alt="东堤抢护现场" />
        <span>第{dayNames[outcome.day - 1]}日 · 题销</span>
      </div>
      <div className="outcome-slip-body">
        <div className="outcome-slip-head"><Stamp size={12} /><span>验收已下</span><b>{outcome.grade}</b></div>
        <p>{outcome.symptom}</p>
        <button className="outcome-slip-link" onClick={onOpen}>展开因果纸<ArrowUpRight size={12} /></button>
      </div>
    </section>
  )
}
