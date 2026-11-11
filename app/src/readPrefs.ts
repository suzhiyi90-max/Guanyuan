/**
 * C-87 阅览偏好：只改「看法」与「听法」，不改状态。
 * 字号 / 墨色 / 动效 / 声音四组写入 <html data-read-*>，另存本机 key，绝不触碰 guanyuan.save.v1。
 * 纸纹仍由顶栏「纸样」小印单独开关，此处不重复。
 */
import { useCallback, useSyncExternalStore } from 'react'

export type ReadSize = 'normal' | 'large' | 'xlarge'
export type ReadInk = 'normal' | 'dense'
export type ReadMotion = 'system' | 'reduce'

/** FE-089：五格铜尺，只调总闸；不加载任何音源。 */
export const readVolumeSteps = [20, 40, 60, 80, 100] as const
export type ReadVolume = (typeof readVolumeSteps)[number]

export interface ReadPrefs {
  size: ReadSize
  ink: ReadInk
  motion: ReadMotion
  /** FE-083：初到三签是否已永久收起。与阅览三档同档存本机，不写存档。 */
  guide: boolean
  /** FE-089：总音量。音源未接入时只作挂点参数，不产生声音。 */
  volume: ReadVolume
  muted: boolean
}

export const READ_PREFS_KEY = 'guanyuan.prefs.read.v1'

export const readDefaults: ReadPrefs = { size: 'normal', ink: 'normal', motion: 'system', guide: false, volume: 60, muted: false }

const sizes: ReadSize[] = ['normal', 'large', 'xlarge']
const inks: ReadInk[] = ['normal', 'dense']
const motions: ReadMotion[] = ['system', 'reduce']

export const readSizeLabel: Record<ReadSize, string> = { normal: '常', large: '大', xlarge: '特大' }
export const readInkLabel: Record<ReadInk, string> = { normal: '常墨', dense: '浓墨' }
export const readMotionLabel: Record<ReadMotion, string> = { system: '随系统', reduce: '减弱' }
export const readVolumeLabel: Record<ReadVolume, string> = { 20: '轻', 40: '低', 60: '常', 80: '响', 100: '满' }

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function snapVolume(value: unknown): ReadVolume {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : readDefaults.volume
  return readVolumeSteps.reduce((best, step) => Math.abs(step - numeric) < Math.abs(best - numeric) ? step : best, readVolumeSteps[0])
}

export function normalizeReadPrefs(raw: unknown): ReadPrefs {
  const value = (raw ?? {}) as Partial<ReadPrefs>
  return {
    size: pick(value.size, sizes, readDefaults.size),
    ink: pick(value.ink, inks, readDefaults.ink),
    motion: pick(value.motion, motions, readDefaults.motion),
    guide: value.guide === true,
    volume: snapVolume(value.volume),
    muted: value.muted === true,
  }
}

export function loadReadPrefs(): ReadPrefs {
  if (typeof window === 'undefined') return readDefaults
  try {
    const raw = window.localStorage.getItem(READ_PREFS_KEY)
    return normalizeReadPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return readDefaults
  }
}

/** 只改根节点 data 属性，样式全部由 styles.css 承担。 */
export function applyReadPrefs(prefs: ReadPrefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.readSize = prefs.size
  root.dataset.readInk = prefs.ink
  root.dataset.readMotion = prefs.motion
  root.dataset.readAudio = prefs.muted ? 'muted' : 'on'
  root.dataset.readVolume = String(prefs.volume)
  root.style.setProperty('--read-volume', `${prefs.volume}%`)
}

/* --- 极简外部 store：顶栏面板与 App 的 MotionConfig 共用同一份偏好 --- */
let current: ReadPrefs = loadReadPrefs()
applyReadPrefs(current)
const listeners = new Set<() => void>()

function commit(next: ReadPrefs) {
  current = next
  applyReadPrefs(current)
  try {
    window.localStorage.setItem(READ_PREFS_KEY, JSON.stringify(current))
  } catch {
    /* 本机存储不可用时只保留本次会话 */
  }
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getReadPrefs() {
  return current
}

export function useReadPrefs(): [ReadPrefs, (patch: Partial<ReadPrefs>) => void, () => void] {
  const prefs = useSyncExternalStore(subscribe, getReadPrefs, getReadPrefs)
  const patch = useCallback((next: Partial<ReadPrefs>) => {
    commit(normalizeReadPrefs({ ...current, ...next }))
  }, [])
  // 「复常」回字 / 墨 / 动 / 声四组；初到三签是否收起属于看过与否，不随复常重置。
  const reset = useCallback(() => commit({ ...readDefaults, guide: current.guide }), [])
  return [prefs, patch, reset]
}

export function isDefaultReadPrefs(prefs: ReadPrefs) {
  return prefs.size === readDefaults.size
    && prefs.ink === readDefaults.ink
    && prefs.motion === readDefaults.motion
    && prefs.volume === readDefaults.volume
    && prefs.muted === readDefaults.muted
}
