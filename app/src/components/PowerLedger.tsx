import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, CircleDashed, EyeOff, FileWarning, Fingerprint, Link2, LockKeyhole, ScrollText, Stamp, X } from 'lucide-react'
import type { GameState } from '../game/useGame'
import {
  dockOf, echoesOf, entitlementsOf, impressionsOf, overreachOf, powerContexts, stateLabel, verbCounts, verbTrunk,
  type CommissionDraft, type EchoFocus, type PowerContext, type PowerHandler, type PowerHandlers, type Tier,
} from '../power'
import { useOverlayDialog } from './useOverlayDialog'
import { RuleChip } from './RuleBook'

const tierMeta: Record<Tier, { question: string; hint: string }> = {
  能: { question: '做得到吗', hint: '人 · 物 · 程序' },
  可: { question: '许不许做', hint: '身份 · 场合 · 上级' },
  该: { question: '该不该做', hint: '名分 · 舆论 · 责任' },
}

const echoTabs: Array<{ id: EchoFocus; label: string }> = [
  { id: 'clue', label: '疑点' },
  { id: 'gift', label: '礼簿' },
  { id: 'plan', label: '抢护' },
  { id: 'outcome', label: '验收' },
]

const spring = { type: 'spring' as const, stiffness: 400, damping: 34 }

function handlerOf(handlers: PowerHandlers | undefined, key: PowerHandler | undefined) {
  if (!handlers || !key) return undefined
  return handlers[key]
}

export function EntitlementSheet({ state, context, variant = 'columns', draft, compact = false }: { state: GameState; context: PowerContext; variant?: 'columns' | 'strip'; draft?: CommissionDraft; compact?: boolean }) {
  const bundle = entitlementsOf(state, context, draft)
  const tiers: Tier[] = ['能', '可', '该']

  if (variant === 'strip') {
    return (
      <section className="pw-entitle is-strip" aria-label="能 可 该 三层查验">
        <header>
          <span className="pw-identity"><Fingerprint size={13} />{bundle.identity}</span>
          <small>{bundle.place}</small>
        </header>
        <div className="pw-strip-rows">
          {tiers.map(tier => {
            const row = bundle.rows.find(item => item.tier === tier)!
            return (
              <div className="pw-strip-row" data-state={row.state} data-tier={tier} key={tier}>
                <span className="pw-tier-seal">{tier}</span>
                <div><b>{row.label}</b><small>{row.detail}</small></div>
                <i>{stateLabel[row.state]}</i>
              </div>
            )
          })}
        </div>
        <footer>{bundle.note}</footer>
      </section>
    )
  }

  return (
    <section className={`pw-entitle ${compact ? 'is-compact' : ''}`} aria-label="能 可 该 三层查验">
      <header className="pw-entitle-head">
        <div>
          <span className="eyebrow">能 / 可 / 该 · 三层纸面</span>
          <h3>{bundle.identity}</h3>
        </div>
        <div className="pw-seat-chip"><span>{bundle.seat}</span><small>{bundle.place}</small></div>
      </header>
      <div className="pw-tiers">
        {tiers.map(tier => (
          <article className="pw-tier" data-tier={tier} key={tier}>
            <header>
              <span className="pw-tier-seal">{tier}</span>
              <div><b>{tierMeta[tier].question}</b><small>{tierMeta[tier].hint}</small></div>
            </header>
            {bundle.rows.filter(item => item.tier === tier).map(row => (
              <div className="pw-row" data-state={row.state} key={row.label}>
                <div className="pw-row-top"><b>{row.label}</b><i>{stateLabel[row.state]}</i></div>
                <p>{row.detail}</p>
                <small>{row.source}</small>
              </div>
            ))}
          </article>
        ))}
      </div>
      <footer className="pw-entitle-foot">{bundle.note}</footer>
    </section>
  )
}

