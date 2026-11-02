import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, FileSearch, FileWarning, Landmark, LockKeyhole, ScrollText, Stamp, X } from 'lucide-react'
import { useOverlayDialog } from './Overlays'
import type { GameState } from '../game/useGame'
import type { OfficialActionId } from '../types'

interface ActionSpec {
  id: OfficialActionId
  name: string
  cost: string
  can: string
  cannot: string
  effect: string
  danger?: boolean
}

const actions: ActionSpec[] = [
  { id: 'endorse', name: '批驳', cost: '不耗时段', can: '批示准驳 饬令再核 把「查」字发回县里', cannot: '替你定下工法 也替不了你签押', effect: '批语入卷 · 书办先自乱' },
  { id: 'commissioner', name: '委员覆勘', cost: '1 时段', can: '委员赴堤覆勘 把闸底与抢护再看一遍', cannot: '把覆勘预先写成「合式」', effect: '工期与定性 · 得勘报 E-008 事务转验' },
  { id: 'files', name: '调卷传询', cost: '1 时段', can: '调河厅旧修造册 传询经手书办', cannot: '直接革职 也不能越过河厅改委', effect: '料源与责任 · 得修造册 E-004' },
  { id: 'citation', name: '考语', cost: '不耗时段', can: '据本局实迹拟一句考语 附入册中', cannot: '保卓异 也不能预知大计', effect: '考语措辞 · 日后会被人翻出' },
  { id: 'impeach', name: '揭参', cost: '1 时段 · 高风险', can: '具揭参劾书办失察 稿封发河厅', cannot: '保证揭参必准 也不能不伤县里和气', effect: '责任与风评 · 清名与刻名并至', danger: true },
  { id: 'suppress', name: '压案', cost: '不耗时段 · 留把柄', can: '把来文压进匣底 暂不应答', cannot: '让来文消失 幕友已经看见', effect: '责任 · 把柄留在人手里', danger: true },
]

function citationOf(state: GameState): string {
  if (state.plan && state.officialActions.includes('commissioner')) return '才具开展 河工尚能集事'
  if (state.plan) return '办事勤勉 调度未纯'
  return '到任伊始 河工未固'
}

