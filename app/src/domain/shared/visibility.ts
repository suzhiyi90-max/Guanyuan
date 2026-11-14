import type { PersonId } from './ids'

export type VisibilityLevel = 'public' | 'contact' | 'private' | 'secret'

export interface Visibility {
  readonly observer: PersonId | 'player'
  readonly level: VisibilityLevel
}