export function ProhibitionList({ state, context, handlers }: { state: GameState; context: PowerContext; handlers?: PowerHandlers }) {
  const bundle = entitlementsOf(state, context)
  return (
    <section className="pw-prohibitions" aria-label="禁为权与替代路径">
      <header><span className="eyebrow">禁为权 · 有能力也不能做</span><small>每条都给替代路径</small></header>
      {bundle.prohibitions.map(item => {
        const run = handlerOf(handlers, item.handler)
        return (
          <div className="pw-prohibition" key={item.label}>
            <span className="pw-ban">禁</span>
            <div><b>{item.label}</b><small>替代 · {item.alternative}</small></div>
            {run && <button onClick={run} aria-label={`去${item.alternative}`} title={item.alternative}><ArrowUpRight size={13} /></button>}
          </div>
        )
      })}
    </section>
  )
}

export function InteractionDock({ context, handlers, variant = 'full', limit }: { context: PowerContext; handlers?: PowerHandlers; variant?: 'full' | 'brief'; limit?: number }) {
  const all = dockOf(context)
  const actions = limit ? all.slice(0, limit) : all
  const counts = verbCounts(all)
  const reduceMotion = useReducedMotion()

  return (
    <section className={`pw-dock is-${variant}`} aria-label="上下文互动坞">
      <header className="pw-dock-head">
        <div><span className="eyebrow">此刻可做 · 对话与文书都有落点</span><h3>八动词仍是主干，落地只三五件</h3></div>
        <span className="pw-dock-count">{all.length} 件 · 原入口</span>
      </header>
      <div className="pw-verbs" aria-label="八动词主干">
        {verbTrunk.map(verb => (
          <span className={counts[verb] ? 'is-on' : ''} key={verb} aria-label={`${verb} ${counts[verb]} 件`}>
            <b>{verb}</b><i>{counts[verb] || '·'}</i>
          </span>
        ))}
      </div>
      <div className="pw-actions">
        {actions.map((action, index) => {
          const run = handlerOf(handlers, action.handler)
          const alternative = handlerOf(handlers, action.blocked?.handler)
          return (
            <motion.div
              className={`pw-action ${action.blocked ? 'is-blocked' : ''} ${action.risk ? 'is-risk' : ''}`}
              key={action.key}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduceMotion ? 0 : .2, delay: reduceMotion ? 0 : index * .04 }}
            >
              <span className="pw-verb">{action.verb}</span>
              <div className="pw-action-body">
                <b>{action.object}</b>
                <p className="pw-action-identity">{action.identity}</p>
                {action.blocked ? <>
                  <p className="pw-action-block"><FileWarning size={12} />{action.blocked.reason}</p>
                  <button className="pw-alt" onClick={alternative} disabled={!alternative}>
                    替代 · {action.blocked.alternative}<ArrowRight size={12} />
                  </button>
                </> : <>
                  <p className={`pw-action-trace ${action.trace ? '' : 'is-blank'}`}>
                    {action.trace ? <><Stamp size={11} />留痕 · {action.trace}</> : <><CircleDashed size={11} />留痕 · 未详（无来源字段）</>}
                  </p>
                  <button className="pw-entry" onClick={run} disabled={!run}>
                    {action.entry}<ArrowRight size={12} />
                  </button>
                </>}
              </div>
            </motion.div>
          )
        })}
      </div>
      <footer className="pw-dock-foot"><LockKeyhole size={12} /><span>只作原入口索引 · 不代执行耗时动作 · 不写存档</span></footer>
    </section>
  )
}

function DockBrief({ context, handlers, onOpen }: { context: PowerContext; handlers?: PowerHandlers; onOpen: () => void }) {
  const actions = dockOf(context).slice(0, 3)
  return (
    <section className="pw-brief" aria-label="此刻可做">
      <header><span>此刻可做</span><small>对象 · 身份 · 留痕</small></header>
      {actions.map(action => {
        const run = handlerOf(handlers, action.handler)
        return (
          <button key={action.key} className={`pw-brief-row ${action.blocked ? 'is-blocked' : ''}`} onClick={action.blocked ? onOpen : run} disabled={!action.blocked && !run}>
            <span className="pw-verb">{action.verb}</span>
            <div><b>{action.object}</b><small>{action.blocked ? `受阻 · ${action.blocked.reason}` : `${action.identity} · ${action.trace ? `留痕 ${action.trace}` : '留痕未详'}`}</small></div>
            <ArrowRight size={12} />
          </button>
        )
      })}
      <button className="pw-brief-open" onClick={onOpen}>展开权界纸 · 能 / 可 / 该<ArrowUpRight size={12} /></button>
    </section>
  )
}

