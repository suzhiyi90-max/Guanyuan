/**
 * C-103 三向对读：账 / 疑 / 礼，只把已经留下的东西放回同一张纸。
 * 只读 state.clues / giftEntries / privateFunds 与既有三数；不新增账目、疑点或礼数。
 * FE-098：长文下本地「展开余下 / 收起」只改显示条数，不改数据；整页与章末共用卷页题签。
 * FE-118：栏首小签只标栏序与「回卷首」焦点，不新增内容、不触发点击回调、不写存档。
 * FE-119：空态纸签与卷末落款沿用卷末纸带装裱，只换皮不换内容。
 */
import { useState, type KeyboardEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { ledgerThree } from '../data'
import type { GameState } from '../game/useGame'
import { FolioProgress } from './FolioSlip'
import { handleFolioReturnKey, returnToFolioHead } from '../folioReturn'

export type ReadAcrossTarget = 'ledger' | 'intel' | 'gift'

const sourceLabel = { document: '呈文对勘', ledger: '账房并置', river: '东堤探挖' } as const

function format(value: number) {
  return value.toLocaleString('zh-CN')
}

/** C-129 / C-133：回卷首只把 DOM 焦点送回本表面卷首题签，不改业务状态、不触发任何既有回调。 */
function handleFolioKeys(event: KeyboardEvent<HTMLElement>) {
  handleFolioReturnKey(event)
}

export function ReadAcross({ state, variant = 'page', active, onOpen, folioVisited }: { state: GameState, variant?: 'page' | 'strip', active?: ReadAcrossTarget, onOpen?: (target: ReadAcrossTarget) => void, folioVisited?: number[] }) {
  const [expanded, setExpanded] = useState(false)
  const longForm = state.clues.length > 2 || state.giftEntries.length > 2
  const clues = (expanded ? state.clues.slice() : state.clues.slice(-2)).reverse()
  const gifts = (expanded ? state.giftEntries.slice() : state.giftEntries.slice(-2)).reverse()
  const link = (target: ReadAcrossTarget, label: string) => {
    if (onOpen && active !== target) return <button type="button" data-folio-mount="true" onClick={() => onOpen(target)}>{label}<ArrowRight size={10} /></button>
    if (active === target) return <span className="read-across-here">当前页</span>
    return null
  }

  if (variant === 'strip') {
    return (
      <section className="read-across is-strip" aria-label="章末会读到的账疑礼" data-readacross-strip="true" data-folio-cols="strip" onKeyDown={handleFolioKeys}>
        <header className="read-across-strip-head"><span>章节将合时</span><b>账 · 疑 · 礼会读到</b><em className="read-colhead" data-colhead-slip="true">第 01–03 栏</em><small>只读对读</small></header>
        <div className="read-across-strip-grid">
          <button type="button" data-folio-mount="true" className={active === 'ledger' ? 'is-current' : ''} onClick={() => onOpen?.('ledger')} disabled={!onOpen || active === 'ledger'} aria-label={`账房三数 · 差额 ${ledgerThree.gap} 两`}>
            <i>账</i><b>{format(ledgerThree.gap)}</b><span>两差额 · 报部待定</span><small>{format(ledgerThree.book)} → {format(ledgerThree.actual)}</small>
          </button>
          <button type="button" data-folio-mount="true" className={active === 'intel' ? 'is-current' : ''} onClick={() => onOpen?.('intel')} disabled={!onOpen || active === 'intel'} aria-label={`情报台账 · ${state.clues.length} 条疑点`}>
            <i>疑</i><b>{state.clues.length}</b><span>条疑点 · 来源仍在</span><small>{clues[0] ? clues[0].text : '尚无记下的疑点'}</small>
          </button>
          <button type="button" data-folio-mount="true" className={active === 'gift' ? 'is-current' : ''} onClick={() => onOpen?.('gift')} disabled={!onOpen || active === 'gift'} aria-label={`礼簿 · ${state.giftEntries.length} 笔往来`}>
            <i>礼</i><b>{state.giftEntries.length}</b><span>笔往来 · 私囊 {state.privateFunds} 两</span><small>{gifts[0] ?? '尚无礼簿往来'}</small>
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="read-across is-page" aria-label="三向对读 · 账疑礼" data-readacross-long={longForm ? 'true' : 'false'} data-readacross-expanded={expanded ? 'true' : 'false'} data-folio-cols="page" onKeyDown={handleFolioKeys}>
      <header className="read-across-head">
        <div><span className="eyebrow">三向对读 / 只把已有的放回一张纸</span><h3>账、疑、礼，各归其位。</h3><p>三栏都是已经发生的事；不替它们下结论，也不折算成一条总账。</p></div>
        <FolioProgress index={4} total={4} label="留下的账" visited={folioVisited ?? []} />
      </header>
      <div className="read-across-columns">
        <article className="read-across-col is-ledger" data-col="1">
          <header><i>账</i><div><span>账房三数</span><b>差额 {format(ledgerThree.gap)} 两</b></div><em className="read-colhead" data-colhead-slip="true">第 01 / 03 栏</em><small>报部待定</small></header>
          <dl>
            <div><dt>账面领出</dt><dd>{format(ledgerThree.book)}<small>两</small></dd></div>
            <div><dt>河工实收</dt><dd>{format(ledgerThree.actual)}<small>两</small></dd></div>
            <div><dt>差额 · 尚无科目</dt><dd>{format(ledgerThree.gap)}<small>两</small></dd></div>
          </dl>
          <footer><span>E-001 · 库房与专账</span>{link('ledger', '回账房')}</footer>
        </article>
        <article className="read-across-col is-clue" data-col="2">
          <header><i>疑</i><div><span>情报台账</span><b>{state.clues.length} 条疑点</b></div><em className="read-colhead" data-colhead-slip="true">第 02 / 03 栏</em><small>只记来源</small></header>
          {clues.length ? <ul>{clues.map(clue => <li key={clue.id}><span>{clue.id} · 第{clue.day}日</span><p>{clue.text}</p><small>{sourceLabel[clue.source]}</small></li>)}</ul> : <p className="read-across-empty" data-empty-slip="true">尚无记下的疑点。对勘或并置后，这里才会多一行。</p>}
          <footer><span>来源与真假分开记</span>{link('intel', '回情报台账')}</footer>
        </article>
        <article className="read-across-col is-gift" data-col="3">
          <header><i>礼</i><div><span>礼簿与私囊</span><b>{state.giftEntries.length} 笔往来</b></div><em className="read-colhead" data-colhead-slip="true">第 03 / 03 栏</em><small>不折人情</small></header>
          {gifts.length ? <ul>{gifts.map((entry, index) => <li key={`${entry}-${index}`}><span>原簿 · 第{state.giftEntries.length - index} 笔</span><p>{entry}</p><small>夜事件记录</small></li>)}</ul> : <p className="read-across-empty" data-empty-slip="true">尚无礼簿往来。接风宴之后，这里才会多一笔。</p>}
          <div className="read-across-funds"><span>私囊余</span><b>{state.privateFunds}<small>两</small></b></div>
          <footer><span>礼簿不与公帑混记</span>{link('gift', '回礼簿')}</footer>
        </article>
      </div>
      {longForm && <div className="read-across-longbar">
        <button type="button" data-folio-mount="true" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
          {expanded ? '收起余下 · 只看最近两条' : `展开余下 ${Math.max(0, state.clues.length - 2) + Math.max(0, state.giftEntries.length - 2)} 条`}
        </button>
        <span>只换显示条数 · 不新增疑点与礼数</span>
      </div>}
      <footer className="read-across-foot" data-folio-band="true">
        <span>卷末落款 · 界面只读对读</span>
        <p>不新增账目、疑点、礼数；只把来源与数目并到一处。归卷页序同章末四页。</p>
        <button type="button" className="read-colhead-return" data-folio-mount="true" onClick={event => returnToFolioHead(event.currentTarget)} aria-label="回卷首 · 只把焦点送回本表面卷首题签">回卷首 <small>Alt ↑</small></button>
        <small className="art-borrow art-borrow-colhead">暂借长卷栏纸 · 待栏首小签纸</small>
      </footer>
    </section>
  )
}
