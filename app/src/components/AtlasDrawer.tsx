import { useState, type KeyboardEvent } from 'react'
import { KnowledgeLegend } from './KnowledgeLegend'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, Clock3, Coins, Compass, FileText, Footprints, Home, Landmark, Map as MapIcon, MapPin, Mountain, PackageOpen, PenLine, Route as RouteIcon, ScrollText, Ship, Store, UserRound, Waves, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import { ScenePlate } from './ScenePlate'
import { CityAtlas } from './CityAtlas'
import { PlaceTrail } from './PlaceTrail'
import type { PlaceId } from '../placeTrail'
import type { LocationSceneId } from './LocationScene'
import type { CityLocationId, MapKnowledge, StreetStationId } from '../city'
import type { GameState } from '../game/useGame'
import type { Period, SceneId } from '../types'

export type AtlasView = 'map' | 'city' | 'journey' | 'arrival'
type Knowledge = MapKnowledge

interface AtlasNode {
  id: string
  name: string
  type: string
  x: number
  y: number
  knowledge: Knowledge
  source: string
  summary: string
  icon: typeof Landmark
}

interface AtlasRoute {
  id: string
  name: string
  path: string
  labelX: number
  labelY: number
  type: string
  duration: string
  risk: string
  source: string
}

const nodes: AtlasNode[] = [
  { id: 'county', name: '县治', type: '城郭入口', x: 43, y: 48, knowledge: '见图', source: '官图 / 附录 F 样值', summary: '县衙、街市、茶楼与内宅仍进城郭索引，不在舆图里嵌第二层室内地图。', icon: Landmark },
  { id: 'river', name: '东堤', type: '河工现场', x: 74, y: 36, knowledge: '见图', source: '河工呈文 / 当前案卷接口', summary: '旧闸、渗水点与料场已有案卷接口；这里只展开行程样纸，不改同城进入规则。', icon: Waves },
  { id: 'ferry', name: '河湾渡口', type: '水路节点', x: 62, y: 70, knowledge: '见图', source: '官图 / 附录 F 样值', summary: '渡票、脚夫与汛期停摆只作样本字段；本局尚无船家口供或渡票。', icon: Ship },
  { id: 'town', name: '青石镇', type: '市镇', x: 25, y: 30, knowledge: '见图', source: '官图 / 附录 F 样值', summary: '粮行、牙行与驿铺是 M2 地点名目；未接触时不生成粮价或人物秘密。', icon: Store },
  { id: 'station', name: '北驿铺', type: '驿传节点', x: 20, y: 68, knowledge: '听说', source: '驿路传闻 / 附录 F 样值', summary: '号簿、换马与过境消息尚无本局来源，保持待核，不写成已经可查。', icon: Home },
  { id: 'manor', name: '桑家庄', type: '乡村节点', x: 78, y: 72, knowledge: '听说', source: '桑鹤龄请帖 / 既有地点知识', summary: '士绅、宗祠与坟地只沿用既有请帖口径；舆图不显示未接触的田亩和资源。', icon: MapPin },
  { id: 'prefecture', name: '府城', type: '县外接口', x: 45, y: 12, knowledge: '见图', source: '官道官图 / M2-B 接口', summary: '官道约二日仅为附录 F 样值；本节点不展开府城，不启用跨县行程。', icon: Landmark },
  { id: 'unknown', name: '西路旧渡', type: '未详', x: 12, y: 48, knowledge: '未详', source: '', summary: '', icon: Mountain },
]

