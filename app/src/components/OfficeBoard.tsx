import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, Check, ClipboardList, FileText, Gift, Hammer, LockKeyhole, PackageOpen, Scale, Shield, Stamp, UsersRound } from 'lucide-react'
import type { GameState } from '../game/useGame'
import type { SectionId } from '../types'

type OfficeId = '吏' | '户' | '礼' | '兵' | '刑' | '工'
interface Props {
  state: GameState
  onOpenPlan: () => void
  onOpenEvidence: () => void
  onOpenReview: () => void
  onNavigate: (section: SectionId) => void
  onGoRiver: () => void
}

export function OfficeBoard({ state, onOpenPlan, onOpenEvidence, onOpenReview, onNavigate, onGoRiver }: Props) {
  const [selected, setSelected] = useState<OfficeId>('工')
  const reduceMotion = useReducedMotion()
  const offices = [
    { id: '吏' as OfficeId, name: '吏房', title: '考语与回文', icon: UsersRound, status: state.officialActions.length ? `${state.officialActions.length} 项入卷` : '尚无回文', work: '府札、考语与县署已行动作分别归卷，不把“已读”写成“已办”。', source: state.officialActions.includes('citation') ? '考语已入册 · 上宪来文' : `上宪来文 · ${state.officialActions.length} 项回文`, boundary: '不生成升迁、大计、品级或考语阈值。', action: '回上宪来文' },
    { id: '户' as OfficeId, name: '户房', title: '三数与料账', icon: BookOpen, status: `${state.material.arrived} 垛到场`, work: '账面、实收、差额各有来源；到场、在途、未发不重复计算。', source: `到场 ${state.material.arrived} / 在途 ${state.material.transit} / 未发 ${state.material.unsent}`, boundary: '差额仍待定，不用值房直接报部或定罪。', action: '回账房三数' },
    { id: '礼' as OfficeId, name: '礼房', title: '礼簿与应酬', icon: Gift, status: state.giftEntries.length ? `${state.giftEntries.length} 笔记录` : '礼簿为空', work: '接风帖、礼簿与五本生活账同读，人情不折算好感值。', source: state.giftEntries[0] ?? '桑宅请帖已在案 · 尚未作取舍', boundary: '不生成馈赠、消费、风评分值或家庭事件。', action: '回生活礼簿' },
    { id: '兵' as OfficeId, name: '兵房', title: '夫役与具结', icon: Shield, status: state.plan ? `${state.plan.labor} 人已委` : '尚未签押', work: '抢护夫役、保正具结和会勘属于同一张委牌，签押不等于已经办成。', source: state.plan?.detail ?? '预演抢护 · 尚未发起', boundary: '不调兵、不增夫役、不改原委托耗时与结果。', action: '回抢护委牌' },
    { id: '刑' as OfficeId, name: '刑房', title: '证据与责任', icon: Scale, status: state.comparisons.length ? `${state.comparisons.length} 条疑点` : '尚无疑点', work: '三百两只并置库账、借领与旧欠的名目差异，责任仍须回到经手人。', source: state.comparisons[0]?.refs.join(' / ') ?? 'E-001 可查验 · 尚未正式并置', boundary: '不直接定罪，不生成揭帖、牢狱或审讯规则。', action: '回证据并置' },
    { id: '工' as OfficeId, name: '工房', title: '河工与抢护', icon: Hammer, status: state.plan ? '抢护已发起' : '东堤待勘', work: '旧闸、渗水、料场和抢护委牌同属河工案，长动作按原日程推进。', source: state.plan ? `${state.plan.leaderName}主办 · 第${state.plan.day}日签押` : 'V-001/V-002 · 东堤渗水呈文', boundary: '不改汛情、工法、验收与时段，不预告结果。', action: '回东堤现场' },
  ]
  const active = offices.find(office => office.id === selected) ?? offices[5]
  const ActiveIcon = active.icon
  const run = () => {
    if (selected === '吏') onOpenReview()
    else if (selected === '户') onNavigate('ledger')
    else if (selected === '礼') onNavigate('life')
    else if (selected === '兵') onOpenPlan()
    else if (selected === '刑') onOpenEvidence()
    else onGoRiver()
  }
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = offices.findIndex(office => office.id === selected)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? offices.length - 1 : event.key === 'ArrowRight' ? (current + 1) % offices.length : (current - 1 + offices.length) % offices.length
    setSelected(offices[next].id)
    requestAnimationFrame(() => document.getElementById(`office-tab-${offices[next].id}`)?.focus())
  }

  return (
    <div className="office-board">
      <div className="office-tabs" role="tablist" aria-label="六房值房" onKeyDown={handleKeys}>
        {offices.map(office => <button key={office.id} id={`office-tab-${office.id}`} role="tab" aria-selected={selected === office.id} aria-controls="office-panel" tabIndex={selected === office.id ? 0 : -1} className={selected === office.id ? 'selected' : ''} onClick={() => setSelected(office.id)}>
          {selected === office.id && <motion.span className="office-tab-ink" layoutId="office-tab-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
          <office.icon size={16} /><span>{office.name}</span><small>{office.title}</small>
        </button>)}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={selected} id="office-panel" role="tabpanel" aria-labelledby={`office-tab-${selected}`} className="office-desk" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
          <header className="office-desk-head"><div><span className="eyebrow">{active.name} / 值房案台</span><h2>{active.title}</h2></div><span className="office-status-seal">{active.status}</span></header>
          <div className="office-desk-grid">
            <article className="office-work-paper"><span><ClipboardList size={14} />在办</span><p>{active.work}</p><footer><Check size={12} />只读原状态 · 回查不耗时</footer></article>
            <article className="office-source-paper"><span><FileText size={14} />所据</span><p>{active.source}</p><footer>来源与原工作面一致</footer></article>
            <article className="office-boundary-paper"><span><LockKeyhole size={14} />边界</span><p>{active.boundary}</p><footer>完整六房仍为 M2 预览</footer></article>
          </div>
          <div className="office-desk-action"><div><ActiveIcon size={20} /><span>{active.name}不另立规则<br /><small>只把既有案卷放回对应案台</small></span></div><button className="primary-button" onClick={run}>{active.action}<ArrowRight size={15} /></button></div>
          <div className="office-desk-watermark" aria-hidden="true">{selected}</div>
          <div className="office-desk-tools" aria-hidden="true"><Stamp size={18} /><PackageOpen size={18} /></div>
        </motion.section>
      </AnimatePresence>
    </div>
  )
}
