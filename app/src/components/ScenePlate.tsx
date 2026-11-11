import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, LockKeyhole, MessagesSquare, UsersRound, X } from 'lucide-react'
import type { GameState } from '../game/useGame'
import { revealDepthOf } from '../game/people'
import { ambientPeopleOf, presentPeopleOf, type AmbientPresence, type PresentPerson } from '../game/presence'
import { scenePlates, scenePresenceOf, type ScenePlateId } from '../sceneArt'
import type { Period, Person, SceneId } from '../types'
import { useOverlayDialog } from './useOverlayDialog'
import { Portrait } from './Portrait'

/** C-47 场景美术板：换图只改 sceneArt.ts 的 src，组件与交互层不动。 */
export function ScenePlate({ id, className = '', children }: { id: ScenePlateId; className?: string; children?: ReactNode }) {
  const spec = scenePlates[id]
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const src = usingFallback ? spec.fallbackSrc ?? null : spec.src
  const show = Boolean(src) && !failed
  return (
    <div className={`scene-plate ${className} ${show ? (loaded ? 'is-loaded' : 'is-loading') : 'is-blank'}`} data-pending={spec.pending ? 'true' : 'false'}>
      {show ? <>
        <img
          className="scene-plate-img"
          key={src!}
          src={src!}
          alt={spec.alt}
          onLoad={() => setLoaded(true)}
          onError={() => { if (!usingFallback && spec.fallbackSrc) setUsingFallback(true); else setFailed(true) }}
          style={{ objectPosition: spec.position, transform: spec.scale && spec.scale !== 1 ? `scale(${spec.scale})` : undefined }}
        />
        <div className="scene-plate-wash" aria-hidden="true" />
        {spec.pending && usingFallback && <span className="scene-plate-pending">专图待补 · 暂借既有实景</span>}
        <span className="scene-plate-credit">{usingFallback ? spec.fallbackCredit ?? spec.credit : spec.credit}</span>
      </> : <div className="scene-plate-blank">
        <span>底图未备</span>
        <small>留白 · 不补写现场</small>
      </div>}
      {children}
    </div>
  )
}

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const depthLabel: Record<string, string> = { 闻名: '闻名', 相识: '相识', 共事: '共事', 深交: '深交' }

/**
 * C-48 / C-153 在场名帖与接谈纸（FE-145）：只读当值表 × 时段 + 同场景公开日程。
 * 名帖可点开接谈纸（parleyId 留在本组件内，不新增 OverlayId）；未具名者只计公开度、不列名。
 * onAsk / onOpenPerson 可选，不传则名帖只读，旧行为同 FE-033。
 */