const routes: AtlasRoute[] = [
  { id: 'county-river', name: '县治—东堤', path: 'M43 48 Q58 34 74 36', labelX: 53, labelY: 34, type: '堤路 / 官道', duration: '约半日 · 1 段', risk: '汛期封闭；堤口或遇工头', source: '附录 F / M2 样值' },
  { id: 'county-ferry', name: '县治—河湾', path: 'M43 48 Q48 68 62 70', labelX: 43, labelY: 65, type: '官道', duration: '约半日 · 1 段', risk: '渡票、脚夫；雨天停摆', source: '附录 F / M2 样值' },
  { id: 'county-station', name: '县治—北驿', path: 'M43 48 Q30 58 20 68', labelX: 25, labelY: 54, type: '官道', duration: '约一日 · 2 段', risk: '驿马不足；可寄信', source: '附录 F / M2 样值' },
  { id: 'county-town', name: '县治—青石', path: 'M43 48 Q33 34 25 30', labelX: 29, labelY: 41, type: '驿路', duration: '约一日 · 2 段', risk: '税卡、粮价、牙行', source: '附录 F / M2 样值' },
  { id: 'town-station', name: '青石—北驿', path: 'M25 30 Q15 47 20 68', labelX: 13, labelY: 36, type: '乡路', duration: '约半日 · 1 段', risk: '近路夜间难行', source: '附录 F / M2 样值' },
  { id: 'ferry-manor', name: '河湾—桑家庄', path: 'M62 70 Q70 77 78 72', labelX: 65, labelY: 80, type: '水路', duration: '约半日 · 1 段', risk: '水位与船家关系；可带信', source: '附录 F / M2 样值' },
  { id: 'manor-river', name: '桑家庄—东堤', path: 'M78 72 Q84 52 74 36', labelX: 82, labelY: 51, type: '堤路', duration: '约一晨 · 1 段', risk: '取土与坟地冲突；洪水断路', source: '附录 F / M2 样值' },
  { id: 'county-prefecture', name: '县治—府城', path: 'M43 48 Q52 28 45 12', labelX: 49, labelY: 22, type: '官道 / M2-B', duration: '约二日 · 4 段', risk: '实际路况待核', source: '官图 / 尚未启用' },
]

const viewTabs: Array<{ id: AtlasView, label: string, note: string }> = [
  { id: 'map', label: '一县舆图', note: '节点与路段' },
  { id: 'city', label: '县治城郭', note: '地点与在场' },
  { id: 'journey', label: '行程样纸', note: '只预演' },
  { id: 'arrival', label: '抵达样张', note: '回既有场景' },
]

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

interface AtlasDrawerProps {
  state: GameState
  period: Period
  scene: SceneId
  initialView?: AtlasView
  initialNode?: string
  initialCityLocation?: CityLocationId
  initialStreetId?: StreetStationId
  onClose: () => void
  onGoRiver: () => void
  onGoCounty: () => void
  onGoStudy: () => void
  onReturnStreet: (stationId: StreetStationId) => void
  onReturnHome: () => void
  onOpenLedger: () => void
  onOpenForeman: () => void
  onOpenBanquet: () => void
  onOpenPerson: (id: string) => void
  onOpenLocation: (id: LocationSceneId) => void
  onOpenPlace?: (id: PlaceId) => void
}

