import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BookOpen, Home, Map as MapIcon, MapPin, Mountain, PackageOpen, Scale, Store, UserRound, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import type { GameState } from '../game/useGame'
import type { Period } from '../types'

export type SettlementSceneId = 'town' | 'manor'
type AnchorId = 'market' | 'broker' | 'street' | 'ancestral' | 'tombs' | 'soil'
interface Props {
  initialLocation: SettlementSceneId
  state: GameState
  period: Period
  onClose: () => void
  onReturnAtlas: (node: SettlementSceneId) => void
  onOpenEvidence: () => void
  onOpenPerson: (id: string) => void
  onOpenPlan: () => void
}
const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function SettlementScene({ initialLocation, state, period, onClose, onReturnAtlas, onOpenEvidence, onOpenPerson, onOpenPlan }: Props) {
  const [location, setLocation] = useState(initialLocation)
  const [anchor, setAnchor] = useState<AnchorId>(initialLocation === 'town' ? 'market' : 'ancestral')
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const town = location === 'town'
  const anchors = town ? [
    { id: 'street' as AnchorId, name: '青石街市', note: '地点与行人', icon: Store, x: 48, y: 34 },
    { id: 'market' as AnchorId, name: '裕丰粮行', note: '旧欠与料源', icon: PackageOpen, x: 23, y: 56 },
    { id: 'broker' as AnchorId, name: '牙行', note: '中介与凭据', icon: Scale, x: 73, y: 58 },
  ] : [
    { id: 'ancestral' as AnchorId, name: '桑氏宗祠', note: '士绅与礼数', icon: Home, x: 31, y: 45 },
    { id: 'tombs' as AnchorId, name: '桑家坟图', note: '地界与旧帖', icon: MapPin, x: 71, y: 35 },
    { id: 'soil' as AnchorId, name: '堤边土源', note: '取土与会勘', icon: Mountain, x: 64, y: 68 },
  ]
  const active = anchors.find(item => item.id === anchor) ?? anchors[0]
  const changeLocation = (next: SettlementSceneId) => { setLocation(next); setAnchor(next === 'town' ? 'market' : 'ancestral') }
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-settlement-anchor]')
    if (!target) return
    event.preventDefault()
    const current = anchors.findIndex(item => item.id === anchor)
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? anchors.length - 1 : (current + (backward ? -1 : 1) + anchors.length) % anchors.length
    setAnchor(anchors[next].id)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-settlement-anchor="${anchors[next].id}"]`)?.focus())
  }

  return (
    <motion.section className="overlay-backdrop location-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className={`location-scene settlement-scene location-${location}`} role="dialog" aria-modal="true" aria-labelledby="settlement-title" tabIndex={-1} layoutId="overlay-paper" data-period={period} data-location={location} initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 14 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 27 }}>
        <header className="location-head"><div><span className="eyebrow">具体场景 / 镇与庄 · M2 样张</span><h2 id="settlement-title">{town ? '青石镇' : '桑家庄'}</h2></div><div className="location-switch"><button className={town ? 'active' : ''} aria-pressed={town} onClick={() => changeLocation('town')}><Store size={14} />青石镇</button><button className={!town ? 'active' : ''} aria-pressed={!town} onClick={() => changeLocation('manor')}><Home size={14} />桑家庄</button></div><button className="icon-button" onClick={onClose} aria-label="收起镇庄场景"><X size={20} /></button></header>
        <div className="location-layout">
          <section className="location-stage" onKeyDown={handleKeys} aria-label="镇庄地点锚点">
            <AnimatePresence mode="wait" initial={false}><motion.div key={location} className="location-art" initial={{ opacity: 0, clipPath: reduceMotion ? 'inset(0)' : 'inset(0 0 0 8%)' }} animate={{ opacity: 1, clipPath: 'inset(0)' }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .34 }}>
              {town ? <svg className="location-art-svg" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path className="art-mountain" d="M0 205 L100 137 175 190 270 105 350 184 450 120 560 190 670 122 800 180 800 0 0 0Z" />
                <path className="art-bank" d="M0 350 Q200 300 400 340 T800 312 L800 560 0 560Z" />
                <path className="art-station-roof" d="M68 285 L190 200 318 285Z M94 284 L94 449 M287 284 L287 449 M77 449 L303 449 M124 317 L257 317" />
                <path className="art-stable" d="M455 290 L583 207 714 290Z M478 289 L478 444 M689 289 L689 444 M460 444 L707 444 M512 327 L652 327" />
                <path className="art-road" d="M0 481 Q205 430 405 470 T800 429 M0 522 Q215 468 420 508 T800 467" />
                <path className="art-flag" d="M145 413 L145 319 M146 323 L223 336 207 375 146 365 M536 408 L536 318 M537 322 L604 333 591 367 537 359" />
                <path className="art-reeds" d="M359 441 l4-102 M378 448 l-7-83 M399 443 l8-94" />
              </svg> : <svg className="location-art-svg" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path className="art-mountain" d="M0 213 L95 143 180 195 265 106 360 190 460 121 565 187 670 110 800 180 800 0 0 0Z" />
                <path className="art-bank" d="M0 345 Q190 304 390 340 T800 305 L800 560 0 560Z" />
                <path className="art-station-roof" d="M104 293 L254 190 415 293Z M134 291 L134 450 M383 291 L383 450 M112 450 L402 450 M170 326 L349 326" />
                <path className="art-station-gate" d="M230 450 L230 340 Q257 306 287 340 L287 450 M247 450 L247 359 Q258 344 272 359 L272 450" />
                <path className="art-horse" d="M544 429 l-12-92 13-33 21-9 18 15-3 24-17 12 9 83 M532 338 l-24-18 M584 341 l25-17" />
                <path className="art-water" d="M0 474 Q180 443 360 476 T800 447 M0 516 Q190 486 380 514 T800 490" />
                <path className="art-reeds" d="M664 428 l-8-96 M680 432 l14-84 M704 427 l-3-105 M55 442 l-9-76 M72 446 l12-91" />
                <path className="art-flag" d="M443 402 L443 251 M444 258 L506 273 492 310 444 297" />
              </svg>}
              <div className="location-light" aria-hidden="true" />
              <div className="location-caption"><span>第{dayNames[state.day - 1]}日 · {period}</span><h3>{town ? '粮行招幌静着，旧欠仍须凭票。' : '祠外坟图有界，取土不可空言。'}</h3><p>{town ? '不生成粮价、牙行账或营业状态' : '不生成宗族秘密、地亩或取土结果'}</p></div>
              {anchors.map(item => <button key={item.id} data-settlement-anchor={item.id} className={`location-anchor ${anchor === item.id ? 'selected' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} aria-pressed={anchor === item.id} onClick={() => setAnchor(item.id)}><span><item.icon size={17} /></span><div><b>{item.name}</b><small>{item.note}</small></div><i /></button>)}
            </motion.div></AnimatePresence>
          </section>
          <aside className="location-paper"><AnimatePresence mode="wait" initial={false}><motion.section key={anchor} className="location-inspector" initial={{ opacity: 0, x: reduceMotion ? 0 : 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
            <header><span>地点查验 / {active.name}</span><active.icon size={19} /></header><div className="location-inspector-title"><active.icon size={24} /><div><small>{active.note}</small><h3>{active.name}</h3></div></div>
            {anchor === 'market' && <>
              <p>{state.unlocked.includes('E-003') ? '粮商旧欠票据已经取得，可与库账和借领状并置；同一笔三百不重复记成六百。' : '粮行与旧欠只保留已知名目。未取得 E-003 前，不显示票据全文。'}</p>
              <div className="location-source-card"><PackageOpen size={16} /><div><b>{state.unlocked.includes('E-003') ? 'E-003 · 旧欠票据在卷' : '阮裕丰 · 粮行经手人'}</b><small>{state.unlocked.includes('E-003') ? '回证据板并置' : '可回原人物卷问旧欠与料源'}</small></div></div>
              <button className="primary-button" onClick={state.unlocked.includes('E-003') ? onOpenEvidence : () => onOpenPerson('liangshang')}>{state.unlocked.includes('E-003') ? '回证据并置' : '问粮商旧欠'}<ArrowRight size={14} /></button>
            </>}
            {anchor === 'ancestral' && <>
              <p>宗祠只作为士绅与礼数的地点锚点。人物说法仍以真实接触为准，不因为进入庄门就展开秘密。</p>
              <div className="location-source-card"><UserRound size={16} /><div><b>桑鹤龄 · 地方士绅</b><small>{state.asked.includes('gentry') ? '已有正式问话 · 可回看原口供' : '尚未正式问话'}</small></div></div>
              <button className="primary-button" onClick={() => onOpenPerson('gentry')}>回桑鹤龄人物卷<ArrowRight size={14} /></button>
            </>}
            {anchor === 'tombs' && <>
              <p>{state.giftEntries.length ? '接风宴取舍已经留痕，坟图与旧欠仍按原事件口径回查，不补写地界结论。' : '既有请帖只说明桑家坟地与土源相邻；未赴宴或问话前，不展开坟图细节。'}</p>
              <div className="location-source-card"><MapPin size={16} /><div><b>桑宅请帖 / 坟地边界</b><small>{state.giftEntries.length ? `${state.giftEntries.length} 笔夜事件记录` : '尚无夜事件取舍记录'}</small></div></div>
              <button className="outline-button" onClick={() => onOpenPerson('gentry')}>回士绅口供与坟图<ArrowRight size={14} /></button>
            </>}
            {anchor === 'soil' && <>
              <p>{state.plan ? '抢护委牌已经签押，取土、会勘与夫役仍按原委牌和任务日程，不把土源写成已经取得。' : '土源必须与抢护工法、坟地边界和会勘一起决定。当前尚未签押。'}</p>
              <div className="location-source-card"><Mountain size={16} /><div><b>{state.plan ? state.plan.detail : '东堤抢护 · 委托预览'}</b><small>{state.plan ? '原委牌已入卷' : '不预写取土结果'}</small></div></div>
              <button className="primary-button" onClick={onOpenPlan}>回抢护委牌<ArrowRight size={14} /></button>
            </>}
            {(anchor === 'street' || anchor === 'broker') && <div className="location-empty"><Store size={24} /><b>{anchor === 'street' ? '街市行人未详' : '牙行凭据未详'}</b><p>不生成粮价、中介账、营业状态、无名路人或消费选项。此处只保留地点接口。</p></div>}
            <div className="location-presence"><h4>三层在场 / 无据留白</h4><dl><div><dt>固定在场</dt><dd>未详 · 不补写</dd></div><div><dt>定时来客</dt><dd>未详 · 不补写</dd></div><div><dt>无名场面</dt><dd>无来源，不生成行人或宗族成员</dd></div></dl></div>
          </motion.section></AnimatePresence><footer><button className="text-link" onClick={() => onReturnAtlas(location)}><ArrowLeft size={13} />回一县舆图</button><span><MapIcon size={12} />进入样张不耗时</span></footer></aside>
        </div>
        <footer className="location-foot"><span><BookOpen size={13} />M2 场景样张 · 不启用消费、地方事件、行程或随机人物</span><button className="outline-button" onClick={onClose}>退出场景 回到案头</button></footer>
      </motion.div>
    </motion.section>
  )
}
