import type { PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

export type PersonPopulationTier = 'county' | 'grassroots' | 'other'

export type HistoricalPersonScope =
  | { readonly kind: 'world' }
  | { readonly kind: 'location'; readonly locationCode: string }

/**
 * Persisted creation provenance. County and grassroots personnel can only use
 * seeded-random provenance; fixed historical names are limited to evidenced
 * famous ministers and have no local-office role slot.
 */
export type PersonOrigin =
  | {
      readonly kind: 'seeded-random'
      readonly candidateId: string
      readonly seedFingerprint: string
      readonly roleCode: string
      readonly populationTier: PersonPopulationTier
    }
  | {
      readonly kind: 'historical-minister'
      readonly category: 'famous-minister'
      readonly evidenceRefs: readonly string[]
      readonly validFrom: WorldTime
      readonly validThrough: WorldTime | null
      readonly scope: HistoricalPersonScope
    }
  | { readonly kind: 'player-character' }

export interface PersonOriginRecord {
  readonly person: PersonId
  readonly origin: PersonOrigin
}
