import { ArrowRight, Check, CircleDashed, FileText, ScrollText, Stamp } from 'lucide-react'
import type { GameState } from '../game/useGame'
import { draftsOf } from './BriefDraft'

export type DocKindId = 'endorse' | 'brief' | 'petition' | 'impeach'
export type DocPhase = 'in-volume' | 'pending' | 'draft' | 'not-yet'

export interface DocKind {
  id: DocKindId
  seal: string
  name: string
  direction: string
  status: string
  phase: DocPhase
  note: string
  basis: string
}

/** C-61 四体入卷链：只读既有动作与拟稿可用性，不生成文书正文、不写入卷。 */
export function docKindsOf(state: GameState): DocKind[] {
  const drafts = draftsOf(state)
  return [
    {
      id: 'endorse', seal: '批', name: '批', direction: '下行 · 知府批语',
      status: state.officialActions.includes('endorse') ? '批答已入卷' : '府札在卷 · 候批',
      phase: state.officialActions.includes('endorse') ? 'in-volume' : 'pending',
      note: '批语即证据；已入卷只表示原动作留痕', basis: '8.4 / 17.4',
    },
    {
      id: 'brief', seal: '详', name: '详文', direction: '上行 · 有详必有批',
      status: drafts.brief ? '拟稿可拟 · 未入卷' : '未届 · 尚未签押委牌',
      phase: drafts.brief ? 'draft' : 'not-yet',
      note: '详文留空供批，详册上司存案；拟稿不代具名', basis: '8.4',
    },
    {
      id: 'petition', seal: '禀', name: '禀帖', direction: '上行 · 非正式短札',
      status: drafts.petition ? '拟稿可拟 · 未入卷' : '未届 · 府札未到',
      phase: drafts.petition ? 'draft' : 'not-yet',
      note: '公事应候批者不得以禀代详；白禀存上司卷宗', basis: '8.4',
    },
    {
      id: 'impeach', seal: '揭', name: '揭', direction: '上行 · 参劾',
      status: drafts.impeach ? '已行揭参 · 拟稿未入卷' : '未届 · 未行揭参',
      phase: drafts.impeach ? 'draft' : 'not-yet',
      note: '揭≠揭帖；M1 只做揭，不做揭帖', basis: '8.4 / 17.4',
    },
  ]
}

const kindIcons = { endorse: Stamp, brief: ScrollText, petition: FileText, impeach: Check }
const phaseLabels: Record<DocPhase, string> = { 'in-volume': '在卷', pending: '候答', draft: '拟稿 · 未入卷', 'not-yet': '未届' }

export function DocumentKindChain({ state, onOpenBrief, onOpenReview, onOpenDocument }: {
  state: GameState
  onOpenBrief?: () => void
  onOpenReview: () => void
  onOpenDocument: (mode: 'original') => void
}) {
  const kinds = docKindsOf(state)
  const openOf = (id: DocKindId, phase: DocPhase) => {
    if (id === 'endorse') return phase === 'in-volume' ? onOpenReview : () => onOpenDocument('original')
    if (phase === 'draft' && onOpenBrief) return onOpenBrief
    return undefined
  }
  return (
    <section className="doc-kind-chain" data-doc-kind-chain="4" data-focus-id="doc-kind-chain" aria-label="四体入卷链 · 界面只读串联">
      <header>
        <div><span className="eyebrow">界面 · 只读串联 / 依 8.4</span><h3>批、详、禀、揭：拟稿与入卷是两回事。</h3></div>
        <span className="chain-note">不写入卷 · 不具名 · 不生成新文书</span>
      </header>
      <div className="doc-kind-grid">
        {kinds.map(kind => {
          const Icon = kindIcons[kind.id]
          const open = openOf(kind.id, kind.phase)
          return (
            <article key={kind.id} className={`doc-kind is-${kind.phase}`} data-doc-kind={kind.id} data-doc-phase={kind.phase}>
              <header><i>{kind.seal}</i><Icon size={15} /><span>{phaseLabels[kind.phase]}</span></header>
              <h4>{kind.name}<small>{kind.direction}</small></h4>
              <b>{kind.status}</b>
              <p>{kind.note}</p>
              <footer><span>依 {kind.basis}</span>{open
                ? <button className="text-link" onClick={open}>{kind.id === 'endorse' ? '回上宪 / 呈文' : '回拟稿'}<ArrowRight size={12} /></button>
                : <em><CircleDashed size={11} />未届 · 无稿可回</em>}</footer>
            </article>
          )
        })}
      </div>
      <footer className="doc-kind-foot"><Check size={12} /><span>在卷只读原动作留痕；拟稿只据既有委牌、勘报、批答与具结；两者之间不自动生成流转、不耗时段、不写存档。</span></footer>
    </section>
  )
}