export function PowerBrief({ state, context, handlers, onOpen }: { state: GameState; context: PowerContext; handlers?: PowerHandlers; onOpen: () => void }) {
  const bundle = entitlementsOf(state, context)
  const pick = (tier: Tier) => bundle.rows.find(item => item.tier === tier)!
  return (
    <section className="pw-aside" aria-label="权界摘要">
      <div className="pw-aside-head">
        <div><span className="eyebrow">权界 / 只投影既有身份</span><b>{bundle.identity}</b></div>
        <span className="pw-aside-seat">{bundle.seat}</span>
      </div>
      <div className="rb-inline-row is-tight"><span>界面 · 投影 / 非规则</span><RuleChip clause="power-tier" compact label="依 6.7.1" /></div>
      <div className="pw-aside-tiers">
        {(['能', '可', '该'] as Tier[]).map(tier => {
          const row = pick(tier)
          return <div className="pw-aside-row" data-state={row.state} data-tier={tier} key={tier}>
            <span className="pw-tier-seal">{tier}</span>
            <div><b>{row.label}</b><small>{row.detail}</small></div>
          </div>
        })}
      </div>
      <DockBrief context={context} handlers={handlers} onOpen={onOpen} />
    </section>
  )
}

export function RiskStrip({ verdict, title, detail, marks }: { verdict: string; title: string; detail: string; marks?: string[] }) {
  return (
    <div className="pw-risk-strip" aria-label="越权留痕预览">
      <i className="pw-risk-seam" aria-hidden="true">骑缝</i>
      <div>
        <b>{title}</b>
        <span>{detail}</span>
        {marks && marks.length > 0 && <div className="pw-risk-marks">{marks.map(mark => <i key={mark}>{mark}</i>)}</div>}
      </div>
      <em>{verdict}</em>
    </div>
  )
}

export function OverreachPreview({ verdict, title, object, marks, trace, basis, note }: { verdict: string; title: string; object: string; marks: string[]; trace: string[]; basis: string; note?: string }) {
  return (
    <article className="pw-overreach is-preview">
      <i className="pw-seam" aria-hidden="true"><span>骑缝</span></i>
      <header><span className="pw-verdict">{verdict}</span><b>{title}</b><small>{object}</small></header>
      <div className="pw-marks">{marks.map(mark => <span key={mark}>{mark}</span>)}</div>
      <ol className="pw-trace-flow">{trace.map((line, step) => <li key={line}><i>{String(step + 1).padStart(2, '0')}</i><p>{line}</p></li>)}</ol>
      <footer><span>{basis}</span></footer>
      {note && <p className="pw-preview-note">{note}</p>}
    </article>
  )
}

export function OverreachList({ state, handlers, variant = 'full' }: { state: GameState; handlers?: PowerHandlers; variant?: 'full' | 'compact' }) {
  const cases = overreachOf(state)
  if (!cases.length) {
    return (
      <section className={`pw-overreach-block is-${variant}`}>
        <header className="pw-block-head"><div><span className="eyebrow">越权留痕 · 可能越权、会留下痕迹</span><h3>本局尚无越权留痕</h3></div></header>
        <div className="pw-overreach-empty"><ScrollText size={20} /><p>压案、揭参与无会勘签押一旦发生，会在这里出现。<br /><span>越权长尾仍属 M2；本页只列本局已经发生的边界。</span></p></div>
      </section>
    )
  }
  return (
    <section className={`pw-overreach-block is-${variant}`}>
      <header className="pw-block-head">
        <div><span className="eyebrow">越权留痕 · 可能越权、会留下痕迹</span><h3>{cases.length} 处边界已经落纸</h3></div>
        <small>不改原确认流程</small>
      </header>
      <div className="pw-overreach-grid">
        {cases.map((item, index) => {
          const run = handlerOf(handlers, item.handler)
          return (
            <motion.article
              className="pw-overreach"
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .2, delay: index * .05 }}
            >
              <i className="pw-seam" aria-hidden="true"><span>骑缝</span></i>
              <header><span className="pw-verdict">{item.verdict}</span><b>{item.title}</b><small>{item.object}</small></header>
              <div className="pw-marks">{item.marks.map(mark => <span key={mark}>{mark}</span>)}</div>
              <ol className="pw-trace-flow">{item.trace.map((line, step) => <li key={line}><i>{String(step + 1).padStart(2, '0')}</i><p>{line}</p></li>)}</ol>
              <footer>
                <span>{item.basis}</span>
                {run && <button className="pw-entry" onClick={run}>回原处<ArrowRight size={12} /></button>}
              </footer>
            </motion.article>
          )
        })}
      </div>
    </section>
  )
}

