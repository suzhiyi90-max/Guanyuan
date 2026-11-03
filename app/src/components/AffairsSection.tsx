import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleDollarSign, Coins, FileSearch, Flag, Landmark, Layers, Link2, LockKeyhole, PackageOpen, Plus, RotateCcw, ScrollText, Stamp, UsersRound, Waves, X } from 'lucide-react'
import { nextCheckpointOf, periods, taskProgressOf, taskStageOf, type GameState } from '../game/useGame'
import { OfficeBoard } from './OfficeBoard'
import type { SectionId, TaskStage } from '../types'

const stages: Array<{ id: TaskStage; label: string; hint: string }> = [
  { id: '起', label: '起', hint: '接呈立案' },
  { id: '查', label: '查', hint: '问人看账' },
  { id: '谋', label: '谋', hint: '预演调度' },
  { id: '办', label: '办', hint: '签押执行' },
  { id: '验', label: '验', hint: '会勘复核' },
  { id: '结', label: '结', hint: '验收题销' },
]

const stageNotes: Record<TaskStage, string> = {
  起: '呈文已接到 先确认要办的是什么',
  查: '人证与账目互相印证 疑点仍须回到来源',
  谋: '主办与投入先在委牌预演 尚未签押',
  办: '签押之后由执行人与日程推进 发起不等于办成',
  验: '以覆勘与验收回报核对 不以投入代替结果',
  结: '题销与行状留存 结果仍带来长尾',
}

const worldClock = [
  { day: 2, when: '第二日 暮', label: '在途十垛到岸', detail: '若无人接收复秤，粮商会把它记成“已交”' },
  { day: 3, when: '第三日 午', label: '主簿来问旧册', detail: '查过旧册却不回话，他会先写自己的说法' },
  { day: 5, when: '第五日 夜', label: '河厅委员到县', detail: '程仪与会勘记录，决定他先听谁讲' },
  { day: 8, when: '第八至九日', label: '上游暴雨 洪峰至', detail: '抢护若未合式，东堤先替你作答' },
]
const clockDays = Array.from({ length: 10 }, (_, index) => index + 1)
const durationOffsets = Array.from({ length: 16 }, (_, index) => index)

type AffairsView = 'tasks' | 'tokens' | 'offices'

const affairsViews = [
  { id: 'tasks' as AffairsView, label: '事务盘', note: '进度与检查点' },
  { id: 'tokens' as AffairsView, label: '政令牌', note: 'M2 牌式预览' },
  { id: 'offices' as AffairsView, label: '六房值房', note: 'M2 案台预览' },
]

const policyTokens = [
  { id: 'relief', name: '以工代赈', seal: '赈', category: '赈济', action: '把赈济与河工编入同一件执行 Case', expiry: '随章立期 逾期须重新核验', cost: '粮料 夫役 后续验收责任', source: '事件 / 考语 / 章末结算' },
  { id: 'survey', name: '清丈', seal: '丈', category: '钱粮', action: '另起一段清丈核查 Case 不以牌面直接改账', expiry: '按核查期限生效 不永久留存', cost: '人手 文书 地方解释成本', source: '幕友 / 关系 / 事件' },
  { id: 'baojia', name: '保甲', seal: '甲', category: '治安', action: '进入编查与执行 Case 仍须逐项验收', expiry: '按章或季限时 逾期失效', cost: '编查人力 风评与执行风险', source: '考语 / 关系 / 章末结算' },
]

interface Props {
  state: GameState
  onOpenPlan: () => void
  onOpenEvidence: () => void
  onOpenReview: () => void
  onOpenEpilogue: () => void
  onNavigate: (section: SectionId) => void
  onGoRiver: () => void
}

