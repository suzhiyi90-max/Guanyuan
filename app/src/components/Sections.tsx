import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookMarked, BookOpen, Check, ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Coffee, DoorClosed, EyeOff, FileSearch, Gift, Home, Landmark, Library, Link2, LockKeyhole, MapPin, MessageCircle, PackageOpen, Printer, Scale, UserRound, Utensils } from 'lucide-react'
import { fixedEvents, ledgerRows, ledgerThree, people } from '../data'
import { streetStations, type StreetStationId } from '../city'
import { AnimatedNumber } from './AnimatedNumber'
import { Portrait } from './Portrait'
import { AudienceEchoPanel, ImpressionSlips, PowerBrief } from './PowerLedger'
import { RuleChip } from './RuleBook'
import { OutcomeSlip } from './CausalityPaper'
import { StreetScene } from './StreetScene'
import { readView, useViewMemory } from '../viewMemory'
import { TodayDocket } from './TodayDocket'
import { FirstRunSlip } from './FirstRun'
import { RecentlyRead, type RecentSpot } from './RecentlyRead'
import { ReadAcross, type ReadAcrossTarget } from './ReadAcross'
import { LastReviewChip } from './LastReviewChip'
import { RumorTrail } from './RumorTrail'
import { PlaceTrail } from './PlaceTrail'
import { FolioProgress, FolioSlip } from './FolioSlip'
import { FolioIndex } from './FolioIndex'
import { FolioHead } from './FolioHead'
import { recordFolioVisit, type FolioKey } from '../folioIndex'
import { originLabels, type ReviewOrigin } from '../reviewTrail'
import { handleFolioReturnKey, isFolioReturnKey, returnToDeskTop } from '../folioReturn'
import { SurfaceColophon } from './SurfaceColophon'
import { printSurface } from '../printSurface'
import { type PlaceId } from '../placeTrail'
import type { FocusTarget } from '../focusContext'
import { ScenePlate } from './ScenePlate'
import { GateNote } from './StreetScene'
import { DecencyLine } from './DecencyLine'
import { GrowthPreview } from './GrowthPreview'
import { revealDepthOf, sharedHistoryOf, specialtyOf } from '../game/people'
import type { GameState } from '../game/useGame'
import type { PowerContext, PowerHandlers } from '../power'
import type { GameLog, Period, SceneId } from '../types'

const deskSections = [
  { id: 'urgent', label: '急务' },
  { id: 'docket', label: '待决' },
  { id: 'calendar', label: '日程' },
  { id: 'log', label: '日志' },
] as const

