/**
 * W6-B — deterministic world bootstrap and population candidate generation.
 *
 * County and grassroots roles are always generated from the supplied scenario
 * role slots and name pool. Fixed named appearances are a separate, narrow
 * exception for verified famous ministers only; this module never assigns
 * offices, relationships, organizations or knowledge.
 */
import { brandedId, type PersonId } from '../../domain/shared/ids'
import { compareWorldTime, isValidWorldTime, type WorldTime } from '../../domain/shared/world-time'
import type { WorldId } from '../../domain/event-ledger'
import type { WorldBootstrapMetadata } from '../../domain/world/metadata'
import type { HistoricalPersonScope, PersonOrigin, PersonPopulationTier } from '../../domain/person/provenance'

export type PopulationTier = PersonPopulationTier

export interface PopulationRoleSlot {
  readonly roleCode: string
  readonly tier: PopulationTier
  readonly minCount: number
  readonly maxCount: number
}

export interface ScenarioNamePool {
  readonly surnames: readonly string[]
  readonly givenNames: readonly string[]
}

export type HistoricalAppearanceScope = HistoricalPersonScope

export interface HistoricalMinisterException {
  readonly personId: PersonId
  readonly displayName: string
  readonly category: 'famous-minister'
  readonly evidenceStatus: 'verified' | 'unverified'
  readonly evidenceRefs: readonly string[]
  readonly validFrom: WorldTime
  readonly validThrough: WorldTime | null
  readonly scope: HistoricalAppearanceScope
}

export interface WorldBootstrapRequest {
  readonly worldId: WorldId
  readonly seed: string
  readonly scenarioPackId: string
  readonly rulesetVersion: string
  readonly contentPackVersion: string
  readonly worldTime: WorldTime
  readonly locationCode: string
  readonly roleSlots: readonly PopulationRoleSlot[]
  readonly namePool: ScenarioNamePool
  readonly historicalMinisters: readonly HistoricalMinisterException[]
}

export interface GeneratedPersonCandidate {
  readonly id: PersonId
  readonly displayName: string
  readonly roleCode: string
  readonly populationTier: PopulationTier
  readonly provenance: 'seeded-random'
  readonly seedFingerprint: string
  readonly ordinal: number
  readonly createdAt: WorldTime
}

export interface FixedHistoricalPersonCandidate {
  readonly id: PersonId
  readonly displayName: string
  readonly category: 'famous-minister'
  readonly evidenceRefs: readonly string[]
  readonly validFrom: WorldTime
  readonly validThrough: WorldTime | null
  readonly scope: HistoricalAppearanceScope
  readonly provenance: 'verified-historical-exception'
}

export interface WorldBootstrapDescriptor extends WorldBootstrapMetadata {
  readonly worldId: WorldId
  readonly startedAt: WorldTime
}

export type WorldBootstrapIssue =
  | 'bootstrap-world-id-empty'
  | 'bootstrap-seed-empty'
  | 'bootstrap-scenario-pack-empty'
  | 'bootstrap-ruleset-version-empty'
  | 'bootstrap-content-version-empty'
  | 'bootstrap-world-time-invalid'
  | 'bootstrap-location-empty'
  | 'bootstrap-role-code-invalid'
  | 'bootstrap-role-code-duplicate'
  | 'bootstrap-role-count-invalid'
  | 'bootstrap-name-pool-empty'
  | 'bootstrap-name-pool-duplicate'
  | 'bootstrap-historical-person-id-duplicate'
  | 'bootstrap-historical-person-name-duplicate'
  | 'bootstrap-historical-person-not-famous-minister'
  | 'bootstrap-historical-person-not-verified'
  | 'bootstrap-historical-person-evidence-missing'
  | 'bootstrap-historical-person-time-invalid'
  | 'bootstrap-historical-person-not-yet-active'
  | 'bootstrap-historical-person-no-longer-active'
  | 'bootstrap-historical-person-location-mismatch'
  | 'bootstrap-generated-person-id-collision'
  | 'bootstrap-generated-name-pool-exhausted'

export type WorldBootstrapResult =
  | {
      readonly status: 'ready'
      readonly descriptor: WorldBootstrapDescriptor
      readonly generatedPeople: readonly GeneratedPersonCandidate[]
      readonly historicalPeople: readonly FixedHistoricalPersonCandidate[]
    }
  | { readonly status: 'rejected'; readonly issues: readonly WorldBootstrapIssue[] }

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0 || 0x9e3779b9
}

function fingerprint(seed: string): string {
  return hashSeed(seed).toString(16).padStart(8, '0')
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }
}

