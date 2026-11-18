/** Stable scenario provenance persisted with the initialized world. */
export interface WorldBootstrapMetadata {
  readonly scenarioPackId: string
  readonly rulesetVersion: string
  readonly contentPackVersion: string
  readonly seedFingerprint: string
  readonly locationCode: string
  readonly populationPolicyVersion: string
}
