/**
 * C-106 今日动线：只记会话内去过的场所，不记里程、耗时、好感或路线判定。
 * 不写存档；刷新即散。
 */
import { useSyncExternalStore } from 'react'

export type PlaceId = 'county' | 'river' | 'study' | 'street' | 'home' | 'ferry' | 'station' | 'town' | 'manor'
export type PlaceKind = 'scene' | 'street' | 'home' | 'location'

export interface PlaceSpec {
  label: string
  mark: string
  kind: PlaceKind
}

export const placeSpecs: Record<PlaceId, PlaceSpec> = {
  county: { label: '县衙', mark: '衙', kind: 'scene' },
  river: { label: '东堤', mark: '堤', kind: 'scene' },
  study: { label: '夜书房', mark: '斋', kind: 'scene' },
  street: { label: '街市', mark: '市', kind: 'street' },
  home: { label: '内宅', mark: '宅', kind: 'home' },
  ferry: { label: '渡口', mark: '渡', kind: 'location' },
  station: { label: '驿站', mark: '驿', kind: 'location' },
  town: { label: '青石镇', mark: '镇', kind: 'location' },
  manor: { label: '桑家庄', mark: '庄', kind: 'location' },
}

const MAX_STOPS = 5
const stops: PlaceId[] = ['county']
let snapshot: PlaceId[] = [...stops]
const listeners = new Set<() => void>()

function emit() {
  snapshot = [...stops]
  listeners.forEach(listener => listener())
}

export function recordPlace(id: PlaceId) {
  const index = stops.indexOf(id)
  if (index === stops.length - 1) return
  if (index >= 0) stops.splice(index, 1)
  stops.push(id)
  if (stops.length > MAX_STOPS) stops.shift()
  emit()
}

export function usePlaceTrail() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    () => snapshot,
    () => snapshot,
  )
}
