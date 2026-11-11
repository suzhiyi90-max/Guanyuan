import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { RuleChip } from './RuleBook'
import { ScenePlate } from './ScenePlate'
import { RumorTrail } from './RumorTrail'
import { PlaceTrail } from './PlaceTrail'
import { recordPlace, type PlaceId } from '../placeTrail'
import { streetStations, type StreetStationId } from '../city'
import type { GameState } from '../game/useGame'
import type { GameLog, Period } from '../types'

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

// 六处只是纸面索引位，不作精确地理定位。
const pins: Array<{ id: StreetStationId; x: number; y: number }> = [
  { id: 'tea', x: 27, y: 35 },
  { id: 'wine', x: 45, y: 55 },
  { id: 'theatre', x: 64, y: 37 },
  { id: 'firm', x: 74, y: 63 },
  { id: 'pawn', x: 41, y: 75 },
  { id: 'wharf', x: 17, y: 63 },
]

type GatePlace = 'street' | 'town' | 'manor' | 'inner'

const gateSpecs: Record<GatePlace, { place: string; identity: string; door: string; seat: string; address: string; escort: string }> = {
  street: { place: '街市 · 街面', identity: '地方官', door: '不设门禁 · 街面人人可入', seat: '不设座次', address: '众人称「大人」', escort: '可带仪从 · 不带刑具' },
  town: { place: '青石镇 · 街市', identity: '地方官', door: '不设门禁 · 街面人人可入', seat: '不设座次', address: '商户称「大人」', escort: '可带仪从 · 不带刑具' },
  manor: { place: '桑家庄 · 宗祠外', identity: '宾客', door: '需请 · 门房通传', seat: '宾位 · 不代主人受礼', address: '称「老先生」', escort: '不带衙役入席' },
  inner: { place: '内宅 · 门外', identity: '主人', door: '内门 · 家人可入，吏役止步', seat: '主位', address: '家人称「老爷」，儿女称「父亲」', escort: '不用衙役 · 不带公事入内' },
}

/** C-51 门禁条：场合说明，不随本局状态变化，也不代作判定（6.7.2 / 6.7.4）。 */
export function GateNote({ place }: { place: GatePlace }) {
  const spec = gateSpecs[place]
  return (
    <aside className="gate-note" aria-label={`场合说明 · ${spec.place}`}>
      <header><span>场合 · 身份</span><small>非本局判定</small></header>
      <div className="gate-rows">
        <div><span>身份</span><b>{spec.identity}</b></div>
        <div><span>门</span><b>{spec.door}</b></div>
        <div><span>座</span><b>{spec.seat}</b></div>
        <div><span>称</span><b>{spec.address}</b></div>
        <div><span>随从</span><b>{spec.escort}</b></div>
      </div>
      <footer><RuleChip clause="power-seat" compact label="依 6.7.2" /><span>{spec.place}</span></footer>
    </aside>
  )
}

function streetToday(state: GameState): string {
  const fixed: Record<number, string> = {
    1: '今夜桑宅接风，街面只是等人',
    5: '委员到县，街面有仪从，茶楼先传话',
    8: '堤上急务，街面开始搬沙袋',
    9: '洪峰过境，街面人人自危',
    10: '验收题销，街面等着看考语',
  }
  return fixed[state.day] ?? '今日无公开市面之事'
}

/** 街市场景：画境 + 六处索引位 + 今日市面；六行索引仍是控制层，见 Sections。 */
export function StreetScene({ state, period, log, activeId, onSelectStation, onOpenRumor, onOpenPlace }: { state: GameState; period: Period; log: GameLog; activeId: StreetStationId; onSelectStation?: (id: StreetStationId) => void; onOpenRumor?: (target: 'street' | 'intel') => void; onOpenPlace?: (id: PlaceId) => void }) {
  useEffect(() => { recordPlace('street') }, [])
  const pinButtons = useRef<Array<HTMLButtonElement | null>>([])

  // FE-128：画境上的索引签只投影既有选中状态，点选等同右侧六行索引，不推进时段、不消费。
  const stepPins = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    if (!onSelectStation) return
    const current = Math.max(0, pins.findIndex(pin => pin.id === activeId))
    let next = current
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = pins.length - 1
    else next = (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + pins.length) % pins.length
    event.preventDefault()
    onSelectStation(pins[next].id)
    requestAnimationFrame(() => pinButtons.current[next]?.focus())
  }

  return (
    <section className="street-scene" aria-label="街市场景与今日市面">
      <div className="street-plate" onKeyDown={stepPins}>
        <ScenePlate id="market" className="street-art-plate" />
        {pins.map((pin, index) => {
          const station = streetStations.find(item => item.id === pin.id)!
          const active = activeId === pin.id
          return <button key={pin.id} type="button" ref={element => { pinButtons.current[index] = element }} tabIndex={active ? 0 : -1} className={`street-pin ${active ? 'is-active' : ''} ${station.recordId ? 'has-source' : ''}`} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} onClick={() => onSelectStation?.(pin.id)} aria-pressed={active} aria-label={`街市索引 · ${station.name}${station.recordId ? ' · 有来源' : ' · 未接触'}`} title={`${station.name} · ${station.label}`}>
            <i /><b>{station.name}</b>
          </button>
        })}
        <div className="street-plate-caption"><span>第{dayNames[state.day - 1]}日 · {period} · 街面</span><b>六处只作索引 · 不作精确定位</b></div>
      </div>
      <div className="street-today">
        <header><span>今日市面</span><small>只读既有日志与公开日程</small></header>
        <RumorTrail variant="strip" current="street" rumor={log.rumor} onOpen={onOpenRumor} />
        <p><i>日程</i>{streetToday(state)}</p>
        <GateNote place="street" />
        <PlaceTrail current="street" onOpen={onOpenPlace} />
      </div>
    </section>
  )
}
