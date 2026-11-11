import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, Clock3, Coins, FileWarning, Landmark, Link2, LockKeyhole, Network, Scale, Shield, Sparkles, Users, X } from 'lucide-react'
import { fixedEvents, goals, ledgerRows, people } from '../data'
import type { GameState, GoalReckoning } from '../game/useGame'
import type { Clue, ClueSource, GameLog, Goal, Period } from '../types'
import { useOverlayDialog } from './useOverlayDialog'
import { AudienceEchoPanel, EntitlementSheet, RiskStrip } from './PowerLedger'
import { RuleChip, WhyNot } from './RuleBook'
import { ScenePlate } from './ScenePlate'
import { SaveFolio, type SaveSummary } from './SaveFolio'
import { ReadAcross, type ReadAcrossTarget } from './ReadAcross'
import { LastReviewChip } from './LastReviewChip'
import { FolioSlip } from './FolioSlip'
import { RumorTrail } from './RumorTrail'
import type { ReviewOrigin } from '../reviewTrail'

export { useOverlayDialog } from './useOverlayDialog'

export function DrawerFrame({ children, title, eyebrow, onClose, className = '' }: { children: React.ReactNode, title: string, eyebrow: string, onClose: () => void, className?: string }) {
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className={`side-drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} layoutId="overlay-paper" initial={{ opacity: 0, x: reduceMotion ? 0 : 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : 40 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 250, damping: 28 }}>
        <header className="drawer-header"><div><span className="eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label={`关闭${title}`}><X size={20} /></button></header>
        {children}
      </motion.div>
    </motion.section>
  )
}

export function PlanDrawer({ onClose, onConfirm, canPlan, state }: { onClose: () => void, onConfirm: (plan: { leader: string, leaderName: string, material: number, labor: number, supervisor: string, detail: string }) => void, canPlan: boolean, state: GameState }) {
  const [leader, setLeader] = useState('foreman')
  const [material, setMaterial] = useState(8)
  const [labor, setLabor] = useState(30)
  const [supervisor, setSupervisor] = useState('县丞会勘 · 工头监作')
  const [guarantee, setGuarantee] = useState(false)
  const reduceMotion = useReducedMotion()
  const valid = guarantee && material >= 8 && labor >= 30 && leader === 'foreman'
  const leaderName = leader === 'foreman' ? '赵九河' : leader === 'xiancheng' ? '林绍棠' : '顾逢源'
  return (
    <DrawerFrame title="东堤抢护 · 委托预览" eyebrow="先抢后报 / 三日内补详" onClose={onClose} className="plan-drawer">
      <div className="drawer-scroll">
        <div className="plan-premise"><span className="seal-mini">抢</span><p>旧闸下游四十步。先稳住渗点，不承诺十日拆修。</p><span className="status-tag">可领办</span></div>
        <div className="rb-inline-row"><span>界面 · 投影 / 三层查验只映既有表单</span><RuleChip clause="power-tier" compact label="依 6.7.1" /></div>
        <section className="plan-time-paper" aria-label="抢护长动作时长预览">
          <header><span className="eyebrow">一汛长卷 / 发起与执行分开</span><small>只声明耗时 不预告结果</small></header>
          <div className="plan-time-segments">
            <article><span>发起</span><b>本时段</b><small>签押后委托入卷</small></article>
            <motion.i initial={{ scaleX: reduceMotion ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduceMotion ? 0 : .45, ease: 'easeOut' }} aria-hidden="true" />
            <article><span>执行</span><b>3–4 日</b><small>任务与世界各自推进</small></article>
            <motion.i initial={{ scaleX: reduceMotion ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduceMotion ? 0 : .45, delay: reduceMotion ? 0 : .08, ease: 'easeOut' }} aria-hidden="true" />
            <article><span>验收</span><b>以回报为准</b><small>签押不等于已经办成</small></article>
          </div>
        </section>
            {!valid && <WhyNot
              title={!guarantee ? '尚缺保正具结' : '条件尚未补足'}
              reason={!guarantee ? '雇募夫役须由保正具结存案；缺此一道，委牌不能签押。' : material < 8 || labor < 30 ? '拨料不足八垛或夫役不足三十人，抢护不能发起。' : '一线抢护仍须工头监作，另选主办只作协办。'}
              alternative={!guarantee ? '勾选「雇募夫役由保正具结」后再签押' : '按委牌预览补足料、夫与主办'}
              clause="power-why-not"
            />}
            <section className="plan-entitlement">
              <EntitlementSheet state={state} context="commission" compact draft={{ material, labor, guarantee, survey: !supervisor.includes('仅工头监作') }} />
              {supervisor.includes('仅工头监作') && <RiskStrip
                verdict="可而该不该"
                title="无会勘签押 · 委牌会勘栏空白"
                detail="保固与赔补由签押人独担，县丞不在委牌上留名。只预览既有边界，不改签押条件与验收结果。"
                marks={['会勘栏空白', '验收只落一纸', '6.6 责任共担']}
              />}
            </section>
        <div className="plan-workspace">
          <div className="plan-fields">
            <section className="form-section">
              <div className="form-label"><span>壹</span><h3>托谁主办</h3><small>能不能 / 愿不愿 / 敢不敢</small></div>
              <div className="choice-list three">
                {[['foreman', '赵九河', '熟悉险工'], ['xiancheng', '林绍棠', '善协调'], ['expert', '顾逢源', '懂工法']].map(([id, name, hint]) => <button key={id} className={leader === id ? 'selected' : ''} aria-pressed={leader === id} onClick={() => setLeader(id)}>
                  {leader === id && <motion.span className="choice-ink" layoutId="plan-leader-ink" transition={{ type: 'spring', stiffness: 400, damping: 34 }} aria-hidden="true" />}
                  <b>{name}</b><small>{hint}</small>{leader === id && <Check size={14} />}
                </button>)}
              </div>
              <AnimatePresence initial={false}>{leader !== 'foreman' && <motion.p className="inline-warning" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><FileWarning size={14} />此人可作协办，但一线抢护仍需工头监作。</motion.p>}</AnimatePresence>
            </section>
            <section className="form-section">
              <div className="form-label"><span>贰</span><h3>投多少料与人</h3><small>只预览，不预告结果</small></div>
              <label className="range-control"><span>秫秸料 <b>{material} 垛</b></span><input type="range" min="8" max="10" step="1" value={material} onChange={(e) => setMaterial(Number(e.target.value))} /><small>到场 30 垛 · 本次占用后余 {30 - material} 垛</small></label>
              <label className="range-control"><span>抢护夫役 <b>{labor} 人</b></span><input type="range" min="30" max="50" step="5" value={labor} onChange={(e) => setLabor(Number(e.target.value))} /><small>现有堡夫 20 + 河兵 5 · 其余须雇募</small></label>
            </section>
            <section className="form-section">
              <div className="form-label"><span>叁</span><h3>如何留痕</h3><small>程序不是拖慢，是责任共担</small></div>
              <label className="select-label">会勘 / 监督<select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}><option>县丞会勘 · 工头监作</option><option>仅工头监作 · 暂无会勘</option><option>请河工幕友估工 · 县丞会勘</option></select></label>
              <button className={`guarantee-check ${guarantee ? 'checked' : ''}`} aria-pressed={guarantee} onClick={() => setGuarantee(!guarantee)}><span className="checkbox">{guarantee && <Check size={15} />}</span><span><b>雇募夫役由保正具结</b><small>雇募不超过五十人，示例夫食二十五两</small></span></button>
            </section>
          </div>
          <aside className="plan-ticket" aria-label="实时委牌预览">
            <header><span className="eyebrow">委牌 / 随填随改</span><span className={`plan-ticket-status ${valid ? 'ready' : ''}`}>{valid ? '可签押' : '待补足'}</span></header>
            <div className="plan-ticket-title"><span>东堤抢护</span><b>委</b><small>先抢后报 · 三日内补详</small></div>
            <dl>
              <div><dt>主办</dt><dd><AnimatePresence mode="wait" initial={false}><motion.span key={leader} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{leaderName}</motion.span></AnimatePresence></dd></div>
              <div><dt>秫秸</dt><dd><AnimatePresence mode="wait" initial={false}><motion.span key={material} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{material} 垛</motion.span></AnimatePresence></dd></div>
              <div><dt>夫役</dt><dd><AnimatePresence mode="wait" initial={false}><motion.span key={labor} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{labor} 人</motion.span></AnimatePresence></dd></div>
              <div><dt>会勘</dt><dd><motion.span key={supervisor} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{supervisor}</motion.span></dd></div>
              <div className={guarantee ? 'is-ready' : 'is-pending'}><dt>具结</dt><dd><motion.span key={String(guarantee)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{guarantee ? '保正具结已附' : '尚缺保正具结'}</motion.span></dd></div>
            </dl>
            <footer><span className="plan-ticket-seal">委</span><p>此牌只随预览改动<br />签押后方才入卷</p></footer>
          </aside>
        </div>
      </div>
      <footer className="drawer-footer plan-summary">
        <div><span><Clock3 size={14} />执行 3–4 日</span><span><Coins size={14} />夫食 25 两</span></div>
        <button className="primary-button" disabled={!valid || !canPlan} onClick={() => onConfirm({ leader, leaderName, material, labor, supervisor, detail: `${leaderName}主办 · 料${material}垛 · 夫${labor}人 · ${supervisor}` })}>{canPlan ? '签押，发起抢护' : '抢护已在执行'}<ArrowRight size={17} /></button>
        <small>发起占本时段；任务异步执行，不会立即显示“已完成”。</small>
      </footer>
    </DrawerFrame>
  )
}

type IntelligenceFilter = '已核实' | '听说' | '推测' | '存疑'

export function IntelligenceDrawer({ clues, asked, onClose, onOpenSource, onOpenEvidence, state, readAcrossJump, onOpenLastReview, onOpenRumor, reviewOrigin, onBackReviewOrigin }: { clues: Clue[], asked: string[], onClose: () => void, onOpenSource: (source: ClueSource, refs?: string[]) => void, onOpenEvidence: () => void, state: GameState, readAcrossJump?: (target: ReadAcrossTarget) => void, onOpenLastReview?: (focus: string) => void, onOpenRumor?: (target: 'street' | 'intel') => void, reviewOrigin?: ReviewOrigin, onBackReviewOrigin?: () => void }) {
  const [filter, setFilter] = useState<IntelligenceFilter>('存疑')
  const claims = people.filter(p => asked.includes(p.id))
  const hearsay = ledgerRows.find(row => row.id === 'P-006')
  // 公开事实按既有材料数取，不写死；每条都能回原处。
  const facts: Array<{ id: string; tag: string; text: string; source: ClueSource; refs: string[] }> = [
    { id: 'F-001', tag: '河工现场', text: '东堤旧闸下游出现渗水，约四十步。', source: 'document', refs: ['cause-1'] },
    { id: 'F-005', tag: '河工料账', text: `应到料五十垛；到场 ${state?.material.arrived ?? 30}，在途 ${state?.material.transit ?? 10}，未发 ${state?.material.unsent ?? 10}。`, source: 'ledger', refs: ['E-001'] },
  ]
  const counts: Record<IntelligenceFilter, number> = { 已核实: facts.length, 听说: hearsay ? 1 : 0, 推测: 0, 存疑: clues.length + claims.length }
  const filters: IntelligenceFilter[] = ['已核实', '听说', '推测', '存疑']
  // FE-134（C-145）：来源钉单一 Tab 停靠，方向键 / Home / End 巡览；只移焦点，不改回查回调。
  const recordsRef = useRef<HTMLDivElement | null>(null)
  const dockPins = (node: HTMLDivElement | null) => {
    recordsRef.current = node
    if (!node) return
    const pins = Array.from(node.querySelectorAll<HTMLButtonElement>('.clue-source'))
    pins.forEach((pin, index) => { pin.tabIndex = index === 0 ? 0 : -1 })
  }
  useEffect(() => { dockPins(recordsRef.current) }, [filter, clues.length, asked.length])
  const handlePinKeys = (event: ReactKeyboardEvent) => {
    const pins = Array.from(recordsRef.current?.querySelectorAll<HTMLButtonElement>('.clue-source') ?? [])
    if (pins.length < 2) return
    const index = pins.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? pins.length - 1 : (index + step + pins.length) % pins.length
    pins[next].focus()
  }
  return (
    <DrawerFrame title="情报台账" eyebrow="接触不等于相信 / 来源独立记录" onClose={onClose} className="intelligence-drawer">
      <span className="focus-anchor" data-focus-id="intel-drawer" aria-hidden="true" />
      <span className="intel-base-note">台账底纸 · 待补专图（暂借素纸）</span>
      <div className="drawer-scroll">
        <div className="intel-review-row"><LastReviewChip compact onOpen={focus => onOpenLastReview?.(focus)} origin={reviewOrigin} onBack={onBackReviewOrigin} /></div>
        <div className="rb-inline-row"><span>四档状态 · 界面投影 / 来源与真假分开记</span><RuleChip clause="knowledge-tier" compact label="依 14.3" /></div>
        <div className="knowledge-legend" role="toolbar" aria-label="按知识状态筛选">
          {filters.map(item => <button key={item} className={`${item === '已核实' ? 'verified' : item === '存疑' ? 'doubt' : ''} ${filter === item ? 'active' : ''}`} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {filter === item && <motion.span className="intel-filter-ink" layoutId="intel-filter-ink" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
            <span className="intel-filter-label">{item}<b>{counts[item]}</b></span>
          </button>)}
        </div>
        <button className="evidence-entry" onClick={onOpenEvidence}><Link2 size={16} /><div><b>把矛盾正式并置</b><small>同一笔三百两 · 只呈现差异 不作结论</small></div><ArrowUpRight size={16} /></button>
        <ReadAcross state={state} variant="strip" active="intel" onOpen={readAcrossJump} />
        <AudienceEchoPanel state={state} focus="clue" variant="stack" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div className="intelligence-records" key={filter} ref={dockPins} onKeyDown={handlePinKeys} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
            {filter === '存疑' && <>
              <section className="intel-section"><h3>你亲手记下的疑点 <b>{clues.length}</b></h3>{clues.length === 0 ? <div className="empty-paper"><BookOpen size={24} /><p>尚无疑点 去呈文对勘选两处文字 或把两本账并置</p></div> : clues.map((clue, i) => <motion.article layout className="clue-card" key={clue.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ delay: i * .05 }}><header className="intel-record-head"><span className="intel-status doubt">存疑</span><span>{clue.id} / 第{clue.day}日</span></header><p>{clue.text}</p><button className="clue-source" onClick={() => onOpenSource(clue.source, clue.refs)}><Link2 size={12} />{clue.source === 'document' ? '来源 东堤呈文对勘' : clue.source === 'ledger' ? '来源 账房并置' : '来源 东堤探挖记录'}<ArrowUpRight size={12} /></button></motion.article>)}</section>
              <section className="intel-section"><h3>人物说法 <b>{claims.length}</b></h3>{claims.length === 0 ? <div className="empty-paper"><Users size={24} /><p>还没有正式问话 人物公开身份可见 真实说法须亲自接触</p></div> : claims.map((p, index) => <motion.article className="claim-card" key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }}><header><span className="mini-monogram">{p.monogram}</span><div><b>{p.name} · {p.role}</b><small>{p.claimId} / 亲见口供</small></div><span className="intel-status doubt">存疑</span></header><p>{p.claim}</p><footer>来源可靠性与内容真假分开记录</footer></motion.article>)}</section>
            </>}
            {filter === '已核实' && <section className="intel-section"><h3>公开事实 <b>{facts.length}</b></h3>{facts.map(fact => <article className="fact-row" key={fact.id}><span>{fact.id}<small>{fact.tag}</small></span><p>{fact.text}</p><b>已核实</b><button className="clue-source" onClick={() => onOpenSource(fact.source, fact.refs)}><Link2 size={12} />回查来源<ArrowUpRight size={12} /></button></article>)}<p className="intel-filter-note">已核实只表示事实已有依据 不代表相关人的解释可信</p></section>}
            {filter === '听说' && <section className="intel-section"><h3>转述与传闻 <b>{counts.听说}</b></h3><RumorTrail variant="strip" current="intel" rumor={state.log.rumor} onOpen={onOpenRumor} />{hearsay ? <motion.article className="clue-card hearsay-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><header className="intel-record-head"><span className="intel-status">听说</span><span>{hearsay.id} / 转述</span></header><p>{hearsay.text}</p><button className="clue-source" onClick={() => onOpenSource('ledger', [hearsay.id])}><Link2 size={12} />来源 {hearsay.source}<ArrowUpRight size={12} /></button></motion.article> : <div className="empty-paper"><BookOpen size={24} /><p>尚未接触转述与传闻</p></div>}</section>}
            {filter === '推测' && <section className="intel-section"><h3>单独记下的推测 <b>0</b></h3><div className="empty-paper"><BookOpen size={24} /><p>尚无单列为推测的记录 并置只产生疑点 不替你推断</p></div></section>}
          </motion.div>
        </AnimatePresence>
      </div>
    </DrawerFrame>
  )
}

export function BanquetModal({ period, onClose, onChoose }: { period: Period, onClose: () => void, onChoose: (choice: 'attend' | 'delegate' | 'audit') => void }) {
  const isNight = period === '夜'
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop banquet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="banquet-modal" role="dialog" aria-modal="true" aria-labelledby="banquet-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : 20, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .24, ease: 'easeOut' }}>
        <button className="icon-button banquet-close" onClick={onClose} aria-label="收起请帖"><X size={20} /></button>
        <div className="invitation-side"><ScenePlate id="banquet" className="banquet-art-plate" /><div className="invitation-side-shade" />{isNight && <div className="sang-lamp-glow" aria-hidden="true" />}<span>第一日 · 夜</span><h2 id="banquet-title">接风宴</h2><p>桑鹤龄 谨订</p><div className="invitation-seal">桑</div></div>
        <div className="banquet-content"><span className="eyebrow">世俗事件 / 不止花一笔钱</span><h3>灯已点上，帖子就压在案角。</h3><p className="banquet-lead">桑士绅做东，县丞与粮商都会到。他们去的不只是饭局——旧欠、坟地和谁肯替你说句话，都可能在一盏茶里露出边角。</p>{!isNight && <WhyNot title="此刻不能定宴" reason={`现在是「${period}」。桑宅接风宴入夜才能作决定；眼下可先看三择与各自牵动的账。`} alternative="先读三择，入夜后再点选" clause="time-one-action" />}
          <div className="banquet-options-heading"><span>灯下三择</span><small>点选即定 随后进入夜结算</small></div>
          <div className="banquet-options">
            <motion.button disabled={!isNight} onClick={() => onChoose('attend')} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: .08 }} whileTap={isNight ? { scale: .99 } : undefined}><span className="option-index">甲</span><div><h4>亲自赴宴</h4><p>听旧欠与坟地两件事，给足主人体面。</p><footer><span>私囊 −20 两</span><span>人情 +1</span><span>身体：困倦</span></footer></div><ArrowRight size={18} /></motion.button>
            <motion.button disabled={!isNight} onClick={() => onChoose('delegate')} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: .14 }} whileTap={isNight ? { scale: .99 } : undefined}><span className="option-index">乙</span><div><h4>请县丞代去</h4><p>让他替县衙留一份情，也让他多知道一点内情。</p><footer><span>私囊 −6 两</span><span>县丞人情 +1</span><span>士绅或不满</span></footer></div><ArrowRight size={18} /></motion.button>
            <motion.button disabled={!isNight} onClick={() => onChoose('audit')} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: .2 }} whileTap={isNight ? { scale: .99 } : undefined}><span className="option-index">丙</span><div><h4>闭门查旧册</h4><p>不去赴宴，循着三百两的数目找借领状。</p><footer><span>证据 E-002</span><span>主簿警觉</span><span>身体：困倦</span></footer></div><ArrowRight size={18} /></motion.button>
          </div><small className="choice-note">选择只呈现可能触及的账，不标示“最优解”。</small>
        </div>
      </motion.div>
    </motion.section>
  )
}

const goalForesee: Record<string, string[]> = {
  achievement: ['堤在不在', '工法有没有亲勘', '勘报与考语是否对得上'],
  integrity: ['三百两有没有名目', '旧借领与旧欠能不能并置', '席面有没有沾清名'],
  network: ['谁真的出过力', '会勘有没有人签', '托付有没有回音'],
  survival: ['两版呈文有没有对勘', '会勘与具结有没有留痕', '题销能不能分说'],
}

export function GoalPrologue({ selected, onSelect, onStart, onReset, saveSummary, onExport, narrativeSlot }: { selected: string | null, onSelect: (id: string) => void, onStart: () => void, onReset?: () => void, saveSummary?: SaveSummary, onExport?: () => void, narrativeSlot?: React.ReactNode }) {
  const icons = [<Landmark size={19} />, <Scale size={19} />, <Network size={19} />, <Shield size={19} />]
  return (
    <motion.div className="prologue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="prologue-scene"><ScenePlate id="prologue-night" className="prologue-art" /><div className="prologue-scene-shade" /><div className="prologue-title"><span className="prologue-kicker">一县 · 七人 · 十日 · 一汛</span><h1>观远</h1><div className="title-seal">知县<br />亲览</div><p>你不是直接操纵世界。<br />你只是坐在案前，决定听谁、信谁、托谁。</p></div><div className="prologue-scene-footer"><span>互动视觉原型 · 第一章</span><span>河工案卷 / 东堤渗水</span></div></div>
      <div className="prologue-paper"><div className="prologue-paper-inner"><span className="eyebrow">书斋夜坐 · 立志</span><h2>你这一任，<br />最想留下什么？</h2><p className="goal-intro">志向不是加成，也没有标准答案。它只在章末替你照一照：当初想要的，后来还剩下多少。</p><ol className="goal-horizon" aria-label="十日内的公开日程">{fixedEvents.map(event => <li key={event.day}><span>{String(event.day).padStart(2, '0')}</span><b>{event.label}</b><small>{event.detail}</small></li>)}</ol>
          <div className="goal-grid">{goals.map((goal: Goal, i) => <button key={goal.id} className={`goal-card ${selected === goal.id ? 'selected' : ''}`} onClick={() => onSelect(goal.id)}><span className="goal-icon">{icons[i]}</span><div><h3>{goal.title}<small>{goal.seal}</small></h3><p>{goal.statement}</p><footer>{goal.hint}</footer></div><span className="goal-check">{selected === goal.id && <Check size={14} />}</span></button>)}</div>{selected && <p className="goal-foresee"><span>章末照见</span>{(goalForesee[selected] ?? []).map(item => <i key={item}>{item}</i>)}<small>不是结果预告</small></p>}
          <button className="primary-button start-button" disabled={!selected} onClick={onStart}><span>{selected ? '以此立志，进入第一日' : '先选一个志向'}</span><ArrowRight size={18} /></button><div className="prologue-note"><Sparkles size={13} /><span>志向默认私有。你可以在任何重大事件后改写它。</span></div>{onReset && (saveSummary
            ? <SaveFolio summary={saveSummary} onExport={onExport} onReset={onReset} extra={narrativeSlot} />
            : <button className="prologue-reset" onClick={onReset}>重新立志 · 清空本地存档</button>)}</div></div>
    </motion.div>
  )
}

export function DaySummary({ log, privateFunds, day, reckoning, onContinue, onLocate }: { log: GameLog, privateFunds: number, day: number, reckoning: GoalReckoning | null, onContinue: () => void, onLocate?: (kind: 'affairs' | 'document' | 'intel') => void }) {
  const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop summary-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="day-summary" role="dialog" aria-modal="true" aria-labelledby="summary-title" tabIndex={-1} layoutId="overlay-paper" initial={{ opacity: 0, scale: reduceMotion ? 1 : .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
        <div className="summary-lamp" aria-hidden="true" />
        <div className="summary-night-plate"><ScenePlate id="summary-night" className="summary-art-plate" /><span>第{dayNames[day - 1]}日 · 夜结算</span></div>
        <div className="summary-heading">
          <div>
            <span className="eyebrow">第{dayNames[day - 1]}日 · 夜结算</span>
            <h2 id="summary-title">灯花结了，县衙还没有睡。</h2>
            <p>世界没有等你。你说过的、没说的，都有人各自记了一笔。</p>
          </div>
          <span className="summary-night-seal">更</span>
        </div>
        <div className="rb-inline-row is-tight"><span>夜结算 · 界面投影</span><RuleChip clause="time-settle" compact label="依 9.3" /></div>
        <div className="summary-ledger" data-three-lines="true"><article><span>今日办成</span><div><h3>{log.done}</h3>{onLocate && <FolioSlip className="log-locate" compact label="回事务盘" onClick={() => onLocate('affairs')} />}</div></article><article><span>卡在</span><div><h3>{log.stuck}</h3>{onLocate && <FolioSlip className="log-locate" compact label="回案卷" onClick={() => onLocate('document')} />}</div></article><article><span>有人在传</span><div><h3>{log.rumor}</h3>{onLocate && <FolioSlip className="log-locate" compact label="回情报台账" onClick={() => onLocate('intel')} />}</div></article></div>
        {reckoning && (
          <section className="reckoning">
            <header><span className="eyebrow">志向对账 · {reckoning.title}</span><i>{reckoning.seal}</i></header>
            {reckoning.rows.map((row, index) => (
              <motion.div className={`reckoning-row tone-${row.tone}`} key={row.text} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .12 + index * .09 }}>
                <span>{row.tone}</span><p>{row.text}</p>
              </motion.div>
            ))}
            <small>只对账 不评分 志向仍可回印改写</small>
          </section>
        )}
        <div className="summary-stats"><span>私囊余 <b>{privateFunds}</b> 两</span><span>情报疑点已留痕</span><span>抢护任务按自身日程推进</span></div>
        <button className="primary-button" onClick={onContinue}>翻到第{dayNames[day]}日 · 晨<ArrowRight size={17} /></button>
      </motion.div>
    </motion.section>
  )
}
