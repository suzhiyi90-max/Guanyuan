import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, FileWarning, Link2, ScrollText, Stamp, X } from 'lucide-react'
import { officialAvailableOf, type GameState } from '../game/useGame'
import { RuleChip } from './RuleBook'
import { useOverlayDialog } from './useOverlayDialog'

type DraftKind = 'brief' | 'petition' | 'impeach'

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const kindMeta: Record<DraftKind, { label: string; note: string; basis: string }> = {
  brief: { label: '详文', note: '呈上宪的正式汇报', basis: '8.4 / 9.1' },
  petition: { label: '禀帖', note: '私下递上的短札', basis: '8.4' },
  impeach: { label: '揭', note: '参劾稿，一封就无回旋', basis: '17.4' },
}

interface Draft { paragraphs: string[]; signoff: string; seal: string }

export function draftsOf(state: GameState): Record<DraftKind, Draft | null> {
  const plan = state.plan
  const done = state.officialActions
  const day = plan ? dayNames[plan.day - 1] : ''
  const brief: Draft | null = plan ? {
    seal: '详',
    paragraphs: [
      '据东堤堡夫报称，旧闸下游堤身渗水四十步，湿痕三处，最大约二尺。',
      state.probeKnown
        ? '卑职亲赴堤所，督同堡夫探挖，见闸底淘空约三尺；书办所称「毋庸拆验」，与现场不符。'
        : '闸底情形尚未探挖，未敢遽断工法。',
      `当经雇募夫役${plan.labor}名，拨秫秸${plan.material}垛，委${plan.leaderName}主办，${plan.supervisor}，于第${day}日${plan.period}先行抢护。`,
      '惟十日之内只能抢护，旧闸拆修应俟汛后另案详请；雇募夫役已取保正具结存案。',
      '理合具文详报，伏乞鉴核施行。',
    ],
    signoff: `永济县知县 · 第${day}日${plan.period}`,
  } : null

  const petition: Draft | null = officialAvailableOf(state) ? {
    seal: '禀',
    paragraphs: [
      '卑职谨禀大人钧座：',
      plan
        ? `东堤渗水一事，已于第${day}日${plan.period}先抢后报，委牌、会勘与保正具结俱在案。`
        : '东堤渗水一事，尚在查勘，未敢遽定工法，先行具禀。',
      done.includes('commissioner')
        ? '委员勘报已至，与探挖相合，谨候验收题销。'
        : '委员覆勘一节，伏乞早赐批行；卑职不敢以一面之词自定工法。',
      '卑职谨禀。',
    ],
    signoff: `永济县知县 · 第${dayNames[state.day - 1]}日`,
  } : null

  const impeach: Draft | null = done.includes('impeach') ? {
    seal: '揭',
    paragraphs: [
      '为特参书办失察事：',
      '东堤旧闸渗水，初稿称「堤土未实」，请毋庸拆验；卑职亲勘，闸底实已淘空三尺。',
      '该书办身司文牍，于险工要务颟顸粉饰，实属失察。',
      '谨具揭参，伏候宪裁。',
    ],
    signoff: `永济县知县 · 第${dayNames[state.day - 1]}日`,
  } : null

  return { brief, petition, impeach }
}

