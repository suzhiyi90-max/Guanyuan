import type { PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { HistoricalPersonScope } from '../person/provenance'

export interface HistoricalMinisterAllowListEntry {
  readonly personId: PersonId
  readonly displayName: string
  readonly category: 'famous-minister'
  readonly evidenceRefs: readonly string[]
  readonly validFrom: WorldTime
  readonly validThrough: WorldTime | null
  readonly scope: HistoricalPersonScope
}

/** Stable scenario provenance and the only fixed-name NPC allow-list persisted with a world. */
export interface WorldBootstrapMetadata {
  readonly scenarioPackId: string
  readonly rulesetVersion: string
  readonly contentPackVersion: string
  readonly seed: string
  readonly seedFingerprint: string
  readonly locationCode: string
  readonly populationPolicyVersion: string
  readonly historicalNameAllowList: readonly HistoricalMinisterAllowListEntry[]
}
