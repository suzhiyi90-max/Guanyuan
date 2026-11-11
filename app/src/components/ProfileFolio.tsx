import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, LockKeyhole, X } from 'lucide-react'
import { goals } from '../data'
import type { GameState } from '../game/useGame'
import { dockOf, entitlementsOf, impressionsOf, powerContexts, stateLabel, verbCounts, verbTrunk, type Tier } from '../power'
import { decencyFactsOf } from './DecencyLine'
import { useOverlayDialog } from './useOverlayDialog'
import { SurfaceColophon } from './SurfaceColophon'
import { handleFolioReturnKey } from '../folioReturn'

/**
 * S-25 自我 · 履历（FE-146 / C-154·155·156）：只读投影，不新增数值。
 * 属性来源白名单（18 6.18.1 / 17 红线 25）：state.day/goalId/plan/outcome/privateFunds/
 * material/giftEntries/officialActions/clues/comparisons/asked/unlocked/handledEvents
 * + entitlementsOf/verbCounts/impressionsOf/powerContexts/goals；白名单外不投影。
 * 印只作装帧、只盖已发生；回源签只换表面与焦点，不推进时段、不写存档。
 */

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const anchors = [
  { id: 'identity', label: '身份' },
  { id: 'power', label: '权' },
  { id: 'wealth', label: '财' },
  { id: 'repute', label: '望' },
  { id: 'accum', label: '积累' },
] as const

// 与权界纸同源（6.7.1 三层问句），只作投影标签。
const tierQuestions: Record<Tier, { question: string; hint: string }> = {
  能: { question: '做得到吗', hint: '人 · 物 · 程序' },
  可: { question: '许不许做', hint: '身份 · 场合 · 上级' },
  该: { question: '该不该做', hint: '名分 · 舆论 · 责任' },
}

export interface ProfileFolioProps {
  state: GameState
  onClose: () => void
  onOpenPower?: () => void
  onOpenLedger?: () => void
  onOpenGift?: () => void
  onOpenCitation?: () => void
  onOpenEpilogue?: () => void
  onOpenIntel?: () => void
  onOpenPeople?: () => void
  onOpenAffairs?: () => void
}

function dockFirst(node: HTMLElement | null, selector: string) {
  if (!node) return
  Array.from(node.querySelectorAll<HTMLElement>(selector)).forEach((el, index) => { el.tabIndex = index === 0 ? 0 : -1 })
}

function roveFocus(container: HTMLElement | null, selector: string, event: KeyboardEvent) {
  const items = Array.from(container?.querySelectorAll<HTMLElement>(selector) ?? [])
  if (items.length < 2) return
  const index = items.indexOf(event.target as HTMLElement)
  if (index < 0) return
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length
  items[next].focus()
}

