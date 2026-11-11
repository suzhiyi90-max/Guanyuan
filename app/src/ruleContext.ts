import { createContext, useContext } from 'react'

export interface RuleBookApi {
  openRule: (clauseId?: string) => void
}

export const RuleBookContext = createContext<RuleBookApi>({ openRule: () => {} })

export function useRuleBook() {
  return useContext(RuleBookContext)
}
