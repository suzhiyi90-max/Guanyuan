import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookMarked, BookOpen, Calculator, Check, ChevronRight, ClipboardList, Coffee, FileSearch, Files, Footprints, Gift, Landmark, Map, MoonStar, PackageOpen, ScrollText, Search, Stamp, Sun, UserRound, UsersRound, Waves, X } from 'lucide-react'
import { PeriodLight, RiverProjection, SceneArt } from './components/SceneArt'
import { ScenePresence } from './components/ScenePlate'
import { AtlasDrawer, type AtlasView } from './components/AtlasDrawer'
import { LocationScene, type LocationSceneId } from './components/LocationScene'
import { SettlementScene } from './components/SettlementScene'
import { DocumentWorkspace } from './components/DocumentWorkspace'
import { BanquetModal, DaySummary, DrawerFrame, GoalPrologue, IntelligenceDrawer, PlanDrawer } from './components/Overlays'
import { PersonPanel } from './components/PersonPanel'
import type { ArchivePage } from './components/PersonArchive'
import { LedgerSection, LifeSection, PeopleSection, TodayAside } from './components/Sections'
import { AffairsSection } from './components/AffairsSection'
import { EvidenceBoard } from './components/EvidenceBoard'
import { SigningSeal } from './components/SigningSeal'
import { OfficialReview } from './components/OfficialReview'
import { WorldEventCard } from './components/WorldEventCard'
import { EpilogueCard, type LocateKind } from './components/EpilogueCard'
import { PowerFolio } from './components/PowerLedger'
import { RuleBook } from './components/RuleBook'
import { CausalitySheet } from './components/CausalityPaper'
import { DebtLedger } from './components/DebtLedger'
import { ProfileFolio } from './components/ProfileFolio'
import { BriefDraft } from './components/BriefDraft'
import { RuleBookContext } from './ruleContext'
import { FocusContext, type FocusTarget } from './focusContext'
import { FocusBridge } from './components/FocusBridge'
import { PaperTexture } from './components/PaperTexture'
import { ReadPrefs } from './components/ReadPrefs'
import { ReadingRibbon } from './components/ReadingRibbon'
import { type RecentSpot } from './components/RecentlyRead'
import { type ReadAcrossTarget } from './components/ReadAcross'
import { placeSpecs, recordPlace, type PlaceId } from './placeTrail'
import { lastReviewOrigin, originLabels, recordReviewOrigin, useReviewTrail, type ReviewOrigin } from './reviewTrail'
import { readView } from './viewMemory'
import type { FolioKey } from './folioIndex'
import { useReadPrefs } from './readPrefs'
import { installSoundHooks } from './audio'
import { worldEvents, type WorldEvent } from './game/schedule'
import { AnimatedNumber } from './components/AnimatedNumber'
import { goals, people } from './data'
import { streetStationOf, type CityLocationId, type StreetStationId } from './city'
import { goalReckoningOf, officialAvailableOf, periods, useGuanyuanGame, verdictOf } from './game/useGame'
import { routeCommandFeedback } from './game/commandFeedback'
import { useNarrator } from './narrative/useNarrator'
import { effectById } from './narrative/effects'
import { findGeneratedEvent } from './narrative/store'
import type { GeneratedEvent, NarrationIntent } from './narrative/types'
import { NarrationCard } from './components/NarrationCard'
import { NarratorConfig } from './components/NarratorConfig'
import { ambientPeopleOf, presentPeopleOf } from './game/presence'
import type { PowerHandlers } from './power'
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
// FE-082：回跳纸签第二行只说「回到哪一小节」，不改任何业务含义。
const epilogueDetails: Record<LocateKind, string> = {
  document: '案卷 · 原件',
  evidence: '证据链',
  affairs: '事务盘 · 十日时钟',
  review: '上宪批答',
  gift: '礼簿',
  intel: '情报台账',
  ledger: '账房 · 三数',
  causality: '因果纸',
}
const logDetails: Record<'affairs' | 'document' | 'intel', string> = {
  affairs: '事务盘 · 十日时钟',
  document: '案卷 · 原件',
  intel: '情报台账',
}
// FE-085：最近看过只写「表面 + 小节」，用作纸签文字，不改任何业务含义。
const docModeLabel: Record<DocMode, string> = { dossier: '卷宗', original: '原件', reading: '释文', compare: '对勘' }
const overlayLabels: Partial<Record<NonNullable<OverlayId>, string>> = {
  document: '案卷', intelligence: '情报台账', plan: '抢护委牌', banquet: '接风宴', person: '人物卷',
  evidence: '证据链', review: '上宪批答', world: '世界事件卡', epilogue: '章末四页', atlas: '舆图',
  location: '地点纸', power: '权界纸', rule: '则例册', causality: '因果纸', debt: '人情簿', brief: '拟稿', goal: '志向纸', profile: '自我履历',
}
const sectionLabels: Record<SectionId, string> = { today: '今日案头', cases: '案卷', affairs: '事务盘', people: '人情', ledger: '账房', life: '生活' }