export function ScenePresence({ state, scene, period, onThing, onAsk, onOpenPerson }: { state: GameState; scene: SceneId; period: Period; onThing?: (label: string) => void; onAsk?: (personId: string) => void; onOpenPerson?: (personId: string) => void }) {
  const spec = scenePresenceOf(state, scene, period)
  const present = presentPeopleOf(state, scene, period)
  const ambient = ambientPeopleOf(state, scene, period)
  const [parleyId, setParleyId] = useState<string | null>(null)
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const cardIds = present.map(item => item.person.id).join(',')

  const dockCards = (node: HTMLDivElement | null) => {
    cardsRef.current = node
    if (!node) return
    Array.from(node.querySelectorAll<HTMLButtonElement>('.presence-card')).forEach((card, index) => { card.tabIndex = index === 0 ? 0 : -1 })
  }
  useEffect(() => { dockCards(cardsRef.current) }, [cardIds])
  // 时段推进 / 换场景导致人物离场：接谈纸立即关闭，不显示过期对象。
  useEffect(() => { if (parleyId && !present.some(item => item.person.id === parleyId)) setParleyId(null) }, [cardIds, parleyId])

  const handleCardKeys = (event: KeyboardEvent) => {
    const cards = Array.from(cardsRef.current?.querySelectorAll<HTMLButtonElement>('.presence-card') ?? [])
    if (cards.length < 2) return
    const index = cards.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (index + step + cards.length) % cards.length
    cards.forEach((card, i) => { card.tabIndex = i === next ? 0 : -1 })
    cards[next].focus()
  }

  const parleyPerson = parleyId ? present.find(item => item.person.id === parleyId)?.person ?? null : null

  return (
    <aside className="scene-presence" aria-label="此刻在场与可做">
      <header><UsersRound size={13} /><span>此刻在场</span><small>第{dayNames[state.day - 1]}日 · {period}</small></header>
      <div className="scene-presence-row"><span>地点</span><b>{spec.place}</b></div>
      <div className="scene-presence-present">
        {present.length ? <>
          <div className="presence-head"><span>在场</span><em>{present.length} 人</em></div>
          <div className="presence-cards" ref={dockCards} onKeyDown={handleCardKeys}>
            {present.map(({ person, reason }) => {
              const depth = revealDepthOf(person.id, state)
              return (
                <button key={person.id} className="presence-card" aria-haspopup="dialog" aria-label={`与${person.name}接谈（${reason}）`} onClick={() => setParleyId(person.id)}>
                  <Portrait person={person} silhouette={depth === '闻名'} size={22} />
                  <span className="presence-card-name">{person.name}</span>
                  <span className="presence-card-role">{person.role}</span>
                  <i className="presence-depth" data-depth={depth} title={depthLabel[depth]} aria-label={depthLabel[depth]} />
                </button>
              )
            })}
          </div>
          {ambient.count > 0 && <p className="presence-ambient">门外：{ambient.text}（不列名）</p>}
        </> : ambient.count > 0 ? (
          <p className="presence-none">无可谈之人 · 门外{ambient.text}（不列名）</p>
        ) : (
          <div className="scene-presence-row"><span>在场</span><b className="is-unknown">{spec.present}</b></div>
        )}
      </div>
      <div className="scene-presence-row is-things"><span>可做</span><div>{spec.things.map(item => onThing
        ? <button key={item} className="presence-thing" onClick={() => onThing(item)} title={`回原处 · ${item}`}>{item}</button>
        : <i key={item}>{item}</i>)}</div></div>
      <footer>{present.length || ambient.count ? '依名册职掌与公开日程 · 未具名者只计公开度' : spec.presentSource}<i>依 13.5.2 · 只取公开日程，不推断谁知道了</i></footer>
      {parleyPerson && createPortal(
        <ParleyPaper person={parleyPerson} state={state} place={spec.place} present={present} ambient={ambient} onClose={() => setParleyId(null)} onAsk={onAsk} onOpenPerson={onOpenPerson} />,
        document.body,
      )}
    </aside>
  )
}

