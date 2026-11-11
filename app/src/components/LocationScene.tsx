import { ScenePlate } from './ScenePlate'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BookOpen, FileText, Footprints, Landmark, Link2, Map as MapIcon, PackageOpen, Ship, Stamp, UsersRound, Waves, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import { PlaceTrail } from './PlaceTrail'
import { recordPlace, type PlaceId } from '../placeTrail'
import type { GameState } from '../game/useGame'
import type { Period } from '../types'

export type LocationSceneId = 'ferry' | 'station' | 'town' | 'manor'
type AnchorId = 'ticket' | 'boat' | 'people' | 'register' | 'stable' | 'gate'

interface Props {
  initialLocation: LocationSceneId
  state: GameState
  period: Period
  onClose: () => void
  onReturnAtlas: (node: LocationSceneId) => void
  onOpenLedger: () => void
  onOpenIntelligence: () => void
  onOpenReview: () => void
  onOpenPlace?: (id: PlaceId) => void
}

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function LocationScene({ initialLocation, state, period, onClose, onReturnAtlas, onOpenLedger, onOpenIntelligence, onOpenReview, onOpenPlace }: Props) {
  const [location, setLocation] = useState<LocationSceneId>(initialLocation)
  useEffect(() => { recordPlace(initialLocation) }, [initialLocation])
  const [anchor, setAnchor] = useState<AnchorId>(initialLocation === 'ferry' ? 'boat' : 'register')
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const ferry = location === 'ferry'
  const anchors = ferry ? [
    { id: 'ticket' as AnchorId, name: '渡亭', note: '渡票与船期', icon: FileText, x: 19, y: 54 },
    { id: 'boat' as AnchorId, name: '河湾料船', note: '在途与到岸', icon: Ship, x: 58, y: 65 },
    { id: 'people' as AnchorId, name: '茶棚脚夫', note: '听说与脚力', icon: UsersRound, x: 78, y: 40 },
  ] : [
    { id: 'register' as AnchorId, name: '号簿案', note: '过境文书', icon: BookOpen, x: 24, y: 52 },
    { id: 'stable' as AnchorId, name: '马厩', note: '驿马与脚力', icon: Footprints, x: 69, y: 58 },
    { id: 'gate' as AnchorId, name: '驿门', note: '往来消息', icon: Landmark, x: 48, y: 30 },
  ]
  const active = anchors.find(item => item.id === anchor) ?? anchors[0]

  const changeLocation = (next: LocationSceneId) => {
    recordPlace(next)
    setLocation(next)
    setAnchor(next === 'ferry' ? 'boat' : 'register')
  }
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-location-anchor]')
    if (!target) return
    event.preventDefault()
    const current = anchors.findIndex(item => item.id === anchor)
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? anchors.length - 1 : (current + (backward ? -1 : 1) + anchors.length) % anchors.length
    setAnchor(anchors[next].id)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-location-anchor="${anchors[next].id}"]`)?.focus())
  }

  return (
    <motion.section className="overlay-backdrop location-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className={`location-scene location-${location}`} role="dialog" aria-modal="true" aria-labelledby="location-title" tabIndex={-1} layoutId="overlay-paper" data-period={period} data-location={location} initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 14 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 27 }}>
        <header className="location-head">
          <div><span className="eyebrow">具体场景 / 第三尺度 · M2 样张</span><h2 id="location-title">{ferry ? '河湾渡口' : '北驿铺'}</h2></div>
          <div className="location-switch" aria-label="切换场景样张"><button className={ferry ? 'active' : ''} aria-pressed={ferry} onClick={() => changeLocation('ferry')}><Ship size={14} />渡口</button><button className={!ferry ? 'active' : ''} aria-pressed={!ferry} onClick={() => changeLocation('station')}><Landmark size={14} />驿铺</button></div>
          <button className="icon-button" onClick={onClose} aria-label="收起地点场景"><X size={20} /></button>
        </header>
        <PlaceTrail variant="line" current={location} limit={3} onOpen={onOpenPlace} />

        <div className="location-layout">
          <section className="location-stage" onKeyDown={handleKeys} aria-label={`${ferry ? '河湾渡口' : '北驿铺'}地点锚点`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={location} className="location-art" initial={{ opacity: 0, clipPath: reduceMotion ? 'inset(0)' : 'inset(0 0 0 8%)' }} animate={{ opacity: 1, clipPath: 'inset(0)' }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .34 }}>
                <ScenePlate id={ferry ? 'ferry' : 'station'} className="location-art-plate" />
                <div className="location-light" aria-hidden="true" />
                {ferry && state.day >= 8 && <div className="location-rain" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ left: `${index * 10 + 4}%` }} />)}</div>}
                <div className="location-caption"><span>第{dayNames[state.day - 1]}日 · {period}</span><h3>{ferry ? '水过埠头，船期尚未有凭。' : '驿门半掩，号簿尚未调阅。'}</h3><p>{ferry ? state.day >= 8 ? '雨线入河 · 只投影既有日程' : '水面平静 · 不补写船家口供' : '不生成驿马、信件或过境人物'}</p></div>
                {anchors.map(item => <button key={item.id} data-location-anchor={item.id} className={`location-anchor ${anchor === item.id ? 'selected' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} aria-pressed={anchor === item.id} onClick={() => setAnchor(item.id)}>
                  <span><item.icon size={17} /></span><div><b>{item.name}</b><small>{item.note}</small></div><i />
                </button>)}
              </motion.div>
            </AnimatePresence>
          </section>

          <aside className="location-paper">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section key={anchor} className="location-inspector" initial={{ opacity: 0, x: reduceMotion ? 0 : 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                <header><span>地点查验 / {active.name}</span><active.icon size={19} /></header>
                <div className="location-inspector-title"><active.icon size={24} /><div><small>{active.note}</small><h3>{active.name}</h3></div></div>
                {anchor === 'boat' && <>
                  <p>料船位置只读原三数料账。在途不等于已经到岸，到岸后也不重复累计。</p>
                  <div className="location-data-grid"><article><span>在途</span><b>{state.material.transit}</b><small>垛</small></article><article><span>到场</span><b>{state.material.arrived}</b><small>垛</small></article><article><span>未发</span><b>{state.material.unsent}</b><small>垛</small></article></div>
                  <button className="primary-button" onClick={onOpenLedger}><PackageOpen size={15} />回账房核对料船<ArrowRight size={14} /></button>
                </>}
                {anchor === 'register' && <>
                  <p>号簿案只回查既有上宪来文与回文，不把驿铺写成已经取得新文书。</p>
                  <div className="location-source-card"><FileText size={16} /><div><b>府札与县署回文</b><small>{state.officialActions.length ? `${state.officialActions.length} 项已入卷` : '尚无县署回文'}</small></div></div>
                  <button className="primary-button" onClick={onOpenReview}><Stamp size={15} />回上宪来文<ArrowRight size={14} /></button>
                </>}
                {(anchor === 'ticket' || anchor === 'stable') && <div className="location-empty"><FileText size={24} /><b>{anchor === 'ticket' ? '渡票与船期未详' : '驿马与脚力未详'}</b><p>本局没有可核验来源。此处保留场景锚点，不生成价格、数量、营业状态或可用行程。</p></div>}
                {(anchor === 'people' || anchor === 'gate') && <>
                  <div className="location-empty"><UsersRound size={24} /><b>{anchor === 'people' ? '尚未接触船家与脚夫' : '尚无驿门来信与过境消息'}</b><p>不因为地点打开就自动出现人物、传闻或信件。可回原情报台账检查既有来源。</p></div>
                  <button className="outline-button" onClick={onOpenIntelligence}><Link2 size={14} />回情报台账<ArrowRight size={14} /></button>
                </>}
                <div className="location-presence">
                  <h4>三层在场 / 无据留白</h4>
                  <dl><div><dt>固定在场</dt><dd>未详 · 不补写</dd></div><div><dt>定时来客</dt><dd>未详 · 不补写</dd></div><div><dt>无名场面</dt><dd>{anchor === 'boat' ? '只读原料船位置，不生成脚夫' : '无来源，不生成路人'}</dd></div></dl>
                </div>
              </motion.section>
            </AnimatePresence>
            <footer><button className="text-link" onClick={() => onReturnAtlas(location)}><ArrowLeft size={13} />回一县舆图</button><span><MapIcon size={12} />进入样张不耗时</span></footer>
          </aside>
        </div>
        <footer className="location-foot"><span><Waves size={13} />M2 场景样张 · 不启用行程、消费、随机人物或地点事件</span><button className="outline-button" onClick={onClose}>退出场景 回到案头</button></footer>
      </motion.div>
    </motion.section>
  )
}
