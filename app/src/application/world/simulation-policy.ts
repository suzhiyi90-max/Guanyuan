/**
 * W6-G — explicit, versioned simulation policy parsing.
 *
 * This module validates and resolves policy declarations only. It does not
 * infer game rules, assign decay/economic values, create tasks, or commit facts.
 */
import type { JsonValue } from '../../domain/event-ledger'
import type { SimulationLod } from './ports'

export type WorldSimulationPolicyLevel = 'L0' | 'L1' | 'L2' | 'L3'
export type WorldSimulationPolicySource = 'rule' | 'schedule'

export interface WorldSimulationPolicyRule {
  readonly policyId: string
  readonly level: WorldSimulationPolicyLevel
  readonly source: WorldSimulationPolicySource
  readonly intentKind: string
  readonly priority: number
  readonly lods: readonly SimulationLod[]
  readonly enabled: boolean
}

export interface WorldSimulationRuleset {
  readonly schemaVersion: 'w6-simulation-policy/1'
  readonly rulesetId: string
  readonly revision: string
  /** Explicit scheduler event budget; this is infrastructure configuration, not a game-world rate. */
  readonly maxEvents: number
  readonly rules: readonly WorldSimulationPolicyRule[]
}

export interface WorldSimulationPolicyCandidate {
  readonly candidateId: string
  readonly level: WorldSimulationPolicyLevel | string
  readonly source: WorldSimulationPolicySource | string
  readonly intentKind: string
  readonly lod: SimulationLod | string
  readonly payload: JsonValue
}

export type WorldSimulationPolicyDecision =
  | { readonly candidateId: string; readonly status: 'accepted'; readonly policyId: string; readonly priority: number }
  | { readonly candidateId: string; readonly status: 'deferred'; readonly policyId: string; readonly reason: 'lod-not-enabled' }
  | { readonly candidateId: string; readonly status: 'rejected'; readonly reason: 'invalid-candidate-id' | 'unknown-level' | 'unknown-source' | 'unknown-lod' | 'unsupported-intent' | 'policy-disabled' | 'candidate-identity-conflict' }

export type WorldSimulationPolicyResolution =
  | { readonly status: 'valid'; readonly rulesetId: string; readonly revision: string; readonly maxEvents: number; readonly decisions: readonly WorldSimulationPolicyDecision[] }
  | { readonly status: 'invalid-ruleset'; readonly issues: readonly string[] }

const levels = new Set<string>(['L0', 'L1', 'L2', 'L3'])
const sources = new Set<string>(['rule', 'schedule'])
const lods = new Set<string>(['near-field', 'relationship-circle', 'regional', 'remote-world'])

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function ruleKey(rule: WorldSimulationPolicyRule): string {
  return [rule.level, rule.source, rule.intentKind].join('|')
}

/** Validates ruleset shape and rejects duplicate selectors rather than choosing an arbitrary winner. */
export function validateWorldSimulationRuleset(ruleset: WorldSimulationRuleset): readonly string[] {
  const issues: string[] = []
  if (!ruleset || ruleset.schemaVersion !== 'w6-simulation-policy/1') issues.push('policy-schema-version-unsupported')
  if (!nonEmpty(ruleset?.rulesetId)) issues.push('policy-ruleset-id-invalid')
  if (!nonEmpty(ruleset?.revision)) issues.push('policy-revision-invalid')
  if (!Number.isInteger(ruleset?.maxEvents) || ruleset.maxEvents < 1) issues.push('policy-event-budget-invalid')
  if (!Array.isArray(ruleset?.rules)) issues.push('policy-rules-invalid')
  const selectors = new Set<string>()
  const ids = new Set<string>()
  const configuredRules = Array.isArray(ruleset?.rules) ? ruleset.rules : []\n  for (const rule of configuredRules) {
    if (!rule || !nonEmpty(rule.policyId) || ids.has(rule.policyId)) issues.push('policy-id-invalid-or-duplicate')
    else ids.add(rule.policyId)
    if (!levels.has(rule?.level)) issues.push('policy-level-unsupported')
    if (!sources.has(rule?.source)) issues.push('policy-source-unsupported')
    if (!nonEmpty(rule?.intentKind)) issues.push('policy-intent-invalid')
    if (!Number.isInteger(rule?.priority)) issues.push('policy-priority-invalid')
    if (typeof rule?.enabled !== 'boolean') issues.push('policy-enabled-flag-invalid')
    if (!Array.isArray(rule?.lods) || rule.lods.length === 0 || rule.lods.some(lod => !lods.has(lod))) {
      issues.push('policy-lod-set-invalid')
    }
    if (levels.has(rule?.level) && sources.has(rule?.source) && nonEmpty(rule?.intentKind)) {
      const key = ruleKey(rule)
      if (selectors.has(key)) issues.push('policy-selector-conflict')
      selectors.add(key)
    }
  }
  return Object.freeze([...new Set(issues)].sort())
}

