import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, Clock3, Coins, FileWarning, Landmark, Link2, LockKeyhole, Network, Scale, Shield, Sparkles, Users, X } from 'lucide-react'
import { goals, ledgerRows, people } from '../data'
import type { GoalReckoning } from '../game/useGame'
import type { Clue, ClueSource, GameLog, Goal, Period } from '../types'

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
let activeOverlayDialogs = 0
let bodyOverflowBeforeOverlay = ''

export function useOverlayDialog<T extends HTMLElement>() {
  const dialogRef = useRef<T>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (activeOverlayDialogs === 0) bodyOverflowBeforeOverlay = document.body.style.overflow
    activeOverlayDialogs += 1
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(item => item.getClientRects().length > 0)
    const focusFrame = requestAnimationFrame(() => (focusable()[0] ?? dialog).focus())
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    dialog.addEventListener('keydown', trapFocus)
    return () => {
      cancelAnimationFrame(focusFrame)
      dialog.removeEventListener('keydown', trapFocus)
      activeOverlayDialogs = Math.max(0, activeOverlayDialogs - 1)
      if (activeOverlayDialogs === 0) {
        document.body.style.overflow = bodyOverflowBeforeOverlay
        if (opener?.isConnected) requestAnimationFrame(() => opener.focus())
      }
    }
  }, [])

  return dialogRef
}

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