export function AtlasDrawer({ state, period, scene, initialView = 'map', initialNode = 'river', initialCityLocation = 'county', initialStreetId, onClose, onGoRiver, onGoCounty, onGoStudy, onReturnStreet, onReturnHome, onOpenLedger, onOpenForeman, onOpenBanquet, onOpenPerson, onOpenLocation, onOpenPlace }: AtlasDrawerProps) {
  const [view, setView] = useState<AtlasView>(initialView)
  const [selectedNode, setSelectedNode] = useState(initialNode)
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [journeyRoute, setJourneyRoute] = useState<'dike' | 'ferry'>('dike')
  const [unfolding, setUnfolding] = useState(false)
  const [folded, setFolded] = useState(false)
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const activeNode = nodes.find(node => node.id === selectedNode) ?? nodes[1]
  const activeRoute = routes.find(route => route.id === selectedRoute)
  const knowledgeOf = (node: AtlasNode): Knowledge => node.id === 'county' && scene !== 'river' ? '亲至' : node.id === 'river' && scene === 'river' ? '亲至' : node.knowledge
  const activeKnowledge = knowledgeOf(activeNode)
  const ActiveNodeIcon = activeNode.icon

  const selectNode = (id: string) => {
    setSelectedNode(id)
    setSelectedRoute(null)
    setView('map')
  }

  const handleViewKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = viewTabs.findIndex(tab => tab.id === view)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? viewTabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % viewTabs.length : (current - 1 + viewTabs.length) % viewTabs.length
    const nextView = viewTabs[next].id
    setView(nextView)
    requestAnimationFrame(() => document.getElementById(`atlas-tab-${nextView}`)?.focus())
  }

  const handleNodeKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')
    if (!target) return
    event.preventDefault()
    const current = Math.max(0, nodes.findIndex(node => node.id === target.dataset.nodeId))
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (current + (backward ? -1 : 1) + nodes.length) % nodes.length
    selectNode(nodes[next].id)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-node-id="${nodes[next].id}"]`)?.focus())
  }

  const previewJourney = () => {
    if (reduceMotion) {
      setView('arrival')
      return
    }
    setUnfolding(true)
  }

  const pageMotion = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 9 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -6 },
    transition: { duration: reduceMotion ? 0 : .2, ease: 'easeOut' as const },
  }

  return (
    <motion.section className="overlay-backdrop atlas-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="atlas-drawer" role="dialog" aria-modal="true" aria-labelledby="atlas-title" tabIndex={-1} layoutId="overlay-paper" initial={{ opacity: 0, y: reduceMotion ? 0 : 25, rotate: reduceMotion ? 0 : -.25 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 15 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 27 }} data-atlas-view={view}>
        <header className="atlas-head">
          <div><span className="eyebrow">案头抽图 / 已知空间的纸面投影</span><h2 id="atlas-title">永济一县舆图</h2></div>
          <span className="atlas-preview-seal">M2<br />预览</span>
          <button className="icon-button" onClick={onClose} aria-label="收起舆图"><X size={20} /></button>
        </header>
        <PlaceTrail current={scene} onOpen={onOpenPlace} />
        <div className="atlas-view-tabs" role="tablist" aria-label="舆图工作面" onKeyDown={handleViewKeys}>
          {viewTabs.map(tab => <button key={tab.id} id={`atlas-tab-${tab.id}`} role="tab" aria-selected={view === tab.id} aria-controls={`atlas-panel-${tab.id}`} tabIndex={view === tab.id ? 0 : -1} onClick={() => setView(tab.id)}>
            {view === tab.id && <motion.span className="atlas-tab-ink" layoutId="atlas-tab-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} aria-hidden="true" />}
            <span>{tab.label}</span><small>{tab.note}</small>
          </button>)}
        </div>

        <div className="atlas-body">
          <AnimatePresence mode="wait" initial={false}>
            {view === 'map' && <motion.div key="map" id="atlas-panel-map" role="tabpanel" aria-labelledby="atlas-tab-map" className="atlas-map-layout" {...pageMotion}>
              <section className="atlas-map-paper" data-folded={folded} aria-label="一县节点路段图" onKeyDown={handleNodeKeys} ref={node => { if (node) Array.from(node.querySelectorAll<HTMLButtonElement>('[data-node-id]')).forEach((el, index) => { el.tabIndex = index === 0 ? 0 : -1 }) }}>
                <div className="atlas-map-inscription"><span>永济县舆图</span><small>官图抄样 · 旧补纸</small></div>
                <button className="atlas-fold-toggle" onClick={() => setFolded(value => !value)} aria-pressed={folded}>{folded ? '展卷' : '折页'}</button>
                <ScenePlate id="county-map" className="atlas-art-plate" />
                <svg className="atlas-route-network" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {routes.map((route, routeIndex) => <g key={route.id} className={`atlas-route ${selectedRoute === route.id ? 'selected' : ''}`} role="button" tabIndex={selectedRoute === route.id || (!selectedRoute && routeIndex === 0) ? 0 : -1} aria-label={`查验路段 ${route.name}`} onClick={() => { setSelectedRoute(route.id); setView('map') }} onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRoute(route.id); return }
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const current = routes.findIndex(item => item.id === route.id)
                    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? routes.length - 1 : (current + (backward ? -1 : 1) + routes.length) % routes.length
                    setSelectedRoute(routes[next].id)
                    requestAnimationFrame(() => dialogRef.current?.querySelectorAll<SVGGElement>('.atlas-route')[next]?.focus())
                  }}>
                    <path className="atlas-route-hit" d={route.path} /><path className="atlas-route-ink" d={route.path} />
                    <text x={route.labelX} y={route.labelY}>{route.name}</text>
                  </g>)}
                </svg>
                {nodes.map(node => {
                  const knowledge = knowledgeOf(node)
                  return <button key={node.id} data-node-id={node.id} className={`atlas-node knowledge-${knowledge} ${selectedNode === node.id && !selectedRoute ? 'selected' : ''} ${knowledge === '未详' ? 'is-unknown' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} aria-pressed={selectedNode === node.id && !selectedRoute} onClick={() => selectNode(node.id)}>
                    <span className="atlas-node-mark"><node.icon size={14} /></span><b>{node.name}</b><small>{knowledge}</small>
                  </button>
                })}
                <div className="atlas-fold atlas-fold-a" aria-hidden="true" /><div className="atlas-fold atlas-fold-b" aria-hidden="true" />
                <KnowledgeLegend className="atlas-map-legend" note="只读认知档位 · 不改图" />
              </section>

              <aside className="atlas-inspector" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  {activeRoute ? <motion.section key={activeRoute.id} className="atlas-route-inspector" initial={{ opacity: 0, x: reduceMotion ? 0 : 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .17 }}>
                    <header><span>路段查验 / {activeRoute.id}</span><RouteIcon size={18} /></header>
                    <div className="atlas-inspector-title"><RouteIcon size={24} /><div><span>{activeRoute.type}</span><h3>{activeRoute.name}</h3></div></div>
                    <dl><div><dt>约需</dt><dd>{activeRoute.duration}</dd></div><div><dt>所限</dt><dd>{activeRoute.risk}</dd></div><div><dt>来源</dt><dd>{activeRoute.source}</dd></div></dl>
                    <p className="atlas-boundary-note">路段时长与风险都是 M2 样值。选中不等于签下行程，也不会推进当前时辰。</p>
                    {activeRoute.id === 'county-river' && <button className="primary-button" onClick={() => setView('journey')}>展开东堤行程样纸<ArrowRight size={15} /></button>}
                  </motion.section> : <motion.section key={activeNode.id} className="atlas-node-inspector" initial={{ opacity: 0, x: reduceMotion ? 0 : 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .17 }}>
                    <header><span>节点查验 / {activeNode.id}</span><Compass size={18} /></header>
                    <div className="atlas-inspector-title"><ActiveNodeIcon size={24} /><div><span>{activeNode.type}</span><h3>{activeNode.name}</h3></div><b className={`knowledge-seal knowledge-${activeKnowledge}`}>{activeKnowledge}</b></div>
                    {activeKnowledge === '未详' ? <div className="atlas-unknown-empty"><Mountain size={26} /><p>此处没有可核验的图注与路程。</p><small>不补全地名由来、人物、资源或路线。</small></div> : <>
                      <p className="atlas-node-summary">{activeNode.summary}</p>
                      <div className="atlas-source-line"><BookOpen size={14} /><div><span>认知来源</span><p>{activeNode.source}</p></div></div>
                      <div className="atlas-knowledge-note"><PenLine size={13} /><span>{activeKnowledge === '亲至' ? '只表示此刻所在 不代表知道当地秘密' : activeKnowledge === '见图' ? '图上见过 不等于亲至或核实' : '只记听说来源 不转成事实'}</span></div>
                      {activeNode.id === 'county' && <button className="primary-button" onClick={() => setView('city')}>展开县治城郭图<ArrowRight size={15} /></button>}
                      {activeNode.id === 'river' && <button className="primary-button" onClick={() => setView('journey')}>展开行程样纸<ArrowRight size={15} /></button>}
                      {['ferry', 'station', 'town', 'manor'].includes(activeNode.id) && <button className="primary-button" onClick={() => onOpenLocation(activeNode.id as LocationSceneId)}>进入{activeNode.name}场景样张<ArrowRight size={15} /></button>}
                    </>}
                  </motion.section>}
                </AnimatePresence>
                <footer><MapIcon size={13} /><span>节点与墨线都可点选 · 方向键移节点</span></footer>
              </aside>
            </motion.div>}

            {view === 'city' && <motion.section key="city" id="atlas-panel-city" role="tabpanel" aria-labelledby="atlas-tab-city" className="city-panel" {...pageMotion}>
              <CityAtlas state={state} period={period} scene={scene} initialLocation={initialCityLocation} initialStreetId={initialStreetId} onGoScene={next => { if (next === 'county') onGoCounty(); else if (next === 'study') onGoStudy() }} onReturnStreet={onReturnStreet} onReturnHome={onReturnHome} onOpenLedger={onOpenLedger} onOpenBanquet={onOpenBanquet} onOpenPerson={onOpenPerson} />
            </motion.section>}

            {view === 'journey' && <motion.section key="journey" id="atlas-panel-journey" role="tabpanel" aria-labelledby="atlas-tab-journey" className="journey-preview" {...pageMotion}>
              <header className="journey-title"><div><span className="eyebrow">行程确认 / 总纲附录 F 样纸</span><h3>县治 <i /> 东堤</h3></div><span>第{dayNames[state.day - 1]}日 · {period}<small>预演不推进</small></span></header>
              <div className="journey-ledger-strip"><span><Clock3 size={14} />时辰 <b>不结算</b></span><span><Coins size={14} />路费 <b>不扣减</b></span><span><Footprints size={14} />身体 <b>不变化</b></span><span><FileText size={14} />事件 <b>不生成</b></span></div>
              <div className="journey-route-options" aria-label="东堤行程样纸路线">
                <button className={journeyRoute === 'dike' ? 'selected' : ''} aria-pressed={journeyRoute === 'dike'} onClick={() => setJourneyRoute('dike')}>
                  {journeyRoute === 'dike' && <motion.span className="journey-choice-ink" layoutId="journey-choice-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
                  <span className="journey-route-index">甲</span><div><small>堤路 / 样值</small><h4>走堤路</h4><p>约半日 · 1 段。汛期可能封路；可在堤口遇见工头。</p><footer><span>路费待核</span><span>快 / 有汛限</span></footer></div>
                </button>
                <button className={journeyRoute === 'ferry' ? 'selected' : ''} aria-pressed={journeyRoute === 'ferry'} onClick={() => setJourneyRoute('ferry')}>
                  {journeyRoute === 'ferry' && <motion.span className="journey-choice-ink" layoutId="journey-choice-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
                  <span className="journey-route-index">乙</span><div><small>河湾绕行 / 字段待核</small><h4>绕河湾</h4><p>可问船家，但本局尚无船家口供。绕行时段与渡票不补写。</p><footer><span>时段待核</span><span>渡票待核</span></footer></div>
                </button>
              </div>
              <section className="journey-confirm-paper">
                <header><ScrollText size={17} /><span>行程样纸 / {journeyRoute === 'dike' ? '堤路' : '河湾绕行'}</span><b>未签</b></header>
                <dl><div><dt>起点</dt><dd>县治</dd></div><div><dt>终点</dt><dd>东堤堤口</dd></div><div><dt>预计</dt><dd>{journeyRoute === 'dike' ? '约半日 · 1 段（样值）' : '未详 · 不填数'}</dd></div><div><dt>限制</dt><dd>{journeyRoute === 'dike' ? '汛期封闭（样本字段）' : '雨天停摆（样本字段）'}</dd></div></dl>
                <p>这是确认界面的视觉预演，不是 Journey 提交。点击后只展开卷图并翻到抵达样张。</p>
                <button className="primary-button journey-preview-button" onClick={previewJourney}>预演卷图 · 不耗时<ArrowRight size={16} /></button>
              </section>
            </motion.section>}

            {view === 'arrival' && <motion.section key="arrival" id="atlas-panel-arrival" role="tabpanel" aria-labelledby="atlas-tab-arrival" className="arrival-preview" {...pageMotion}>
              <div className="arrival-landscape"><ScenePlate id="arrival" className="arrival-art-plate" /><span>东堤堤口 / 抵达第一眼</span></div>
              <div className="arrival-content">
                <header><div><span className="eyebrow">抵达样张 / 复用 M1 可玩场景</span><h3>{state.day >= 9 ? '堤口水痕未退，旧闸仍在。' : state.day >= 8 ? '雨线未歇，料垛压在坡下。' : '旧闸下风过堤，料垛在坡下。'}</h3></div><span className="arrival-date-seal">第{dayNames[state.day - 1]}日<br />{period}</span></header>
                <div className="arrival-state-grid"><article><span>时辰</span><b>第{dayNames[state.day - 1]}日 · {period}</b><small>预演未推进</small></article><article><span>路费 / 身体</span><b>未结算</b><small>不制造变化</small></article><article><span>料账</span><b>{state.material.arrived} / {state.material.transit} / {state.material.unsent}</b><small>到场 / 在途 / 未发</small></article><article><span>案卷</span><b>{state.plan ? '抢护已发起' : '尚未签押'}</b><small>{state.probeKnown ? 'E-007 已有探挖记录' : '呈文两版仍可回查'}</small></article></div>
                <div className="arrival-anchors" aria-label="返回既有场景接口">
                  <button className="arrival-go-river" onClick={onGoRiver}><Waves size={18} /><div><b>回当前东堤</b><small>同城进入 · 原场景回调</small></div><ArrowRight size={15} /></button>
                  <button className="arrival-open-ledger" onClick={onOpenLedger}><PackageOpen size={18} /><div><b>查看料账</b><small>原账房与三数五账</small></div><ArrowRight size={15} /></button>
                  <button className="arrival-open-foreman" onClick={onOpenForeman}><UserRound size={18} /><div><b>问堡夫头</b><small>原人物卷与问话接口</small></div><ArrowRight size={15} /></button>
                </div>
                <p className="arrival-boundary-note">抵达样张不表示完成了一段行程。三个入口只返回本局已有场景、账房和人物，不触发新的抵达结算。</p>
              </div>
            </motion.section>}
          </AnimatePresence>
        </div>

        <footer className="atlas-foot"><span><Compass size={13} />M2 纸面预览 · 地图认知不等于情报可信度 · 不启用跨地行程</span><button className="outline-button" onClick={onClose}>合图 回到原来所在</button></footer>
        <AnimatePresence>{unfolding && <motion.div className="atlas-unfold" initial={{ clipPath: 'inset(0 49.7% 0 49.7%)' }} animate={{ clipPath: 'inset(0 0% 0 0%)' }} exit={{ opacity: 0 }} transition={{ duration: .9, ease: [.76, 0, .24, 1] }} onAnimationComplete={() => { setUnfolding(false); setView('arrival') }}><div><MapIcon size={25} /><span>县治 <i /> 东堤</span><b>卷图预演</b><small>第{dayNames[state.day - 1]}日 · {period} / 时辰未变</small></div></motion.div>}</AnimatePresence>
      </motion.div>
    </motion.section>
  )
}
