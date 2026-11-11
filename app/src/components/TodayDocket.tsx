import { ArrowRight, Check, CircleDashed } from 'lucide-react'
import type { GameState } from '../game/useGame'
import { officialAvailableOf } from '../game/useGame'

export interface DocketHandlers {
  onOpenDoc: () => void
  onOpenReview: () => void
  onOpenPlan: () => void
  onOpenBanquet: () => void
  onOpenAffairs: () => void
}

interface DocketRow {
  id: string
  title: string
  hint: string
  done: boolean
  action: () => void
}

/** C-04 今日待决：只从既有状态推出还能做的事，不生成新事、不预告结果。 */
export function docketOf(state: GameState, handlers: DocketHandlers): DocketRow[] {
  const rows: DocketRow[] = []
  const docDone = state.completedActions.includes('doc-remembered')
  rows.push({ id: 'doc', title: '东堤呈文两版', hint: docDone ? '已并置，疑点入台账' : '尚未并置 · 改动依据仍缺', done: docDone, action: handlers.onOpenDoc })

  if (officialAvailableOf(state)) {
    const replied = state.officialActions.length > 0
    rows.push({
      id: 'review',
      title: '上宪来文',
      hint: replied ? `已行 ${state.officialActions.length} 项，覆勘与回文在卷` : '府札候答 · 委员覆勘与料价仍悬',
      done: replied,
      action: handlers.onOpenReview,
    })
  }

  rows.push({
    id: 'plan',
    title: '抢护委牌',
    hint: state.plan ? '已签押 · 执行与验收按日程走' : state.clues.length || state.asked.length ? '疑点在手，可以预演调度' : '先读呈文、问人，再决定托谁',
    done: Boolean(state.plan),
    action: handlers.onOpenPlan,
  })

  if (state.day === 1 && state.giftEntries.length === 0) {
    rows.push({ id: 'banquet', title: '桑宅接风帖', hint: '今夜须作取舍 · 私囊、人情与旧欠', done: false, action: handlers.onOpenBanquet })
  } else if (state.giftEntries.length > 0) {
    rows.push({ id: 'banquet', title: '桑宅接风帖', hint: state.giftEntries[0], done: true, action: handlers.onOpenBanquet })
  }

  if (state.day >= 10) {
    rows.push({ id: 'close', title: '验收题销', hint: state.outcome ? `${state.outcome.grade} 已下 · 题销与考语可回看` : '第十日 · 题销册仍待落字', done: Boolean(state.outcome), action: handlers.onOpenAffairs })
  }
  return rows
}

export function TodayDocket({ state, handlers }: { state: GameState; handlers: DocketHandlers }) {
  const rows = docketOf(state, handlers)
  const open = rows.filter(row => !row.done)
  const done = rows.length - open.length
  return (
    <section className="today-docket" aria-label="今日待决">
      <header>
        <span>今日待决</span>
        <b>{open.length}</b>
        <small>点开即回原处</small>
        <details className="docket-why"><summary>看依据</summary><p>只列已有来源的待决：点开回原处，不生成新事、不耗时段；已办项折成一行，不占版面。</p></details>
      </header>
      <div className="docket-rows">
        {open.map((row, index) => (
          <button key={row.id} className={`docket-row ${row.done ? 'is-done' : ''}`} onClick={row.action} aria-label={`${row.title} · ${row.hint}`}>
            <span className="docket-index">{row.done ? <Check size={11} /> : String(index + 1).padStart(2, '0')}</span>
            <div><b>{row.title}</b><small>{row.hint}</small></div>
            {row.done ? <CircleDashed size={13} /> : <ArrowRight size={13} />}
          </button>
        ))}
        {done > 0 && <p className="docket-done">已办 {done} 项 · {rows.filter(row => row.done).map(row => row.title).join(' / ')}</p>}
      </div>
      <footer>只列已有来源的待决，不生成新事</footer>
    </section>
  )
}
