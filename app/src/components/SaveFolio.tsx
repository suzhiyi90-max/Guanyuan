/**
 * C-92 存档案卷：立志纸左下的一枚压角折页。
 * 只做三件事——读本档现状（只读投影）、导出底稿（只读下载）、另立新志（两段落印，复用既有 resetGame）。
 * 不改存档结构、不新增存储 key、不设多档位；骑缝与半印只作装帧，不作印信。
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Download, RotateCcw, ShieldAlert } from 'lucide-react'

export interface SaveSummary {
  day: number
  period: string
  goal: string | null
  funds: number
  clues: number
  plan: string | null
  restored: boolean
}

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function SaveFolio({ summary, onExport, onReset, extra }: { summary: SaveSummary, onExport?: () => void | Promise<void>, onReset: () => void, extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [saved, setSaved] = useState(false)
  const reduceMotion = useReducedMotion()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const headRef = useRef<HTMLButtonElement | null>(null)
  const armTimer = useRef(0)
  const savedTimer = useRef(0)

  // 落印只等一次呼吸：8 秒内不再按，就自己收起。
  useEffect(() => {
    if (!armed) return
    armTimer.current = window.setTimeout(() => setArmed(false), 8000)
    return () => window.clearTimeout(armTimer.current)
  }, [armed])

  useEffect(() => () => {
    window.clearTimeout(armTimer.current)
    window.clearTimeout(savedTimer.current)
  }, [])

  // Esc 先撤印、再折页；拦在本组件内，不让它顺手关掉整张立志纸。
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (armed) setArmed(false)
      else { setOpen(false); headRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, armed])

  const handleExport = async () => {
    if (!onExport) return
    try {
      await onExport()
      setSaved(true)
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(false), 2600)
    } catch {
      setSaved(false)
    }
  }

  const handleReset = () => {
    if (!armed) { setArmed(true); return }
    setArmed(false)
    onReset()
  }

  return (
    <div className="save-folio" ref={rootRef} data-open={open ? 'true' : 'false'} data-armed={armed ? 'true' : 'false'}>
      <button
        ref={headRef}
        type="button"
        className="save-folio-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setArmed(false); setOpen(value => !value) }}
      >
        <span className="save-folio-seal" aria-hidden="true">存</span>
        <span className="save-folio-title"><b>存档案卷</b><small>{summary.restored ? '本机存档 · 可继续接续' : '本机存档待写入'}</small></span>
        <span className="save-folio-day">第{dayNames[summary.day - 1]}日 · {summary.period}</span>
        <ChevronDown size={14} className="save-folio-chevron" aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="save-folio-body"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}
          >
            <div className="save-folio-inner">
              <dl className="save-folio-facts">
                <div><dt>志向</dt><dd>{summary.goal ?? '尚未立志'}</dd></div>
                <div><dt>私囊</dt><dd>{summary.funds} 两</dd></div>
                <div><dt>疑点</dt><dd>{summary.clues} 条</dd></div>
                <div><dt>抢护</dt><dd>{summary.plan ? '已发起' : '未发起'}<small>{summary.plan ? ' · 按日程走' : ''}</small></dd></div>
              </dl>

              <div className="save-folio-acts">
                <button type="button" className="save-folio-act" onClick={handleExport} disabled={!onExport}>
                  <Download size={13} aria-hidden="true" />
                  <span>{saved ? '便携包已导出' : '导出便携存档'}</span>
                </button>
                <button
                  type="button"
                  className={`save-folio-act is-danger ${armed ? 'is-armed' : ''}`}
                  onClick={handleReset}
                  aria-describedby={`${panelId}-note`}
                >
                  {armed ? <ShieldAlert size={13} aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
                  <span>{armed ? '再按一次 · 另立新志' : '清空重立志'}</span>
                </button>
              </div>

              {armed && <div className="save-folio-countdown" aria-hidden="true"><i /></div>}
              <p className={`save-folio-note ${armed ? 'is-armed' : ''}`} id={`${panelId}-note`}>
                {armed
                  ? '重立志会创建新世界；已有本机存档保留，不自动删除。'
                  : '当前世界自动保存于本机；便携存档包含完整校验链，可供后续独立导入流程使用。'}
              </p>
              {extra}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
