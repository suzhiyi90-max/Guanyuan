/**
 * C-111 合卷索引：三处表面「翻过哪几页」的派生只读汇总。
 *
 * 边界：各表面自己的 viewMemory 键（epilogue-visited / document-visited /
 * ledger-visited）不动，这里不写回、不合并、不落盘、不参与任何判定。
 * 只存会话内存（useSyncExternalStore），刷新即散；墨点不是完成度或数值条。
 */
import { useSyncExternalStore } from 'react'

export type FolioKey = 'epilogue' | 'document' | 'ledger'

export const folioSpecs: Record<FolioKey, { label: string; short: string; total: number }> = {
  epilogue: { label: '章末四页', short: '章末', total: 4 },
  document: { label: '文书四视图', short: '文书', total: 4 },
  ledger: { label: '账房三分签', short: '账房', total: 3 },
}

export const folioKeys = ['epilogue', 'document', 'ledger'] as const

type FolioSnapshot = Record<FolioKey, number[]>

const stops: FolioSnapshot = { epilogue: [], document: [], ledger: [] }
let snapshot: FolioSnapshot = { epilogue: [], document: [], ledger: [] }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { epilogue: [...stops.epilogue], document: [...stops.document], ledger: [...stops.ledger] }
  listeners.forEach(listener => listener())
}

/** 由三处表面在页签切换后上报自己已翻过的页序；只归一、去重、限幅，不改写来源。 */
export function recordFolioVisit(key: FolioKey, visited: number[]) {
  const total = folioSpecs[key].total
  const next = [...new Set(visited)].filter(n => Number.isInteger(n) && n >= 1 && n <= total).sort((a, b) => a - b)
  if (next.join(',') === stops[key].join(',')) return
  stops[key] = next
  emit()
}

export function getFolioIndex() {
  return snapshot
}

export function subscribeFolioIndex(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useFolioIndex() {
  return useSyncExternalStore(subscribeFolioIndex, getFolioIndex, getFolioIndex)
}