/** C-153 接谈纸：公开度是第一等信息；寒暄 / 问三句 / 正式问一回 / 私下说。不新增 OverlayId、不写回声。 */
function ParleyPaper({ person, state, place, present, ambient, onClose, onAsk, onOpenPerson }: { person: Person; state: GameState; place: string; present: PresentPerson[]; ambient: AmbientPresence; onClose: () => void; onAsk?: (personId: string) => void; onOpenPerson?: (personId: string) => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const [openQuestion, setOpenQuestion] = useState<number | null>(null)
  const [greeted, setGreeted] = useState(false)
  const [saidFear, setSaidFear] = useState(false)
  const [saidHook, setSaidHook] = useState(false)
  const depth = revealDepthOf(person.id, state)
  const others = present.filter(item => item.person.id !== person.id)
  const company = others.length + ambient.count > 0
  const reason = present.find(item => item.person.id === person.id)?.reason ?? ''

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    dialog.addEventListener('keydown', onKey)
    return () => dialog.removeEventListener('keydown', onKey)
  }, [onClose, dialogRef])

  const companyText = others.length
    ? `当众 · 另有 ${others.length} 名具名者：${others.map(item => item.person.name).join('、')}${ambient.count ? `；门外${ambient.text}（不列名）` : ''}`
    : `当众 · 门外${ambient.text}（不列名）`

  return (
    <motion.section className="overlay-backdrop parley-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .15 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="parley-paper" role="dialog" aria-modal="true" aria-labelledby="parley-title" tabIndex={-1} initial={{ y: reduceMotion ? 0 : 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : 10, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18, ease: 'easeOut' }}>
        <header className="parley-head">
          <Portrait person={person} silhouette={depth === '闻名'} size={44} />
          <div className="parley-head-text"><h2 id="parley-title">{person.name}</h2><span>{person.role} · {person.rank}</span><small>{depthLabel[depth]}</small></div>
          <button className="icon-button" onClick={onClose} aria-label={`合上与${person.name}的接谈`}><X size={19} /></button>
        </header>
        <div className="parley-now"><span>{place}</span><small>{reason.startsWith('公开日程') ? reason : `当值：${reason}`}</small></div>
        <div className={`parley-publicity ${company ? 'is-company' : 'is-alone'}`} role="note">
          <b>{company ? companyText : '独对 · 只你与他'}</b>
          <p>{company ? '你说的话，他们听得见；台账仍只记「问过」，不记原话。' : '私话不出此室；不入回声、不入台账。'}</p>
        </div>
        <div className="parley-body">
          <section className="parley-questions" aria-label="问三句">
            {person.questions.map((question, index) => (
              <div className="parley-question" key={question.label}>
                <button aria-expanded={openQuestion === index} onClick={() => setOpenQuestion(current => current === index ? null : index)}>
                  <i data-tone={question.tone} /><span>{question.label}</span><small>{openQuestion === index ? '收起' : '展开'}</small>
                </button>
                {openQuestion === index && <div className="parley-answer"><p>{question.answer}</p><small>{question.basis}</small></div>}
              </div>
            ))}
          </section>
          <section className="parley-greet" aria-label="寒暄一句">
            <button className="parley-greet-btn" onClick={() => setGreeted(true)} disabled={greeted}><MessagesSquare size={13} />{greeted ? '已寒暄' : '寒暄一句'}<small>0 费 · 只作场面话</small></button>
            {greeted && <div className="parley-greet-quote"><p>{person.quote}</p><small>{company ? '旁人只当客套' : '只在此室'}</small></div>}
          </section>
          <section className={`parley-private ${company ? 'is-locked' : ''}`} aria-label="私下说">
            <header><LockKeyhole size={12} /><span>私下说</span>{company && <small>当众 · 私话说不得</small>}</header>
            {company ? <p className="parley-private-locked">当众由具名他人或未具名当值构成；私话须独对再说。</p> : <>
              <div className="parley-private-item">
                <button disabled={depth === '闻名'} onClick={() => setSaidFear(true)}>{saidFear ? '已问私话' : '问一句私话'}</button>
                {depth === '闻名' ? <small className="parley-private-hint">先正式问一回，才谈得上私话</small>
                  : saidFear ? <p className="parley-private-reveal">你听出他真正怕的是：{person.fear}</p> : null}
              </div>
              <div className="parley-private-item">
                <button disabled={person.tokens.hook <= 0} onClick={() => setSaidHook(true)}>{saidHook ? '已挑明' : '把话挑明'}</button>
                {person.tokens.hook <= 0 ? <small className="parley-private-hint">手里没有可挑明的凭据</small>
                  : saidHook ? <p className="parley-private-reveal">{person.hookNote}</p> : null}
              </div>
              <small className="parley-private-note">不入台账 · 不入回声 · 不改关系值</small>
            </>}
          </section>
        </div>
        <footer className="parley-foot">
          <div className="parley-foot-actions">
            {onOpenPerson && <button className="outline-button" onClick={() => onOpenPerson(person.id)}>看人物卷<ArrowRight size={12} /></button>}
            {onAsk && <button className="primary-button parley-ask" onClick={() => onAsk(person.id)}>正式问一回<small>{company ? '当众' : '独对'}</small><ArrowRight size={14} /></button>}
            <button className="outline-button" onClick={onClose}>合上</button>
          </div>
          <p>只据既有名册职掌与公开日程；未具名者只计公开度，不列名、不入回声。</p>
        </footer>
      </motion.div>
    </motion.section>
  )
}