export default function App() {
  const game = useGuanyuanGame()
  const { state, toast, notify, dismissToast } = game

  // FE-080 跨屏跳转后留一枚「回 · 上一处」，只记表面与焦点，不改业务、不写存档。
  // FE-082 再补来处小节与滚轴位置：回来时不再落在纸页顶端。
  const [returnSpot, setReturnSpot] = useState<{ label: string; detail: string; overlay: OverlayId | null; section: SectionId; scrollTop: number } | null>(null)
  const [evidenceFocus, setEvidenceFocus] = useState<string | null>(null)
  // FE-090：回跳落位后短暂留一枚「已归位」纸角，只说明看见了，不改任何状态。
  const [arrivedSpot, setArrivedSpot] = useState<string | null>(null)
  const arrivedTimer = useRef<number | null>(null)
  // FE-132：批阅来处只多记一枚滚轴位置（会话内存），「回那处」不再落在纸页顶端。
  const reviewOriginScroll = useRef<Partial<Record<ReviewOrigin, number>>>({})
  const [prologueDone, setPrologueDone] = useState(() => Boolean(game.restored && state.goalId))
  const [activeSection, setActiveSection] = useState<SectionId>('today')
  const [scene, setScene] = useState<SceneId>('county')
  const [sceneDirection, setSceneDirection] = useState(1)
  const [overlay, setOverlay] = useState<OverlayId>(null)
  const [daybreak, setDaybreak] = useState(false)
  const reduceMotion = useReducedMotion()
  const [readPrefs, patchReadPrefs] = useReadPrefs()
  // FE-083：初到三签只在首次进入出现；「知道」写进本机阅览偏好同档，「先收起」只在本组件折成书签。
  const [guideClosed, setGuideClosed] = useState(false)
  const [guideReplay, setGuideReplay] = useState(false)
  const [docMode, setDocMode] = useState<DocMode>('original')
  // FE-093：源选中时给卷宗一个一次性的批阅焦点；普通开卷则回上次批阅组。
  const [docFocusHint, setDocFocusHint] = useState<string | null>(null)
  const [selectedCompare, setSelectedCompare] = useState<string[]>([])
  const [selectedLedger, setSelectedLedger] = useState<string[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('expert')
  // FE-164/165：全貌档案页状态 lifted 到 App，回跳（captureSpot/returnToSpot）回来时不丢子页上下文。
  const [personArchive, setPersonArchive] = useState<ArchivePage | null>(null)
  const [atlasEntry, setAtlasEntry] = useState<{ view: AtlasView, location: CityLocationId, node?: string, streetId?: StreetStationId }>({ view: 'map', location: 'county' })
  const [locationScene, setLocationScene] = useState<LocationSceneId>('ferry')
  const [ruleFocus, setRuleFocus] = useState<string | undefined>(undefined)
  const [lifeDestination, setLifeDestination] = useState<{ space: 'gift' | 'home' | 'street', streetId: StreetStationId, version: number }>({ space: 'gift', streetId: 'tea', version: 0 })
  // FE-064 / FE-065 跨屏回查：只带「看哪张纸、是谁」的界面请求，不携带业务状态、不写存档。
  const [peopleRequest, setPeopleRequest] = useState<{ id?: string, view?: 'network', version: number } | null>(null)
  const [clockRequest, setClockRequest] = useState<{ day: number, version: number } | null>(null)
  const [debtFocusId, setDebtFocusId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  // C-62 回查焦点：只带目标纸片 id 与重播序号，不携带业务状态、不写存档。
  const focusOn = useCallback((target: FocusTarget) => { setFocusTarget(target); setFocusNonce(current => current + 1) }, [])
  const focusApi = useMemo(() => ({ key: focusTarget, nonce: focusNonce, focusOn }), [focusTarget, focusNonce, focusOn])

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

  // C-92 存档案卷：只取既有状态的摘要；导出是本地下载，既不读存档结构也不写回。
  const saveSummary = useMemo(() => ({
    day: state.day,
    period,
    goal: currentGoal?.title ?? null,
    funds: state.privateFunds,
    clues: state.clues.length,
    plan: state.plan?.detail ?? null,
    restored: game.restored,
  }), [state.day, period, currentGoal, state.privateFunds, state.clues.length, state.plan, game.restored])

  const exportSave = useCallback(() => {
    const payload = {
      schema: 'guanyuan.save.v1',
      exportedAt: new Date().toISOString(),
      summary: { day: state.day, period, goalId: state.goalId, privateFunds: state.privateFunds, clues: state.clues.length },
      state,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `观远-底稿-第${state.day}日.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1200)
    notify('底稿已存本机', `第${dayNames[state.day - 1]}日 · ${period} · 只取一份底稿，不改本档`)
  }, [state, period, notify])

  // FE-083：案头压角三签，只在本机没有存档的新局、且还没看过时出现。
  const guideOpen = prologueDone && overlay !== 'goal' && (!readPrefs.guide || guideReplay) && !guideClosed
  const dismissGuide = () => { setGuideClosed(true); setGuideReplay(false); patchReadPrefs({ guide: true }) }
  // 「指给我看」：三签收起，落一处既有区域并留朱砂环；不写存档、不推进时段。
  const pointGuide = (target: FocusTarget) => { setGuideClosed(true); setGuideReplay(false); focusOn(target) }
  const replayGuide = () => { setGuideClosed(false); setGuideReplay(true) }

  // FE-085：最近看过只记「表面 + 小节」，至多四条；只存内存，刷新即散。
  const [recent, setRecent] = useState<RecentSpot[]>([])
  useEffect(() => {
    let spot: RecentSpot | null = null
    if (!overlay) {
      spot = { key: `section:${activeSection}`, label: sectionLabels[activeSection], section: activeSection, overlay: null }
    } else if (overlay !== 'summary' && overlay !== 'signing' && overlay !== 'desk') {
      const label = overlayLabels[overlay]
      if (label) {
        spot = {
          key: overlay === 'document' ? `document:${docMode}` : `overlay:${overlay}`,
          label,
          detail: overlay === 'document' ? docModeLabel[docMode] : undefined,
          section: activeSection,
          overlay,
          docMode: overlay === 'document' ? docMode : undefined,
        }
      }
    }
    if (!spot) return
    setRecent(current => current[0]?.key === spot!.key ? current : [spot!, ...current.filter(item => item.key !== spot!.key)].slice(0, 4))
  }, [overlay, activeSection, docMode])
  const recentForDesk = useMemo(() => recent.slice(1), [recent])
  const jumpRecent = (spot: RecentSpot) => {
    if (spot.docMode) setDocMode(spot.docMode)
    setOverlay(spot.overlay)
    setActiveSection(spot.section)
  }

  // FE-089：只把 data-sound 标成可分发的声音提示；音源未接入，不产生任何声音。
  useEffect(() => installSoundHooks(), [])

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

  // FE-093：统一开卷入口。focus 只作一次性的批阅提示，不写存档、不改选证。
  const openDocument = (nextMode: DocMode, focus: string | null = null) => {
    setDocFocusHint(focus)
    setDocMode(nextMode)
    setOverlay('document')
  }

  const navigate = (id: SectionId) => {
    setReturnSpot(null)
    if (id === 'cases') {
      setActiveSection('today')
      openDocument('dossier')
      return
    }
    setOverlay(null)
    setActiveSection(id)
  }

  const changeScene = (next: SceneId) => {
    recordPlace(next)
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
      openDocument('compare', refs?.[0] ?? null)
      focusOn('document-original')
      return
    }
    setOverlay(null)
    if (source === 'ledger') {
      if (refs) setSelectedLedger(refs)
      setActiveSection('ledger')
      focusOn('ledger-three')
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
    const result = game.runOfficialAction(id)
    if (!routeCommandFeedback(
      result,
      reason => notify(reason === 'repeated' ? '此动作已行' : '动作未执行', reason === 'repeated' ? '不重复耗时段 批语与动作已在卷中' : `命令层拒绝（${reason}），状态未改变。`),
      () => notify(...messages[id]),
    )) return
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
    setPersonArchive(null)
    setOverlay('person')
  }

  const openAtlas = (view: AtlasView = 'map', streetId?: StreetStationId) => {
    const location = streetId ? streetStationOf(streetId)?.cityLocationId ?? 'street' : 'county'
    setAtlasEntry({ view, location, streetId })
    setOverlay('atlas')
  }

  const openLifeDestination = (space: 'gift' | 'home' | 'street', streetId: StreetStationId = 'tea') => {
    if (space === 'street') recordPlace('street')
    else if (space === 'home') recordPlace('home')
    setLifeDestination(current => ({ space, streetId, version: current.version + 1 }))
    setOverlay(null)
    setActiveSection('life')
  }

  // FE-092：三向对读只跳到既有表面；FE-093：同源批阅签只回上次批阅组。
  const readAcrossJump = (target: ReadAcrossTarget) => {
    if (target === 'ledger') { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') }
    else if (target === 'intel') { setOverlay('intelligence'); focusOn('intel-drawer') }
    else { openLifeDestination('gift'); focusOn('gift-sheet') }
  }
  // FE-097：只记「从哪个表面、在哪个场所点开批阅尺」，会话内、刷新即散；回那处只换界面焦点。
  const reviewTrail = useReviewTrail()
  const currentOrigin = reviewTrail.length ? reviewTrail[reviewTrail.length - 1].origin : null
  const reviewMarks = reviewTrail.map(stop => stop.place)
  const currentPlace: PlaceId = activeSection === 'life' && lifeDestination.space === 'street' ? 'street'
    : activeSection === 'life' && lifeDestination.space === 'home' ? 'home'
      : scene
  const openDocumentAt = (focus: string, origin: ReviewOrigin = 'desk') => {
    reviewOriginScroll.current[origin] = scrollRootOf()?.scrollTop ?? 0
    recordReviewOrigin(origin, currentPlace)
    openDocument('original', focus)
    focusOn('document-original')
  }
  const backToReviewOrigin = () => {
    const origin = lastReviewOrigin()
    if (origin === 'ledger') { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') }
    else if (origin === 'intel') { setOverlay('intelligence'); focusOn('intel-drawer') }
    else if (origin === 'epilogue') setOverlay('epilogue')
    else { setOverlay(null); setActiveSection('today') }
    if (origin) {
      restoreScrollTo(reviewOriginScroll.current[origin] ?? 0)
      echoArrived(originLabels[origin])
    }
  }
  // FE-100：合卷索引只回既有三处表面，不新开入口、不携带业务状态、不记批阅来处。
  const openFolio = (key: FolioKey) => {
    if (key === 'epilogue') setOverlay('epilogue')
    else if (key === 'document') { openDocument('original'); focusOn('document-original') }
    else { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') }
  }
  const epilogueOrder = ['citation', 'deeds', 'reckoning', 'legacy']
  const epiloguePage = Math.max(1, epilogueOrder.indexOf(readView('epilogue-tab', 'citation')) + 1)
  // FE-094：风闻行迹只回既有街市 / 情报两处，不打开章末。
  const openRumorTarget = (target: 'street' | 'intel') => {
    if (target === 'intel') { setOverlay('intelligence'); focusOn('intel-drawer') }
    else openLifeDestination('street', 'tea')
  }
  // FE-095：今日动线只回既有场所；不耗时段、不改场景判定。
  const openPlace = (id: PlaceId) => {
    const spec = placeSpecs[id]
    if (spec.kind === 'scene') { setOverlay(null); setActiveSection('today'); changeScene(id as SceneId) }
    else if (spec.kind === 'street') openLifeDestination('street', 'tea')
    else if (spec.kind === 'home') openLifeDestination('home')
    else { recordPlace(id); setLocationScene(id as LocationSceneId); setAtlasEntry({ view: 'map', location: 'county', node: id }); setOverlay('location') }
  }
  useEffect(() => { if (!overlay && activeSection === 'today') recordPlace(scene) }, [overlay, activeSection, scene])

  const openRule = (clauseId?: string) => {
    setRuleFocus(clauseId)
    setOverlay('rule')
  }

  const openCausality = () => setOverlay('causality')
  const openDebt = () => { setDebtFocusId(null); setOverlay('debt') }
  const openBrief = () => setOverlay('brief')
  // FE-064：从人情谱点开同一人的名目，只定位纸片，不改债务与接触。
  const openDebtFor = (id: string) => { setDebtFocusId(id); setOverlay('debt') }
  const locatePeopleNetwork = (id?: string) => {
    setOverlay(null)
    setActiveSection('people')
    setPeopleRequest(current => ({ id, view: 'network', version: (current?.version ?? 0) + 1 }))
    focusOn('people-network')
  }
  // FE-082：回跳只认「来处的滚轴」——叠层里第一个真正能滚的纸卷，退到案情区则认工作区；找不到就记 0。
  const scrollRootOf = () => {
    const overlayRoot = document.querySelector<HTMLElement>('.overlay-backdrop')
    const scope = overlayRoot ?? document.querySelector<HTMLElement>('.workspace')
    if (scope) {
      const nodes = [scope, ...Array.from(scope.querySelectorAll<HTMLElement>('*'))]
      for (const node of nodes) {
        if (node.scrollHeight - node.clientHeight <= 4) continue
        const overflowY = window.getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return node
      }
    }
    const doc = document.scrollingElement as HTMLElement | null
    return doc && doc.scrollHeight - doc.clientHeight > 4 ? doc : null
  }
  const captureSpot = (label: string, detail: string) => ({ label, detail, overlay, section: activeSection, scrollTop: scrollRootOf()?.scrollTop ?? 0 })
  const restoreScrollTo = (top: number) => {
    if (!top) return
    let tries = 0
    const step = () => {
      const root = scrollRootOf()
      if (root) {
        root.scrollTop = top
        if (Math.abs(root.scrollTop - top) <= 2) return
      }
      if (tries++ < 16) window.setTimeout(step, 60)
    }
    window.setTimeout(step, 70)
  }
  const echoArrived = (detail: string) => {
    setArrivedSpot(detail)
    if (arrivedTimer.current) window.clearTimeout(arrivedTimer.current)
    arrivedTimer.current = window.setTimeout(() => setArrivedSpot(null), 1200)
  }
  const returnToSpot = (spot: { detail: string; overlay: OverlayId | null; section: SectionId; scrollTop: number } | null) => {
    if (!spot) return
    setReturnSpot(null)
    if (spot.overlay !== 'evidence') setEvidenceFocus(null)
    setOverlay(spot.overlay)
    setActiveSection(spot.section)
    restoreScrollTo(spot.scrollTop)
    echoArrived(spot.detail || '原处')
  }
  useEffect(() => () => { if (arrivedTimer.current) window.clearTimeout(arrivedTimer.current) }, [])

  // FE-065：事件卡与十日世界时钟互跳，只换查验日，不动日程与事件。
  // FE-072：从章末回查既有纸片，只换表面与焦点，不推进时段、不写存档。
  const locateFromEpilogue = (kind: LocateKind) => {
    setReturnSpot(captureSpot('章末四页', epilogueDetails[kind]))
    if (kind === 'document') { openDocument('original'); focusOn('document-original') }
    else if (kind === 'evidence') { setOverlay('evidence'); focusOn('evidence-chain') }
    else if (kind === 'affairs') { setOverlay(null); setActiveSection('affairs'); focusOn('affairs-clock') }
    else if (kind === 'review') { setOverlay('review'); focusOn('review-actions') }
    else if (kind === 'gift') { openLifeDestination('gift'); focusOn('gift-sheet') }
    else if (kind === 'intel') { setOverlay('intelligence'); focusOn('intel-drawer') }
    else if (kind === 'ledger') { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') }
    else setOverlay('causality')
  }
  // FE-074：三行日志只回查既有纸片，不推进时段、不写存档。
  const locateFromLog = (kind: 'affairs' | 'document' | 'intel') => {
    setReturnSpot(captureSpot('三行日志', logDetails[kind]))
    setOverlay(null)
    if (kind === 'affairs') { setActiveSection('affairs'); focusOn('affairs-clock') }
    else if (kind === 'document') { openDocument('original'); focusOn('document-original') }
    else { setOverlay('intelligence'); focusOn('intel-drawer') }
  }
  const locateWorldDay = (day: number) => {
    setReturnSpot(captureSpot('世界事件卡', `第${dayNames[day - 1]}日 · 十日时钟`))
    setOverlay(null)
    setActiveSection('affairs')
    setClockRequest(current => ({ day, version: (current?.version ?? 0) + 1 }))
    focusOn('world-clock')
  }

  // C-70 可做纸签：只分发到既有场景热点动作，不新增动作、不改任何既有回调。
  const handlePresenceThing = (label: string) => {
    if (label.includes('呈文')) { openDocument('original'); focusOn('document-original') }
    else if (label.includes('旧账册') || label.includes('料场')) { setActiveSection('ledger'); focusOn('ledger-three') }
    else if (label.includes('印匣') || label.includes('险工牌')) openPlan()
    else if (label.includes('请帖')) setOverlay('banquet')
    else if (label.includes('渗水')) handleProbe()
    else if (label.includes('堡夫棚')) openPerson('foreman')
    else if (label.includes('志向印')) setOverlay('goal')
    else if (label.includes('灯下旧册')) handleAudit()
  }

  // FE-145：接谈纸正式问一回走既有 askPerson；toast 按当下公开度分众（当众 / 独对），不记原话、不写回声。
  const handlePresenceAsk = (personId: string) => {
    const person = people.find(item => item.id === personId)
    if (!person) return
    const company = presentPeopleOf(state, scene, period).filter(item => item.person.id !== personId).length + ambientPeopleOf(state, scene, period).count > 0
    const result = game.askPerson(personId)
    if (result === 'missing') return
    if (result === 'repeated') { notify('重复口供 · 0 费', '没有新信息或承诺，本时段不推进。'); return }
    notify(`已取得 ${person.claimId} · ${company ? '当众' : '独对'}`, company ? '在场者都听见了；台账只记「问过」，不记原话。' : '只在此室；台账只记「问过」。')
  }

  const goScene = (next: SceneId) => {
    setOverlay(null)
    setActiveSection('today')
    changeScene(next)
  }

  // 权界纸只作原入口索引：耗时动作一律回原场景/原工作面，不在这里代执行。
  const powerHandlers: PowerHandlers = {
    document: () => { openDocument('original'); focusOn('document-original') },
    plan: () => openPlan(),
    ledger: () => { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') },
    review: () => { setOverlay('review'); focusOn('review-actions') },
    evidence: () => setOverlay('evidence'),
    intel: () => setOverlay('intelligence'),
    banquet: () => setOverlay('banquet'),
    epilogue: () => setOverlay('epilogue'),
    atlas: () => openAtlas('map'),
    life: () => { openLifeDestination('gift'); focusOn('gift-sheet') },
    'scene:county': () => goScene('county'),
    'scene:river': () => goScene('river'),
    'scene:study': () => goScene('study'),
    'person:expert': () => openPerson('expert'),
    'person:xiancheng': () => openPerson('xiancheng'),
    'person:zhubu': () => openPerson('zhubu'),
    'person:liangshang': () => openPerson('liangshang'),
    'person:gentry': () => openPerson('gentry'),
    'person:foreman': () => openPerson('foreman'),
  }

  // FE-157：候墨运行时。生成事件不入存档结构，只借既有 handledEvents 记「已决」。
  const officialAvailable = officialAvailableOf(state)
  const narrator = useNarrator({ state, scene, period, officialAvailable })
  const [narrationIntent, setNarrationIntent] = useState<NarrationIntent>('旁白')
  const generatedEvent = narrator.run.event
  // 正式世界事件优先；只在没有任何 pendingEvent 时展示本轮新生成事件。
  const currentEvent: WorldEvent | GeneratedEvent | null = worldEvents.find(e => e.id === state.pendingEvent)
    ?? (state.pendingEvent ? findGeneratedEvent(state.pendingEvent) : generatedEvent)

  const openNarration = () => {
    narrator.dismiss()
    setOverlay('world')
  }

  const generatedNotes = generatedEvent
    ? Object.fromEntries(generatedEvent.options.map(option => [option.id, effectById(option.effect)?.hint ?? '']))
    : undefined

  const chooseEventOption = (optionId: string) => {
    if (!currentEvent) return
    const isGenerated = 'origin' in currentEvent
    const result = isGenerated
      ? game.resolveGeneratedEvent(currentEvent as GeneratedEvent, optionId)
      : game.resolveWorldOption(currentEvent.id, optionId)
    const reasons: Record<string, string> = {
      'world-event-pending': '正式世界事件尚待处理，生成事件不能抢占。',
      'already-handled': '此事件已经结算，不会重复记账。',
      'not-pending': '此事件已不在待决队列，请重新查看当前案头。',
      'unknown-option': '所选方案无效，事件没有结算。',
      'effect-unavailable': '当前条件不满足，事件没有结算。',
      'unknown-effect': '该效果未登记，事件没有结算。',
      'not-generated': '生成事件来源校验失败，事件没有结算。',
      'unknown-event': '未找到对应世界事件，事件没有结算。',
      'repeated': '此动作已经执行，不会重复结算。',
    }
    if (!routeCommandFeedback(
      result,
      reason => notify('事件未结算', reasons[reason] ?? `结算被拒绝（${reason}），状态未改变。`),
      () => undefined,
    )) return
    if (isGenerated) narrator.dismiss()
    setOverlay(null)
    notify('事已记下', `${currentEvent.title} · 选择已入卷 世界继续按日程走`)
  }

  const todayAsideProps = {
    day: state.day,
    onOpenDoc: () => openDocument('original'),
    onOpenPlan: openPlan,
    onOpenBanquet: () => setOverlay('banquet'),
    onOpenAffairs: () => { setActiveSection('affairs'); focusOn('affairs-clock') },
    onOpenReview: () => setOverlay('review'),
    pendingEventTitle: currentEvent?.title ?? null,
    onOpenWorld: () => setOverlay('world'),
    reviewAvailable: officialAvailableOf(state),
    reviewPending: state.officialActions.length === 0,
    cluesCount: state.clues.length,
    taskStarted,
    period,
    log: state.log,
    state,
    scene,
    handlers: powerHandlers,
    onOpenPower: () => setOverlay('power'),
    onOpenCausality: openCausality,
    onLocateWorldDay: locateWorldDay,
    onLocateLog: locateFromLog,
    guideOpen,
    onGuideDismiss: dismissGuide,
    onGuidePoint: pointGuide,
    onGuideReplay: replayGuide,
    recentSpots: recentForDesk,
    onRecentJump: jumpRecent,
    onOpenRumor: openRumorTarget,
    onOpenPlace: openPlace,
    epiloguePage,
    onOpenEpiloguePage: () => setOverlay('epilogue'),
    reviewOrigin: currentOrigin ?? undefined,
    onBackReviewOrigin: backToReviewOrigin,
    reviewMarks,
    onOpenFolio: openFolio,
    onAwaitInk: openNarration,
    narrativeReady: narrator.ready,
    narrativeEnabled: narrator.enabled,
  }

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
  // FE-079：场景热点键盘巡览。只换焦点，不触发动作；Enter / Space 仍是原按钮行为。
  const scenePanelRef = useRef<HTMLElement | null>(null)
  const handleHotspotKey = (event: React.KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const items = Array.from(scenePanelRef.current?.querySelectorAll<HTMLButtonElement>('.scene-hotspot') ?? [])
    if (items.length < 2) return
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length
    items[next].focus()
  }
  const sceneVariants = {
    enter: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * 42, scale: reduceMotion ? 1 : 1.012 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (direction: number) => ({ opacity: 0, x: reduceMotion ? 0 : direction * -30, scale: reduceMotion ? 1 : .992 }),
  }

  return (
    <MotionConfig reducedMotion={readPrefs.motion === 'reduce' ? 'always' : 'user'}>
    <FocusContext.Provider value={focusApi}>
    <RuleBookContext.Provider value={{ openRule }}>
    <div className="app-shell" data-period={period} data-day={state.day}>
      <FocusBridge />
      <ReadingRibbon watch={`${activeSection}|${overlay ?? ''}|${docMode}`} />
      <PeriodLight period={period} />
      <nav className="main-nav" aria-label="主要导航" data-focus-id="main-nav">
        <button className="nav-brand" onClick={() => setOverlay('goal')} aria-label="查看志向"><span>观</span><small>远</small></button>
        <div className="nav-items">{navItems.map(item => <button key={item.id} className={activeNav === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={activeNav === item.id ? 'page' : undefined}>{activeNav === item.id && <motion.span className="nav-active-ink" layoutId="nav-active-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} aria-hidden="true" />}<item.icon size={20} strokeWidth={1.6} /><span>{item.label}</span>{item.id === 'cases' && <i className="nav-notice" />}{item.id === 'affairs' && taskStarted && <i className="nav-notice is-live" />}{item.id === 'people' && state.asked.length > 0 && <em>{state.asked.length}</em>}</button>)}</div>
        <button className="nav-intel" onClick={() => { setOverlay('intelligence'); focusOn('intel-drawer') }} aria-label="打开情报台账"><BookMarked size={20} /><span>情报</span>{state.clues.length > 0 && <em>{state.clues.length}</em>}</button>
        <button className="nav-profile" onClick={() => setOverlay('profile')} aria-label="打开自我履历"><UserRound size={20} strokeWidth={1.6} /><span>自</span></button>
      </nav>

      <main className="main-shell">
        <header className="top-hud">
          <div className="date-block" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.span key={state.day} initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }}>第{dayNames[state.day - 1]}日</motion.span></AnimatePresence><small>永济县 · 架空</small></div>
          <div className="period-track" data-focus-id="period-track" aria-label={`当前时段：${period}`}>{periods.map((item, index) => <div key={item} className={`${index === state.periodIndex ? 'active' : ''} ${index < state.periodIndex ? 'passed' : ''}`}><span><b>{item}</b>{index === state.periodIndex && <motion.i className="period-active-ink" layoutId="period-active-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" />}</span><i />{index === state.periodIndex && <small>当前时段</small>}</div>)}</div>
          <div className="flood-deadline"><Waves size={17} /><div><span>汛期</span><small>洪峰第 9 日</small></div><b><AnimatedNumber value={Math.max(0, 9 - state.day)} /><small>日</small></b></div>
          <div className="hud-actions"><button onClick={() => setActiveSection('life')}><span>私囊</span><b><AnimatedNumber value={state.privateFunds} /><small>两</small></b></button><button className="rule-seal" onClick={() => openRule()} title="则例册 · 为什么不能" aria-label="打开则例册"><span>例</span><small>则</small></button><button className="power-seal" onClick={() => { setOverlay('power'); focusOn('power-folio') }} title="权界纸 · 能 / 可 / 该" aria-label="打开权界纸"><span>权</span><small>界</small></button><button className="goal-seal" onClick={() => setOverlay('goal')} title={currentGoal?.statement ?? '尚未立志'}>{currentGoal?.seal ?? '志'}</button><ReadPrefs /><PaperTexture /></div>
        </header>

        <div className={`workspace ${activeSection !== 'today' ? 'paper-workspace' : ''}`}>
          <AnimatePresence mode="wait">
            {activeSection === 'today' && <motion.div className="scene-layout" key="today" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
            <div className="scene-stage">
            <AnimatePresence custom={sceneDirection} initial={false}>
            <motion.section ref={scenePanelRef} className={`scene-panel scene-${scene}`} key={scene} custom={sceneDirection} variants={sceneVariants} initial="enter" animate="center" exit="exit" transition={{ duration: reduceMotion ? 0 : .3, ease: [.22, 1, .36, 1] }} onKeyDown={handleHotspotKey} aria-label="场景热点 · 方向键切换" data-sound={`scene:${scene}`}>
              <SceneArt scene={scene} riverWorking={Boolean(state.plan) || state.day >= 8} />
              <div className="scene-shade" />
              {scene === 'river' && <RiverProjection state={state} />}
              <div className="scene-caption"><span className="eyebrow">此刻所在</span><h1>{sceneName}</h1><div>{period === '夜' ? <MoonStar size={14} /> : <Sun size={14} />}<span>{sceneWeather}</span><i /><span>移动不耗时段</span></div></div>
              <ScenePresence state={state} scene={scene} period={period} onThing={handlePresenceThing} onAsk={handlePresenceAsk} onOpenPerson={openPerson} />
              <button className="desk-tab" onClick={() => setOverlay('desk')} aria-label="打开今日案头"><span>案头</span></button>
              <button className="scene-intel-button" onClick={() => setOverlay('intelligence')}><Search size={16} /><span>情报</span>{state.clues.length > 0 && <b>{state.clues.length}</b>}</button>

              {scene === 'county' && <>
                <button className="scene-hotspot hotspot-document" data-sound="paper:open" onClick={() => openDocument('original')}><span className="hotspot-icon"><ScrollText size={18} /></span><span className="hotspot-label"><b>东堤呈文</b><small>两版有改 · 展开</small></span><i /></button>
                <button className="scene-hotspot hotspot-books" data-sound="ledger:open" onClick={() => setActiveSection('ledger')}><span className="hotspot-icon"><BookOpen size={18} /></span><span className="hotspot-label"><b>旧账册</b><small>账面四千五百两</small></span><i /></button>
                <button className="scene-hotspot hotspot-seal" data-sound="plan:open" onClick={openPlan}><span className="hotspot-icon"><Stamp size={18} /></span><span className="hotspot-label"><b>印匣</b><small>预演抢护签押</small></span><i /></button>
                <button className="scene-hotspot hotspot-invitation" data-sound="banquet:open" onClick={() => setOverlay('banquet')}><span className="hotspot-icon"><Gift size={18} /></span><span className="hotspot-label"><b>桑宅请帖</b><small>今夜 · 接风宴</small></span><i /></button>
                <button className="scene-exit exit-left" data-sound="step" onClick={() => changeScene('river')}><Footprints size={17} /><span>出县衙，往东堤</span><ChevronRight size={16} /></button>
              </>}

              {scene === 'river' && <>
                <button className="scene-hotspot hotspot-seep" data-sound="probe" onClick={handleProbe}><span className="hotspot-icon"><Waves size={18} /></span><span className="hotspot-label"><b>{state.probeKnown ? '探挖记录 E-007' : '渗水点'}</b><small>{state.probeKnown ? '闸底淘空三尺' : '亲勘 / 探挖 · 1 时段'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-material" data-sound="ledger:material" onClick={() => setActiveSection('ledger')}><span className="hotspot-icon"><PackageOpen size={18} /></span><span className="hotspot-label"><b>料场</b><small>到场 {state.material.arrived} / 在途 {state.material.transit} / 未发 {state.material.unsent}</small></span><i /></button>
                <button className="scene-hotspot hotspot-workers" data-sound="person:foreman" onClick={() => openPerson('foreman')}><span className="hotspot-icon"><UsersRound size={18} /></span><span className="hotspot-label"><b>堡夫棚</b><small>赵九河愿带路</small></span><i /></button>
                <button className="scene-hotspot hotspot-plan" data-sound="plan:open" onClick={openPlan}><span className="hotspot-icon"><Stamp size={18} /></span><span className="hotspot-label"><b>险工牌</b><small>{taskStarted ? '抢护执行中' : '预演抢护 · 先抢后报'}</small></span><i /></button>
                <button className="scene-exit exit-left" data-sound="step" onClick={() => changeScene('county')}><ArrowLeft size={17} /><span>回县衙</span></button>
              </>}

              {scene === 'study' && <>
                <button className="scene-hotspot hotspot-document" data-sound="audit" onClick={handleAudit}><span className="hotspot-icon"><FileSearch size={18} /></span><span className="hotspot-label"><b>灯下旧册</b><small>{audited ? '借领状已取得' : '细查三百两 · 1 时段'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-books" data-sound="goal:open" onClick={() => setOverlay('goal')}><span className="hotspot-icon"><BookMarked size={18} /></span><span className="hotspot-label"><b>志向印</b><small>{currentGoal ? `${currentGoal.title} · 可改写` : '尚未立志'}</small></span><i /></button>
                <button className="scene-hotspot hotspot-invitation" data-sound="banquet:open" onClick={() => setOverlay('banquet')}><span className="hotspot-icon"><MoonStar size={18} /></span><span className="hotspot-label"><b>案角请帖</b><small>接风宴 · 今夜取舍</small></span><i /></button>
                <button className="scene-exit exit-left" data-sound="step" onClick={() => changeScene('county')}><ArrowLeft size={17} /><span>回签押房</span></button>
              </>}

            </motion.section>
            </AnimatePresence>
            <div className="scene-switcher" aria-label="切换所在场景"><button className="scene-atlas-button" onClick={() => openAtlas('map')} aria-label="抽阅一县舆图" title="抽阅一县舆图"><Map size={15} /><span>舆图</span></button>{([['county', '县衙'], ['river', '东堤'], ['study', '夜书房']] as Array<[SceneId, string]>).map(([id, label]) => <button key={id} data-sound="step" className={scene === id ? 'active' : ''} aria-pressed={scene === id} onClick={() => changeScene(id)}>{scene === id && <motion.span className="scene-switch-ink" layoutId="scene-switch-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 35 }} aria-hidden="true" />}<span>{label}</span></button>)}</div>
            </div>
            <TodayAside {...todayAsideProps} />
            </motion.div>}
            {activeSection === 'affairs' && <AffairsSection key="affairs" state={state} onOpenPlan={openPlan} onOpenEvidence={() => setOverlay('evidence')} onOpenReview={() => setOverlay('review')} onOpenEpilogue={() => setOverlay('epilogue')} onNavigate={navigate} onGoRiver={() => { setActiveSection('today'); changeScene('river') }} onOpenCausality={openCausality} onOpenBrief={openBrief} clockRequest={clockRequest} onOpenWorld={currentEvent ? () => setOverlay('world') : undefined} />}
            {activeSection === 'people' && <PeopleSection key="people" state={state} onSelect={openPerson} onOpenDebt={openDebt} onOpenDebtFor={openDebtFor} focusRequest={peopleRequest} />}
            {activeSection === 'ledger' && <LedgerSection key="ledger" unlocked={state.unlocked} selected={selectedLedger} onToggle={id => toggleSelection(id, 'ledger')} onRemember={handleRememberLedger} remembered={ledgerRemembered} onAudit={handleAudit} audited={audited} onOpenEvidence={() => setOverlay('evidence')} material={state.material} state={state} recentSpots={recentForDesk} onRecentJump={jumpRecent} readAcrossJump={readAcrossJump} onOpenLastReview={focus => openDocumentAt(focus, 'ledger')} reviewOrigin={currentOrigin ?? undefined} onBackReviewOrigin={backToReviewOrigin} onOpenFolio={openFolio} />}
            {activeSection === 'life' && <LifeSection key="life" privateFunds={state.privateFunds} giftEntries={state.giftEntries} onOpenBanquet={() => setOverlay('banquet')} onOpenAtlas={stationId => openAtlas('city', stationId)} log={state.log} period={period} state={state} requestedSpace={lifeDestination.space} requestedStreetId={lifeDestination.streetId} requestVersion={lifeDestination.version} recentSpots={recentForDesk} onRecentJump={jumpRecent} readAcrossJump={readAcrossJump} onOpenRumor={openRumorTarget} onOpenPlace={openPlace} />}
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
        {overlay === 'atlas' && <AtlasDrawer key="atlas" state={state} period={period} scene={scene} initialView={atlasEntry.view} initialNode={atlasEntry.node} initialCityLocation={atlasEntry.location} initialStreetId={atlasEntry.streetId} onClose={() => setOverlay(null)} onGoRiver={() => { setOverlay(null); setActiveSection('today'); changeScene('river') }} onGoCounty={() => { setOverlay(null); setActiveSection('today'); changeScene('county') }} onGoStudy={() => { setOverlay(null); setActiveSection('today'); changeScene('study') }} onReturnStreet={stationId => openLifeDestination('street', stationId)} onReturnHome={() => openLifeDestination('home')} onOpenLedger={() => { setOverlay(null); setActiveSection('ledger') }} onOpenForeman={() => openPerson('foreman')} onOpenBanquet={() => setOverlay('banquet')} onOpenPerson={openPerson} onOpenPlace={openPlace} onOpenLocation={id => { recordPlace(id); setLocationScene(id); setAtlasEntry({ view: 'map', location: 'county', node: id }); setOverlay('location') }} />}
        {overlay === 'location' && (locationScene === 'town' || locationScene === 'manor' ? <SettlementScene key="settlement" initialLocation={locationScene} state={state} period={period} onClose={() => setOverlay(null)} onReturnAtlas={node => { setAtlasEntry({ view: 'map', location: 'county', node }); setOverlay('atlas') }} onOpenEvidence={() => setOverlay('evidence')} onOpenPerson={openPerson} onOpenPlan={openPlan} onOpenPlace={openPlace} /> : <LocationScene key="location" initialLocation={locationScene} state={state} period={period} onClose={() => setOverlay(null)} onReturnAtlas={node => { setAtlasEntry({ view: 'map', location: 'county', node }); setOverlay('atlas') }} onOpenLedger={() => { setOverlay(null); setActiveSection('ledger') }} onOpenIntelligence={() => setOverlay('intelligence')} onOpenReview={() => setOverlay('review')} onOpenPlace={openPlace} />)}
        {overlay === 'document' && <DocumentWorkspace key="document" mode={docMode} onModeChange={setDocMode} selected={selectedCompare} onToggle={id => toggleSelection(id, 'document')} onRemember={handleRememberDoc} remembered={docRemembered} onClose={() => { setDocFocusHint(null); setOverlay(null) }} state={state} onOpenReview={() => setOverlay('review')} onOpenEvidence={() => setOverlay('evidence')} onOpenEpilogue={() => setOverlay('epilogue')} onOpenBrief={openBrief} focusHint={docFocusHint} reviewOrigin={currentOrigin ?? undefined} onBackToOrigin={backToReviewOrigin} onOpenFolio={openFolio} />}
        {overlay === 'plan' && <PlanDrawer key="plan" onClose={() => setOverlay(null)} onConfirm={handleConfirmPlan} canPlan={!taskStarted} state={state} />}
        {overlay === 'intelligence' && <IntelligenceDrawer key="intel" clues={state.clues} asked={state.asked} onClose={() => setOverlay(null)} onOpenSource={openSource} onOpenEvidence={() => setOverlay('evidence')} state={state} readAcrossJump={readAcrossJump} onOpenLastReview={focus => openDocumentAt(focus, 'intel')} onOpenRumor={openRumorTarget} reviewOrigin={currentOrigin ?? undefined} onBackReviewOrigin={backToReviewOrigin} />}
        {overlay === 'evidence' && <EvidenceBoard key="evidence" state={state} initialRef={evidenceFocus} onClose={() => { setOverlay(null); setEvidenceFocus(null) }} onOpenSource={openSource} />}
        {overlay === 'banquet' && <BanquetModal key="banquet" period={period} onClose={() => setOverlay(null)} onChoose={handleBanquet} />}
        {overlay === 'person' && <PersonPanel key="person" person={selectedPerson} state={state} onClose={() => setOverlay(null)} onAsk={handleAsk} archivePage={personArchive} onArchivePage={setPersonArchive} onOpenPerson={id => { setSelectedPersonId(id); setPersonArchive('home') }} onOpenEvidence={ref => { setEvidenceFocus(ref); setReturnSpot(captureSpot('人物档案', `${selectedPerson.name} · 历史与公文 · ${ref}`)); setOverlay('evidence'); focusOn('evidence-chain') }} onOpenIntel={() => { setReturnSpot(captureSpot('人物档案', `${selectedPerson.name} · 全貌档案`)); setOverlay('intelligence'); focusOn('intel-drawer') }} onGoScene={scene => { setOverlay(null); setActiveSection('today'); changeScene(scene) }} />}
        {overlay === 'review' && <OfficialReview key="review" state={state} onClose={() => setOverlay(null)} onAction={handleOfficial} />}
        {overlay === 'world' && currentEvent && <WorldEventCard key={`world-${currentEvent.id}`} event={currentEvent} onChoose={chooseEventOption} onLater={() => { narrator.dismiss(); setOverlay(null) }} currentDay={state.day} onLocateDay={locateWorldDay} generated={Boolean(generatedEvent && currentEvent.id === generatedEvent.id)} optionNotes={generatedNotes} />}
        {overlay === 'world' && !currentEvent && <NarrationCard key="narration" run={narrator.run} ready={narrator.ready} intent={narrationIntent} onIntent={setNarrationIntent} onAwait={() => narrator.awaitInk(narrationIntent)} onSkip={narrator.skip} onCancel={() => { narrator.cancel(); setOverlay(null) }} configSlot={<NarratorConfig defaultOpen={!narrator.ready} />} />}
        {overlay === 'epilogue' && <EpilogueCard key="epilogue" state={state} onClose={() => setOverlay(null)} onOpenCausality={openCausality} onLocate={locateFromEpilogue} onOpenReviewGroup={focus => openDocumentAt(focus, 'epilogue')} onOpenStreet={() => openRumorTarget('street')} reviewOrigin={currentOrigin ?? undefined} onBackReviewOrigin={backToReviewOrigin} onOpenFolio={openFolio} verdict={verdictOf(state)} onRestart={() => { game.resetGame(); narrator.cancel(); setPrologueDone(false); setOverlay(null); setActiveSection('today'); changeScene('county') }} />}
        {overlay === 'power' && <PowerFolio key="power" state={state} onClose={() => setOverlay(null)} handlers={powerHandlers} />}
        {overlay === 'rule' && <RuleBook key="rule" state={state} initialClause={ruleFocus} onClose={() => setOverlay(null)} />}
        {overlay === 'brief' && <BriefDraft key="brief" state={state} onClose={() => setOverlay(null)} onOpenPlan={openPlan} onOpenReview={() => setOverlay('review')} onOpenDossier={() => { openDocument('dossier'); focusOn('doc-kind-chain') }} />}
        {overlay === 'debt' && <DebtLedger key="debt" state={state} onClose={() => setOverlay(null)} onOpenPerson={id => openPerson(id)} focusPersonId={debtFocusId ?? undefined} onBackToNetwork={id => locatePeopleNetwork(id)} />}
        {overlay === 'profile' && <ProfileFolio key="profile" state={state} onClose={() => setOverlay(null)} onOpenPower={() => { setOverlay('power'); focusOn('power-folio') }} onOpenLedger={() => { setOverlay(null); setActiveSection('ledger'); focusOn('ledger-three') }} onOpenGift={() => { openLifeDestination('gift'); focusOn('gift-sheet') }} onOpenCitation={() => setOverlay('epilogue')} onOpenEpilogue={() => setOverlay('epilogue')} onOpenIntel={() => { setOverlay('intelligence'); focusOn('intel-drawer') }} onOpenPeople={() => { setOverlay(null); setActiveSection('people') }} onOpenAffairs={() => { setOverlay(null); setActiveSection('affairs'); focusOn('world-clock') }} />}
        {overlay === 'causality' && <CausalitySheet key="causality" state={state} onClose={() => setOverlay(null)} onOpen={handler => powerHandlers[handler]?.()} />}
        {overlay === 'desk' && <DrawerFrame key="desk" title="今日案头" eyebrow="掌上案头 / 与桌面同源" onClose={() => setOverlay(null)} className="desk-drawer"><div className="drawer-scroll desk-sheet"><TodayAside {...todayAsideProps} idPrefix="desk" withDeskIndex /></div></DrawerFrame>}
        {overlay === 'summary' && <DaySummary key="summary" log={state.log} privateFunds={state.privateFunds} day={state.day} reckoning={goalReckoningOf(state)} onContinue={handleNextDay} onLocate={locateFromLog} />}
        {overlay === 'signing' && state.plan && <SigningSeal key="signing" plan={state.plan} onDone={finishSigning} />}
        {(!prologueDone || overlay === 'goal') && <GoalPrologue key="goal" selected={state.goalId} onSelect={game.setGoal} onStart={() => { if (!state.goalId) return; setPrologueDone(true); setOverlay(null) }} onReset={prologueDone ? () => { game.resetGame(); setPrologueDone(false); setOverlay(null); setActiveSection('today'); changeScene('county') } : undefined} saveSummary={prologueDone ? saveSummary : undefined} onExport={exportSave} narrativeSlot={<NarratorConfig />} />}
      </AnimatePresence>

      <AnimatePresence>
        {returnSpot && (
          <motion.button
            type="button"
            className="return-chip"
            key={`return-${returnSpot.label}`}
            onClick={() => returnToSpot(returnSpot)}
            data-overlay={overlay ? 'true' : 'false'}
            data-folio-mount="true"
            aria-label={`回到${returnSpot.label}${returnSpot.detail ? ` · ${returnSpot.detail}` : ''}`}
            initial={{ opacity: 0, x: reduceMotion ? 0 : -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0 : .18 }}
          >
            <ArrowLeft size={12} />
            <span className="return-chip-text"><span>回 · {returnSpot.label}</span><small>{returnSpot.detail}</small></span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {arrivedSpot && (
          <motion.div
            className="return-arrived"
            key={`arrived-${arrivedSpot}`}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }}
            transition={{ duration: reduceMotion ? 0 : .2 }}
          >
            <Check size={11} />
            <span>已归位</span>
            <small>{arrivedSpot}</small>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <motion.div className="toast" key={toast.id} role="status" aria-live="polite" aria-atomic="true" initial={{ opacity: 0, y: reduceMotion ? 0 : 14, x: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : .985 }} animate={{ opacity: 1, y: 0, x: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 5, x: reduceMotion ? 0 : 16 }} transition={{ duration: reduceMotion ? 0 : .22, ease: 'easeOut' }}><div className="toast-seal"><Check size={17} /></div><div><h3>{toast.title}</h3><p>{toast.detail}</p></div><button onClick={dismissToast} aria-label="关闭提示" title="收起通知"><X size={15} /></button></motion.div>}</AnimatePresence>
    </div>
    </RuleBookContext.Provider>
    </FocusContext.Provider>
    </MotionConfig>
  )
}
