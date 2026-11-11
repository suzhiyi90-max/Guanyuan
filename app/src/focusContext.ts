import { createContext, useContext } from 'react'

/** C-62 回查焦点：只描述「回到哪张纸」，不携带业务状态，也不写存档。 */
export type FocusTarget =
  | 'document-original'
  | 'doc-kind-chain'
  | 'ledger-three'
  | 'gift-sheet'
  | 'affairs-clock'
  | 'review-actions'
  | 'power-folio'
  | 'intel-drawer'
  | 'people-network'
  | 'world-clock'
  | 'evidence-chain'
  // FE-087：初到三签「指给我看」的三处落点（时段条 / 六入口 / 三行日志）
  | 'period-track'
  | 'main-nav'
  | 'today-log'

export interface FocusApi {
  key: FocusTarget | null
  nonce: number
  focusOn: (target: FocusTarget) => void
}

export const FocusContext = createContext<FocusApi>({ key: null, nonce: 0, focusOn: () => {} })

export function useFocus() {
  return useContext(FocusContext)
}
