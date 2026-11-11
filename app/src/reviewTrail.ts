/**
 * C-108 批阅来处：只记「从哪个表面点开批阅尺」与当时所在场所。
 * useSyncExternalStore 会话外存；去重移尾、上限 3、刷新即散、不落盘。
 * 边界：只交换界面焦点；不生成场所、传闻、账目，不记里程 / 耗时 / 好感，
 * 不写 guanyuan.save.v1 或 guanyuan.prefs.read.v1，不改批阅组来源判定。
 */
import { useSyncExternalStore } from 'react'
import type { PlaceId } from './placeTrail'

export type ReviewOrigin = 'ledger' | 'intel' | 'epilogue' | 'desk'

export const originLabels: Record<ReviewOrigin, string> = {
  ledger: '账房',
  intel: '情报台账',
  epilogue: '章末四页',
  desk: '今日案头',
}

export interface ReviewTrailStop {
  origin: ReviewOrigin
  place: PlaceId
}

const MAX_STOPS = 3
const stops: ReviewTrailStop[] = []
let snapshot: ReviewTrailStop[] = []
const listeners = new Set<() => void>()

function emit() {
  snapshot = stops.map(stop => ({ ...stop }))
  listeners.forEach(listener => listener())
}

export function recordReviewOrigin(origin: ReviewOrigin, place: PlaceId) {
  const index = stops.findIndex(stop => stop.origin === origin && stop.place === place)
  // 空队列时 index 与 length-1 同为 -1，不能误判成「重复末站」而吞掉首记。
  if (index >= 0 && index === stops.length - 1) return
  if (index >= 0) stops.splice(index, 1)
  stops.push({ origin, place })
  if (stops.length > MAX_STOPS) stops.shift()
  emit()
}

export function useReviewTrail() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    () => snapshot,
    () => snapshot,
  )
}

export function lastReviewOrigin(): ReviewOrigin | null {
  return snapshot.length ? snapshot[snapshot.length - 1].origin : null
}

export function reviewPlaces(): PlaceId[] {
  return snapshot.map(stop => stop.place)
}
