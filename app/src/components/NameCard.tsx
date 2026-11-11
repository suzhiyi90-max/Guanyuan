import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { Portrait } from './Portrait'
import { revealDepthOf, sharedHistoryOf, specialtyOf } from '../game/people'
import type { GameState } from '../game/useGame'
import type { Person } from '../types'

/** C-65 名帖装裱：正面是公开身份，背面是真实接触；翻面为本地状态，不写存档。 */
export function NameCard({ person, state }: { person: Person; state: GameState }) {
  const [flipped, setFlipped] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()
  const depth = revealDepthOf(person.id, state)
  const history = sharedHistoryOf(person.id, state)
  return (
    <section className="name-card" data-name-card="folio" data-face={flipped ? 'back' : 'front'} aria-label={`${person.name} 名帖`}>
      <div className="name-card-mount" aria-hidden="true" />
      <motion.div className="name-card-face" key={flipped ? 'back' : 'front'} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : -8 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
        {!flipped ? <>
          <Portrait person={person} silhouette={depth === '闻名'} size={72} />
          <div className="name-card-inscription">
            <b>{person.name}</b>
            <small>{person.style} · {person.role}</small>
            <i>{person.rank}</i>
            <p className="name-card-specialty">{specialtyOf(person).label} · {person.reputation.join(' · ')}</p>
            <p className="name-card-origin">{person.origin}</p>
          </div>
          <div className="name-card-seals">
            <span className="origin-seal">{person.seal}</span>
            <span className={`depth-tag depth-${depth}`}>{depth}</span>
          </div>
        </> : <div className="name-card-back">
          <span className="eyebrow">接触路径 · 只读</span>
          <b>{specialtyOf(person).label}</b>
          {history.length
            ? <><ol>{history.slice(0, expanded ? 3 : 2).map(row => <li key={row}>{row}</li>)}</ol>{history.length > 2 && <button className="name-card-more" onClick={() => setExpanded(current => !current)} aria-expanded={expanded}>{expanded ? '收起接触记录' : '展开全部接触记录'}</button>}</>
            : <p>尚未正式接触 · 只保留公开名录与闻名记录</p>}
        </div>}
      </motion.div>
      <button className="name-card-flip" onClick={() => setFlipped(current => !current)} aria-pressed={flipped}>
        <ArrowLeftRight size={12} />{flipped ? '看名帖正面' : '翻看接触路径'}
      </button>
      <footer>名帖只录公开身份与真实接触 · 不换算好感 · 不写存档</footer>
    </section>
  )
}
