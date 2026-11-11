import { useEffect, useRef, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BookOpen, HandCoins, KeyRound, ScrollText, UsersRound, X } from 'lucide-react'
import { people } from '../data'
import type { GameState } from '../game/useGame'
import { useOverlayDialog } from './useOverlayDialog'
import { RuleChip } from './RuleBook'
import { GrowthPreview } from './GrowthPreview'

type DebtKind = 'owed' | 'owe' | 'hook'

const kindMeta: Record<DebtKind, { label: string; note: string; icon: typeof HandCoins }> = {
  owed: { label: '人欠我', note: '可以讨、可以抵，也可以先不提', icon: HandCoins },
  owe: { label: '我欠人', note: '礼数、承诺与未清的账', icon: ScrollText },
  hook: { label: '把柄', note: '知道不等于能用；用一次就少一次', icon: KeyRound },
}

export function debtRowsOf(kind: DebtKind) {
  return people
    .map(person => ({
      person,
      count: kind === 'owed' ? person.tokens.owesYou : kind === 'owe' ? person.tokens.youOwe : person.tokens.hook,
    }))
    .filter(row => row.count > 0)
}

/** S-23 人情簿：只把既有 tokens / hookNote 与礼簿记录并到一处，不新增债务或好感。 */
export function DebtLedger({ state, onClose, onOpenPerson, focusPersonId, onBackToNetwork }: { state: GameState; onClose: () => void; onOpenPerson: (id: string) => void; focusPersonId?: string; onBackToNetwork?: (id: string) => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const rows: Record<DebtKind, ReturnType<typeof debtRowsOf>> = { owed: debtRowsOf('owed'), owe: debtRowsOf('owe'), hook: debtRowsOf('hook') }
  const total = rows.owed.length + rows.owe.length + rows.hook.length

  // FE-064：从人情谱进来只把对应名目滚入视野，不新增条目、不改债务。
  useEffect(() => {
    if (!focusPersonId) return
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('.debt-entry[data-debt-focus="true"]')?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    }, 140)
    return () => window.clearTimeout(timer)
  }, [focusPersonId, reduceMotion])

  // FE-143（C-151）：回人物卷钉单一 Tab 停靠 + 方向键巡览；只移焦点，不改回查回调。
  const debtBodyRef = useRef<HTMLDivElement | null>(null)
  const dockDebtPins = (node: HTMLDivElement | null) => {
    debtBodyRef.current = node
    if (!node) return
    Array.from(node.querySelectorAll<HTMLButtonElement>('.debt-entry footer button')).forEach((el, index) => { el.tabIndex = index === 0 ? 0 : -1 })
  }
  useEffect(() => { dockDebtPins(debtBodyRef.current) }, [state])
  const handleDebtPinKeys = (event: KeyboardEvent) => {
    const pins = Array.from(debtBodyRef.current?.querySelectorAll<HTMLButtonElement>('.debt-entry footer button') ?? [])
    if (pins.length < 2) return
    const index = pins.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? pins.length - 1 : (index + step + pins.length) % pins.length
    pins[next].focus()
  }

  return (
    <motion.section className="overlay-backdrop debt-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="debt-folio" role="dialog" aria-modal="true" aria-labelledby="debt-title" tabIndex={-1} initial={{ y: reduceMotion ? 0 : 20, opacity: 0, scale: reduceMotion ? 1 : .99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: reduceMotion ? 0 : 12, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 235, damping: 28 }}>
        <span className="debt-base-note">人情簿底纸 · 待补专图（暂借素纸）</span>
        <header className="debt-head">
          <div>
            <span className="eyebrow" id="debt-title">S-23 / 人情簿 · 只记名目与来源</span>
            <h2>欠与不欠，都要有个名字。</h2>
            <p>人欠我、我欠人、把柄分三栏；债不是好感条，也不会自动变成可用的筹码。</p>
          </div>
          <div className="debt-head-right">
            <RuleChip clause="trace-verbs" label="依 4.3" />
            {onBackToNetwork && <button className="outline-button debt-back-network" onClick={() => onBackToNetwork(focusPersonId ?? '')}><ArrowLeft size={14} />回人情谱</button>}
            <button className="icon-button" onClick={onClose} aria-label="收起人情簿"><X size={20} /></button>
          </div>
        </header>

        <div className="debt-body" ref={dockDebtPins} onKeyDown={handleDebtPinKeys}>
          {(Object.keys(kindMeta) as DebtKind[]).map(kind => {
            const meta = kindMeta[kind]
            const list = rows[kind]
            const MetaIcon = meta.icon
            return (
              <section className={`debt-column is-${kind}`} key={kind} aria-label={meta.label}>
                <header>
                  <MetaIcon size={15} />
                  <div><b>{meta.label}</b><small>{meta.note}</small></div>
                  <em>{list.length}</em>
                </header>
                {list.length ? list.map(({ person, count }) => (
                  <motion.article key={person.id} className={`debt-entry ${person.id === focusPersonId ? 'is-from-network' : ''}`} data-debt-focus={person.id === focusPersonId ? 'true' : undefined} data-name-card="seam" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                    <span className="debt-monogram">{person.monogram}</span>
                    <div>
                      <header><b>{person.name}</b><small>{person.role}</small><i aria-label={`${count} 笔`}>{Array.from({ length: count }, (_, index) => <u key={index} />)}</i>{person.id === focusPersonId && <span className="debt-from-network">从人情谱来</span>}</header>
                      <p>{person.hookNote}</p>
                      <footer><span>{person.claimId} · 口供与行状</span><button onClick={() => onOpenPerson(person.id)}>回人物卷<ArrowRight size={11} /></button></footer>
                    </div>
                  </motion.article>
                )) : <div className="debt-empty empty-slip" data-empty-slip="true"><BookOpen size={18} /><p>{kind === 'owed' ? '尚无人欠你' : kind === 'owe' ? '你也不欠人' : '尚无可用把柄'}<br /><span>没有来源就不补写</span></p></div>}
              </section>
            )
          })}
        </div>

        <section className="debt-gift" aria-label="礼簿往来">
          <header><UsersRound size={14} /><span>礼簿往来 · 与 S-07 同源</span><small>{state.giftEntries.length} 笔</small></header>
          {state.giftEntries.length
            ? state.giftEntries.map(entry => <p key={entry}><i>礼</i>{entry}</p>)
            : <p className="is-empty empty-slip" data-empty-slip="true"><i>礼</i>接风帖仍在案角，尚无往来记录</p>}
        </section>

        <GrowthPreview state={state} variant="slip" />

        <footer className="debt-foot">
          <span>共 {total} 笔名目 · 只读 tokens 与礼簿 · 不折算人情数值 · 不写存档</span>
          <button className="primary-button" onClick={onClose}>合上簿子<ArrowRight size={15} /></button>
        </footer>
      </motion.div>
    </motion.section>
  )
}