/** C-57 文书三体：详文 / 禀帖 / 揭，全部据既有事实拟稿，标「未入卷」。 */
export function BriefDraft({ state, onClose, onOpenPlan, onOpenReview, onOpenDossier }: { state: GameState; onClose: () => void; onOpenPlan: () => void; onOpenReview: () => void; onOpenDossier?: () => void }) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useOverlayDialog<HTMLDivElement>()
  const drafts = draftsOf(state)
  const available = (Object.keys(kindMeta) as DraftKind[]).filter(kind => drafts[kind])
  const [kind, setKind] = useState<DraftKind>(available[0] ?? 'brief')
  const [gloss, setGloss] = useState(false)
  const draft = drafts[kind]
  const reasons: Record<DraftKind, string> = {
    brief: '尚未签押委牌，无抢护可详',
    petition: '府札未到，无上宪可禀',
    impeach: '未行揭参，无揭可拟',
  }

  return (
    <motion.section className="overlay-backdrop brief-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div ref={dialogRef} className="brief-folio" role="dialog" aria-modal="true" aria-labelledby="brief-title" tabIndex={-1} initial={{ y: reduceMotion ? 0 : 20, opacity: 0, scale: reduceMotion ? 1 : .99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: reduceMotion ? 0 : 12, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 235, damping: 28 }}>
        <header className="brief-head">
          <div>
            <span className="eyebrow" id="brief-title">C-57 / 文书三体 · 据既有事实拟稿</span>
            <h2>话要落到纸上，才算说过。</h2>
            <p>详文、禀帖、揭各有分寸；这里只拟稿，不代你具名，也不写进卷宗。</p>
          </div>
          <div className="brief-head-right">
            <RuleChip clause="trace-record" label="依 8.4" />
            <button className="icon-button" onClick={onClose} aria-label="收起文书拟稿"><X size={20} /></button>
          </div>
        </header>

        <div className="brief-tabs" role="tablist" aria-label="文书种类">
          {(Object.keys(kindMeta) as DraftKind[]).map(item => {
            const ready = Boolean(drafts[item])
            return <button key={item} role="tab" aria-selected={kind === item} aria-disabled={!ready} disabled={!ready} tabIndex={kind === item ? 0 : -1} onClick={() => setKind(item)} title={ready ? kindMeta[item].note : reasons[item]}>
              {kind === item && ready && <motion.span className="brief-tab-ink" layoutId="brief-tab-ink" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 390, damping: 34 }} aria-hidden="true" />}
              <span>{kindMeta[item].label}</span><small>{ready ? kindMeta[item].note : reasons[item]}</small>
            </button>
          })}
        </div>

        <div className="brief-body">
          {draft ? <>
            <article className={`brief-sheet ${gloss ? 'is-gloss' : ''}`} aria-label={`${kindMeta[kind].label}拟稿`}>
              <div className="brief-mark">拟稿 · 未入卷</div>
              <div className="brief-title-line"><b>{kindMeta[kind].label}</b><span>{kindMeta[kind].basis}</span></div>
              <motion.div key={gloss ? 'gloss' : 'vertical'} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : -6 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
                {gloss
                  ? <div className="brief-gloss">{draft.paragraphs.map(text => <p key={text}>{text}</p>)}</div>
                  : <div className="brief-vertical">{draft.paragraphs.map(text => <p key={text}>{text}</p>)}</div>}
              </motion.div>
              <div className="brief-signoff"><span>{draft.signoff}</span><i>{draft.seal}</i></div>
            </article>

            <aside className="brief-side">
              <header><Stamp size={14} /><span>此稿所据</span></header>
              <div className="brief-source"><span>委牌</span><b>{state.plan ? `${state.plan.leaderName} · 料 ${state.plan.material} 垛 · ${state.plan.supervisor}` : '尚未签押'}</b></div>
              <div className="brief-source"><span>勘报</span><b>{state.probeKnown ? 'E-007 闸底淘空三尺' : '尚未探挖'}</b></div>
              <div className="brief-source"><span>批答</span><b>{state.officialActions.length ? `已行 ${state.officialActions.length} 项` : '府札候答'}</b></div>
              <div className="brief-source"><span>具结</span><b>{state.plan ? '保正具结已附' : '未具结'}</b></div>
              <div className="brief-actions">
                <button className="outline-button" onClick={() => setGloss(current => !current)} aria-pressed={gloss}>{gloss ? '看竖排原件' : '看横排释文'}</button>
                <button className="text-link" onClick={onOpenPlan}>回委牌<ArrowRight size={12} /></button>
                {officialAvailableOf(state) && <button className="text-link" onClick={onOpenReview}>回上宪来文<ArrowRight size={12} /></button>}
              </div>
              <footer><Link2 size={11} /><span>只据既有委牌、勘报、批答与具结；缺一项即留白，不补写措辞。</span></footer>
            </aside>
          </> : <div className="brief-empty"><FileWarning size={22} /><p>尚无文书可拟。<br /><span>先签押委牌，或候府札到县；揭须先自行揭参。</span></p></div>}
        </div>

        <footer className="brief-foot">
          <span><ScrollText size={12} />拟稿不耗时段 · 不具名 · 不入卷 · 不写存档 · 与卷宗四体链只读串联</span>
          <div className="brief-foot-actions">
            {onOpenDossier && <button className="text-link" onClick={onOpenDossier}>回卷宗 · 查此体入卷与否<ArrowRight size={12} /></button>}
            <button className="primary-button" onClick={onClose}>收起拟稿<ArrowRight size={15} /></button>
          </div>
        </footer>
      </motion.div>
    </motion.section>
  )
}
