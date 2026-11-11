/**
 * C-87 阅览偏好浮签：顶栏末端「阅览」小印，展开一张纸。
 * 只切换字 / 纸 / 墨三组投影档位，不改任何业务数值、时段或存档。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { RotateCcw, X } from 'lucide-react'
import {
  isDefaultReadPrefs,
  readInkLabel,
  readMotionLabel,
  readSizeLabel,
  readVolumeLabel,
  readVolumeSteps,
  useReadPrefs,
  type ReadInk,
  type ReadMotion,
  type ReadSize,
  type ReadVolume,
} from '../readPrefs'

interface GroupProps<T extends string> {
  label: string
  note: string
  value: T
  options: T[]
  labels: Record<T, string>
  onSelect: (value: T) => void
}

function PrefGroup<T extends string>({ label, note, value, options, labels, onSelect }: GroupProps<T>) {
  const id = useId()
  return (
    <div className="read-prefs-group" role="group" aria-labelledby={id}>
      <header><span id={id}>{label}</span><small>{note}</small></header>
      <div className="read-prefs-chips">
        {options.map(option => (
          <button
            key={option}
            type="button"
            className={value === option ? 'is-on' : ''}
            aria-pressed={value === option}
            onClick={() => onSelect(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  )
}

function VolumeGroup({ volume, muted, onVolume, onMute }: { volume: ReadVolume, muted: boolean, onVolume: (volume: ReadVolume) => void, onMute: () => void }) {
  const id = useId()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const index = Math.max(0, readVolumeSteps.indexOf(volume))
  const percent = (index / (readVolumeSteps.length - 1)) * 100
  const setFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const next = readVolumeSteps[Math.round(ratio * (readVolumeSteps.length - 1))]
    if (next !== volume) onVolume(next)
  }
  return (
    <div className="read-audio" role="group" aria-labelledby={id} data-muted={muted ? 'true' : 'false'}>
      <header className="read-audio-head">
        <span id={id}>声</span>
        <small>只调总闸 · 音源未接入</small>
        <button type="button" className="read-mute" aria-pressed={muted} onClick={onMute} title={muted ? '打开总闸' : '合上总闸'}>
          <b>静</b><small>{muted ? '已合' : '未合'}</small>
        </button>
      </header>
      <div className="read-audio-row">
        <div
          ref={trackRef}
          className="read-volume"
          role="slider"
          tabIndex={0}
          aria-label="总音量 · 未启音源"
          aria-valuemin={1}
          aria-valuemax={readVolumeSteps.length}
          aria-valuenow={index + 1}
          aria-valuetext={`${readVolumeLabel[volume]} · ${volume}%${muted ? ' · 已静音' : ''}`}
          onPointerDown={event => {
            if (event.button !== 0) return
            dragging.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            setFromClientX(event.clientX)
          }}
          onPointerMove={event => { if (dragging.current) setFromClientX(event.clientX) }}
          onPointerUp={() => { dragging.current = false }}
          onPointerCancel={() => { dragging.current = false }}
          onKeyDown={event => {
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']
            if (event.key === 'm' || event.key === 'M') { event.preventDefault(); onMute(); return }
            if (!keys.includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? readVolumeSteps.length - 1 : Math.min(readVolumeSteps.length - 1, Math.max(0, index + (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp' ? 1 : -1)))
            onVolume(readVolumeSteps[next])
          }}
        >
          <span className="read-volume-line" aria-hidden="true" />
          <span className="read-volume-fill" style={{ width: `calc((100% - 8px) * ${percent / 100})` }} aria-hidden="true" />
          {readVolumeSteps.map((step, stepIndex) => (
            <i key={step} className={stepIndex <= index ? 'is-passed' : ''} style={{ left: `calc(4px + (100% - 8px) * ${stepIndex / (readVolumeSteps.length - 1)})` }} aria-hidden="true" />
          ))}
          <span className="read-volume-thumb" style={{ left: `calc(4px + (100% - 8px) * ${percent / 100})` }} aria-hidden="true" />
        </div>
        <span className="read-volume-value">{muted ? '静' : readVolumeLabel[volume]}</span>
      </div>
      <div className="read-audio-scale" aria-hidden="true"><span>轻</span><span>满</span></div>
    </div>
  )
}

export function ReadPrefs() {
  const [prefs, patch, reset] = useReadPrefs()
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const changed = !isDefaultReadPrefs(prefs)

  return (
    <div className="read-prefs" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="read-seal"
        aria-expanded={open}
        aria-controls="read-prefs-panel"
        aria-label="阅览偏好 · 字墨动声"
        title="阅览偏好 · 字 / 墨 / 动效 / 声"
        onClick={() => setOpen(value => !value)}
      >
        <span>阅</span><small>览</small>
        {changed && <i className="read-seal-dot" aria-hidden="true" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="read-prefs-panel"
            id="read-prefs-panel"
            role="dialog"
            aria-label="阅览偏好 · 只改看法与听法"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : .99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : .995 }}
            transition={{ duration: reduceMotion ? 0 : .16 }}
          >
            <header className="read-prefs-head">
              <div><span>阅览</span><h3>字 · 墨 · 动 · 声</h3></div>
              <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus() }} aria-label="收起阅览偏好"><X size={13} /></button>
            </header>
            <p className="read-prefs-intro">改的只是这一双眼睛与耳朵看到、听到的东西。数值、日程、判定与存档都不动；字号在 1024 以上整屏缩放，窄屏随系统；纸纹由顶栏「纸样」单独开关；声音只有总闸，音源未接入。</p>

            <PrefGroup<ReadSize>
              label="字号"
              note="按屏宽整体缩放"
              value={prefs.size}
              options={['normal', 'large', 'xlarge']}
              labels={readSizeLabel}
              onSelect={size => patch({ size })}
            />
            <PrefGroup<ReadInk>
              label="墨色"
              note="加深正文与注记"
              value={prefs.ink}
              options={['normal', 'dense']}
              labels={readInkLabel}
              onSelect={ink => patch({ ink })}
            />
            <PrefGroup<ReadMotion>
              label="动效"
              note="压掉位移与缩放"
              value={prefs.motion}
              options={['system', 'reduce']}
              labels={readMotionLabel}
              onSelect={motion => patch({ motion })}
            />
            <VolumeGroup
              volume={prefs.volume}
              muted={prefs.muted}
              onVolume={volume => patch({ volume })}
              onMute={() => patch({ muted: !prefs.muted })}
            />
            <div className="read-prefs-sample" data-sample="true">
              <span>正文示例</span>
              <p>差额三百两只记差额。账面平，不等于事情平。</p>
              <small>界格与纸纹仍由既有纸样承担，不在此重绘。</small>
            </div>

            <footer className="read-prefs-foot">
              <span>存于本机 · 不写存档</span>
              <button type="button" onClick={reset} disabled={!changed}><RotateCcw size={11} />复常</button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
