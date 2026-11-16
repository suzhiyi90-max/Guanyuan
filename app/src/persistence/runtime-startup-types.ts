import type { SaveWorldSummary } from './save-repository'

export type RuntimeStartupView =
  | { readonly status: 'loading' }
  | { readonly status: 'selection-required'; readonly worlds: readonly SaveWorldSummary[] }
  | { readonly status: 'error'; readonly issue: string }
