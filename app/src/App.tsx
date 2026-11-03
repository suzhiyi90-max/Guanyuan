import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookMarked, BookOpen, Calculator, Check, ChevronRight, ClipboardList, Coffee, FileSearch, Files, Footprints, Gift, Landmark, Map, MoonStar, PackageOpen, ScrollText, Search, Stamp, Sun, UsersRound, Waves, X } from 'lucide-react'
import { PeriodLight, RiverProjection, SceneArt } from './components/SceneArt'
import { AtlasDrawer, type AtlasView } from './components/AtlasDrawer'
import { LocationScene, type LocationSceneId } from './components/LocationScene'
import { SettlementScene } from './components/SettlementScene'
import { DocumentWorkspace } from './components/DocumentWorkspace'
import { BanquetModal, DaySummary, GoalPrologue, IntelligenceDrawer, PlanDrawer } from './components/Overlays'
import { PersonPanel } from './components/PersonPanel'
import { LedgerSection, LifeSection, PeopleSection, TodayAside } from './components/Sections'
import { AffairsSection } from './components/AffairsSection'
import { EvidenceBoard } from './components/EvidenceBoard'
import { SigningSeal } from './components/SigningSeal'
import { OfficialReview } from './components/OfficialReview'
import { WorldEventCard } from './components/WorldEventCard'
import { EpilogueCard } from './components/EpilogueCard'
import { worldEvents } from './game/schedule'
import { AnimatedNumber } from './components/AnimatedNumber'
import { goals, people } from './data'
import { streetStationOf, type CityLocationId, type StreetStationId } from './city'
import { goalReckoningOf, officialAvailableOf, periods, useGuanyuanGame } from './game/useGame'
import type { ClueSource, DocMode, OfficialActionId, OverlayId, SceneId, SectionId } from './types'

const navItems = [
  { id: 'today' as SectionId, label: '今日', icon: Landmark },
  { id: 'cases' as SectionId, label: '案卷', icon: Files },
  { id: 'affairs' as SectionId, label: '事务', icon: ClipboardList },
  { id: 'people' as SectionId, label: '人情', icon: UsersRound },
  { id: 'ledger' as SectionId, label: '账房', icon: Calculator },
  { id: 'life' as SectionId, label: '生活', icon: Coffee },
]
const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const sceneOrder: SceneId[] = ['county', 'river', 'study']