export function OfficialReview({ state, onClose, onAction }: { state: GameState, onClose: () => void, onAction: (id: OfficialActionId) => void }) {
  const [selected, setSelected] = useState<OfficialActionId>('commissioner')
  const [confirming, setConfirming] = useState<OfficialActionId | null>(null)
  const done = state.officialActions
  const citationWritten = done.includes('citation')
  const action = actions.find(item => item.id === selected) ?? actions[0]
  const isDone = done.includes(action.id)
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()

  const select = (id: OfficialActionId) => {
    setSelected(id)
    setConfirming(null)
  }

  const handleActionKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = actions.findIndex(item => item.id === selected)
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (current + (backward ? -1 : 1) + actions.length) % actions.length
    select(actions[next].id)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-action-id="${actions[next].id}"]`)?.focus())
  }

  const run = (id: OfficialActionId) => {
    if (done.includes(id)) return
    if ((id === 'impeach' || id === 'suppress') && confirming !== id) {
      setConfirming(id)
      return
    }
    setConfirming(null)
    onAction(id)
  }

  return (
    <motion.section className="overlay-backdrop review-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="review-paper" role="dialog" aria-modal="true" aria-labelledby="review-title" tabIndex={-1} layoutId="overlay-paper" initial={{ y: reduceMotion ? 0 : 26, opacity: 0, rotate: reduceMotion ? 0 : -.3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: reduceMotion ? 0 : 16, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 27 }} data-reply-state={isDone ? 'archived' : 'review'}>
        <header className="review-head">
          <div>
            <span className="eyebrow" id="review-title">上宪来文 · 知府批</span>
            <div className="verdict-seals">{['准', '驳', '查', '饬', '存'].map(item => <span key={item} className={item === '查' ? 'active' : ''}>{item}</span>)}</div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="收起来文"><X size={20} /></button>
        </header>

        <div className="review-body">
          <section className="review-letter">
            <div className="review-paper-route" aria-label="文书流转：府札到县卷，再候回文"><span>府札</span><i /><span>县卷</span><i /><span>回文</span></div>
            <motion.p className="review-verdict" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .2, delay: reduceMotion ? 0 : .12 }}>委员覆勘 料价再核</motion.p>
            <div className="review-text">
              <p>据永济县呈报东堤渗水并抢护缘由前来。堤工关系汛务，未便仅凭县呈遽准。仰即委员覆勘闸底情形，并将拨料数目、旧欠流转一并核查，限三日内详报，毋得粉饰。</p>
              <p>至该县所称先行抢护一节，事出汛急，准其先办后报；惟雇募夫役须具结存案，不得派累。</p>
            </div>
            <div className="review-knowledge">
              <Landmark size={15} />
              <p>他只知道县呈与河厅册上有的。你夜查旧册、并置疑点，他尚不知——除非写进详文。</p>
            </div>
            <div className="review-boundary">
              <LockKeyhole size={14} />
              <span>他不能批银 · 不能改委河厅 · 不能直接革职</span>
            </div>
          </section>

          <section className="review-actions">
            <header className="review-actions-head"><div><span className="eyebrow">批答六法</span><h2>先查验 再落字</h2></div><span>已入卷 {done.length} / 6</span></header>
            <ol className="review-correspondence" aria-label="当前回文流程" data-stage={isDone ? 'archived' : 'review'}>
              <li className="is-done"><span>收</span><div><b>收文</b><small>府札在案</small></div></li>
              <li className="is-active"><span>验</span><div><b>查验</b><small>{action.name}</small></div></li>
              <li className={isDone ? 'is-done' : ''}><span>入</span><div><b>{isDone ? '已入卷' : '待回文'}</b><small>{isDone ? '朱印留痕' : '不预告结果'}</small></div></li>
            </ol>
            <div className="review-action-workspace">
              <div className="review-action-index" aria-label="选择要查验的上宪动作，方向键切换" onKeyDown={handleActionKey}>
                {actions.map((item, index) => {
                  const itemDone = done.includes(item.id)
                  return (
                    <motion.button
                      key={item.id}
                      data-action-id={item.id}
                      className={`review-action-select ${selected === item.id ? 'active' : ''} ${itemDone ? 'is-done' : ''} ${item.danger ? 'is-danger' : ''}`}
                      onClick={() => select(item.id)}
                      aria-pressed={selected === item.id}
                      initial={{ opacity: 0, x: reduceMotion ? 0 : 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduceMotion ? 0 : .16, delay: reduceMotion ? 0 : .04 + index * .03 }}
                      whileTap={{ scale: .99 }}
                    >
                      {selected === item.id && <motion.span className="review-action-ink" layoutId="review-action-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} aria-hidden="true" />}
                      <span className="review-action-number">0{index + 1}</span>
                      <span className="review-action-name">{item.name}<small>{itemDone ? '朱印 · 已入卷' : `墨稿 · ${item.cost}`}</small></span>
                      {itemDone ? <Check size={14} /> : <ArrowRight size={14} />}
                    </motion.button>
                  )
                })}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.article key={action.id} className={`action-card ${isDone ? 'is-done' : ''} ${action.danger ? 'is-danger' : ''}`} data-archive-state={isDone ? '朱印入卷' : '墨稿待落'} initial={{ opacity: 0, x: reduceMotion ? 0 : 12, rotateY: reduceMotion ? 0 : -2 }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0 : .18, ease: 'easeOut' }}>
                  <div className="action-paper-kicker"><span>回文查验 / {action.name}</span><b>{isDone ? '朱印入卷' : '墨稿待落'}</b></div>
                  <header><h3>{action.name}</h3><span>{isDone ? '已行' : action.cost}</span></header>
                  <dl>
                    <div><dt>能</dt><dd>{action.can}</dd></div>
                    <div><dt>否</dt><dd>{action.cannot}</dd></div>
                    <div><dt>变</dt><dd>{action.effect}</dd></div>
                  </dl>
                  {isDone && <motion.span className="action-archive-seal" aria-hidden="true" initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.35, rotate: reduceMotion ? -5 : -12 }} animate={{ opacity: 1, scale: 1, rotate: -5 }} transition={{ duration: reduceMotion ? 0 : .22, ease: 'easeOut' }}>入卷</motion.span>}
                  {action.id === 'citation' && citationWritten && <p className="citation-line">考语 · {citationOf(state)}</p>}
                  <AnimatePresence mode="wait" initial={false}>
                    {confirming === action.id ? (
                      <motion.div key="confirm" className="action-confirm" initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : .16 }}>
                        <p>{action.id === 'impeach' ? '揭参一出 县里再无回旋 仍要封发？' : '压案会留把柄 日后被人提起时无从分辩 仍要压下？'}</p>
                        <div><button className="text-link" onClick={() => setConfirming(null)}>再想想</button><button className="primary-button danger-button" onClick={() => run(action.id)}>仍要{action.name}<ArrowRight size={14} /></button></div>
                      </motion.div>
                    ) : (
                      <motion.button key="run" className="outline-button action-run" disabled={isDone} onClick={() => run(action.id)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .14 }} whileTap={{ scale: .98 }}>{isDone ? <><Check size={14} />已入卷</> : <>{action.id === 'impeach' ? <FileWarning size={14} /> : action.id === 'citation' ? <ScrollText size={14} /> : action.id === 'commissioner' ? <FileSearch size={14} /> : <Stamp size={14} />}{action.name}<ArrowRight size={14} /></>}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.article>
              </AnimatePresence>
            </div>
          </section>
        </div>

        <footer className="review-foot">
          <span>已入卷 {done.length} 项 · 批语与动作都留痕 不显示知府全知</span>
          <button className="primary-button" onClick={onClose}>收起来文 回到案头</button>
        </footer>
      </motion.div>
    </motion.section>
  )
}