export function AffairsSection({ state, onOpenPlan, onOpenEvidence, onOpenReview, onOpenEpilogue, onNavigate, onGoRiver }: Props) {
  const stage = taskStageOf(state)
  const progress = taskProgressOf(state)
  const checkpoint = nextCheckpointOf(state)
  const stageIndex = stages.findIndex(item => item.id === stage)
  const plan = state.plan
  const evidenceCount = state.unlocked.filter(id => ['E-001', 'E-002', 'E-003'].includes(id)).length
  const [inspectedStage, setInspectedStage] = useState<TaskStage | null>(null)
  const inspected = stages.find(item => item.id === (inspectedStage ?? stage)) ?? stages[0]
  const inspectedIndex = stages.findIndex(item => item.id === inspected.id)
  const inspectionState = inspectedIndex < stageIndex ? '已经走过' : inspectedIndex === stageIndex ? '当前所在' : '尚未到此'
  const reduceMotion = useReducedMotion()
  const [view, setView] = useState<AffairsView>('tasks')
  const [selectedTokenId, setSelectedTokenId] = useState(policyTokens[0].id)
  const [tokenBack, setTokenBack] = useState(false)
  const [comparedTokens, setComparedTokens] = useState<string[]>([])
  const [inspectedClockDay, setInspectedClockDay] = useState(state.day)
  const selectedToken = policyTokens.find(item => item.id === selectedTokenId) ?? policyTokens[0]
  const selectedWorldClock = worldClock.find(item => item.day === inspectedClockDay) ?? null
  const clockClues = state.clues.filter(clue => clue.day === inspectedClockDay)
  const clockState = inspectedClockDay < state.day ? '已过' : inspectedClockDay === state.day ? '今日' : '未到'
  const planPeriodIndex = plan ? periods.indexOf(plan.period) : 0
  const elapsedPeriods = plan ? Math.max(0, (state.day - plan.day) * 4 + state.periodIndex - planPeriodIndex) : 0
  const outcomePeriod = state.outcome && plan ? (state.outcome.day - plan.day) * 4 - planPeriodIndex : -1
  useEffect(() => setInspectedClockDay(state.day), [state.day])

  const selectToken = (id: string) => {
    setSelectedTokenId(id)
    setTokenBack(false)
  }
  const toggleComparedToken = (id: string) => {
    setComparedTokens(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 2 ? [...current, id] : current)
  }
  const moveComparedToken = (index: number, direction: -1 | 1) => {
    setComparedTokens(current => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }
  const handleViewKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = affairsViews.findIndex(item => item.id === view)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % affairsViews.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + affairsViews.length) % affairsViews.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = affairsViews.length - 1
    else return
    event.preventDefault()
    const nextView = affairsViews[next].id
    setView(nextView)
    document.getElementById(`affairs-tab-${nextView}`)?.focus()
  }

  return (
    <motion.section className="content-section affairs-section" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .24, ease: 'easeOut' }}>
      <header className="section-heading">
        <div>
          <span className="eyebrow">事务 / 你签过字的 都在往前走</span>
          <h1>发起不是办成。</h1>
          <p>抢护有自己的日程 人情与账目也是 这里只看进度与检查点 不替你宣布结果</p>
        </div>
        <div className="section-stat"><b>{state.day}</b><span>第 {state.day} 日 / 洪峰第九日</span></div>
      </header>

      <div className="section-subtabs affairs-view-tabs" role="tablist" aria-label="事务工作面" onKeyDown={handleViewKeys}>
        {affairsViews.map(item => <button key={item.id} id={`affairs-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`affairs-panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)}>
          {view === item.id && <motion.span className="section-subtab-ink" layoutId="affairs-view-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 410, damping: 35 }} aria-hidden="true" />}
          <span>{item.label}</span><small>{item.note}</small>
        </button>)}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'tasks' ? <motion.div key="tasks" id="affairs-panel-tasks" role="tabpanel" aria-labelledby="affairs-tab-tasks" className="affairs-view-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
      <div className="affairs-layout">
        <section className="task-board">
          <header className="task-board-head">
            <div>
              <span className="eyebrow">案 001 · 东堤险工</span>
              <h2>东堤抢护</h2>
            </div>
            <span className={`task-state ${plan ? 'is-running' : ''}`}>{plan ? '执行中' : '未发起'}</span>
          </header>

          <div className="stage-track" aria-label={`当前阶段 ${stage}`}>
            {stages.map((item, index) => {
              const selected = inspected.id === item.id
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  className={`stage-node ${index === stageIndex ? 'active' : ''} ${index < stageIndex ? 'passed' : ''} ${selected ? 'is-inspected' : ''}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .05, duration: .22 }}
                  onClick={() => setInspectedStage(item.id)}
                  aria-pressed={selected}
                  aria-current={index === stageIndex ? 'step' : undefined}
                  whileTap={{ scale: .97 }}
                >
                  {selected && <motion.span className="stage-inspect-ink" layoutId="affairs-stage-inspect" transition={{ type: 'spring', stiffness: 390, damping: 34 }} aria-hidden="true" />}
                  <span className="stage-seal">{index < stageIndex ? <Check size={13} /> : item.label}</span>
                  <b>{item.hint}</b>
                  {index < stages.length - 1 && <i />}
                </motion.button>
              )
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="stage-inspector" key={inspected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .17 }} aria-live="polite">
              <span>{inspected.label}</span>
              <div><small>{inspectionState} · 阶段查验</small><b>{inspected.hint}</b></div>
              <p>{stageNotes[inspected.id]}</p>
            </motion.div>
          </AnimatePresence>

          {plan ? (
            <motion.div className="task-running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .18 }}>
              <section className="task-duration-lane" aria-label={`抢护于第${plan.day}日${plan.period}发起，执行三至四日`}>
                <header><div><span>长动作时段带</span><b>第{plan.day}日{plan.period}发起</b></div><small>执行 3–4 日 · 第{plan.day + 3}日起验收</small></header>
                <div className="duration-periods" aria-hidden="true">{durationOffsets.map(offset => {
                  const absolute = planPeriodIndex + offset
                  const day = plan.day + Math.floor(absolute / 4)
                  const period = periods[absolute % 4]
                  const passed = offset < elapsedPeriods
                  const current = offset === elapsedPeriods && !state.outcome
                  const outcome = offset === outcomePeriod
                  return <span key={offset} className={`${passed ? 'passed' : ''} ${current ? 'current' : ''} ${outcome ? 'is-outcome' : ''}`} title={`第${day}日${period}`}><i /><small>{period}</small>{offset % 4 === 0 && <b>第{day}日</b>}{outcome && <em>验</em>}</span>
                })}</div>
                <footer><span>发起占用本时段</span><span>后续由执行人与日程推进</span><span>验收以原结果为准</span></footer>
              </section>
              <div className="task-progress">
                <div className="task-progress-head"><span>抢护进度 · 据回报估算</span><b>{progress}<small>%</small></b></div>
                <div className="task-progress-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: .8, ease: 'easeOut' }} /></div>
                <small>进度来自工头回报与时段推进 不等于堤已安全</small>
              </div>
              <div className="task-facts">
                <article><UsersRound size={16} /><div><span>主办</span><b>{plan.leaderName}</b><small>{plan.supervisor}</small></div></article>
                <article><PackageOpen size={16} /><div><span>已拨料</span><b>{plan.material} 垛</b><small>到场三十垛内实拨</small></div></article>
                <article><Flag size={16} /><div><span>夫役</span><b>{plan.labor} 人</b><small>堡夫二十 河兵五 余者雇募</small></div></article>
                <article><Coins size={16} /><div><span>夫食</span><b>25 两</b><small>保正具结已入发起文书</small></div></article>
              </div>
              <div className="task-checkpoint">
                <CalendarClock size={17} />
                <div><span>下一检查点 · {checkpoint.when}</span><p>{checkpoint.label}</p></div>
              </div>
              {state.outcome && (
                <motion.div className={`task-outcome grade-${state.outcome.grade}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="outcome-head"><span>第{state.outcome.day}日 验收</span><b>{state.outcome.grade}</b></div>
                  <p>{state.outcome.symptom}</p>
                  <div className="outcome-factors">
                    {state.outcome.factors.map(f => <p key={f.label + f.detail} className={`tone-${f.tone}`}><i>{f.label}</i>{f.detail}</p>)}
                  </div>
                </motion.div>
              )}
              <div className="task-actions">
                <button className="outline-button" onClick={onGoRiver}><Waves size={16} />去东堤看现场<ArrowRight size={15} /></button>
                <button className="text-link" onClick={onOpenPlan}><Stamp size={14} />回看签押底稿</button>
              </div>
              {state.day >= 10 && <button className="primary-button epilogue-entry" onClick={onOpenEpilogue}><ScrollText size={16} />验收题销 · 章末尾声<ArrowRight size={16} /></button>}
            </motion.div>
          ) : (
            <div className="task-idle">
              <p>尚未签押。阶段停在「{stage}」——{stage === '起' ? '先读呈文 再决定问谁' : stage === '查' ? '疑点已在手 可以预演调度' : '人已托定 只欠一道签押'}</p>
              <button className="primary-button" onClick={onOpenPlan}><Stamp size={16} />{stage === '谋' ? '回到委托预演' : '预演抢护调度'}<ArrowRight size={16} /></button>
            </div>
          )}
        </section>

        <aside className="affairs-side">
          <section className="thread-list">
            <header><h3>同时在走的几条线</h3><span>点开即回到来源</span></header>
            <button onClick={onOpenReview}>
              <Landmark size={16} />
              <div><b>上宪来文 · 知府批</b><small>{state.officialActions.length ? `已行 ${state.officialActions.length} 项 批语与动作在卷` : '委员覆勘 料价再核 尚未应答'}</small></div>
              <ArrowRight size={14} />
            </button>
            <button onClick={() => onNavigate('cases')}>
              <FileSearch size={16} />
              <div><b>东堤呈文两版对勘</b><small>{state.comparisons.some(c => c.source === 'document') ? '疑点已记 待问书办' : '尚未并置差异'}</small></div>
              <ArrowRight size={14} />
            </button>
            <button onClick={onOpenEvidence}>
              <Link2 size={16} />
              <div><b>同一笔三百两</b><small>证据 {evidenceCount} / 3 · {evidenceCount === 3 ? '三件已齐 可以并置' : '借领状与旧欠票据未齐'}</small></div>
              <ArrowRight size={14} />
            </button>
            <button onClick={() => onNavigate('life')}>
              <CircleDollarSign size={16} />
              <div><b>桑宅人情与私囊</b><small>{state.giftEntries.length ? `${state.giftEntries.length} 笔已入礼簿` : '接风帖仍在案角'}</small></div>
              <ArrowRight size={14} />
            </button>
          </section>

          <section className="world-clock">
            <header><h3>十日世界时钟</h3><span>若你不管 世界也会变</span></header>
            <div className="world-day-rail" role="group" aria-label="点选十日日程查验">{clockDays.map(day => {
              const selected = day === inspectedClockDay
              const current = day === state.day
              const hasEvent = worldClock.some(item => item.day === day)
              const hasTrace = plan?.day === day || state.outcome?.day === day || state.clues.some(clue => clue.day === day)
              return <button type="button" key={day} className={`${selected ? 'selected' : ''} ${current ? 'current' : ''} ${day < state.day ? 'passed' : ''}`} aria-pressed={selected} aria-current={current ? 'date' : undefined} onClick={() => setInspectedClockDay(day)} aria-label={`查验第${day}日`}>
                {selected && <motion.span className="world-day-ink" layoutId="world-day-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} aria-hidden="true" />}
                <span>{String(day).padStart(2, '0')}</span><i className={hasEvent ? 'has-event' : hasTrace ? 'has-trace' : ''} />
              </button>
            })}</div>
            <div className="world-day-legend"><span><i className="has-event" />公开节点</span><span><i className="has-trace" />本局留痕</span><small>当前第{state.day}日</small></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.article className="world-day-inspector" key={inspectedClockDay} initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }} aria-live="polite">
                <header><span>第{inspectedClockDay}日 · 日程查验</span><b>{clockState}</b></header>
                {selectedWorldClock ? <><h4>{selectedWorldClock.label}</h4><p>{selectedWorldClock.detail}</p><small>{selectedWorldClock.when} · 公开世界时钟</small></> : <><h4>无公开日程节点</h4><p>这一天没有额外世界时钟说明，不补写事件。</p></>}
                <div className="world-day-traces">
                  {plan?.day === inspectedClockDay && <span>抢护 · 第{plan.day}日{plan.period}签押</span>}
                  {clockClues.length > 0 && <span>疑点 · 当日留下 {clockClues.length} 条</span>}
                  {state.outcome?.day === inspectedClockDay && <span>验收 · {state.outcome.grade}已入卷</span>}
                  {plan?.day !== inspectedClockDay && clockClues.length === 0 && state.outcome?.day !== inspectedClockDay && <small>本局此日无可回看的留痕</small>}
                </div>
              </motion.article>
            </AnimatePresence>
          </section>
        </aside>
      </div>
        </motion.div> : view === 'tokens' ? <motion.div key="tokens" id="affairs-panel-tokens" role="tabpanel" aria-labelledby="affairs-tab-tokens" className="affairs-view-panel policy-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
          <div className="policy-workspace-grid">
            <section className="policy-rack-section">
              <header className="policy-section-head"><div><span className="eyebrow">S-16 / 牌票而非稀有卡</span><h2>政令样牌</h2></div><span>牌式 03 · 实得 00</span></header>
              <div className="policy-rack" aria-label="政令样牌架">
                {policyTokens.map((item, index) => {
                  const selected = selectedToken.id === item.id
                  return <motion.button layout key={item.id} type="button" className={`policy-wood-token ${selected ? 'selected' : ''}`} onClick={() => selectToken(item.id)} aria-pressed={selected} aria-label={`查验${item.name}牌式`} initial={{ opacity: 0, y: reduceMotion ? 0 : 20, rotate: reduceMotion ? 0 : index - 1 }} animate={{ opacity: 1, y: selected && !reduceMotion ? -8 : 0, rotate: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 10 }} transition={{ duration: reduceMotion ? 0 : .28, delay: reduceMotion ? 0 : index * .06 }} whileTap={{ scale: .98 }}>
                    {selected && <motion.span className="policy-pull-ink" layoutId="policy-pull-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 370, damping: 32 }} aria-hidden="true" />}
                    <span className="wood-token-top"><small>牌式 · 未入囊中</small><i>{String(index + 1).padStart(2, '0')}</i></span>
                    <b>{item.name}</b>
                    <span className="wood-token-category">{item.category} / 执行 Case</span>
                    <span className="wood-token-seal" aria-hidden="true">{item.seal}</span>
                  </motion.button>
                })}
              </div>
              <div className="policy-source-note"><LockKeyhole size={15} /><p><b>只能挣得 不抽取 不购买</b><span>当前没有正式政令解锁记录 木牌只展示将来牌式与查验方式</span></p></div>
            </section>

            <section className="policy-inspector" aria-label="政令牌查验">
              <header className="policy-section-head"><div><span className="eyebrow">抽出一牌 / 正背对勘</span><h2>{selectedToken.name}</h2></div><span>{tokenBack ? '背面' : '正面'}</span></header>
              <div className="policy-flip-window" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div className={`policy-flip-card ${tokenBack ? 'is-back' : ''}`} key={`${selectedToken.id}-${tokenBack ? 'back' : 'front'}`} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : -24, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={{ opacity: 0, rotateY: reduceMotion ? 0 : 18, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
                    {!tokenBack ? <>
                      <span className="policy-face-kicker">永济县 · 政令样牌</span>
                      <b>{selectedToken.name}</b>
                      <p>不是瞬时增益<br />打出后仍须进入执行 Case</p>
                      <span className="policy-face-seal">{selectedToken.seal}</span>
                      <small>制度牌式 · 具体适用期待史实核验</small>
                    </> : <dl>
                      <div><dt>能做什么</dt><dd>{selectedToken.action}</dd></div>
                      <div><dt>何时失效</dt><dd>{selectedToken.expiry}</dd></div>
                      <div><dt>代价</dt><dd>{selectedToken.cost}</dd></div>
                      <div><dt>来源</dt><dd>{selectedToken.source}</dd></div>
                    </dl>}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="policy-inspector-actions">
                <button className="outline-button policy-flip-button" onClick={() => setTokenBack(current => !current)} aria-pressed={tokenBack}><RotateCcw size={15} />{tokenBack ? '翻回牌面' : '翻面查验'}</button>
                <button className="primary-button" onClick={() => toggleComparedToken(selectedToken.id)} disabled={comparedTokens.length >= 2 && !comparedTokens.includes(selectedToken.id)}>{comparedTokens.includes(selectedToken.id) ? <X size={15} /> : <Plus size={15} />}{comparedTokens.includes(selectedToken.id) ? '移出并置' : '收入并置'}</button>
              </div>
            </section>
          </div>

          <section className="policy-comparison">
            <header><div><Layers size={16} /><h3>并置牌案</h3></div><span>本地排序 · 最多两张</span></header>
            {comparedTokens.length ? <div className="policy-compare-slots"><AnimatePresence initial={false}>{comparedTokens.map((id, index) => {
              const item = policyTokens.find(token => token.id === id)!
              return <motion.article layout key={id} initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : .95 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
                <span className="policy-compare-order">{String(index + 1).padStart(2, '0')}</span>
                <div><b>{item.name}</b><small>{item.cost}</small></div>
                <div className="policy-compare-controls">
                  <button onClick={() => moveComparedToken(index, -1)} disabled={index === 0} aria-label={`前移${item.name}`}><ArrowLeft size={14} /></button>
                  <button onClick={() => moveComparedToken(index, 1)} disabled={index === comparedTokens.length - 1} aria-label={`后移${item.name}`}><ArrowRight size={14} /></button>
                  <button onClick={() => toggleComparedToken(id)} aria-label={`移出${item.name}`}><X size={14} /></button>
                </div>
              </motion.article>
            })}</AnimatePresence></div> : <div className="policy-compare-empty">从木牌架抽取一牌 再收入并置<br /><span>这里只核对先后与代价 不合成增益</span></div>}
            <footer><Stamp size={14} /><span>预览不打牌 不耗时段 不发起政令 不写入事务存档</span></footer>
          </section>
        </motion.div> : <motion.div key="offices" id="affairs-panel-offices" role="tabpanel" aria-labelledby="affairs-tab-offices" className="affairs-view-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -10 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
          <OfficeBoard state={state} onOpenPlan={onOpenPlan} onOpenEvidence={onOpenEvidence} onOpenReview={onOpenReview} onNavigate={onNavigate} onGoRiver={onGoRiver} />
        </motion.div>}
      </AnimatePresence>
    </motion.section>
  )
}
