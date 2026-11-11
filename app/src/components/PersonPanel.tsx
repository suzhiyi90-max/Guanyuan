import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, Check, Coins, Link2, LockKeyhole, ScrollText } from 'lucide-react'
import { DrawerFrame } from './Overlays'
import { Portrait } from './Portrait'
import { RadarChart } from './RadarChart'
import { GrowthPreview } from './GrowthPreview'
import { NameCard } from './NameCard'
import { capabilityKeys, capabilityTitleOf, needKeys, revealDepthOf, sharedHistoryOf, specialtyOf, topNeedsOf } from '../game/people'
import type { GameState } from '../game/useGame'
import type { Person } from '../types'

type PersonFolio = 'profile' | 'questions' | 'history'

const folios: Array<{ id: PersonFolio; label: string }> = [
  { id: 'profile', label: '形与能' },
  { id: 'questions', label: '三问' },
  { id: 'history', label: '行状' },
]

export function PersonPanel({ person, state, onClose, onAsk }: { person: Person, state: GameState, onClose: () => void, onAsk: () => void }) {
  const [folio, setFolio] = useState<PersonFolio>('profile')
  const reduceMotion = useReducedMotion()
  const depth = revealDepthOf(person.id, state)
  const known = depth !== '闻名'
  const asked = state.asked.includes(person.id)
  const specialty = specialtyOf(person)
  const history = sharedHistoryOf(person.id, state)

  const onFolioKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = folios.findIndex(item => item.id === folio)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % folios.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + folios.length) % folios.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = folios.length - 1
    else return
    event.preventDefault()
    setFolio(folios[next].id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  const ask = () => {
    setFolio('questions')
    onAsk()
  }

  return (
    <DrawerFrame title={`${person.name} · ${person.role}`} eyebrow={person.rank} onClose={onClose} className="person-drawer">
      <div className="drawer-scroll">
        <NameCard person={person} state={state} />
        <div className="panel-hero">
          <Portrait person={person} silhouette={!known} size={96} />
          <div className="panel-hero-text">
            <div className="panel-name">{person.name}<small>{person.style}</small></div>
            <div className="panel-tags"><span className="origin-seal">{person.seal}</span><span className={`depth-tag depth-${depth}`}>{depth}</span></div>
            <p className="panel-specialty">{specialty.label}<i />{person.reputation.join(' · ')}</p>
            <p className="panel-origin">{person.origin}</p>
          </div>
        </div>

        <motion.section className={`contact-route depth-${depth}`} aria-label="与知县的真实接触路径" initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
          <header><span><Link2 size={13} />接触路径</span><b>{depth}</b></header>
          {history.length ? <ol>{history.slice(0, 2).map((row, index) => <li key={row}><span>{String(index + 1).padStart(2, '0')}</span><p>{row}</p></li>)}</ol> : <p className="contact-route-empty">尚未正式接触 · 只保留公开名录与闻名记录</p>}
          <footer>只记你与对方的来路 不换算好感 不推出未知秘密</footer>
        </motion.section>

        {!known && (
          <div className="panel-veiled">
            <blockquote className="person-quote">{person.quote}<cite>到任以来 · 公开言谈 未经证实</cite></blockquote>
            <div className="empty-paper"><LockKeyhole size={22} /><p>只闻其名。能力、动机与三问须正式接触后才可见；人物卡不靠抽卡获得。</p></div>
            <section className="panel-history"><h3><BookOpen size={14} />传闻中的行状</h3><p>{person.milestones[0]}</p></section>
          </div>
        )}

        {known && (
          <>
            <div className="person-folios" role="tablist" aria-label="人物卷内分签" onKeyDown={onFolioKey}>
              {folios.map((item, index) => (
                <button
                  key={item.id}
                  id={`person-tab-${item.id}`}
                  role="tab"
                  aria-selected={folio === item.id}
                  aria-controls={`person-folio-${item.id}`}
                  tabIndex={folio === item.id ? 0 : -1}
                  onClick={() => setFolio(item.id)}
                >
                  {folio === item.id && <motion.span className="person-folio-ink" layoutId={`person-folio-ink-${person.id}`} transition={{ type: 'spring', stiffness: 400, damping: 34 }} aria-hidden="true" />}
                  <span>{item.label}</span><small>0{index + 1}</small>
                </button>
              ))}
            </div>

            <div className="person-folio-paper">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={folio}
                  id={`person-folio-${folio}`}
                  role="tabpanel"
                  aria-labelledby={`person-tab-${folio}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: .18, ease: 'easeOut' }}
                >
                  {folio === 'profile' && (
                    <>
                      <div className="panel-radars">
                        <RadarChart title="能力" caption={specialty.label} max={5} values={capabilityKeys.map(key => ({ label: key, value: person.capability[key], hint: capabilityTitleOf(person.capability[key]) }))} />
                        <RadarChart title="动机" caption={topNeedsOf(person).map(n => n.key).join(' · ')} max={3} values={needKeys.map(key => ({ label: key, value: person.needs[key] }))} />
                      </div>
                      <section className="panel-tokens">
                        <div className="token-chips">
                          <span className={person.tokens.owesYou ? 'is-on' : ''}><Coins size={12} />他欠你 {person.tokens.owesYou}</span>
                          <span className={person.tokens.hook ? 'is-on is-hook' : ''}><Link2 size={12} />你把柄 {person.tokens.hook}</span>
                          <span className={person.tokens.youOwe ? 'is-on is-owe' : ''}><ScrollText size={12} />你欠他 {person.tokens.youOwe}</span>
                        </div>
                        <p>{person.hookNote}</p>
                      </section>
                    </>
                  )}

                  {folio === 'questions' && (
                    <>
                      <section className="three-questions">
                        <h3>看人三问 <small>不是好感 是判断依据</small></h3>
                        {person.questions.map((q, i) => (
                          <motion.article key={q.label} initial={{ opacity: 0, x: 9 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .06 }}>
                            <div className={`question-symbol ${q.tone}`}>{i === 0 ? '能' : i === 1 ? '愿' : '敢'}</div>
                            <div><h4>{q.label}<span>{q.answer}</span></h4><p><b>依据</b>{q.basis}</p></div>
                          </motion.article>
                        ))}
                      </section>
                      {asked && <motion.article className="obtained-claim" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><span>已取得说法 · {person.claimId}</span><p>{person.claim}</p><small>口供已入情报台账，仍为「存疑」，不自动视为事实。</small></motion.article>}
                      <article className="fear-note"><span>忌讳</span><p>{person.fear}</p></article>
                    </>
                  )}

                  {folio === 'history' && (
                    <section className="panel-history panel-history-folio">
                      <h3><BookOpen size={14} />{history.length ? '你与共同经历' : '他的行状'}</h3>
                      {(history.length ? history : person.milestones).map((row, index) => (
                        <motion.p key={row} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .07 }}><span>{String(index + 1).padStart(2, '0')}</span>{row}</motion.p>
                      ))}
                      {depth === '共事' && <small>共事已收录当世人杰册 · 行状由真实事件渲染</small>}
                    </section>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
      <GrowthPreview state={state} variant="slip" person={person} />
      <footer className="drawer-footer">
        <button className="primary-button" onClick={ask}>{asked ? <><Check size={16} />复述口供 · 0 费</> : <>正式问 {person.role} · 1 时段<ArrowRight size={17} /></>}</button>
        <small>{asked ? '重复已得口供不再推进时间，也不会产生新证据。' : '一次社交动作包含同场景的一轮交谈。'}</small>
      </footer>
    </DrawerFrame>
  )
}
