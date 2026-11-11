import { ScenePlate } from './ScenePlate'
import { useState, type KeyboardEvent } from 'react'
import { KnowledgeLegend } from './KnowledgeLegend'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, Clock3, EyeOff, MapPin, ScrollText, UserRound, UsersRound } from 'lucide-react'
import { cityLocationOf, cityLocations, streetStationOf, streetStations, type CityLocationId, type MapKnowledge, type StreetStationId } from '../city'
import type { GameState } from '../game/useGame'
import type { Period, SceneId } from '../types'

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

interface CityAtlasProps {
  state: GameState
  period: Period
  scene: SceneId
  initialLocation: CityLocationId
  initialStreetId?: StreetStationId
  onGoScene: (scene: SceneId) => void
  onReturnStreet: (stationId: StreetStationId) => void
  onReturnHome: () => void
  onOpenLedger: () => void
  onOpenBanquet: () => void
  onOpenPerson: (id: string) => void
}

export function CityAtlas({ state, period, scene, initialLocation, initialStreetId, onGoScene, onReturnStreet, onReturnHome, onOpenLedger, onOpenBanquet, onOpenPerson }: CityAtlasProps) {
  const initialStreet = streetStationOf(initialStreetId)
  const [activeLocationId, setActiveLocationId] = useState<CityLocationId>(initialStreet?.cityLocationId ?? initialLocation)
  const [activeStreetId, setActiveStreetId] = useState<StreetStationId | null>(initialStreet?.id ?? null)
  const reduceMotion = useReducedMotion()
  const activeLocation = cityLocationOf(activeLocationId)
  const activeStreet = streetStationOf(activeStreetId)
  const streetContext = activeLocationId === 'street' || activeLocationId === 'tea' || activeLocationId === 'wharf' ? activeStreet : undefined
  const isCurrent = activeLocationId === 'county' && scene === 'county' || activeLocationId === 'study' && scene === 'study'
  const knowledge: MapKnowledge = isCurrent ? '亲至' : activeLocation.knowledge
  const ActiveIcon = activeLocation.icon
  const banquetPending = state.day === 1 && period === '夜' && state.giftEntries.length === 0
  const source = streetContext?.source ?? activeLocation.source
  const accounts = streetContext?.accounts ?? activeLocation.accounts
  const sourceId = streetContext?.recordId || '认知来源'
  const summary = streetContext && activeLocationId === 'street' ? streetContext.text : activeLocation.summary

  const selectLocation = (id: CityLocationId) => {
    setActiveLocationId(id)
    if (id === 'tea' || id === 'wharf') setActiveStreetId(id)
    else setActiveStreetId(null)
  }

  const selectStreet = (id: StreetStationId) => {
    const station = streetStationOf(id)
    if (!station) return
    setActiveStreetId(id)
    setActiveLocationId(station.cityLocationId)
  }

  const handleLocationKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-city-location]')
    if (!target) return
    event.preventDefault()
    const current = Math.max(0, cityLocations.findIndex(location => location.id === target.dataset.cityLocation))
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cityLocations.length - 1 : (current + (backward ? -1 : 1) + cityLocations.length) % cityLocations.length
    selectLocation(cityLocations[next].id)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-city-location="${cityLocations[next].id}"]`)?.focus())
  }

  const handleStreetKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-street-id]')
    if (!target) return
    event.preventDefault()
    const current = Math.max(0, streetStations.findIndex(station => station.id === target.dataset.streetId))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? streetStations.length - 1 : event.key === 'ArrowRight' ? (current + 1) % streetStations.length : (current - 1 + streetStations.length) % streetStations.length
    selectStreet(streetStations[next].id)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-street-id="${streetStations[next].id}"]`)?.focus())
  }

  const pageMotion = {
    initial: { opacity: 0, x: reduceMotion ? 0 : 9 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduceMotion ? 0 : -6 },
    transition: { duration: reduceMotion ? 0 : .18 },
  }

  return (
    <div className="city-atlas" data-city-location-active={activeLocationId} data-street-active={activeStreetId ?? ''}>
      <section className="city-map-paper" aria-label="县治城郭八处地点图" onKeyDown={handleLocationKeys} ref={node => { if (node) Array.from(node.querySelectorAll<HTMLButtonElement>('.city-location-node')).forEach((el, index) => { el.tabIndex = index === 0 ? 0 : -1 }) }}>
        <div className="city-map-inscription"><span>永济县治</span><small>城郭抄样 · 地点索引</small></div>
        <ScenePlate id="city-map" className="city-art-plate" />
        <div className="city-gate-caption" aria-hidden="true"><span>城门</span><i /><small>同城不记行程</small></div>
        {cityLocations.map(location => {
          const current = location.id === 'county' && scene === 'county' || location.id === 'study' && scene === 'study'
          const locationKnowledge: MapKnowledge = current ? '亲至' : location.knowledge
          const LocationIcon = location.icon
          return <button key={location.id} data-city-location={location.id} className={`city-location-node knowledge-${locationKnowledge} ${activeLocationId === location.id ? 'selected' : ''} ${current ? 'is-current' : ''}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} aria-pressed={activeLocationId === location.id} onClick={() => selectLocation(location.id)}>
            <span className="city-location-mark"><LocationIcon size={14} /></span><b>{location.name}</b><small>{current ? '此刻 · 亲至' : locationKnowledge}</small>
          </button>
        })}
        <KnowledgeLegend className="city-map-legend" note="地点可换 时辰不动" />
      </section>

      <aside className="city-inspector" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${activeLocationId}-${activeStreetId ?? 'index'}`} className="city-inspector-page" {...pageMotion}>
            <header className="city-inspector-head"><span>城郭查验 / {activeLocation.id}</span><b className={`knowledge-seal knowledge-${knowledge}`}>{knowledge}</b></header>
            <div className="city-inspector-title"><ActiveIcon size={24} /><div><span>{activeLocation.label}{streetContext && activeLocationId === 'street' ? ` · ${streetContext.name}` : ''}</span><h3>{activeLocation.name}</h3></div>{isCurrent && <b className="city-current-seal">此刻</b>}</div>
            <div className="city-time-source"><span><Clock3 size={14} />第{dayNames[state.day - 1]}日 · {period}</span><small>读图与同城进入不耗时段</small></div>
            <p className="city-location-summary">{summary}</p>

            {(activeLocationId === 'street' || activeLocationId === 'tea' || activeLocationId === 'wharf') && <div className="city-street-shared" onKeyDown={handleStreetKeys}>
              <header><span>街市六处 / 同源投影</span><small>点选同步城郭节点</small></header>
              <div>{streetStations.map(station => <button key={station.id} data-street-id={station.id} className={`city-station-chip ${activeStreetId === station.id ? 'selected' : ''}`} aria-pressed={activeStreetId === station.id} onClick={() => selectStreet(station.id)}><station.icon size={13} /><span>{station.name}</span><small>{station.status}</small></button>)}</div>
            </div>}

            <section className="city-presence" aria-label="在场人物边界">
              <header><UsersRound size={15} /><span>在场人物 / 只读已有来源</span></header>
              <dl>
                <div><dt>固定在场</dt><dd>未详 · 不补写</dd></div>
                <div><dt>定时来客</dt><dd>{activeLocationId === 'sang' && banquetPending ? '桑鹤龄做东；县丞与粮商将到（原请帖）' : '未详 · 不沿用旧请帖或人物身份'}</dd></div>
                <div><dt>无名场面人</dt><dd>未详 · 不随机生成</dd></div>
              </dl>
              {isCurrent && <p><MapPin size={12} />你在此场景；这不增加对其他人物的在场认知。</p>}
            </section>

            <div className="city-source-account">
              <div className="city-source"><BookOpen size={14} /><div><span>{sourceId}</span><p>{source}</p></div></div>
              <div className="city-accounts"><span>关联网账</span><div>{accounts.length ? accounts.map(account => <b key={account}>{account}</b>) : <b className="empty">无新增账目</b>}</div></div>
            </div>

            <section className="city-actions" aria-label="可做之事与既有入口">
              <header><ScrollText size={14} /><span>可做之事 / 只回既有入口</span></header>
              <div>
                {activeLocationId === 'county' && <><button className="primary-button" onClick={() => onGoScene('county')}>回县衙签押房<ArrowRight size={14} /></button><button className="outline-button" onClick={onOpenLedger}>查看旧账与三数<ArrowRight size={14} /></button></>}
                {activeLocationId === 'study' && <button className="primary-button" onClick={() => onGoScene('study')}>回夜书房原场景<ArrowRight size={14} /></button>}
                {activeLocationId === 'home' && <button className="primary-button" onClick={onReturnHome}>回内宅门簿<ArrowRight size={14} /></button>}
                {(activeLocationId === 'street' || activeLocationId === 'tea' || activeLocationId === 'wharf') && <button className="primary-button" onClick={() => onReturnStreet(activeStreet?.id ?? 'tea')}>回街市同源查验<ArrowRight size={14} /></button>}
                {activeLocationId === 'sang' && <><button className="primary-button" onClick={onOpenBanquet}>展开原接风请帖<ArrowRight size={14} /></button><button className="outline-button" onClick={() => onOpenPerson('gentry')}><UserRound size={14} />回看桑鹤龄名帖</button></>}
                {activeLocationId === 'gate' && <p className="city-no-action"><EyeOff size={14} />只保留城郭边界；出城、路程与抵达不在此启用。</p>}
              </div>
            </section>
            <footer className="city-boundary"><EyeOff size={13} /><span>不生成路人、传闻、消费或地方事件；没有来源就留白。</span></footer>
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  )
}