export default function App() {
  const game = useGuanyuanGame()
  const { state, toast, notify, dismissToast } = game

  const [prologueDone, setPrologueDone] = useState(() => Boolean(game.restored && state.goalId))
  const [activeSection, setActiveSection] = useState<SectionId>('today')
  const [scene, setScene] = useState<SceneId>('county')
  const [sceneDirection, setSceneDirection] = useState(1)
  const [overlay, setOverlay] = useState<OverlayId>(null)
  const [daybreak, setDaybreak] = useState(false)
  const reduceMotion = useReducedMotion()
  const [docMode, setDocMode] = useState<DocMode>('original')
  const [selectedCompare, setSelectedCompare] = useState<string[]>([])
  const [selectedLedger, setSelectedLedger] = useState<string[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('expert')
  const [atlasEntry, setAtlasEntry] = useState<{ view: AtlasView, location: CityLocationId, node?: string, streetId?: StreetStationId }>({ view: 'map', location: 'county' })
  const [locationScene, setLocationScene] = useState<LocationSceneId>('ferry')
  const [lifeDestination, setLifeDestination] = useState<{ space: 'gift' | 'home' | 'street', streetId: StreetStationId, version: number }>({ space: 'gift', streetId: 'tea', version: 0 })

  useEffect(() => {
    if (activeSection !== 'life' && lifeDestination.space !== 'gift') {
      setLifeDestination({ space: 'gift', streetId: 'tea', version: 0 })
    }
  }, [activeSection, lifeDestination.space])

  const period = periods[state.periodIndex]
  const selectedPerson = useMemo(() => people.find(p => p.id === selectedPersonId) ?? people[0], [selectedPersonId])
  const currentGoal = goals.find(g => g.id === state.goalId)
  const audited = state.completedActions.includes('audit')
  const docRemembered = state.completedActions.includes('doc-remembered')
  const ledgerRemembered = state.completedActions.includes('ledger-remembered')
  const taskStarted = Boolean(state.plan)

  useEffect(() => {
    if (game.restored && state.goalId) {
      notify('已接上上次的案头', `第${dayNames[state.day - 1]}日 · ${period} / 本地存档自动保留`)
    }
    // 仅在挂载时提示一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlay !== 'summary' && overlay !== 'signing') setOverlay(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [overlay])

  const navigate = (id: SectionId) => {
    if (id === 'cases') {
      setActiveSection('today')
      setDocMode('dossier')
      setOverlay('document')
      return
    }
    setOverlay(null)
    setActiveSection(id)
  }

  const changeScene = (next: SceneId) => {
    if (next === scene) return
    setSceneDirection(sceneOrder.indexOf(next) >= sceneOrder.indexOf(scene) ? 1 : -1)
    setScene(next)
  }

  const toggleSelection = (id: string, kind: 'document' | 'ledger') => {
    const setter = kind === 'document' ? setSelectedCompare : setSelectedLedger
    setter(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 3 ? [...current.slice(1), id] : [...current, id])
  }

  const openSource = (source: ClueSource, refs?: string[]) => {
    if (source === 'document') {
      if (refs) setSelectedCompare(refs)
      setDocMode('compare')
      setOverlay('document')
      return
    }
    setOverlay(null)
    if (source === 'ledger') {
      if (refs) setSelectedLedger(refs)
      setActiveSection('ledger')
      return
    }
    setActiveSection('today')
    changeScene('river')
  }

  const handleRememberDoc = () => {
    if (game.rememberDocument(selectedCompare) === 'ok') {
      notify('疑点已记住', '没有判定谁说谎；两条版本与来源已写入情报台账。')
    }
  }

  const handleRememberLedger = () => {
    if (game.rememberLedger(selectedLedger) === 'ok') {
      notify('账目疑点已并置', '只记录流转差异，不自动给主簿或粮商定责。')
    }
  }

  const handleAsk = () => {
    const result = game.askPerson(selectedPerson.id)
    if (result === 'repeated') {
      notify('重复口供 · 0 费', '没有新信息或承诺，本时段不推进。')
      return
    }
    notify(`已取得 ${selectedPerson.claimId}`, `${selectedPerson.role}的说法已入情报台账，状态仍为「存疑」。`)
  }

  const handleAudit = () => {
    if (game.audit() === 'repeated') {
      notify('旧册已细查', '重复阅读不耗时；可回账房并置借领状。')
      return
    }
    notify('发现 E-002 · 主簿借领状', '记录为“垫付上年夫役工食”；主簿已知你在查旧册。')
  }

  const handleProbe = () => {
    if (game.probe() === 'repeated') {
      notify('探挖记录已读 · 0 费', '闸底淘空三尺；十日内只能抢护，拆修须汛后另案。')
      return
    }
    notify('亲勘取得 E-007', '闸底淘空三尺。当前十日窗口只能抢护，不能完成拆修。')
  }

  const openPlan = () => {
    game.markPlanPreview()
    setOverlay('plan')
  }

  const handleConfirmPlan: Parameters<typeof PlanDrawer>[0]['onConfirm'] = planInput => {
    if (!game.confirmPlan(planInput)) return
    setOverlay('signing')
  }

  const finishSigning = () => {
    setOverlay(null)
    changeScene('river')
    setActiveSection('affairs')
    notify('抢护已发起 · 并非已完成', `${state.plan?.detail ?? ''}。任务进入异步执行，发起占用本时段。`)
  }

  const handleBanquet = (choice: 'attend' | 'delegate' | 'audit') => {
    game.chooseBanquet(choice)
    setOverlay('summary')
  }

  const handleOfficial = (id: OfficialActionId) => {
    const messages: Record<OfficialActionId, [string, string]> = {
      endorse: ['批语已发回县里', '「查」字入卷 书办先自乱 不耗时段'],
      commissioner: ['委员覆勘已发起', '得勘报 E-008 事务转入「验」 闸底定性有据'],
      files: ['调卷传询已发', '得旧修造册 E-004 书办口径已录'],
      citation: ['考语已拟入册', '措辞只据本局实迹 日后会被人翻出'],
      impeach: ['揭参已封发', '清名与刻名并至 县里再无回旋'],
      suppress: ['来文已压下', '幕友已经看见 把柄留在人手里'],
    }
    if (game.runOfficialAction(id) === 'repeated') {
      notify('此动作已行', '不重复耗时段 批语与动作已在卷中')
      return
    }
    notify(...messages[id])
  }

  const handleNextDay = () => {
    game.continueNextDay()
    setDaybreak(true)
    setOverlay(null)
    setActiveSection('today')
    changeScene('county')
    notify('次日 · 晨', '世界已推进：委托、旧欠与人情会按各自日程继续变化。')
  }

  const openPerson = (id: string) => {
    setSelectedPersonId(id)
    setOverlay('person')
  }

  const openAtlas = (view: AtlasView = 'map', streetId?: StreetStationId) => {
    const location = streetId ? streetStationOf(streetId)?.cityLocationId ?? 'street' : 'county'
    setAtlasEntry({ view, location, streetId })
    setOverlay('atlas')
  }

  const openLifeDestination = (space: 'gift' | 'home' | 'street', streetId: StreetStationId = 'tea') => {
    setLifeDestination(current => ({ space, streetId, version: current.version + 1 }))
    setOverlay(null)
    setActiveSection('life')
  }

  const currentEvent = worldEvents.find(e => e.id === state.pendingEvent) ?? null

  useEffect(() => {
    if (state.pendingEvent) setOverlay('world')
  }, [state.pendingEvent])

  const activeNav = overlay === 'document' ? 'cases' : activeSection
  const sceneName = scene === 'county' ? '县衙 · 签押房' : scene === 'river' ? '东堤 · 旧闸险工' : '县衙 · 夜书房'
  const sceneWeather = scene === 'study'
    ? period === '夜' ? '一灯 / 静' : '夜书房 / 静'
    : scene === 'river'
      ? state.day >= 9 ? '洪峰 / 已过境' : state.day >= 8 ? '上游暴雨 / 水涨' : '东风 / 初勘'
      : `${period === '晨' ? '薄光' : period === '午' ? '平光' : period === '暮' ? '长影' : '黛色'} / ${period === '夜' ? '静' : '晴'}`
  const sceneVariants = {
    enter: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * 42, scale: reduceMotion ? 1 : 1.012 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * -30, scale: reduceMotion ? 1 : .992 }),
  }

  return (
    <div className="app-shell" data-period={period} data-day={state.day}>
      <PeriodLight period={period} />
      <nav className="main-nav" aria-label="主要导航">
        <button className="nav-brand" onClick={() => setOverlay('goal')} aria-label="查看志向"><span>观</span><small>远</small></button>
        <div className="nav-items">{navItems.map(item => <button key={item.id} className={activeNav === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={activeNav === item.id ? 'page' : undefined}>{activeNav === item.id && <motion.span className="nav-active-ink" layoutId="nav-active-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} aria-hidden="true" />}<item.icon size={20} strokeWidth={1.6} /><span>{item.label}</span>{item.id === 'cases' && <i className="nav-notice" />}{item.id === 'affairs' && taskStarted && <i className="nav-notice is-live" />}{item.id === 'people' && state.asked.length > 0 && <em>{state.asked.length}</em>}</button>)}</div>
        <button className="nav-intel" onClick={() => setOverlay('intelligence')} aria-label="打开情报台账"><BookMarked size={20} /><span>情报</span>{state.clues.length > 0 && <em>{state.clues.length}</em>}</button>
      </nav>

      <main className="main-shell">
        <header className="top-hud">
          <div className="date-block" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.span key={state.day} initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }}>第{dayNames[state.day - 1]}日</motion.span></AnimatePresence><small>永济县 · 架空</small></div>
          <div className="period-track" aria-label={`当前时段：${period}`}>{periods.map((item, index) => <div key={item} className={`${index === state.periodIndex ? 'active' : ''} ${index < state.periodIndex ? 'passed' : ''}`}><span><b>{item}</b>{index === state.periodIndex && <motion.i className="period-active-ink" layoutId="period-active-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" />}</span><i />{index === state.periodIndex && <small>当前时段</small>}</div>)}</div>
          <div className="flood-deadline"><Waves size={17} /><div><span>汛期</span><small>洪峰第 9 日</small></div><b><AnimatedNumber value={Math.max(0, 9 - state.day)} /><small>日</small></b></div>
          <div className="hud-actions"><button onClick={() => setActiveSection('life')}><span>私囊</span><b><AnimatedNumber value={state.privateFunds} /><small>两</small></b></button><button className="goal-seal" onClick={() => setOverlay('goal')} title={currentGoal?.statement ?? '尚未立志'}>{currentGoal?.seal ?? '志'}</button></div>
        </header>

        <div className={`workspace ${activeSection !== 'today' ? 'paper-workspace' : ''}`}>
          <AnimatePresence mode="wait">
            {activeSection === 'today' && <motion.div className="scene-layout" key="today" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
            <div className="scene-stage">
            <AnimatePresence custom={sceneDirection} initial={false}>
            <motion.section className={`scene-panel scene-${scene}`} key={scene} custom={sceneDirection} variants={sceneVariants} initial="enter" animate="center" exit="exit" transition={{ duration: reduceMotion ? 0 : .3, ease: [.22, 1, .36, 1] }}>
              <SceneArt scene={scene} riverWorking={Boolean(state.plan) || state.day >= 8} />
              <div className="scene-shade" />
              {scene === 'river' && <RiverProjection state={state} />}
              <div className="scene-caption"><span className="eyebrow">此刻所在</span><h1>{sceneName}</h1><div>{period === '夜' ? <MoonStar size={14} /> : <Sun size={14} />}<span>{sceneWeather}</span><i /><span>移动不耗时段</span></div></div>
              <button className="scene-intel-button" onClick={() => setOverlay('intelligence')}><Search size={16} /><span>情报</span>{state.clues.length > 0 && <b>{state.clues.length}</b>}</button>

              {scene === 'county' && <>
                <button className="scene-hotspot hotspot-document" onClick={() => { setDocMode('original'); setOverlay('document') }}><span className="hotspot-icon"><ScrollText size={18} /></span><span className="hotspot-label"><b>东堤呈文</b><small>两版有改 · 展开</small></span><i /></button>
                <button className="scene-hotspot hotspot-books" onClick={() => setActiveSection('ledger')}><span className="hotspot-icon"><BookOpen size={18} /></span><span className="hotspot-label"><b>旧账册</b><small>账面四千五百两</small></span><i /></button>
                <button className="scene-hotspot hotspot-seal" onClick={openPlan}><span className="hotspot-icon"><Stamp size={18} /></span><span className="hotspot-label"><b>印匣</b><small>预演抢护签押</small></span><i /></button>
                <button className="scene-hotspot hotspot-invitation" onClick={() => setOverlay('banquet')}><span className="hotspot-icon"><Gift size={18} /></span><span className="hotspot-label"><b>桑宅请帖</b><small>今夜 · 接风宴</small></span><i /></button>
                <button className="scene-exit exit-left" onClick={() => changeScene('river')}><Footprints size={17} /><span>出县衙，往东堤</span><ChevronRight size={16} /></button>
              </>}

              {scene === 'river' && <>
                <button className="scene-hotspot hotspot-seep" onClick={handleProbe}><span className="hotspot-icon"><Waves size={18} /></span><span className="hotspot-label"><b>{state.probeKnown ? '探挖记录 E-007' : '渗水点'}</b><small>{state.probeKnown ? '闸底淘空三尺' : '亲勘 / 探挖 · 1 时段'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-material" onClick={() => setActiveSection('ledger')}><span className="hotspot-icon"><PackageOpen size={18} /></span><span className="hotspot-label"><b>料场</b><small>到场 {state.material.arrived} / 在途 {state.material.transit} / 未发 {state.material.unsent}</small></span><i /></button>
                <button className="scene-hotspot hotspot-workers" onClick={() => openPerson('foreman')}><span className="hotspot-icon"><UsersRound size={18} /></span><span className="hotspot-label"><b>堡夫棚</b><small>赵九河愿带路</small></span><i /></button>
                <button className="scene-hotspot hotspot-plan" onClick={openPlan}><span className="hotspot-icon"><Stamp size={18} /></span><span className="hotspot-label"><b>险工牌</b><small>{taskStarted ? '抢护执行中' : '预演抢护 · 先抢后报'}</small></span><i /></button>
                <button className="scene-exit exit-left" onClick={() => changeScene('county')}><ArrowLeft size={17} /><span>回县衙</span></button>
              </>}

              {scene === 'study' && <>
                <button className="scene-hotspot hotspot-document" onClick={handleAudit}><span className="hotspot-icon"><FileSearch size={18} /></span><span className="hotspot-label"><b>灯下旧册</b><small>{audited ? '借领状已取得' : '细查三百两 · 1 时段'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-books" onClick={() => setOverlay('goal')}><span className="hotspot-icon"><BookMarked size={18} /></span><span className="hotspot-label"><b>志向印</b><small>{currentGoal ? `${currentGoal.title} · 可改写` : '尚未立志'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-invitation" onClick={() => setOverlay('banquet')}><span className="hotspot-icon"><MoonStar size={18} /></span><span className="hotspot-label"><b>案角请帖</b><small>接风宴 · 今夜取舍</small></span><i /></button>
                <button className="scene-exit exit-left" onClick={() => changeScene('county')}><ArrowLeft size={17} /><span>回签押房</span></button>
              </>}

            </motion.section>
            </AnimatePresence>
            <div className="scene-switcher" aria-label="切换所在场景"><button className="scene-atlas-button" onClick={() => openAtlas('map')} aria-label="抽阅一县舆图" title="抽阅一县舆图"><Map size={15} /><span>舆图</span></button>{([['county', '县衙'], ['river', '东堤'], ['study', '夜书房']] as Array<[SceneId, string]>).map(([id, label]) => <button key={id} className={scene === id ? 'active' : ''} aria-pressed={scene === id} onClick={() => changeScene(id)}>{scene === id && <motion.span className="scene-switch-ink" layoutId="scene-switch-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 35 }} aria-hidden="true" />}<span>{label}</span></button>)}</div>
            </div>
            <TodayAside day={state.day} onOpenDoc={() => { setDocMode('original'); setOverlay('document') }} onOpenPlan={openPlan} onOpenBanquet={() => setOverlay('banquet')} onOpenAffairs={() => setActiveSection('affairs')} onOpenReview={() => setOverlay('review')} pendingEventTitle={currentEvent?.title ?? null} onOpenWorld={() => setOverlay('world')} reviewAvailable={officialAvailableOf(state)} reviewPending={state.officialActions.length === 0} cluesCount={state.clues.length} taskStarted={taskStarted} period={period} log={state.log} />
            </motion.div>}
            {activeSection === 'affairs' && <AffairsSection key="affairs" state={state} onOpenPlan={openPlan} onOpenEvidence={() => setOverlay('evidence')} onOpenReview={() => setOverlay('review')} onOpenEpilogue={() => setOverlay('epilogue')} onNavigate={navigate} onGoRiver={() => { setActiveSection('today'); changeScene('river') }} />}
            {activeSection === 'people' && <PeopleSection key="people" state={state} onSelect={openPerson} />}
            {activeSection === 'ledger' && <LedgerSection key="ledger" unlocked={state.unlocked} selected={selectedLedger} onToggle={id => toggleSelection(id, 'ledger')} onRemember={handleRememberLedger} remembered={ledgerRemembered} onAudit={handleAudit} audited={audited} onOpenEvidence={() => setOverlay('evidence')} material={state.material} />}
            {activeSection === 'life' && <LifeSection key="life" privateFunds={state.privateFunds} giftEntries={state.giftEntries} onOpenBanquet={() => setOverlay('banquet')} onOpenAtlas={stationId => openAtlas('city', stationId)} log={state.log} period={period} requestedSpace={lifeDestination.space} requestedStreetId={lifeDestination.streetId} requestVersion={lifeDestination.version} />}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {daybreak && <motion.div className="daybreak-handoff" data-handoff="夜-晨" key={`daybreak-${state.day}`} aria-hidden="true" initial={{ opacity: 0, clipPath: reduceMotion ? 'inset(0%)' : 'inset(49.5% 0% 49.5% 0%)' }} animate={{ opacity: 1, clipPath: 'inset(0%)' }} exit={{ opacity: 0, clipPath: reduceMotion ? 'inset(0%)' : 'inset(0% 0% 100% 0%)' }} transition={{ duration: reduceMotion ? 0 : .72, ease: [.76, 0, .24, 1] }} onAnimationComplete={() => setDaybreak(false)}>
          <div className="daybreak-horizon" />
          <motion.div className="daybreak-inscription" initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }} transition={{ duration: reduceMotion ? 0 : .36 }}><span>夜卷已合</span><i /><b>第{dayNames[state.day - 1]}日 · 晨</b><small>光从案头重新起笔</small></motion.div>
        </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
        {overlay === 'atlas' && <AtlasDrawer key="atlas" state={state} period={period} scene={scene} initialView={atlasEntry.view} initialNode={atlasEntry.node} initialCityLocation={atlasEntry.location} initialStreetId={atlasEntry.streetId} onClose={() => setOverlay(null)} onGoRiver={() => { setOverlay(null); setActiveSection('today'); changeScene('river') }} onGoCounty={() => { setOverlay(null); setActiveSection('today'); changeScene('county') }} onGoStudy={() => { setOverlay(null); setActiveSection('today'); changeScene('study') }} onReturnStreet={stationId => openLifeDestination('street', stationId)} onReturnHome={() => openLifeDestination('home')} onOpenLedger={() => { setOverlay(null); setActiveSection('ledger') }} onOpenForeman={() => openPerson('foreman')} onOpenBanquet={() => setOverlay('banquet')} onOpenPerson={openPerson} onOpenLocation={id => { setLocationScene(id); setAtlasEntry({ view: 'map', location: 'county', node: id }); setOverlay('location') }} />}
        {overlay === 'location' && (locationScene === 'town' || locationScene === 'manor' ? <SettlementScene key="settlement" initialLocation={locationScene} state={state} period={period} onClose={() => setOverlay(null)} onReturnAtlas={node => { setAtlasEntry({ view: 'map', location: 'county', node }); setOverlay('atlas') }} onOpenEvidence={() => setOverlay('evidence')} onOpenPerson={openPerson} onOpenPlan={openPlan} /> : <LocationScene key="location" initialLocation={locationScene} state={state} period={period} onClose={() => setOverlay(null)} onReturnAtlas={node => { setAtlasEntry({ view: 'map', location: 'county', node }); setOverlay('atlas') }} onOpenLedger={() => { setOverlay(null); setActiveSection('ledger') }} onOpenIntelligence={() => setOverlay('intelligence')} onOpenReview={() => setOverlay('review')} />)}
        {overlay === 'document' && <DocumentWorkspace key="document" mode={docMode} onModeChange={setDocMode} selected={selectedCompare} onToggle={id => toggleSelection(id, 'document')} onRemember={handleRememberDoc} remembered={docRemembered} onClose={() => setOverlay(null)} state={state} onOpenReview={() => setOverlay('review')} onOpenEvidence={() => setOverlay('evidence')} onOpenEpilogue={() => setOverlay('epilogue')} />}
        {overlay === 'plan' && <PlanDrawer key="plan" onClose={() => setOverlay(null)} onConfirm={handleConfirmPlan} canPlan={!taskStarted} />}
        {overlay === 'intelligence' && <IntelligenceDrawer key="intel" clues={state.clues} asked={state.asked} onClose={() => setOverlay(null)} onOpenSource={openSource} onOpenEvidence={() => setOverlay('evidence')} />}
        {overlay === 'evidence' && <EvidenceBoard key="evidence" state={state} onClose={() => setOverlay(null)} onOpenSource={openSource} />}
        {overlay === 'banquet' && <BanquetModal key="banquet" period={period} onClose={() => setOverlay(null)} onChoose={handleBanquet} />}
        {overlay === 'person' && <PersonPanel key="person" person={selectedPerson} state={state} onClose={() => setOverlay(null)} onAsk={handleAsk} />}
        {overlay === 'review' && <OfficialReview key="review" state={state} onClose={() => setOverlay(null)} onAction={handleOfficial} />}
        {overlay === 'world' && currentEvent && <WorldEventCard key={`world-${currentEvent.id}`} event={currentEvent} onChoose={optionId => { game.resolveWorldOption(currentEvent.id, optionId); setOverlay(null); notify('事已记下', `${currentEvent.title} · 选择已入卷 世界继续按日程走`) }} onLater={() => setOverlay(null)} />}
        {overlay === 'epilogue' && <EpilogueCard key="epilogue" state={state} onClose={() => setOverlay(null)} />}
        {overlay === 'summary' && <DaySummary key="summary" log={state.log} privateFunds={state.privateFunds} day={state.day} reckoning={goalReckoningOf(state)} onContinue={handleNextDay} />}
        {overlay === 'signing' && state.plan && <SigningSeal key="signing" plan={state.plan} onDone={finishSigning} />}
        {(!prologueDone || overlay === 'goal') && <GoalPrologue key="goal" selected={state.goalId} onSelect={game.setGoal} onStart={() => { if (!state.goalId) return; setPrologueDone(true); setOverlay(null) }} onReset={prologueDone ? () => { game.resetGame(); setPrologueDone(false); setOverlay(null); setActiveSection('today'); changeScene('county') } : undefined} />}
      </AnimatePresence>

      <AnimatePresence>{toast && <motion.div className="toast" key={toast.id} role="status" aria-live="polite" aria-atomic="true" initial={{ opacity: 0, y: reduceMotion ? 0 : 14, x: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : .985 }} animate={{ opacity: 1, y: 0, x: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 5, x: reduceMotion ? 0 : 16 }} transition={{ duration: reduceMotion ? 0 : .22, ease: 'easeOut' }}><div className="toast-seal"><Check size={17} /></div><div><h3>{toast.title}</h3><p>{toast.detail}</p></div><button onClick={dismissToast} aria-label="关闭提示" title="收起通知"><X size={15} /></button></motion.div>}</AnimatePresence>
    </div>
  )
}