export function ProfileFolio({ state, onClose, onOpenPower, onOpenLedger, onOpenGift, onOpenCitation, onOpenEpilogue, onOpenIntel, onOpenPeople, onOpenAffairs }: ProfileFolioProps) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const [activeAnchor, setActiveAnchor] = useState<string>('identity')
  // PS-29 官身小像：独立 img + 本地降级态（同 ScenePlate 纪律，不占 scenePlates）；缺图素框 + 小注，不代码画人像。
  const [portrait, setPortrait] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    let cancelled = false
    const probe = new Image()
    probe.onload = () => { if (!cancelled) setPortrait('ready') }
    probe.onerror = () => { if (!cancelled) setPortrait('failed') }
    probe.src = '/assets/magistrate-portrait.png'
    return () => { cancelled = true }
  }, [])

  const anchorRef = useRef<HTMLDivElement | null>(null)
  const dockAnchors = (node: HTMLDivElement | null) => { anchorRef.current = node; dockFirst(node, 'button') }
  const accumRef = useRef<HTMLDivElement | null>(null)
  const dockAccum = (node: HTMLDivElement | null) => { accumRef.current = node; dockFirst(node, 'button') }
  useEffect(() => { dockFirst(anchorRef.current, 'button'); dockFirst(accumRef.current, 'button') }, [])

  const jumpTo = (id: string) => {
    setActiveAnchor(id)
    document.getElementById(`profile-sec-${id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  // 段一 · 身份印带：当前 context 取本县签押（自我汇总以正印官座位为准）。
  const seatContext = powerContexts.find(item => item.id === 'seat')!
  const bundle = entitlementsOf(state, 'seat')
  const currentGoal = goals.find(goal => goal.id === state.goalId)
  const tiers: Tier[] = ['能', '可', '该']
  const counts = verbCounts(dockOf('seat'))
  const impressions = impressionsOf(state)
  const decency = decencyFactsOf(state)

  const accumGroups = [
    { id: 'filed', label: '入卷', count: state.officialActions.length, open: onOpenEpilogue, source: '章末 · 实迹' },
    { id: 'clues', label: '记疑', count: state.clues.length, open: onOpenIntel, source: '情报台账' },
    { id: 'compared', label: '并置', count: state.comparisons.length, open: onOpenLedger, source: '账房 · 并置' },
    { id: 'asked', label: '接触', count: state.asked.length, open: onOpenPeople, source: '人情 · 名册' },
    { id: 'evidence', label: '证据', count: state.unlocked.length, open: onOpenIntel, source: '情报台账' },
    { id: 'handled', label: '处事', count: state.handledEvents.length, open: onOpenAffairs, source: '事务 · 十日时钟' },
  ]

  const stamps: Array<{ label: string; on: boolean; char: string }> = [
    { label: '立志', on: Boolean(state.goalId), char: currentGoal?.seal ?? '' },
    { label: '抢护', on: Boolean(state.plan), char: '委' },
    { label: '验收', on: Boolean(state.outcome), char: '验' },
  ]

  return (
    <motion.section className="overlay-backdrop profile-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div
        ref={dialogRef}
        className="profile-folio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabIndex={-1}
        initial={{ y: reduceMotion ? 0 : 22, opacity: 0, scale: reduceMotion ? 1 : .99 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: reduceMotion ? 0 : 14, opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 235, damping: 28 }}
        onKeyDown={event => { handleFolioReturnKey(event) }}
      >
        <span className="profile-base-note">履历底纸 · 待补专图（暂借素纸）</span>
        <header className="profile-head">
          <div>
            <span className="eyebrow">S-25 / 自我 · 履历 · 界面投影</span>
            <h2 id="profile-title">这一任，已经写下这些。</h2>
            <p>身份、权、财、望与积累，都是已发生之事的汇总与装裱；不新增数值，不预写未发生。</p>
          </div>
          <div className="profile-head-right">
            <span className="profile-head-seal" aria-hidden="true">自</span>
            <button className="icon-button" onClick={onClose} aria-label="合上履历"><X size={20} /></button>
          </div>
        </header>

        <div className="profile-anchors" role="navigation" aria-label="履历五段锚签" ref={dockAnchors} onKeyDown={event => roveFocus(anchorRef.current, 'button', event)}>
          {anchors.map(item => (
            <button key={item.id} className={activeAnchor === item.id ? 'active' : ''} aria-current={activeAnchor === item.id ? 'true' : undefined} onClick={() => jumpTo(item.id)}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="profile-body">
          <section className="profile-section" id="profile-sec-identity" aria-label="身份印带">
            <div className="profile-identity-band">
              <div className="profile-portrait" data-portrait={portrait}>
                {portrait === 'ready'
                  ? <img src="/assets/magistrate-portrait.png" alt="知县官身小像 · 青灰官服半身像" />
                  : <div className="profile-portrait-blank"><span>{portrait === 'failed' ? '官身小像待补' : '官身小像'}</span></div>}
              </div>
              <div className="profile-title-vertical" aria-label="永济县知县">永济县知县</div>
              <div className="profile-meta-signs">
                <div className="profile-meta-sign"><span>任内</span><b>第{dayNames[state.day - 1]}日 / 十日之任</b></div>
                <div className="profile-meta-sign"><span>洪峰</span><b>第 9 日汛 / 余 {Math.max(0, 9 - state.day)} 日</b></div>
                <div className="profile-meta-sign"><span>场景身份</span><b>{seatContext.label} · {seatContext.place}</b></div>
              </div>
              <div className="profile-seal-column">
                <div className={`profile-goal-seal ${currentGoal ? '' : 'is-empty'}`} aria-label={currentGoal ? `志向 ${currentGoal.title}` : '尚未立志'}>{currentGoal?.seal ?? '志'}</div>
                <span className="profile-goal-caption">{currentGoal ? currentGoal.title : '尚未立志'}</span>
                <div className="profile-stamps" aria-label="只盖已发生的三枚条件印">
                  {stamps.map(stamp => (
                    <div className="profile-stamp" key={stamp.label} data-on={stamp.on ? 'true' : 'false'}>
                      <i>{stamp.on ? stamp.char : ''}</i>
                      <span>{stamp.label}</span>
                    </div>
                  ))}
                </div>
                <small className="profile-stamp-note">印只作装帧 · 只盖已发生</small>
              </div>
            </div>
          </section>

          <section className="profile-section" id="profile-sec-power" aria-label="权 · 能可该">
            <header className="profile-section-head"><span className="eyebrow">段二 · 权</span><h3>能 / 可 / 该，分开看。</h3><small>{bundle.identity} · {bundle.place}</small></header>
            <div className="profile-tier-slips">
              {tiers.map(tier => {
                const rows = bundle.rows.filter(row => row.tier === tier)
                const ready = rows.filter(row => row.state === 'ready').length
                const pending = rows.filter(row => row.state === 'pending').length
                const risk = rows.filter(row => row.state === 'risk').length
                return (
                  <div className="profile-tier-slip" data-tier={tier} key={tier}>
                    <span className="profile-tier-seal">{tier}</span>
                    <div className="profile-tier-body"><b>{tierQuestions[tier].question}</b><small>{tierQuestions[tier].hint}</small></div>
                    <div className="profile-tier-count"><b>{rows.length}</b><span>项</span></div>
                    <div className="profile-tier-states">
                      {ready > 0 && <i data-state="ready">{stateLabel.ready} {ready}</i>}
                      {pending > 0 && <i data-state="pending">{stateLabel.pending} {pending}</i>}
                      {risk > 0 && <i data-state="risk">{stateLabel.risk} {risk}</i>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="pw-verbs profile-verbs" aria-label="八动词主干摘要">
              {verbTrunk.map(verb => (
                <span className={counts[verb] ? 'is-on' : ''} key={verb} aria-label={`${verb} ${counts[verb]} 件`}>
                  <b>{verb}</b><i>{counts[verb] || '·'}</i>
                </span>
              ))}
            </div>
            <footer className="profile-section-foot">
              <span>三层与八动词只投影既有派生 · 不代执行</span>
              {onOpenPower && <button className="profile-return" onClick={onOpenPower}>回权界纸<ArrowUpRight size={12} /></button>}
            </footer>
          </section>

          <section className="profile-section" id="profile-sec-wealth" aria-label="财 · 银与料">
            <header className="profile-section-head"><span className="eyebrow">段三 · 财</span><h3>银与料，各有来路。</h3><small>只读既有结算 · 不编收入</small></header>
            <div className="profile-wealth-grid">
              <div className="profile-purse"><span>私囊余</span><b>{state.privateFunds}<small> 两</small></b><small>顶栏私囊同源</small></div>
              <div className="profile-material">
                <div><span>已到场</span><b>{state.material.arrived}</b><small>垛</small></div>
                <div><span>在途</span><b>{state.material.transit}</b><small>垛</small></div>
                <div><span>未发</span><b>{state.material.unsent}</b><small>垛</small></div>
              </div>
              <div className="profile-gift"><span>礼簿往来</span><b>{state.giftEntries.length}<small> 笔</small></b><small>{state.giftEntries.length ? '已发生的事' : '接风帖仍在案角'}</small></div>
            </div>
            <div className="profile-decency" aria-label="体面线摘要 · 规则未启用">
              <span className="profile-decency-label">体面线 · 预览</span>
              {decency.map(fact => <span className="profile-decency-fact" key={fact.id}><i>{fact.label}</i><b>{fact.value}</b></span>)}
              <small>判定规则未启用 · 三笔皆已发生</small>
            </div>
            <footer className="profile-section-foot">
              <span>料账三数口径同 S-06 · 不重复计算</span>
              {onOpenLedger && <button className="profile-return" onClick={onOpenLedger}>回账房<ArrowUpRight size={12} /></button>}
              {onOpenGift && <button className="profile-return" onClick={onOpenGift}>回礼簿<ArrowUpRight size={12} /></button>}
            </footer>
          </section>

          <section className="profile-section" id="profile-sec-repute" aria-label="望 · 四印象">
            <header className="profile-section-head"><span className="eyebrow">段四 · 望</span><h3>同一个人，四种眼光。</h3><small>分开看，不折算为单一数值</small></header>
            <div className="profile-impressions">
              {impressions.map(item => (
                <div className="profile-impression" data-kind={item.id} key={item.id}>
                  <span className="profile-impression-seal">{item.name.slice(0, 1)}</span>
                  <div className="profile-impression-head"><b>{item.name}</b><small>{item.question}</small></div>
                  <div className="profile-impression-tags">
                    {item.tags.length
                      ? item.tags.map(tag => <span className="profile-tag" key={tag.label}><b>{tag.label}</b><i>{tag.basis}</i></span>)
                      : <span className="profile-tag is-blank"><b>未详</b><i>尚无可回到的来源</i></span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="profile-grade" data-empty={state.outcome ? 'false' : 'true'}>
              <span>考语品第</span>
              {state.outcome ? <b>{state.outcome.grade}</b> : <i>未届考语</i>}
              <small>{state.outcome ? `验收题销 · 第${state.outcome.day}日` : '验收未届 · 留白不预写'}</small>
            </div>
            <footer className="profile-section-foot">
              <span>每条标签都能回到原事件与来源</span>
              {onOpenCitation && <button className="profile-return" onClick={onOpenCitation}>回考语<ArrowUpRight size={12} /></button>}
              {onOpenPower && <button className="profile-return" onClick={onOpenPower}>回权界<ArrowUpRight size={12} /></button>}
            </footer>
          </section>

          <section className="profile-section" id="profile-sec-accum" aria-label="积累 · 墨点带">
            <header className="profile-section-head"><span className="eyebrow">段五 · 积累</span><h3>墨点随玩而积，不是进度条。</h3><small>来自存档既有字段 · 刷新不散 · 不折算数值</small></header>
            <div className="profile-accum" ref={dockAccum} onKeyDown={event => roveFocus(accumRef.current, 'button', event)}>
              {accumGroups.map(group => {
                const dots = Math.min(group.count, 10)
                const inner = (
                  <>
                    <span className="profile-accum-label">{group.label}</span>
                    <span className="profile-accum-dots" aria-hidden="true">{Array.from({ length: dots }, (_, index) => <i key={index} />)}</span>
                    <b className="profile-accum-count">{group.count}</b>
                    <small className="profile-accum-source">{group.source}</small>
                  </>
                )
                return group.open
                  ? <button className="profile-accum-group" key={group.id} onClick={group.open} aria-label={`${group.label} ${group.count} · 回${group.source}`}>{inner}<ArrowUpRight className="profile-accum-arrow" size={11} /></button>
                  : <div className="profile-accum-group" key={group.id}>{inner}</div>
              })}
            </div>
            <footer className="profile-section-foot"><span>每组封顶十枚墨点 · 超出只加数字 · 组组回源不耗时</span></footer>
          </section>

          <SurfaceColophon surface="自我 · 履历" note="只读投影 · 墨点随玩而积 · 不写存档" className="profile-colophon" />
        </div>

        <footer className="profile-foot">
          <span><LockKeyhole size={13} />界面 · 投影 / 只读 · 不新增数值 · 回查不耗时 · 不写存档</span>
          <button className="primary-button" onClick={onClose}>合上履历<ArrowRight size={15} /></button>
        </footer>
      </motion.div>
    </motion.section>
  )
}