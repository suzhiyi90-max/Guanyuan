import { Coins, Gift, Home } from 'lucide-react'
import type { GameState } from '../game/useGame'

export interface DecencyFact {
  id: 'purse' | 'gift' | 'household'
  label: string
  value: string
  note: string
  source: string
}

/** C-59 体面线：三笔既有事实与一条粗墨线。不编收入、不判高低、不新增数值。 */
export function decencyFactsOf(state: GameState): DecencyFact[] {
  return [
    {
      id: 'purse',
      label: '私囊余',
      value: `${state.privateFunds} 两`,
      note: '顶栏私囊同源 · 只读既有结算',
      source: '原私囊状态 / 夜事件结算',
    },
    {
      id: 'gift',
      label: '礼簿已出',
      value: state.giftEntries.length ? `${state.giftEntries.length} 笔` : '尚无往来',
      note: state.giftEntries.length ? state.giftEntries[state.giftEntries.length - 1] : '接风帖仍在案角，不补写礼数',
      source: 'S-07 礼簿 / 夜事件记录',
    },
    {
      id: 'household',
      label: '家用归属',
      value: '家用入私囊 · 大额另记',
      note: '内宅门簿只留账位，不预设金额',
      source: 'S-08 内宅门簿 / 厨房账位',
    },
  ]
}

const factIcons = { purse: Coins, gift: Gift, household: Home }

/** 同一份只读投影，full 用于 S-07 / S-06，strip 用于 S-08。 */
export function DecencyLine({ state, variant = 'full' }: { state: GameState; variant?: 'full' | 'strip' }) {
  const facts = decencyFactsOf(state)
  return (
    <section className={`decency-line is-${variant}`} data-decency-line={variant} data-decency-facts={facts.length} aria-label="体面线 · 预览 · 规则未启用">
      <header className="decency-head">
        <div><span className="eyebrow">依 11.7 / 14.5 · 体面线</span><h3>可见消费与已知收入之间，只留一条粗线。</h3></div>
        <span className="preview-seal">预览 · 规则未启用</span>
      </header>
      <div className="decency-ink" aria-hidden="true"><i /><i /><i /></div>
      <div className="decency-facts">
        {facts.map(fact => {
          const Icon = factIcons[fact.id]
          return (
            <article key={fact.id} className={`decency-fact is-${fact.id}`} data-decency-fact={fact.id}>
              <header><Icon size={14} /><span>{fact.label}</span></header>
              <b>{fact.value}</b>
              <p>{fact.note}</p>
              {variant === 'full' && <small>{fact.source}</small>}
            </article>
          )
        })}
      </div>
      {variant === 'full' && <footer className="decency-foot">
        <span>三笔都是已经发生的事：私囊余是既有结算，礼簿已出是既有记录，家用归属是既有账位。</span>
        <span>不列收入字段、不比高低、不新增数值；体面线判定规则未启用。</span>
      </footer>}
    </section>
  )
}