export function TodayAside({ day, onOpenDoc, onOpenPlan, onOpenBanquet, onOpenAffairs, onOpenReview, pendingEventTitle, onOpenWorld, reviewAvailable, reviewPending, cluesCount, taskStarted, period, log, state, scene, handlers, onOpenPower, onOpenCausality, onLocateWorldDay, onLocateLog, idPrefix = 'main', withDeskIndex = false, guideOpen = false, onGuideDismiss, recentSpots, onRecentJump, onGuidePoint, onGuideReplay, onOpenRumor, onOpenPlace, epiloguePage, onOpenEpiloguePage, reviewOrigin, onBackReviewOrigin, reviewMarks, onOpenFolio, onAwaitInk, narrativeReady = false, narrativeEnabled = false }: { day: number, onOpenDoc: () => void, onOpenPlan: () => void, onOpenBanquet: () => void, onOpenAffairs: () => void, onOpenReview: () => void, pendingEventTitle: string | null, onOpenWorld: () => void, reviewAvailable: boolean, reviewPending: boolean, cluesCount: number, taskStarted: boolean, period: Period, log: GameLog, state: GameState, scene: SceneId, handlers?: PowerHandlers, onOpenPower: () => void, onOpenCausality: () => void, onLocateWorldDay?: (day: number) => void, onLocateLog?: (kind: 'affairs' | 'document' | 'intel') => void, idPrefix?: string, withDeskIndex?: boolean, guideOpen?: boolean, onGuideDismiss?: () => void, recentSpots?: RecentSpot[], onRecentJump?: (spot: RecentSpot) => void, onGuidePoint?: (target: FocusTarget) => void, onGuideReplay?: () => void, onOpenRumor?: (target: 'street' | 'intel') => void, onOpenPlace?: (id: PlaceId) => void, epiloguePage?: number, onOpenEpiloguePage?: () => void, reviewOrigin?: ReviewOrigin, onBackReviewOrigin?: () => void, reviewMarks?: PlaceId[], onOpenFolio?: (key: FolioKey) => void, onAwaitInk?: () => void, narrativeReady?: boolean, narrativeEnabled?: boolean }) {
  // 场合决定有效身份：在签押房是正印官，在东堤是河工主持人，在夜书房只是私第里的官。
  const powerContext: PowerContext = scene === 'river' ? 'river' : scene === 'study' ? 'study' : 'seat'
  const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const reduceMotion = useReducedMotion()
  const [inspectedDay, setInspectedDay] = useState(day)
  const [deskSection, setDeskSection] = useState<string>('urgent')
  const deskAsideRef = useRef<HTMLElement | null>(null)
  const deskLock = useRef(0)
  useEffect(() => setInspectedDay(day), [day])
  // FE-069：掌上案头四签，只做卷内跳转与当前段反查，不新增待办、不推进时段。
  useEffect(() => {
    // FE-088：掌上在抽屉滚，桌面就在案头这一栏滚；同一套四签，两份纸面同源。
    const scroller = deskAsideRef.current?.closest('.drawer-scroll') ?? deskAsideRef.current
    if (!(scroller instanceof HTMLElement)) return
    let frame = 0
    const read = () => {
      frame = 0
      if (Date.now() < deskLock.current) return
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 6) { setDeskSection('log'); return }
      const top = scroller.getBoundingClientRect().top + 64
      let current: string = deskSections[0].id
      deskSections.forEach(item => {
        const node = document.getElementById(`${idPrefix}-anchor-${item.id}`)
        if (node && node.getBoundingClientRect().top <= top) current = item.id
      })
      setDeskSection(current)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(read) }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    read()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [withDeskIndex, idPrefix])
  const deskJump = (id: string) => {
    setDeskSection(id)
    deskLock.current = Date.now() + 1000
    document.getElementById(`${idPrefix}-anchor-${id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
  const inspectedEvent = fixedEvents.find(event => event.day === inspectedDay) ?? fixedEvents[0]
  const inspectedState = inspectedDay < day ? '已过' : inspectedDay === day ? '今日' : '未到'
  return (
    <aside className="today-aside" ref={deskAsideRef} data-desk-active={deskSection}>
      {<nav className="desk-index" aria-label={idPrefix === 'main' ? '案头四签' : '掌上案头四签'}>
        <span>{idPrefix === 'main' ? '四签' : '掌上案头'}</span>
        {deskSections.map(item => <button key={item.id} type="button" className={deskSection === item.id ? 'is-current' : ''} aria-pressed={deskSection === item.id} onClick={() => deskJump(item.id)}>{item.label}</button>)}
      </nav>}
      <div className="aside-topline"><span>今日案头</span><small>第{dayNames[day - 1]}日 / 东堤险工</small></div>
      {guideOpen && onGuideDismiss && <FirstRunSlip onDismiss={onGuideDismiss} onPoint={withDeskIndex ? undefined : onGuidePoint} />}
      <section className="urgent-paper" id={`${idPrefix}-anchor-urgent`} data-desk-section="urgent">
        <div className="paper-pin" />
        <div className="urgent-heading"><span className="case-number">案 · 001</span><span className="danger-label">汛前急务</span></div>
        <h2>东堤渗水</h2><p>旧闸下游四十步。书办说培土即可，河工幕友却请你看闸底。</p>
        <div className="case-progress"><div><span>查</span><i className="active" /><i className={cluesCount ? 'active' : ''} /><i className={taskStarted ? 'active' : ''} /><i /></div><small>{taskStarted ? '抢护已发起，待勘验' : cluesCount ? '疑点已记，下一步可谋抢护' : '读呈、问人、对勘，再决定托谁'}</small></div>
        <button className="paper-action" onClick={onOpenDoc}><FileSearch size={17} /><span>展开呈文</span><ChevronRight size={17} /></button>
        <button className="paper-action secondary" onClick={onOpenPlan}><PackageOpen size={17} /><span>{taskStarted ? '查看抢护委托' : '预演抢护调度'}</span><ChevronRight size={17} /></button>
        <button className="paper-action secondary" onClick={onOpenAffairs}><ClipboardList size={17} /><span>{taskStarted ? '事务 · 抢护执行与检查点' : '事务 · 几条线同时在走'}</span><ChevronRight size={17} /></button>
      </section>
      <div id={`${idPrefix}-anchor-docket`} data-desk-section="docket"><TodayDocket state={state} handlers={{ onOpenDoc, onOpenReview, onOpenPlan, onOpenBanquet, onOpenAffairs }} /></div>
      <OutcomeSlip state={state} onOpen={onOpenCausality} />
      <PowerBrief key={powerContext} state={state} context={powerContext} handlers={handlers} onOpen={onOpenPower} />
      {pendingEventTitle && <motion.section className="official-letter is-world" onClick={onOpenWorld} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenWorld()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className="official-seal">报</span>
        <div><span>{pendingEventTitle}</span><p>有一件未决的事 · 点开再定 不会自动推进</p></div>
        <ChevronRight size={16} />
        <i className="official-dot" />
      </motion.section>}
      {reviewAvailable && <motion.section className="official-letter" onClick={onOpenReview} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenReview()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24 }}>
        <span className="official-seal">查</span>
        <div><span>上宪来文</span><p>知府批 · 委员覆勘 料价再核</p></div>
        <ChevronRight size={16} />
        {reviewPending && <i className="official-dot" />}
      </motion.section>}
      {onAwaitInk && <motion.section className={`official-letter is-narration ${narrativeReady ? 'is-ready' : ''}`} onClick={onAwaitInk} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onAwaitInk()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .24 }} aria-label={narrativeReady ? '候一笔新的叙述' : '备笔 · 开启 AI 叙事'}>
        <span className="official-seal">笔</span>
        <div><span>{narrativeReady ? '案上候墨' : '叙事笔墨 · 未备'}</span><p>{narrativeReady ? '模型只写叙述 · 判定与存档仍在本地' : narrativeEnabled ? '已开 · 尚未填钥匙 点开即备' : '可选的一支笔 · 不开也完全照旧可玩'}</p></div>
        <ChevronRight size={16} />
        {narrativeReady && <i className="official-dot" />}
      </motion.section>}
      <section className="event-invitation" onClick={onOpenBanquet} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenBanquet()}>
        <div className="invitation-mark">夜</div><div><span>桑宅接风帖</span><p>{period === '夜' ? '灯已点上，今夜须作个取舍' : '今夜 · 私囊、人情与旧欠'}</p></div><ChevronRight size={16} />
      </section>
      <section className="flood-calendar" id={`${idPrefix}-anchor-calendar`} data-desk-section="calendar"><header><h3>一汛日程</h3><span>{day >= 9 ? '洪峰已至' : `距洪峰 ${9 - day} 日`}</span></header>{fixedEvents.map(event => {
        const current = event.day === day
        const passed = event.day < day
        const inspected = event.day === inspectedDay
        return <button type="button" className={`calendar-row ${current ? 'active' : ''} ${passed ? 'passed' : ''} ${inspected ? 'is-inspected' : ''}`} aria-current={current ? 'date' : undefined} aria-pressed={inspected} onClick={() => setInspectedDay(event.day)} key={event.day}>
          {current && <motion.span className="calendar-current-ink" layoutId="calendar-current-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 32 }} aria-hidden="true" />}
          <span className="day-number">{String(event.day).padStart(2, '0')}</span>
          <div><b>{event.label}</b><small>{passed ? '已过 · ' : current ? '今日 · ' : ''}{event.detail}</small></div>
        </button>
      })}
        <AnimatePresence mode="wait" initial={false}>
          <motion.article className="calendar-inspector" key={inspectedDay} initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : .18 }} aria-live="polite">
            <header><span>第{dayNames[inspectedDay - 1]}日 · 日程查验</span><b>{inspectedState}</b></header>
            <h4>{inspectedEvent.label}</h4><p>{inspectedEvent.detail}</p>
            <small>{inspectedState === '已过' ? '只回看公开日程 不补写当日本局结果' : inspectedState === '今日' ? '当前节点 · 事件仍按原流程等待处理' : '公开日程预告 · 不提前生成本局事件'}</small>
            {onLocateWorldDay && <button type="button" className="text-link calendar-clock-link" onClick={() => onLocateWorldDay(inspectedDay)}>十日世界时钟 · 看第{dayNames[inspectedDay - 1]}日<ArrowRight size={12} /></button>}
          </motion.article>
        </AnimatePresence>
      </section>
      {recentSpots && onRecentJump && <RecentlyRead items={recentSpots} onJump={onRecentJump} />}
      {!guideOpen && onGuideReplay && <button type="button" className="guide-replay" onClick={onGuideReplay}>再看一遍 · 三件事</button>}
      <section className="three-line-log" data-focus-id="today-log" id={`${idPrefix}-anchor-log`} data-desk-section="log" data-three-lines="true"><header><h3>三行日志</h3><span>被世界记住的</span></header><p><b>成</b>{log.done}{onLocateLog && <FolioSlip className="log-locate" compact label="回事务盘" onClick={() => onLocateLog('affairs')} />}</p><p><b>卡</b>{log.stuck}{onLocateLog && <FolioSlip className="log-locate" compact label="回案卷" onClick={() => onLocateLog('document')} />}</p><p><b>传</b>{log.rumor}{onLocateLog && <FolioSlip className="log-locate" compact label="回情报台账" onClick={() => onLocateLog('intel')} />}</p></section>
      <RumorTrail variant="chip" rumor={log.rumor} onOpen={onOpenRumor} />
      <PlaceTrail variant="line" current={scene === 'county' ? 'county' : scene === 'river' ? 'river' : 'study'} limit={5} onOpen={onOpenPlace} reviewMarks={reviewMarks} collapsible />
      {onOpenEpiloguePage && <>
        <SurfaceColophon surface="今日案头" note="回卷首只移焦点，不改当日进度。" className="desk-colophon" onReturn={returnToDeskTop} />
        <div className="desk-folio-row" onKeyDown={event => { if (isFolioReturnKey(event)) { event.preventDefault(); returnToDeskTop(event.currentTarget) } }}>
          <FolioHead label="今日案头" total={4} compact showBorrow />
          <FolioProgress index={epiloguePage ?? 4} total={4} label="章末四页" onOpen={onOpenEpiloguePage} />
          {reviewOrigin && onBackReviewOrigin && <FolioSlip compact mark="来" label="批阅来处" detail={originLabels[reviewOrigin]} onClick={onBackReviewOrigin} />}
        </div>
      </>}
      {onOpenFolio && <FolioIndex variant="full" onOpen={onOpenFolio} />}
    </aside>
  )
}

type PeopleView = 'roster' | 'network' | 'collection' | 'growth'
type CollectionVolume = 'contemporary' | 'past'

const peopleViews = [
  { id: 'roster' as PeopleView, label: '名册', note: '七人与接触' },
  { id: 'network' as PeopleView, label: '关系谱', note: '接触有迹可循' },
  { id: 'collection' as PeopleView, label: '图鉴', note: '两册与行状' },
  { id: 'growth' as PeopleView, label: '成长 · 预览', note: '规则未启用 · 仅预览' },
]
const networkPositions = [
  { x: 180, y: 126 }, { x: 500, y: 74 }, { x: 820, y: 126 },
  { x: 170, y: 424 }, { x: 500, y: 486 }, { x: 830, y: 424 },
]
const collectionVolumes = [
  { id: 'contemporary' as CollectionVolume, label: '当世人杰册', note: '亲历与共事' },
  { id: 'past' as CollectionVolume, label: '前代名臣册', note: '著作与师承' },
]

export function PeopleSection({ state, onSelect, onOpenDebt, onOpenDebtFor, focusRequest }: { state: GameState, onSelect: (id: string) => void, onOpenDebt?: () => void, onOpenDebtFor?: (id: string) => void, focusRequest?: { id?: string, view?: 'network', version: number } | null }) {
  const working = people.filter(person => revealDepthOf(person.id, state) === '共事').length
  const known = people.filter(person => state.asked.includes(person.id)).length
  const reduceMotion = useReducedMotion()
  const [view, setView] = useViewMemory<PeopleView>('people-view', 'roster')
  // FE-090：谱面查验人、图鉴卷次与名册选中只存会话内记忆，回跳与再入不丢焦点。
  const [volume, setVolume] = useViewMemory<CollectionVolume>('people-collection-volume', 'contemporary')
  const [bookOpen, setBookOpen] = useState(true)
  const [selectedId, setSelectedId] = useViewMemory<string>('people-roster-focus', people[0].id)
  const [networkId, setNetworkId] = useViewMemory<string>('people-network-focus', people[0].id)
  // FE-126：谱面聚光只存会话内悬停 / 焦点，不写记忆、不改查验人以外任何状态。
  const [spotlight, setSpotlight] = useState<string | null>(null)
  const networkNodes = useRef<Array<HTMLButtonElement | null>>([])
  const networkPerson = people.find(person => person.id === networkId) ?? people[0]
  const networkDepth = revealDepthOf(networkPerson.id, state)
  const networkHistory = sharedHistoryOf(networkPerson.id, state)
  const networkTokens = networkPerson.tokens
  const networkTokenTotal = networkTokens.owesYou + networkTokens.youOwe + networkTokens.hook
  const selectedPerson = people.find(person => person.id === selectedId) ?? people[0]
  const selectedDepth = revealDepthOf(selectedPerson.id, state)
  const selectedHistory = sharedHistoryOf(selectedPerson.id, state)
  const selectedSpecialty = specialtyOf(selectedPerson)

  // FE-064：谱面点选只换查验人；窄屏（谱与右栏上下叠）顺势把右栏纸签带入视野。
  const inspectNetworkNode = (id: string) => {
    setNetworkId(id)
    if (!window.matchMedia('(max-width: 1220px)').matches) return
    window.setTimeout(() => document.querySelector('.network-inspector')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 80)
  }

  // FE-126：谱面只留一个 Tab 停靠，其余按方位移动。仍只换查验人，不改任何判定。
  const stepNetworkFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const current = Math.max(0, people.findIndex(person => person.id === networkId))
    let next = current
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = people.length - 1
    else {
      const origin = networkPositions[current]
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
      let best = -1
      let bestScore = Number.POSITIVE_INFINITY
      people.forEach((person, index) => {
        if (index === current) return
        const point = networkPositions[index]
        const primary = (horizontal ? point.x - origin.x : point.y - origin.y)
        if (Math.sign(primary) !== direction) return
        const secondary = Math.abs(horizontal ? point.y - origin.y : point.x - origin.x)
        const score = Math.abs(primary) + secondary * 2.2
        if (score < bestScore) { bestScore = score; best = index }
      })
      if (best < 0) return
      next = best
    }
    event.preventDefault()
    inspectNetworkNode(people[next].id)
    requestAnimationFrame(() => networkNodes.current[next]?.focus())
  }

  // FE-064：从人情簿回谱只换工作面与选中人，不动接触深度与名目。
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.view) setView(focusRequest.view)
    if (focusRequest.id) setNetworkId(focusRequest.id)
  }, [focusRequest])

  const handleViewKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = peopleViews.findIndex(item => item.id === view)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % peopleViews.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + peopleViews.length) % peopleViews.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = peopleViews.length - 1
    else return
    event.preventDefault()
    const nextView = peopleViews[next].id
    setView(nextView)
    document.getElementById(`people-tab-${nextView}`)?.focus()
  }
  const handleVolumeKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = collectionVolumes.findIndex(item => item.id === volume)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % collectionVolumes.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + collectionVolumes.length) % collectionVolumes.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = collectionVolumes.length - 1
    else return
    event.preventDefault()
    const nextVolume = collectionVolumes[next].id
    setVolume(nextVolume)
    document.getElementById(`collection-tab-${nextVolume}`)?.focus()
  }

  return (
    <motion.section className="content-section people-section" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <header className="section-heading"><div><span className="eyebrow">当世人杰册 / 相识与共事 不靠抽卡</span><h1>七人，各有其账。</h1><p>能不能做、愿不愿做、敢不敢做。名册只记录你真正接触过的人与共同经历过的事。</p></div><div className="people-head-actions"><button className="outline-button people-debt-button" onClick={onOpenDebt}>人情簿 · 债与把柄</button><div className="section-stat"><b>{working}</b><span>人已共事 / {known} 人相识</span></div></div></header>
      <div className="section-subtabs people-view-tabs" role="tablist" aria-label="人情工作面" onKeyDown={handleViewKeys}>
        {peopleViews.map(item => <button key={item.id} id={`people-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`people-panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} data-sound="tab:people" onClick={() => setView(item.id)}>
          {view === item.id && <motion.span className="section-subtab-ink" layoutId="people-view-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 410, damping: 35 }} aria-hidden="true" />}
          <span>{item.label}</span><small>{item.note}</small>
        </button>)}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'roster' ? <motion.div key="roster" id="people-panel-roster" role="tabpanel" aria-labelledby="people-tab-roster" initial={{ opacity: 0, x: reduceMotion ? 0 : -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
          <div className="people-layout">
            <div className="relationship-thread" aria-hidden="true"><span>知县</span><i /><i /><i /><small>权与责由此向下，话与账由此往回</small></div>
            <div className="people-grid" data-name-card="grid">{people.map((person, index) => {
              const depth = revealDepthOf(person.id, state)
              const isKnown = depth !== '闻名'
              const specialty = specialtyOf(person)
              const debtCount = person.tokens.owesYou + person.tokens.youOwe + person.tokens.hook
              return (
                <motion.button className={`person-card depth-${depth}`} data-has-debt={isKnown && debtCount > 0 ? 'true' : undefined} key={person.id} onClick={() => onSelect(person.id)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .045 }}>
                  <div className="person-card-top">
                    <Portrait person={person} silhouette={!isKnown} size={54} />
                    <div className="person-card-title"><span>{person.role}</span><h2>{person.name}</h2><small>{isKnown ? specialty.label : '只闻其名'}</small></div>
                    <span className={`depth-tag depth-${depth}`}>{depth}</span>
                  </div>
                  <p>{isKnown ? person.desire : person.milestones[0]}</p>
                  <div className="person-card-bottom"><span>{state.asked.includes(person.id) ? `${person.claimId} 说法已入台账` : person.status}</span><span>{isKnown ? '看三问' : '去接触'} <ArrowRight size={14} /></span></div>
                </motion.button>
              )
            })}</div>
          </div>
        </motion.div> : view === 'network' ? <motion.div key="network" id="people-panel-network" role="tabpanel" aria-labelledby="people-tab-network" className="network-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
          <div className="network-heading"><div><span className="eyebrow">一县七人 / 你只站在自己的位置看</span><h2>人情不是数值，是来路与共同经历。</h2></div><div className="network-legend"><span className="depth-闻名">闻名 · 虚线</span><span className="depth-相识">相识 · 黛线</span><span className="depth-共事">共事 · 朱线</span></div></div>
          <div className="network-workspace">
            <div className="network-stage" data-network-paper="true" data-focus-id="people-network" aria-label="知县与六名人物的接触关系谱" onKeyDown={stepNetworkFocus} onMouseLeave={() => setSpotlight(null)}>
              <div className="network-paper" aria-hidden="true" />
              <span className="network-paper-note" aria-hidden="true">谱纸待补 · 暂借素纸</span>
              <svg className="network-lines" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">{people.map((person, index) => {
                const depth = revealDepthOf(person.id, state)
                const position = networkPositions[index]
                // 极轻的手绘弧：以连线中点为轴推开一点，避免尺规直线；仍是同一条数据线。
                const controlX = 500 + (position.x - 500) * .5 + (position.y - 280) * .16
                const controlY = 280 + (position.y - 280) * .5 - (position.x - 500) * .16
                const hot = spotlight === person.id
                return <motion.path key={person.id} className={`depth-${depth} ${spotlight ? (hot ? 'is-hot' : 'is-muted') : ''}`} d={`M 500 280 Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${position.x} ${position.y}`} initial={{ pathLength: reduceMotion ? 1 : 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .58, delay: reduceMotion ? 0 : index * .05 }} />
              })}</svg>
              <div className="network-center" aria-label="玩家知县"><span>永济县</span><b>知县</b><i>你</i><small>亲历为界</small></div>
              {people.map((person, index) => {
                const depth = revealDepthOf(person.id, state)
                const position = networkPositions[index]
                const inspected = person.id === networkId
                return <motion.button key={person.id} ref={element => { networkNodes.current[index] = element }} tabIndex={inspected ? 0 : -1} className={`network-node depth-${depth} ${inspected ? 'is-inspected' : ''} ${spotlight && !inspected ? 'is-muted' : ''}`} style={{ left: `${position.x / 10}%`, top: `${position.y / 5.6}%`, x: '-50%', y: '-50%' }} onMouseEnter={() => { setNetworkId(person.id); setSpotlight(person.id) }} onMouseLeave={() => setSpotlight(null)} onFocus={() => { setNetworkId(person.id); setSpotlight(person.id) }} onBlur={() => setSpotlight(null)} onClick={() => inspectNetworkNode(person.id)} aria-pressed={inspected} aria-label={`查验${person.name}的接触路径与名目，${depth}`} initial={{ opacity: 0, scale: reduceMotion ? 1 : .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : .26, delay: reduceMotion ? 0 : .12 + index * .045 }}>
                  <Portrait person={person} silhouette={depth === '闻名'} size={46} />
                  <span><b>{person.name}</b><small>{person.role}</small></span><em>{depth}</em>
                </motion.button>
              })}
            </div>
            <aside className="network-inspector" aria-live="polite">
              <header><span>接触路径</span><b>不推关系值</b></header>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={networkPerson.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                  <div className="network-person-title"><Portrait person={networkPerson} silhouette={networkDepth === '闻名'} size={58} /><div><span>{networkPerson.role}</span><h3>{networkPerson.name}</h3><small className={`depth-tag depth-${networkDepth}`}>{networkDepth}</small></div></div>
                  {networkHistory.length ? <ol className="network-history">{networkHistory.map((row, index) => <li key={row}><span>{String(index + 1).padStart(2, '0')}</span><p>{row}</p></li>)}</ol> : <div className="network-empty empty-slip" data-empty-slip="true"><EyeOff size={18} /><p>尚未正式接触</p><small>只列公开身份与闻名记录 不展开三问 动机或秘密</small></div>}
                  <button className="outline-button network-open-person" onClick={() => onSelect(networkPerson.id)}>展开人物卷<ArrowRight size={15} /></button>
                  <div className="network-debt-slip" data-network-debt="true">
                    <header><span>人情簿 · 名目</span><b>{networkDepth === '闻名' ? '未展开' : networkTokenTotal ? `${networkTokenTotal} 笔` : '无条目'}</b></header>
                    {networkDepth === '闻名'
                      ? <p className="network-debt-locked">只闻其名 · 名目须正式接触后展开</p>
                      : <>
                        <div className="network-debt-chips">
                          <span className={networkTokens.owesYou ? 'is-on' : ''}>他欠你 <b>{networkTokens.owesYou}</b></span>
                          <span className={networkTokens.youOwe ? 'is-on is-owe' : ''}>你欠他 <b>{networkTokens.youOwe}</b></span>
                          <span className={networkTokens.hook ? 'is-on is-hook' : ''}>把柄 <b>{networkTokens.hook}</b></span>
                        </div>
                        {networkTokenTotal
                          ? <button type="button" className="text-link network-debt-open" onClick={() => onOpenDebtFor?.(networkPerson.id)}>看这一笔在人情簿<ArrowRight size={12} /></button>
                          : <small>此栏无条目 · 不补写</small>}
                      </>}
                  </div>
                </motion.div>
              </AnimatePresence>
              <footer>线只连你与对方 不推断人物之间的隐藏关系</footer>
            </aside>
          </div>
        </motion.div> : view === 'collection' ? <motion.div key="collection" id="people-panel-collection" role="tabpanel" aria-labelledby="people-tab-collection" className="collection-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
          <div className="collection-toolbar">
            <div className="collection-volume-tabs" role="tablist" aria-label="收藏册卷" onKeyDown={handleVolumeKeys}>
              {collectionVolumes.map(item => <button key={item.id} id={`collection-tab-${item.id}`} role="tab" aria-selected={volume === item.id} aria-controls={`collection-panel-${item.id}`} tabIndex={volume === item.id ? 0 : -1} onClick={() => setVolume(item.id)}>
                {volume === item.id && <motion.span className="collection-volume-ink" layoutId="collection-volume-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 390, damping: 34 }} aria-hidden="true" />}
                <span>{item.label}</span><small>{item.note}</small>
              </button>)}
            </div>
            <button className="outline-button collection-book-toggle" onClick={() => setBookOpen(current => !current)} aria-pressed={bookOpen}>{bookOpen ? <BookMarked size={16} /> : <BookOpen size={16} />}{bookOpen ? '合册' : '启册'}</button>
          </div>

          <div className={`silk-book-stage ${bookOpen ? 'is-open' : 'is-closed'}`} id={`collection-panel-${volume}`} role="tabpanel" aria-labelledby={`collection-tab-${volume}`}>
            <div className="silk-book-spine" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <AnimatePresence mode="wait" initial={false}>
              {bookOpen ? <motion.div className="silk-book-open" key={`${volume}-open`} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : -10, scaleX: reduceMotion ? 1 : .97 }} animate={{ opacity: 1, rotateY: 0, scaleX: 1 }} exit={{ opacity: 0, rotateY: reduceMotion ? 0 : 8, scaleX: reduceMotion ? 1 : .98 }} transition={{ duration: reduceMotion ? 0 : .32, ease: [.22, 1, .36, 1] }}>
                {volume === 'contemporary' ? <div className="collection-spread">
                  <section className="collection-index-page">
                    <header><div><span className="eyebrow">卷一 / 当世</span><h2>人杰收录</h2></div><span>{working} 共事 · {known} 相识</span></header>
                    <div className="collection-name-list">{people.map(person => {
                      const depth = revealDepthOf(person.id, state)
                      return <button key={person.id} className={selectedPerson.id === person.id ? 'selected' : ''} onClick={() => setSelectedId(person.id)} aria-pressed={selectedPerson.id === person.id}>
                        {selectedPerson.id === person.id && <motion.span className="collection-person-ink" layoutId="collection-person-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }} aria-hidden="true" />}
                        <Portrait person={person} silhouette={depth === '闻名'} size={40} />
                        <span><b>{person.name}</b><small>{person.role}</small></span><em>{depth}</em>
                      </button>
                    })}</div>
                    <footer>闻名 相识 共事<br />只按接触与实迹编排 不设稀有度</footer>
                  </section>
                  <section className="collection-detail-page" aria-live="polite">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={selectedPerson.id} initial={{ opacity: 0, x: reduceMotion ? 0 : 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -10 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
                        <header className="collection-person-head">
                          <Portrait person={selectedPerson} silhouette={selectedDepth === '闻名'} size={88} />
                          <div><span>{selectedDepth === '闻名' ? '只闻其名' : selectedSpecialty.label}</span><h2>{selectedPerson.name}</h2><p>{selectedPerson.rank}</p></div>
                          <span className={`depth-tag depth-${selectedDepth}`}>{selectedDepth}</span>
                        </header>
                        <div className="collection-origin"><span>出身印</span><b>{selectedPerson.origin}</b></div>
                        {selectedDepth === '闻名' ? <div className="collection-veiled"><EyeOff size={18} /><p>尚未正式接触 不展开三问与关系筹码</p><small>{selectedPerson.milestones[0]} · 仅作闻名记录</small></div> : <div className="collection-record">
                          <section><h3>共同经历</h3>{selectedHistory.length ? selectedHistory.map(row => <p key={row}>{row}</p>) : <p>已经相识 尚无共同办事记录</p>}</section>
                          <section><h3>所得说法</h3><p>{state.asked.includes(selectedPerson.id) ? `${selectedPerson.claimId} · ${selectedPerson.claim}` : '尚未正式问话 不预填三问'}</p></section>
                        </div>}
                        <button className="text-link collection-open-person" onClick={() => onSelect(selectedPerson.id)}>展开人物卷<ArrowRight size={14} /></button>
                        <small className="collection-no-buff">只作行状与关系回查 不增加能力或资源</small>
                      </motion.div>
                    </AnimatePresence>
                  </section>
                </div> : <div className="collection-empty-spread">
                  <section><Library size={30} /><span className="eyebrow">卷二 / 前代</span><h2>名臣册</h2><p>以著作 碑记 传闻与讲学为来源<br />历史人物只作原型与师承参照</p></section>
                  <section><BookOpen size={22} /><h3>尚无收录</h3><p>当前没有可核验的前代人物来源<br />不凭空填入名臣 不伪造史料出处</p><small>空白册页也是知情边界</small></section>
                </div>}
              </motion.div> : <motion.button className="silk-book-cover" key={`${volume}-closed`} onClick={() => setBookOpen(true)} aria-label={`开启${volume === 'contemporary' ? '当世人杰册' : '前代名臣册'}`} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : 10, scaleX: reduceMotion ? 1 : .98 }} animate={{ opacity: 1, rotateY: 0, scaleX: 1 }} exit={{ opacity: 0, rotateY: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .28 }}>
                <span>{volume === 'contemporary' ? '当世' : '前代'}</span>
                <h2>{volume === 'contemporary' ? '人杰册' : '名臣册'}</h2>
                <p>{volume === 'contemporary' ? '所遇 所事 所受其影响' : '所读 所学 所引以为鉴'}</p>
                <i>{volume === 'contemporary' ? '世' : '鉴'}</i>
                <small>绢面装帧 · 点按启册</small>
              </motion.button>}
            </AnimatePresence>
          </div>
        </motion.div> : <motion.div key="growth" id="people-panel-growth" role="tabpanel" aria-labelledby="people-tab-growth" className="growth-panel" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
          <GrowthPreview state={state} />
        </motion.div>}
      </AnimatePresence>
      <footer className="section-footnote"><MessageCircle size={15} /><span>{view === 'roster' ? '正式问话推进一个时段；重复口供、查看人物依据不耗时。共事由真实事件收录。' : view === 'network' ? '关系谱只投影真实接触与共同经历 不显示好感数值 展开人物卷沿用原回调' : view === 'collection' ? '收录只凭接触与事件证据 两册不提供数值加成 启合与查验不耗时段' : '成长五轴规则未启用 · 仅预览；只读既有字段与已发生事实，不新增成长数值、等级或名望刻度，也不写存档。'}</span></footer>
    </motion.section>
  )
}

export function LedgerSection({ unlocked, selected, onToggle, onRemember, remembered, onAudit, audited, onOpenEvidence, material, state, recentSpots, onRecentJump, readAcrossJump, onOpenLastReview, reviewOrigin, onBackReviewOrigin, onOpenFolio }: { unlocked: string[], selected: string[], onToggle: (id: string) => void, onRemember: () => void, remembered: boolean, onAudit: () => void, audited: boolean, onOpenEvidence: () => void, material: { arrived: number, transit: number, unsent: number }, state?: GameState, recentSpots?: RecentSpot[], onRecentJump?: (spot: RecentSpot) => void, readAcrossJump?: (target: ReadAcrossTarget) => void, onOpenLastReview?: (focus: string) => void, reviewOrigin?: ReviewOrigin, onBackReviewOrigin?: () => void, onOpenFolio?: (key: FolioKey) => void }) {
  const reduceMotion = useReducedMotion()
  // FE-090：料账焦点只存会话内记忆，回跳与再入仍停在原段；不改账目与差额。
  const [materialFocus, setMaterialFocus] = useViewMemory<'arrived' | 'transit' | 'unsent'>('ledger-material-focus', 'arrived')
  const [ledgerFolio, setLedgerFolio] = useViewMemory<'three' | 'material' | 'compare'>('ledger-folio', 'three')
  // FE-096：账页三分签与章末四页 / 文书四视图共用同一套卷页题签；只记翻过哪几签。
  const [visited, setVisited] = useViewMemory<string>('ledger-visited', '')
  useEffect(() => {
    const ids = readView('ledger-visited', '').split(',').filter(Boolean)
    if (!ids.includes(ledgerFolio)) setVisited([...ids, ledgerFolio].join(','))
  }, [ledgerFolio, setVisited])
  const folioOrder = ['three', 'material', 'compare'] as const
  const visitedPages = folioOrder.map((id, index) => visited.split(',').includes(id) ? index + 1 : 0).filter((n): n is number => n > 0)
  // FE-100：账房三分签页序只上报派生索引。
  useEffect(() => recordFolioVisit('ledger', visitedPages), [visited])
  const folioIndex = Math.max(1, folioOrder.indexOf(ledgerFolio) + 1)
  const [gapOpen, setGapOpen] = useState(false)
  const total = material.arrived + material.transit + material.unsent
  const pct = (value: number) => `${(value / 50) * 100}%`
  const inspectLedgerRow = (id: string) => { if (!selected.includes(id)) onToggle(id) }
  const materialFocusContent = {
    arrived: { label: '已到场', value: material.arrived, text: material.transit > 0 ? '料场已有实物 虚松与否仍须复秤 不用账面总数代替点收' : '在途已经靠岸 到场与复秤记录按原世界事件保留', source: 'F-005 / 料场与复秤记录' },
    transit: { label: '在途', value: material.transit, text: material.transit > 0 ? '只有船票与在途记录 尚未到料场 不能提前写成到场' : '在途已归零 船已靠岸 不在到场之外重复计算', source: '原世界事件 / 在途十垛到岸' },
    unsent: { label: '未发', value: material.unsent, text: '未发料仍系于粮商旧欠 不提前写成已经到场或已经使用', source: 'E-003 / 粮商旧欠票据' },
  }[materialFocus]
  const selectedRows = selected.flatMap(id => {
    const row = ledgerRows.find(item => item.id === id)
    return row ? [row] : []
  })
  const previewNote = selected.includes('P-006') && selectedRows.length > 1
    ? '票据与传闻已经分开 无凭据的说法不能顶替账面事实'
    : selected.includes('E-001') && selected.includes('E-002')
      ? '同是三百两 一记运输损耗 一记垫付工食 名目仍待核'
      : selected.includes('E-002') && selected.includes('E-003')
        ? '借领与旧欠数额相同 先核是否同一笔 不相加成六百两'
        : '来源与名目已经并置 先问经手人 不把差异直接写成结论'
  return (
    <motion.section className="content-section ledger-section" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onKeyDown={event => { handleFolioReturnKey(event) }}>
      <header className="section-heading"><div><span className="eyebrow">账房 / 银与料分开，事实与说法分开</span><h1>同一笔三百两，四本账。</h1><p>账面平，不等于事情平。把单据并置，才知道下一个问题该问谁。</p></div><div className="rb-inline-column"><LastReviewChip compact onOpen={focus => onOpenLastReview?.(focus)} origin={reviewOrigin} onBack={onBackReviewOrigin} /><RuleChip clause="ledger-three" compact label="依 11.6" /><div className="ledger-head-actions"><button className="outline-button" onClick={onAudit}><BookOpen size={16} />{audited ? '旧册已细查' : '细查旧册 · 1 时段'}</button><button className="outline-button ledger-print" onClick={() => printSurface('ledger')} title="印此页"><Printer size={15} />印此页</button></div></div></header>
      <div className="money-equation money-ledger-strip" data-focus-id="ledger-three"><button className="money-number" onClick={() => inspectLedgerRow('E-001')} aria-pressed={selected.includes('E-001')} aria-label="查验账面领出来源"><span>账面领出</span><b><AnimatedNumber value={ledgerThree.book} /><small>两</small></b><em>E-001 · 估册与领状</em></button><i>=</i><button className="money-number" onClick={() => inspectLedgerRow('E-001')} aria-pressed={selected.includes('E-001')} aria-label="查验河工实收来源"><span>河工实收</span><b><AnimatedNumber value={ledgerThree.actual} /><small>两</small></b><em>E-001 · 库房与专账</em></button><i>+</i><button className="money-number money-gap" onClick={onOpenEvidence} aria-label="打开差额三百两证据链"><span>差额 · 尚待定性</span><b><AnimatedNumber value={ledgerThree.gap} /><small>两</small></b><em>打开证据链 · 不直接定罪</em></button><div className="equation-note"><span className="report-pending">报部 · 待定</span>只能记「差额三百两」<br />不能在证据不足时写成「贪了三百两」</div></div>
      <div className="ledger-gap-bar">
        <button type="button" className="ledger-gap-toggle" aria-expanded={gapOpen} aria-controls="ledger-gap-paper" onClick={() => setGapOpen(value => !value)}>
          <span>{gapOpen ? '收起差额构成' : '差额三百两 · 拆开看构成'}</span>
          <ChevronDown size={12} className={gapOpen ? 'is-open' : ''} />
        </button>
        <span className="ledger-gap-hint">只读拆解 · 不折算、不定罪</span>
      </div>
      <AnimatePresence initial={false}>
        {gapOpen && (
          <motion.section
            key="ledger-gap"
            id="ledger-gap-paper"
            className="ledger-gap-paper"
            data-focus-id="ledger-gap"
            aria-label="差额三百两构成 · 只读"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}
          >
            <div className="ledger-gap-inner">
              <header className="ledger-gap-head">
                <div><span className="eyebrow">差额构成 / 三数拆解</span><h2>三百两落在哪一段？</h2></div>
                <span className="ledger-gap-sum"><b>300</b><small>两 · 尚无科目</small></span>
              </header>
              <ol className="ledger-gap-rows">
                <li><span>01</span><div><h3>账面领出</h3><small>E-001 · 估册与领状</small></div><b>4,500<small>两</small></b></li>
                <li><span>02</span><div><h3>河工实收</h3><small>E-001 · 库房与专账</small></div><b>4,200<small>两</small></b></li>
                <li className="is-gap"><span>03</span><div><h3>差额 · 尚无科目</h3><small>既不写成贪墨，也不写成损耗，除非有新凭据</small></div><b>300<small>两</small></b></li>
              </ol>
              <div className="ledger-gap-actions">
                <button type="button" data-folio-mount="true" onClick={() => { if (!selected.includes('E-001')) onToggle('E-001'); if (!selected.includes('E-002')) onToggle('E-002'); setLedgerFolio('compare') }}><Scale size={12} />去并置这两项</button>
                <button type="button" data-folio-mount="true" onClick={onOpenEvidence}><Link2 size={12} />打开证据链</button>
              </div>
              <footer className="ledger-gap-foot">四本账只解释差额的去向，不替差额定名目。科目须另有凭据。</footer>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <nav className="ledger-folio-tabs" role="tablist" aria-label="账页分签 · 界面投影" data-active={ledgerFolio} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const order = ['three', 'material', 'compare'] as const
        const index = order.indexOf(ledgerFolio)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length
        setLedgerFolio(order[next])
      }}>
        {([['three', '三数'], ['material', '料账'], ['compare', '并置']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={ledgerFolio === id} tabIndex={ledgerFolio === id ? 0 : -1} data-sound="tab:ledger" onClick={() => setLedgerFolio(id)}>{label}<i className={`folio-tab-dot ${visited.includes(id) ? 'is-read' : ''}`} aria-hidden="true" /></button>)}
        <FolioHead label="账房三分签" index={folioIndex} total={folioOrder.length} visited={visitedPages} folioKey="ledger" compact />
        <FolioProgress index={folioIndex} total={folioOrder.length} label={(['三数', '料账', '并置'] as const)[folioIndex - 1]} visited={visitedPages} active />
        <FolioIndex variant="inline" active="ledger" onOpen={onOpenFolio} />
        <small>只读账页 · 切换焦点不改账</small>
      </nav>
      <div className="ledger-workspace">
        <section className="account-books">
          <header><h2>四本账</h2><span>按点选顺序并置 最多三项</span></header>
          {ledgerRows.map(row => {
            const isUnlocked = unlocked.includes(row.id) || row.unlocked
            const order = selected.indexOf(row.id)
            return <motion.button layout key={row.id} className={`account-row ${order >= 0 ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`} disabled={!isUnlocked} aria-pressed={order >= 0} onClick={() => onToggle(row.id)} whileTap={isUnlocked ? { scale: .99 } : undefined}>
              <span className="account-check">{order >= 0 ? <motion.b className="account-order" key={order} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }}>{order + 1}</motion.b> : !isUnlocked ? <LockKeyhole size={13} /> : <Link2 size={13} />}</span>
              <div><h3>{row.title}<small>{row.id}</small></h3><p>{isUnlocked ? row.text : row.source}</p><footer><span>{isUnlocked ? row.type : '未接触'}</span><b>{row.amount}</b></footer></div>
            </motion.button>
          })}
          <button className="primary-button ledger-compare-button" disabled={selected.length < 2 || remembered} onClick={onRemember}>{remembered ? <><Check size={16} />疑点已入台账</> : selected.length < 2 ? '再选一项，开始对勘' : '并置所选项，记下疑点'}<Scale size={16} /></button>
          <button className="text-link ledger-chain-link" onClick={onOpenEvidence}><Link2 size={14} />同一笔三百两 · 证据链与待核问题</button>
        </section>
        <div className="ledger-inspector">
          <section className="ledger-selection-preview" aria-label="所选账证并置预览">
            <header><div><span className="eyebrow">并置纸 / 随选随看</span><h2>先看差异 再记疑点</h2></div><motion.span key={selectedRows.length} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">{selectedRows.length} / 3</motion.span></header>
            <div className="ledger-preview-list">
              <AnimatePresence mode="popLayout" initial={false}>
                {selectedRows.map((row, index) => <motion.article layout key={row.id} initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 18, scale: .97 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }}>
                  <span className="preview-order">{String(index + 1).padStart(2, '0')}</span>
                  <div><header><h3>{row.title}</h3><span>{row.id} · {row.amount}</span></header><p>{row.text}</p><small>{row.source}</small></div>
                </motion.article>)}
              </AnimatePresence>
              {selectedRows.length < 2 && <motion.div className="selection-placeholder empty-slip" data-empty-slip="true" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Link2 size={18} /><p>{selectedRows.length === 0 ? '先点两本账 此处会按点选顺序展开并置' : '再择一项 才能看出名目与来源的差异'}</p></motion.div>}
            </div>
            <AnimatePresence>
              {selectedRows.length >= 2 && <motion.div className="ledger-preview-note" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><Scale size={15} /><div><span>并置所见</span><p>{previewNote}</p></div></motion.div>}
            </AnimatePresence>
          </section>
          <section className="material-ledger"><header><span className="eyebrow">河工料账</span><h2>五十垛，究竟在哪？</h2></header><div className="material-total"><b>{total}</b><span>应到总数 / 垛</span></div><div className="material-bar"><span style={{ width: pct(material.arrived) }} className="arrived" /><span style={{ width: pct(material.transit) }} className="transit" /><span style={{ width: pct(material.unsent) }} className="unsent" /></div><div className="material-legend">{(['arrived', 'transit', 'unsent'] as const).map(kind => <button type="button" key={kind} className={`material-segment ${materialFocus === kind ? 'selected' : ''}`} aria-pressed={materialFocus === kind} onClick={() => setMaterialFocus(kind)}><i className={kind} /><b>{material[kind]}</b><span>{kind === 'arrived' ? '已到场' : kind === 'transit' ? '在途' : '未发'}</span><small>{kind === 'arrived' ? (material.transit > 0 ? '其中或有虚松，待复秤' : '复秤与否 决定虚松是否入账') : kind === 'transit' ? (material.transit > 0 ? '有船票，未到料场' : '船已靠岸') : '粮商以旧欠作保'}</small></button>)}</div><AnimatePresence mode="wait" initial={false}><motion.section className={`material-focus-paper focus-${materialFocus}`} key={materialFocus} initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : .18 }} aria-live="polite"><header><span>{materialFocusContent.label} · {materialFocusContent.value} 垛</span><b>只读料账</b></header><p>{materialFocusContent.text}</p><small>{materialFocusContent.source}</small></motion.section></AnimatePresence><div className="material-note"><PackageOpen size={17} /><p>{material.transit > 0 ? <>账面写「四十」，是把到场与在途并计。<br /><b>在途不等于到场。</b></> : <>在途已到岸。<b>复秤才知虚实</b>，未发十垛仍系于旧欠。</>}</p></div></section>
        </div>
      </div>
      {state && <ReadAcross state={state} variant="strip" active="ledger" onOpen={readAcrossJump} />}
      {state && <DecencyLine state={state} variant="strip" />}
      {recentSpots && onRecentJump && <RecentlyRead items={recentSpots} onJump={onRecentJump} />}
      <SurfaceColophon surface="账房三分签" note="三数 / 料账 / 并置同卷；回卷首只移焦点，不改账页与所选项。" className="ledger-colophon" />
    </motion.section>
  )
}

type LifeSpace = 'gift' | 'home' | 'street'

const lifeSpaceTabs = [
  { id: 'gift' as LifeSpace, label: '礼簿', note: '馈赠 · 应酬', icon: Gift },
  { id: 'home' as LifeSpace, label: '内宅', note: '请求 · 家用', icon: Home },
  { id: 'street' as LifeSpace, label: '街市', note: '应酬 · 享受', icon: Coffee },
]

const lifeSystems = [
  { name: '应酬', accounts: '私囊 · 人情 · 身体 · 风评' },
  { name: '馈赠', accounts: '私囊 · 人情 · Secret / Hook' },
  { name: '内宅', accounts: '私囊 · 身体 · 人情' },
  { name: '享受', accounts: '私囊 · 身体 · 风评' },
  { name: '贪腐', accounts: '收 · 记 · 用 · 平 · 露' },
]

const homeStations = [
  { name: '上房', label: '家人与请求', status: '候事', icon: Home, title: '请求须写明拒绝的代价', text: '家人到来时只呈现请求 所知与代价 不展示私密细节 不把家人写成可收集的后勤增益', accounts: '私囊 · 身体 · 人情' },
  { name: '门房', label: '来客与门包', status: '未接触', icon: DoorClosed, title: '门外发生的事也会回到案头', text: '来客 门包与泄密只记录有来源的说法 未接触时不显示仆役秘密 不生成未发生的收支', accounts: '私囊 · 人情 · 风评' },
  { name: '厨房', label: '家用与虚报', status: '账位预留', icon: Utensils, title: '家用入私囊 大额另记', text: '月度家用与疾病 婚嫁 丧葬各有账位 当前只保留纸面结构 不预设金额 不执行月结', accounts: '私囊 · 身体' },
]

export function LifeSection({ privateFunds, giftEntries, onOpenBanquet, onOpenAtlas, log, period, state, requestedSpace = 'gift', requestedStreetId = 'tea', requestVersion = 0, recentSpots, onRecentJump, readAcrossJump, onOpenRumor, onOpenPlace }: { privateFunds: number, giftEntries: string[], onOpenBanquet: () => void, onOpenAtlas: (stationId: StreetStationId) => void, log: GameLog, period: Period, state: GameState, requestedSpace?: LifeSpace, requestedStreetId?: StreetStationId, requestVersion?: number, recentSpots?: RecentSpot[], onRecentJump?: (spot: RecentSpot) => void, readAcrossJump?: (target: ReadAcrossTarget) => void, onOpenRumor?: (target: 'street' | 'intel') => void, onOpenPlace?: (id: PlaceId) => void }) {
  const reduceMotion = useReducedMotion()
  const [space, setSpace] = useState<LifeSpace>(requestedSpace)
  const [selectedGift, setSelectedGift] = useState(0)
  const [homeStation, setHomeStation] = useState(0)
  const [streetStation, setStreetStation] = useState(() => Math.max(0, streetStations.findIndex(station => station.id === requestedStreetId)))
  const activeGift = Math.min(selectedGift, Math.max(0, giftEntries.length - 1))
  const activeHome = homeStations[homeStation]
  const activeStreet = streetStations[streetStation]
  const activeSystems = space === 'gift' ? ['应酬', '馈赠'] : space === 'home' ? ['内宅'] : ['应酬', '享受']
  const [accountFocus, setAccountFocus] = useState('私囊')
  const lifeAccounts = [
    { name: '公帑', value: '4,200 实收', note: '差额三百尚未定性', icon: CircleDollarSign, detail: '账面四千五百 实收四千二百 差额三百只记作差额 不用生活账替证据定性', source: 'E-001 / 账房三数' },
    { name: '私囊', value: `${privateFunds} 两`, note: '俸禄、宴席、家用皆由此出', icon: Gift, detail: `当前私囊 ${privateFunds} 两 已有 ${giftEntries.length} 笔夜事件礼簿记录 数值只读原状态`, source: '原私囊状态 / 夜事件记录' },
    { name: '人情', value: `${giftEntries.length} 笔新账`, note: '承诺与旧欠没有好感条', icon: UserRound, detail: giftEntries.length ? giftEntries[activeGift] : '尚无夜事件人情新账 不预写承诺与旧欠', source: giftEntries.length ? `原簿第 ${activeGift + 1} 笔 / 与上方礼簿同步` : 'S-07 礼簿空态' },
    { name: '身体', value: giftEntries.length ? '略显困倦' : '尚可', note: '疲劳影响信息质量，不扣行动点', icon: Clock3, detail: giftEntries.length ? '夜事件后沿用略显困倦的原口径 疲劳只影响信息质量 不扣行动点' : '尚无夜事件疲劳记录 不预写身体变化', source: '夜事件 / 身体账边界' },
    { name: '风评', value: giftEntries.length ? '初见应酬' : '新到任', note: '只记录依据，不折算单一分数', icon: Scale, detail: giftEntries.length ? '当前只记初见应酬 具体褒贬仍须以三行日志和真实事件为据' : '新到任 尚无应酬风评记录 不生成评价', source: log.rumor },
  ]
  const activeAccount = lifeAccounts.find(item => item.name === accountFocus) ?? lifeAccounts[1]
  useEffect(() => {
    setSpace(requestedSpace)
    const requestedIndex = streetStations.findIndex(station => station.id === requestedStreetId)
    if (requestedIndex >= 0) setStreetStation(requestedIndex)
  }, [requestVersion, requestedSpace, requestedStreetId])
  const handleSpaceKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = lifeSpaceTabs.findIndex(tab => tab.id === space)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % lifeSpaceTabs.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + lifeSpaceTabs.length) % lifeSpaceTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = lifeSpaceTabs.length - 1
    else return
    event.preventDefault()
    const nextSpace = lifeSpaceTabs[next].id
    setSpace(nextSpace)
    document.getElementById(`life-tab-${nextSpace}`)?.focus()
  }
  return (
    <motion.section className="content-section life-section" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <header className="section-heading"><div><span className="eyebrow">生活 / 权力如何渗进生活，生活如何反噬权力</span><h1>一顿饭，也会进账。</h1><p>清名不是一句口号，人情也不是免费资源。每个夜场景至少牵动两本账。</p></div><div className="private-purse"><span>私囊</span><b>{privateFunds}<small>两</small></b></div></header>
      <div className="life-space-tabs" role="tablist" aria-label="生活空间" onKeyDown={handleSpaceKeys}>{lifeSpaceTabs.map(tab => <button id={`life-tab-${tab.id}`} role="tab" aria-selected={space === tab.id} aria-controls={`life-panel-${tab.id}`} tabIndex={space === tab.id ? 0 : -1} data-sound="tab:life" onClick={() => setSpace(tab.id)} key={tab.id}>
        {space === tab.id && <motion.span className="life-space-ink" layoutId="life-space-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} aria-hidden="true" />}
        <tab.icon size={16} /><span>{tab.label}</span><small>{tab.note}</small>
      </button>)}</div>
      <div className="life-system-map" aria-label="五系统与当前纸面"><span>五事同账</span>{lifeSystems.map(system => <span key={system.name} className={`${activeSystems.includes(system.name) ? 'active' : ''} ${system.name === '贪腐' ? 'risk' : ''}`} title={system.accounts}>{system.name}</span>)}<small>贪腐只列风险链 不作善恶评分</small></div>
      <AnimatePresence mode="wait" initial={false}><motion.div className="life-space-page" id={`life-panel-${space}`} role="tabpanel" aria-labelledby={`life-tab-${space}`} key={space} initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
        {space === 'gift' && <><div className="life-grid"><section className="gift-ledger" data-focus-id="gift-sheet"><header><div><Gift size={19} /><h2>礼簿</h2></div><span>记与不记，也是选择</span></header>{giftEntries.length === 0 ? <div className="gift-empty"><div className="empty-gift-icon"><Gift size={30} /></div><h3>今夜之前，簿上尚无一笔。</h3><p>接风宴的帖子已送到。去不去、谁去、花多少，都会留下不同的账。</p><button className="outline-button" onClick={onOpenBanquet}>展开桑宅请帖 <ArrowRight size={16} /></button></div> : <div className="gift-workspace">
          <div className="gift-entries">{giftEntries.map((entry, i) => <motion.button layout className={`gift-entry ${activeGift === i ? 'selected' : ''}`} aria-pressed={activeGift === i} onClick={() => setSelectedGift(i)} key={`${entry}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : i * .05 }} whileTap={reduceMotion ? undefined : { scale: .99 }}>
            {activeGift === i && <motion.span className="gift-select-ink" layoutId="gift-select-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} aria-hidden="true" />}
            <span>{String(i + 1).padStart(2, '0')}</span><div><h3>{entry}</h3><p>夜事件 / 已留生活记录</p></div><b>{activeGift === i ? '查验中' : '已记'}</b>
          </motion.button>)}</div>
          <AnimatePresence mode="wait" initial={false}><motion.aside className="gift-inspector" key={activeGift} initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .2 }} aria-live="polite">
            <header><span>原簿摘录 / 第 {String(activeGift + 1).padStart(2, '0')} 笔</span><b>已记</b></header>
            <Gift size={20} /><p>{giftEntries[activeGift]}</p>
            <footer>只复述原记录 不增补未发生的细节</footer>
          </motion.aside></AnimatePresence>
        </div>}<footer><span>当前时段：{period}</span><button className="text-link" onClick={onOpenBanquet}>{giftEntries.length ? '回看接风宴' : '预览夜事件'}<ChevronRight size={14} /></button></footer></section>
          <section className="five-accounts"><header><span className="eyebrow">五本生活账</span><h2>看得见的花费，看不见的代价。</h2></header><div className="life-account-list">{lifeAccounts.map(item => <article key={item.name} className={accountFocus === item.name ? 'selected' : ''}><button className="life-account-button" aria-pressed={accountFocus === item.name} onClick={() => setAccountFocus(item.name)}>{accountFocus === item.name && <motion.span className="life-account-ink" layoutId="life-account-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 390, damping: 34 }} aria-hidden="true" />}<item.icon size={18} /><div><span>{item.name}</span><b>{item.value}</b><small>{item.note}</small></div></button></article>)}</div><AnimatePresence mode="wait" initial={false}><motion.section className="life-account-inspector" key={accountFocus} initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }} aria-live="polite"><header><span>{activeAccount.name} · 账页查验</span><b>不改账</b></header><p>{activeAccount.detail}</p><small>{activeAccount.source}</small></motion.section></AnimatePresence></section>
        </div><div className="rb-inline-row"><span>礼簿与风评 · 界面投影 / 四种印象不折算</span><RuleChip clause="echo-four" compact label="依 13.5.1" /></div><div className="pw-life-band"><AudienceEchoPanel state={state} focus="gift" /><ImpressionSlips state={state} /></div><ReadAcross state={state} variant="strip" active="gift" onOpen={readAcrossJump} /><DecencyLine state={state} /></>}
        {space === 'home' && <><div className="life-spread home-spread"><div className="inner-scene"><div className="inner-plate"><ScenePlate id="inner-court" className="inner-art-plate" /><div className="inner-caption"><span>第{['一','二','三','四','五','六','七','八','九','十'][state.day - 1]}日 · {period} · 内宅门外</span><b>镜头停在门外 · 不补写室内</b></div></div><GateNote place="inner" /></div><section className="life-space-index"><header><div><Home size={18} /><h2>内宅门簿</h2></div><span>镜头停在门外</span></header><div className="space-index-list">{homeStations.map((station, index) => <motion.button layout className={`space-index-row ${homeStation === index ? 'selected' : ''}`} aria-pressed={homeStation === index} onClick={() => setHomeStation(index)} key={station.name} whileTap={reduceMotion ? undefined : { scale: .99 }}>
          {homeStation === index && <motion.span className="space-select-ink" layoutId="home-select-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} aria-hidden="true" />}
          <span className="space-index-icon"><station.icon size={17} /></span><div><h3>{station.name}</h3><p>{station.label}</p></div><b>{station.status}</b>
        </motion.button>)}</div><footer><EyeOff size={14} /><span>请求 家用 仆役各有纸位 不展示私密细节</span></footer></section>
          <AnimatePresence mode="wait" initial={false}><motion.aside className="space-inspector" key={homeStation} initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .2 }} aria-live="polite"><header><span>内宅门簿 / 只记可知的</span><b>纸面预览</b></header><div className="space-inspector-title"><activeHome.icon size={23} /><div><span>{activeHome.label}</span><h2>{activeHome.title}</h2></div></div><p>{activeHome.text}</p><div className="space-ledger-line"><span>关联网账</span><b>{activeHome.accounts}</b></div><div className="space-source"><span>事件接口</span><p>家人请求到来时仍沿用 S-11 夜事件 不在这里直接结算</p></div><footer><EyeOff size={14} /><span>不生成请求 金额或家人秘密</span></footer></motion.aside></AnimatePresence>
        </div><DecencyLine state={state} variant="strip" /></>}
        {space === 'street' && <div className="life-spread street-spread"><StreetScene state={state} period={period} log={log} activeId={activeStreet.id} onSelectStation={id => { const index = streetStations.findIndex(station => station.id === id); if (index >= 0) setStreetStation(index) }} onOpenRumor={onOpenRumor} onOpenPlace={onOpenPlace} /><section className="life-space-index"><header><div><MapPin size={18} /><h2>街市地点</h2></div><span>与城郭图共用六处投影</span></header><div className="space-index-list">{streetStations.map((station, index) => <motion.button layout data-street-id={station.id} className={`space-index-row ${streetStation === index ? 'selected' : ''}`} aria-pressed={streetStation === index} onClick={() => setStreetStation(index)} key={station.id} whileTap={reduceMotion ? undefined : { scale: .99 }}>
          {streetStation === index && <motion.span className="space-select-ink" layoutId="street-select-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} aria-hidden="true" />}
          <span className="space-index-icon"><station.icon size={17} /></span><div><h3>{station.name}</h3><p>{station.label}</p></div><b>{station.status}</b>
        </motion.button>)}</div><footer><MapPin size={14} /><span>地点可先读 接触与消费仍须真实事件</span><button className="text-link street-atlas-link" onClick={() => onOpenAtlas(activeStreet.id)}>抽阅城郭图 <ArrowRight size={13} /></button></footer></section>
          <AnimatePresence mode="wait" initial={false}><motion.aside className="space-inspector" data-station-id={activeStreet.id} key={streetStation} initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .2 }} aria-live="polite"><header><span>街市查验 / 城郭同源</span><b>{activeStreet.recordId ? '有来源' : '未接触'}</b></header><div className="space-inspector-title"><activeStreet.icon size={23} /><div><span>{activeStreet.name} · {activeStreet.label}</span><h2>{activeStreet.recordId ? '传闻只按原文留档' : '尚无可查验的话'}</h2></div></div><p>{activeStreet.text}</p><div className="space-ledger-line"><span>关联网账</span><b>{activeStreet.accounts.join(' · ')}</b></div><div className="space-source"><span>{activeStreet.recordId || '来源边界'}</span><p>{activeStreet.source}</p></div><div className="street-shared-note"><MapPin size={13} /><span>城郭选中：{activeStreet.cityLocationId === 'street' ? '街市' : activeStreet.name} · 来源与网账同步</span></div><footer><MapPin size={14} /><span>不生成传闻 不推进时段 不执行消费</span></footer><button className="text-link space-event-link" onClick={onOpenBanquet}>应酬仍由夜宴事件承载 <ArrowRight size={14} /></button></motion.aside></AnimatePresence>
        </div>}
      </motion.div></AnimatePresence>
      <section className="life-log"><span>今日三行</span><p>{log.done}</p><p>{log.stuck}</p><p>{log.rumor}</p></section>
      {recentSpots && onRecentJump && <RecentlyRead items={recentSpots} onJump={onRecentJump} />}
    </motion.section>
  )
}