export function AudienceEchoPanel({ state, focus, variant = 'columns', onFocusChange }: { state: GameState; focus: EchoFocus; variant?: 'columns' | 'stack'; onFocusChange?: (focus: EchoFocus) => void }) {
  const echo = echoesOf(state, focus)
  const reduceMotion = useReducedMotion()
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onFocusChange || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const current = echoTabs.findIndex(item => item.id === focus)
    const backward = event.key === 'ArrowLeft'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? echoTabs.length - 1 : (current + (backward ? -1 : 1) + echoTabs.length) % echoTabs.length
    event.preventDefault()
    onFocusChange(echoTabs[next].id)
    requestAnimationFrame(() => document.getElementById(`pw-echo-tab-${echoTabs[next].id}`)?.focus())
  }

  return (
    <section className={`pw-echo is-${variant}`} aria-label="四类受众回声">
      <header className="pw-block-head">
        <div><span className="eyebrow">四类受众 · 同一件事，各自听见什么</span><h3>{echo.title}</h3></div>
        <span className="pw-echo-event">{echo.event}</span>
      </header>
      {onFocusChange && <div className="pw-echo-tabs" role="tablist" aria-label="选择要回声的事件" onKeyDown={handleKeys}>
        {echoTabs.map(item => <button key={item.id} id={`pw-echo-tab-${item.id}`} role="tab" aria-selected={focus === item.id} tabIndex={focus === item.id ? 0 : -1} onClick={() => onFocusChange(item.id)}>
          {focus === item.id && <motion.span className="pw-echo-ink" layoutId="pw-echo-ink" transition={reduceMotion ? { duration: 0 } : spring} aria-hidden="true" />}
          <span>{item.label}</span>
        </button>)}
      </div>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="pw-echo-grid"
          key={focus}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }}
          transition={{ duration: reduceMotion ? 0 : .18 }}
        >
          {echo.rows.map(row => (
            <article className={`pw-audience ${row.basis ? '' : 'is-blank'}`} data-stance={row.stance} key={row.id} aria-label={`${row.name}受众`}>
              <header><b>{row.name}</b><small>{row.scope}</small><span className="pw-stance">{row.stance}</span></header>
              <p>{row.known}</p>
              <div className="pw-audience-action"><span>可能怎样</span><b>{row.action}</b></div>
              <footer>{row.basis ? <><Link2 size={11} />{row.basis}</> : <><EyeOff size={11} />未详 · 不推断群体态度</>}</footer>
            </article>
          ))}
        </motion.div>
      </AnimatePresence>
      <footer className="pw-echo-note">{echo.note}<span>不显示世界影响力条 · 只按具体受众与来源</span></footer>
    </section>
  )
}

export function ImpressionSlips({ state, variant = 'full' }: { state: GameState; variant?: 'full' | 'compact' }) {
  const list = impressionsOf(state)
  return (
    <section className={`pw-impressions is-${variant}`} aria-label="四种印象">
      <header className="pw-block-head">
        <div><span className="eyebrow">四种印象 · 分开看，不折算</span><h3>同一个人，可以很有名望却无人敢共事</h3></div>
        <small>不合并为单一数值</small>
      </header>
      <div className="pw-impression-grid">
        {list.map(item => (
          <article className="pw-impression" key={item.id} data-kind={item.id}>
            <header>
              <span className="pw-impression-seal">{item.name.slice(0, 1)}</span>
              <div><b>{item.name}</b><small>{item.question}</small></div>
            </header>
            <div className="pw-tags">
              {item.tags.length
                ? item.tags.map(tag => <span className="pw-tag" key={tag.label}><b>{tag.label}</b><i>{tag.basis}</i></span>)
                : <span className="pw-tag is-blank"><b>未详</b><i>尚无可回到的来源</i></span>}
            </div>
          </article>
        ))}
      </div>
      <footer className="pw-impressions-foot"><LockKeyhole size={12} /><span>每条标签都能回到原事件、文书或受众 · 不提供可刷的数值</span></footer>
    </section>
  )
}