function addIssue(issues: WorldBootstrapIssue[], issue: WorldBootstrapIssue): void {
  if (!issues.includes(issue)) issues.push(issue)
}

function nonEmpty(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function validateRequest(request: WorldBootstrapRequest): WorldBootstrapIssue[] {
  const issues: WorldBootstrapIssue[] = []
  if (!nonEmpty(request.worldId)) addIssue(issues, 'bootstrap-world-id-empty')
  if (!nonEmpty(request.seed)) addIssue(issues, 'bootstrap-seed-empty')
  if (!nonEmpty(request.scenarioPackId)) addIssue(issues, 'bootstrap-scenario-pack-empty')
  if (!nonEmpty(request.rulesetVersion)) addIssue(issues, 'bootstrap-ruleset-version-empty')
  if (!nonEmpty(request.contentPackVersion)) addIssue(issues, 'bootstrap-content-version-empty')
  if (!isValidWorldTime(request.worldTime)) addIssue(issues, 'bootstrap-world-time-invalid')
  if (!nonEmpty(request.locationCode)) addIssue(issues, 'bootstrap-location-empty')

  const roleCodes = new Set<string>()
  for (const slot of request.roleSlots) {
    if (!/^[a-z][a-z0-9._-]{0,63}$/.test(slot.roleCode)) addIssue(issues, 'bootstrap-role-code-invalid')
    if (roleCodes.has(slot.roleCode)) addIssue(issues, 'bootstrap-role-code-duplicate')
    roleCodes.add(slot.roleCode)
    if (!['county', 'grassroots', 'other'].includes(slot.tier)
      || !Number.isSafeInteger(slot.minCount)
      || !Number.isSafeInteger(slot.maxCount)
      || slot.minCount < 0
      || slot.maxCount < slot.minCount
      || slot.maxCount > 10000) {
      addIssue(issues, 'bootstrap-role-count-invalid')
    }
  }

  const surnames = request.namePool.surnames
  const givenNames = request.namePool.givenNames
  if (surnames.length === 0 || givenNames.length === 0
    || surnames.some(item => !nonEmpty(item))
    || givenNames.some(item => !nonEmpty(item))) {
    addIssue(issues, 'bootstrap-name-pool-empty')
  }
  if (new Set(surnames).size !== surnames.length || new Set(givenNames).size !== givenNames.length) {
    addIssue(issues, 'bootstrap-name-pool-duplicate')
  }

  const historicalIds = new Set<string>()
  const historicalNames = new Set<string>()
  for (const person of request.historicalMinisters) {
    if (historicalIds.has(person.personId)) addIssue(issues, 'bootstrap-historical-person-id-duplicate')
    if (historicalNames.has(person.displayName)) addIssue(issues, 'bootstrap-historical-person-name-duplicate')
    historicalIds.add(person.personId)
    historicalNames.add(person.displayName)

    if (person.category !== 'famous-minister') addIssue(issues, 'bootstrap-historical-person-not-famous-minister')
    if (person.evidenceStatus !== 'verified') addIssue(issues, 'bootstrap-historical-person-not-verified')
    if (!nonEmpty(person.displayName) || person.evidenceRefs.length === 0
      || person.evidenceRefs.some(ref => !nonEmpty(ref))) {
      addIssue(issues, 'bootstrap-historical-person-evidence-missing')
    }
    if (!isValidWorldTime(person.validFrom)
      || (person.validThrough !== null && !isValidWorldTime(person.validThrough))
      || (person.validThrough !== null && compareWorldTime(person.validThrough, person.validFrom) < 0)) {
      addIssue(issues, 'bootstrap-historical-person-time-invalid')
    } else if (isValidWorldTime(request.worldTime)) {
      if (compareWorldTime(request.worldTime, person.validFrom) < 0) {
        addIssue(issues, 'bootstrap-historical-person-not-yet-active')
      }
      if (person.validThrough && compareWorldTime(request.worldTime, person.validThrough) > 0) {
        addIssue(issues, 'bootstrap-historical-person-no-longer-active')
      }
    }
    if (person.scope.kind === 'location' && person.scope.locationCode !== request.locationCode) {
      addIssue(issues, 'bootstrap-historical-person-location-mismatch')
    }
  }
  return issues
}

/**
 * Build a reproducible bootstrap candidate set. This function does not create
 * Person facts; a later application command must validate and append them.
 */
export function bootstrapWorld(request: WorldBootstrapRequest): WorldBootstrapResult {
  const issues = validateRequest(request)
  if (issues.length > 0) return { status: 'rejected', issues: Object.freeze(issues) }

  const seedFingerprint = fingerprint(request.seed)
  const nextRandom = createRandom(hashSeed(request.seed))
  const generatedPeople: GeneratedPersonCandidate[] = []
  const historicalPeople: FixedHistoricalPersonCandidate[] = request.historicalMinisters.map(person => ({
    id: person.personId,
    displayName: person.displayName,
    category: 'famous-minister' as const,
    evidenceRefs: Object.freeze([...person.evidenceRefs]),
    validFrom: Object.freeze({ ...person.validFrom }),
    validThrough: person.validThrough ? Object.freeze({ ...person.validThrough }) : null,
    scope: Object.freeze({ ...person.scope }),
    provenance: 'verified-historical-exception' as const,
  }))
  const usedNames = new Set(historicalPeople.map(person => person.displayName))
  const usedIds = new Set(historicalPeople.map(person => person.id))
  let ordinal = 0

  for (const slot of request.roleSlots) {
    const count = slot.minCount + (nextRandom() % (slot.maxCount - slot.minCount + 1))
    for (let index = 0; index < count; index += 1) {
      let displayName = ''
      const attempts = Math.max(100, request.roleSlots.reduce((sum, item) => sum + item.maxCount, 0) * 4)
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const surname = request.namePool.surnames[nextRandom() % request.namePool.surnames.length]
        const givenName = request.namePool.givenNames[nextRandom() % request.namePool.givenNames.length]
        const candidateName = surname + givenName
        if (!usedNames.has(candidateName)) {
          displayName = candidateName
          break
        }
      }
      if (!displayName) {
        addIssue(issues, 'bootstrap-generated-name-pool-exhausted')
        return { status: 'rejected', issues: Object.freeze(issues) }
      }
      usedNames.add(displayName)
      ordinal += 1
      const id = brandedId<'PersonId'>(`person:${request.worldId}:generated:${seedFingerprint}:${slot.roleCode}:${index + 1}`)
      if (usedIds.has(id)) {
        addIssue(issues, 'bootstrap-generated-person-id-collision')
        return { status: 'rejected', issues: Object.freeze(issues) }
      }
      usedIds.add(id)
      generatedPeople.push(Object.freeze({
        id,
        displayName,
        roleCode: slot.roleCode,
        populationTier: slot.tier,
        provenance: 'seeded-random',
        seedFingerprint,
        ordinal,
        createdAt: Object.freeze({ ...request.worldTime }),
      }))
    }
  }

  return {
    status: 'ready',
    descriptor: Object.freeze({
      worldId: request.worldId,
      seedFingerprint,
      scenarioPackId: request.scenarioPackId,
      rulesetVersion: request.rulesetVersion,
      contentPackVersion: request.contentPackVersion,
      startedAt: Object.freeze({ ...request.worldTime }),
      locationCode: request.locationCode,
      populationPolicyVersion: 'w6.1' as const,
      historicalNameAllowList: Object.freeze(request.historicalMinisters.map(person => Object.freeze({
        personId: person.personId,
        displayName: person.displayName,
        category: 'famous-minister' as const,
        evidenceRefs: Object.freeze([...person.evidenceRefs]),
        validFrom: Object.freeze({ ...person.validFrom }),
        validThrough: person.validThrough ? Object.freeze({ ...person.validThrough }) : null,
        scope: Object.freeze({ ...person.scope }),
      }))),
    }),
    generatedPeople: Object.freeze(generatedPeople),
    historicalPeople: Object.freeze(historicalPeople),
  }
}

export function generatedCandidateOrigin(candidate: GeneratedPersonCandidate): Extract<PersonOrigin, { readonly kind: 'seeded-random' }> {
  return Object.freeze({
    kind: 'seeded-random' as const,
    candidateId: candidate.id,
    seedFingerprint: candidate.seedFingerprint,
    roleCode: candidate.roleCode,
    populationTier: candidate.populationTier,
  })
}

export function historicalCandidateOrigin(candidate: FixedHistoricalPersonCandidate): Extract<PersonOrigin, { readonly kind: 'historical-minister' }> {
  return Object.freeze({
    kind: 'historical-minister' as const,
    category: 'famous-minister',
    evidenceRefs: Object.freeze([...candidate.evidenceRefs]),
    validFrom: Object.freeze({ ...candidate.validFrom }),
    validThrough: candidate.validThrough ? Object.freeze({ ...candidate.validThrough }) : null,
    scope: Object.freeze({ ...candidate.scope }),
  })
}