export function PlanDrawer({ onClose, onConfirm, canPlan }: { onClose: () => void, onConfirm: (plan: { leader: string, leaderName: string, material: number, labor: number, supervisor: string, detail: string }) => void, canPlan: boolean }) {
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
            <section className="plan-checklist">
              <div className="check-ok"><CheckCircle2 size={17} /><span><b>权限</b>三百两以内领办／垫支可先行</span></div>
              <div className={material <= 30 ? 'check-ok' : 'check-bad'}><CheckCircle2 size={17} /><span><b>料</b>从到场三十垛中实拨，不动未发十垛</span></div>
              <div className={guarantee ? 'check-ok' : 'check-pending'}>{guarantee ? <CheckCircle2 size={17} /> : <FileWarning size={17} />}<span><b>程序</b>{guarantee ? '保正具结已纳入发起文书' : '尚缺保正具结，雇募不能发起'}</span></div>
              <div className="check-risk"><FileWarning size={17} /><span><b>风险</b>闸底未勘明；在途料与三百两旧欠仍可能生变</span></div>
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

export function IntelligenceDrawer({ clues, asked, onClose, onOpenSource, onOpenEvidence }: { clues: Clue[], asked: string[], onClose: () => void, onOpenSource: (source: ClueSource, refs?: string[]) => void, onOpenEvidence: () => void }) {
  const [filter, setFilter] = useState<IntelligenceFilter>('存疑')
  const claims = people.filter(p => asked.includes(p.id))
  const hearsay = ledgerRows.find(row => row.id === 'P-006')
  const counts: Record<IntelligenceFilter, number> = { 已核实: 2, 听说: hearsay ? 1 : 0, 推测: 0, 存疑: clues.length + claims.length }
  const filters: IntelligenceFilter[] = ['已核实', '听说', '推测', '存疑']
  return (
    <DrawerFrame title="情报台账" eyebrow="接触不等于相信 / 来源独立记录" onClose={onClose} className="intelligence-drawer">
      <div className="drawer-scroll">
        <div className="knowledge-legend" role="toolbar" aria-label="按知识状态筛选">
          {filters.map(item => <button key={item} className={`${item === '已核实' ? 'verified' : item === '存疑' ? 'doubt' : ''} ${filter === item ? 'active' : ''}`} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {filter === item && <motion.span className="intel-filter-ink" layoutId="intel-filter-ink" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
            <span className="intel-filter-label">{item}<b>{counts[item]}</b></span>
          </button>)}
        </div>
        <button className="evidence-entry" onClick={onOpenEvidence}><Link2 size={16} /><div><b>把矛盾正式并置</b><small>同一笔三百两 · 只呈现差异 不作结论</small></div><ArrowUpRight size={16} /></button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div className="intelligence-records" key={filter} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
            {filter === '存疑' && <>
              <section className="intel-section"><h3>你亲手记下的疑点 <b>{clues.length}</b></h3>{clues.length === 0 ? <div className="empty-paper"><BookOpen size={24} /><p>尚无疑点 去呈文对勘选两处文字 或把两本账并置</p></div> : clues.map((clue, i) => <motion.article layout className="clue-card" key={clue.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ delay: i * .05 }}><header className="intel-record-head"><span className="intel-status doubt">存疑</span><span>{clue.id} / 第{clue.day}日</span></header><p>{clue.text}</p><button className="clue-source" onClick={() => onOpenSource(clue.source, clue.refs)}><Link2 size={12} />{clue.source === 'document' ? '来源 东堤呈文对勘' : clue.source === 'ledger' ? '来源 账房并置' : '来源 东堤探挖记录'}<ArrowUpRight size={12} /></button></motion.article>)}</section>
              <section className="intel-section"><h3>人物说法 <b>{claims.length}</b></h3>{claims.length === 0 ? <div className="empty-paper"><Users size={24} /><p>还没有正式问话 人物公开身份可见 真实说法须亲自接触</p></div> : claims.map((p, index) => <motion.article className="claim-card" key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }}><header><span className="mini-monogram">{p.monogram}</span><div><b>{p.name} · {p.role}</b><small>{p.claimId} / 亲见口供</small></div><span className="intel-status doubt">存疑</span></header><p>{p.claim}</p><footer>来源可靠性与内容真假分开记录</footer></motion.article>)}</section>
            </>}
            {filter === '已核实' && <section className="intel-section"><h3>公开事实 <b>2</b></h3><article className="fact-row"><span>F-001<small>河工现场</small></span><p>东堤旧闸下游出现渗水，约四十步。</p><b>已核实</b></article><article className="fact-row"><span>F-005<small>河工料账</small></span><p>应到料五十垛；到场三十，在途十，未发十。</p><b>已核实</b></article><p className="intel-filter-note">已核实只表示事实已有依据 不代表相关人的解释可信</p></section>}
            {filter === '听说' && <section className="intel-section"><h3>转述与传闻 <b>{counts.听说}</b></h3>{hearsay ? <motion.article className="clue-card hearsay-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><header className="intel-record-head"><span className="intel-status">听说</span><span>{hearsay.id} / 转述</span></header><p>{hearsay.text}</p><button className="clue-source" onClick={() => onOpenSource('ledger', [hearsay.id])}><Link2 size={12} />来源 {hearsay.source}<ArrowUpRight size={12} /></button></motion.article> : <div className="empty-paper"><BookOpen size={24} /><p>尚未接触转述与传闻</p></div>}</section>}
            {filter === '推测' && <section className="intel-section"><h3>单独记下的推测 <b>0</b></h3><div className="empty-paper"><BookOpen size={24} /><p>尚无单列为推测的记录 并置只产生疑点 不替你推断</p></div></section>}
          </motion.div>
        </AnimatePresence>
      </div>
    </DrawerFrame>
  )
}

export function BanquetModal({ period, onClose, onChoose }: { period: Period, onClose: () => void, onChoose: (choice: 'attend' | 'delegate' | 'audit') => void }) {
  const isNight = period === '夜'
  const [hasScene, setHasScene] = useState(true)
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop banquet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="banquet-modal" role="dialog" aria-modal="true" aria-labelledby="banquet-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : 20, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .24, ease: 'easeOut' }}>
        <button className="icon-button banquet-close" onClick={onClose} aria-label="收起请帖"><X size={20} /></button>
        <div className="invitation-side">{hasScene && <img className="invitation-scene-img" src="/assets/sang-residence-night.jpg" alt="" onError={() => setHasScene(false)} />}<div className="invitation-side-shade" />{isNight && <div className="sang-lamp-glow" aria-hidden="true" />}<span>第一日 · 夜</span><h2 id="banquet-title">接风宴</h2><p>桑鹤龄 谨订</p><div className="invitation-seal">桑</div></div>
        <div className="banquet-content"><span className="eyebrow">世俗事件 / 不止花一笔钱</span><h3>灯已点上，帖子就压在案角。</h3><p className="banquet-lead">桑士绅做东，县丞与粮商都会到。他们去的不只是饭局——旧欠、坟地和谁肯替你说句话，都可能在一盏茶里露出边角。</p>{!isNight && <div className="time-lock"><LockKeyhole size={17} /><span>现在是「{period}」。可以先看选项，入夜后才能作决定。</span></div>}
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

export function GoalPrologue({ selected, onSelect, onStart, onReset }: { selected: string | null, onSelect: (id: string) => void, onStart: () => void, onReset?: () => void }) {
  const icons = [<Landmark size={19} />, <Scale size={19} />, <Network size={19} />, <Shield size={19} />]
  return (
    <motion.div className="prologue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="prologue-scene"><img src="/assets/county-office-dawn.jpg" alt="清晨的县衙签押房" /><div className="prologue-scene-shade" /><div className="prologue-title"><span className="prologue-kicker">一县 · 七人 · 十日 · 一汛</span><h1>观远</h1><div className="title-seal">知县<br />亲览</div><p>你不是直接操纵世界。<br />你只是坐在案前，决定听谁、信谁、托谁。</p></div><div className="prologue-scene-footer"><span>互动视觉原型 · 第一章</span><span>河工案卷 / 东堤渗水</span></div></div>
      <div className="prologue-paper"><div className="prologue-paper-inner"><span className="eyebrow">书斋夜坐 · 立志</span><h2>你这一任，<br />最想留下什么？</h2><p className="goal-intro">志向不是加成，也没有标准答案。它只在章末替你照一照：当初想要的，后来还剩下多少。</p><div className="goal-grid">{goals.map((goal: Goal, i) => <button key={goal.id} className={`goal-card ${selected === goal.id ? 'selected' : ''}`} onClick={() => onSelect(goal.id)}><span className="goal-icon">{icons[i]}</span><div><h3>{goal.title}<small>{goal.seal}</small></h3><p>{goal.statement}</p><footer>{goal.hint}</footer></div><span className="goal-check">{selected === goal.id && <Check size={14} />}</span></button>)}</div><button className="primary-button start-button" disabled={!selected} onClick={onStart}><span>{selected ? '以此立志，进入第一日' : '先选一个志向'}</span><ArrowRight size={18} /></button><div className="prologue-note"><Sparkles size={13} /><span>志向默认私有。你可以在任何重大事件后改写它。</span></div>{onReset && <button className="prologue-reset" onClick={onReset}>重新立志 · 清空本地存档</button>}</div></div>
    </motion.div>
  )
}

export function DaySummary({ log, privateFunds, day, reckoning, onContinue }: { log: GameLog, privateFunds: number, day: number, reckoning: GoalReckoning | null, onContinue: () => void }) {
  const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  return (
    <motion.section className="overlay-backdrop summary-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
      <motion.div ref={dialogRef} className="day-summary" role="dialog" aria-modal="true" aria-labelledby="summary-title" tabIndex={-1} layoutId="overlay-paper" initial={{ opacity: 0, scale: reduceMotion ? 1 : .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
        <div className="summary-lamp" aria-hidden="true" />
        <div className="summary-heading">
          <div>
            <span className="eyebrow">第{dayNames[day - 1]}日 · 夜结算</span>
            <h2 id="summary-title">灯花结了，县衙还没有睡。</h2>
            <p>世界没有等你。你说过的、没说的，都有人各自记了一笔。</p>
          </div>
          <span className="summary-night-seal">更</span>
        </div>
        <div className="summary-ledger"><article><span>今日办成</span><h3>{log.done}</h3></article><article><span>卡在</span><h3>{log.stuck}</h3></article><article><span>有人在传</span><h3>{log.rumor}</h3></article></div>
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