/**
 * Resolves candidates against exact (level, source, intent) selectors.
 * Unknown/unsupported/conflicting inputs never fall through to an executable default.
 */
export function resolveWorldSimulationPolicies(
  ruleset: WorldSimulationRuleset,
  candidates: readonly WorldSimulationPolicyCandidate[],
): WorldSimulationPolicyResolution {
  const issues = validateWorldSimulationRuleset(ruleset)
  if (issues.length > 0) return { status: 'invalid-ruleset', issues }
  if (!Array.isArray(candidates)) {
    return { status: 'invalid-ruleset', issues: Object.freeze(['policy-candidates-invalid']) }
  }

  const candidateIds = new Set<string>()
  const duplicates = new Set<string>()
  for (const candidate of candidates) {
    if (nonEmpty(candidate?.candidateId)) {
      if (candidateIds.has(candidate.candidateId)) duplicates.add(candidate.candidateId)
      candidateIds.add(candidate.candidateId)
    }
  }

  const decisions = candidates.map((candidate): WorldSimulationPolicyDecision => {
    const candidateId = nonEmpty(candidate?.candidateId) ? candidate.candidateId : 'invalid-candidate'
    if (!nonEmpty(candidate?.candidateId)) return { candidateId, status: 'rejected', reason: 'invalid-candidate-id' }\n    if (duplicates.has(candidateId)) return { candidateId, status: 'rejected', reason: 'candidate-identity-conflict' }
    if (!levels.has(candidate?.level)) return { candidateId, status: 'rejected', reason: 'unknown-level' }
    if (!sources.has(candidate?.source)) return { candidateId, status: 'rejected', reason: 'unknown-source' }
    if (!lods.has(candidate?.lod)) return { candidateId, status: 'rejected', reason: 'unknown-lod' }
    if (!nonEmpty(candidate?.intentKind) || candidate.payload === undefined) {
      return { candidateId, status: 'rejected', reason: 'unsupported-intent' }
    }
    const rule = ruleset.rules.find(item =>
      item.level === candidate.level && item.source === candidate.source && item.intentKind === candidate.intentKind)
    if (!rule) return { candidateId, status: 'rejected', reason: 'unsupported-intent' }
    if (!rule.enabled) return { candidateId, status: 'rejected', reason: 'policy-disabled' }
    if (!rule.lods.includes(candidate.lod as SimulationLod)) {
      return { candidateId, status: 'deferred', policyId: rule.policyId, reason: 'lod-not-enabled' }
    }
    return { candidateId, status: 'accepted', policyId: rule.policyId, priority: rule.priority }
  }).sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0)

  return Object.freeze({
    status: 'valid',
    rulesetId: ruleset.rulesetId,
    revision: ruleset.revision,
    maxEvents: ruleset.maxEvents,
    decisions: Object.freeze(decisions),
  })
}