export function PowerFolio({ state, onClose, handlers }: { state: GameState; onClose: () => void; handlers?: PowerHandlers }) {
  const [context, setContext] = useState<PowerContext>('seat')
  const [focus, setFocus] = useState<EchoFocus>('clue')
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const bundle = entitlementsOf(state, context)

  const handleContextKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = powerContexts.findIndex(item => item.id === context)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % powerContexts.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + powerContexts.length) % powerContexts.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = powerContexts.length - 1
    else return
    event.preventDefault()
    const nextContext = powerContexts[next].id
    setContext(nextContext)
    document.getElementById(`pw-seat-${nextContext}`)?.focus()
  }

  return (
    <motion.section className="overlay-backdrop pw-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="pw-folio" data-focus-id="power-folio" role="dialog" aria-modal="true" aria-labelledby="pw-folio-title" tabIndex={-1} data-seat={context} initial={{ y: reduceMotion ? 0 : 22, opacity: 0, scale: reduceMotion ? 1 : .99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: reduceMotion ? 0 : 14, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 28 }}>
        <header className="pw-folio-head">
          <div>
            <span className="eyebrow" id="pw-folio-title">S-21 / 权界纸 · 只组织既有状态</span>
            <h2>权与名，都有边界。</h2>
            <p>能、可、该分开看；谁知道了什么，也分开记。</p>
          </div>
          <div className="pw-folio-head-right">
            <span className="pw-folio-seal">权</span>
            <button className="icon-button" onClick={onClose} aria-label="收起权界纸"><X size={20} /></button>
          </div>
        </header>

        <div className="pw-folio-body">
          <section className="pw-seat-band" aria-label="选择场合">
            <div className="pw-seat-now">
              <span className="eyebrow">有效身份 = 人物 × 职位 × 场合</span>
              <b>{bundle.identity}</b>
              <small>{bundle.place} · {bundle.seat}</small>
            </div>
            <div className="pw-seat-tabs" role="tablist" aria-label="切换场合" onKeyDown={handleContextKeys}>
              {powerContexts.map(item => <button key={item.id} id={`pw-seat-${item.id}`} role="tab" aria-selected={context === item.id} aria-controls="pw-entitle-panel" tabIndex={context === item.id ? 0 : -1} onClick={() => setContext(item.id)}>
                {context === item.id && <motion.span className="pw-seat-ink" layoutId="pw-seat-ink" transition={reduceMotion ? { duration: 0 } : spring} aria-hidden="true" />}
                <span>{item.label}</span><small>{item.place}</small>
              </button>)}
            </div>
          </section>

          <div className="pw-folio-grid" id="pw-entitle-panel" role="tabpanel" aria-labelledby={`pw-seat-${context}`}>
            <div className="pw-folio-main">
              <EntitlementSheet state={state} context={context} />
              <ProhibitionList state={state} context={context} handlers={handlers} />
            </div>
            <div className="pw-folio-side">
              <InteractionDock context={context} handlers={handlers} />
            </div>
          </div>

          <OverreachList state={state} handlers={handlers} />

          <AudienceEchoPanel state={state} focus={focus} onFocusChange={setFocus} />

          <ImpressionSlips state={state} />
        </div>

        <footer className="pw-folio-foot">
          <span><LockKeyhole size={13} />界面 · 投影 / 只读，不新增影响力数值 · 回查不耗时 · 不写存档 <RuleChip clause="power-tier" compact label="查则例" /></span>
          <span className="pw-folio-legend"><i className="is-ready" />已备<i className="is-pending" />待补<i className="is-risk" />有险</span>
          <button className="primary-button" onClick={onClose}>收起纸页<ArrowRight size={15} /></button>
        </footer>
      </motion.div>
    </motion.section>
  )
}
