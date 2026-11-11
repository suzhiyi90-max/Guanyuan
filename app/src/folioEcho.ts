/**
 * C-115 归位纸角：合卷索引跳转时的一枚「自 · 某处 归此卷」回声。
 * 只记界面来处，会话内存、刷新即散、不落盘、不携带业务状态、不参与判定。
 * 沿用 FE-090 归位纸角模式：显示即收，不写存档。
 */
import { useSyncExternalStore } from 'react'
import type { FolioKey } from './folioIndex'

export type EchoFrom = FolioKey | 'desk'

export const echoFromLabels: Record<EchoFrom, string> = {
  desk: '案头',
  epilogue: '章末',
  document: '文书',
  ledger: '账房',
}

export interface FolioEcho {
  from: EchoFrom
  to: FolioKey
  nonce: number
}

let snapshot: FolioEcho | null = null
const listeners = new Set<() => void>()
let seq = 0

export function recordFolioEcho(from: EchoFrom, to: FolioKey) {
  seq += 1
  snapshot = { from, to, nonce: seq }
  listeners.forEach(listener => listener())
}

export function getFolioEcho() {
  return snapshot
}

export function subscribeFolioEcho(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useFolioEcho() {
  return useSyncExternalStore(subscribeFolioEcho, getFolioEcho, getFolioEcho)
}
