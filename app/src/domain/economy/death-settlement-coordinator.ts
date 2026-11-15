import type {
  DeathSettlementEvidenceId,
  EventId,
  PersonId,
} from '../shared/ids'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { WorldTime } from '../shared/world-time'
import type { EstateSettlementDomain } from '../person/model'
import type { DeathOfficeInventoryIssue } from '../identity/death-inventory'
import type { MembershipDeathInventoryIssue } from '../relations/death-inventory'
import type { RelationDeathInventoryIssue } from '../relations/relation-death-inventory'
import type { GoalDeathInventoryIssue } from '../planning/death-inventory'
import type { DebtDeathInventoryIssue } from './debt-death-inventory'
import type { EstateAssetInventoryIssue } from './estate-inventory'
import type {
  DeathSettlementCanonicalInventoryReference,
  DeathSettlementDomainEvidence,
  DeathSettlementEvidenceReferences,
} from './death-settlement-evidence'
import { validateDeathSettlementDomainEvidence } from './death-settlement-evidence'

export interface DeathSettlementScopeDeclaration {
  readonly deceased: PersonId
  readonly deathEvent: EventId
  /** Only these explicitly declared domains participate in this result. */
  readonly domains: readonly EstateSettlementDomain[]
}

type EvidenceFor<Domain extends EstateSettlementDomain> = Extract<
  DeathSettlementDomainEvidence,
  { readonly domain: Domain }
>

type DomainIssueFor<Domain extends EstateSettlementDomain> =
  Domain extends 'office' ? DeathOfficeInventoryIssue
    : Domain extends 'debt' ? DebtDeathInventoryIssue
      : Domain extends 'asset' ? EstateAssetInventoryIssue
        : Domain extends 'membership' ? MembershipDeathInventoryIssue
          : Domain extends 'relation' ? RelationDeathInventoryIssue
            : GoalDeathInventoryIssue

type AssessmentFor<Domain extends EstateSettlementDomain> = {
  readonly domain: Domain
  readonly evidence: EvidenceFor<Domain>
  readonly canonical: DeathSettlementCanonicalInventoryReference | null
  /** Domain-specific validator issues retain the domain's own issue type. */
  readonly domainIssues: readonly DomainIssueFor<Domain>[]
  /** Result of this domain's own readiness function, represented without a boolean. */
  readonly readiness: 'ready' | 'blocked'
}

export type DeathSettlementDomainAssessment = {
  [Domain in EstateSettlementDomain]: AssessmentFor<Domain>
}[EstateSettlementDomain]

export type DeathSettlementDomainCoverage =
  | 'missing'
  | 'unknown'
  | 'empty-reviewed'
  | 'reviewed-with-items'

export interface DeathSettlementDomainReviewResult {
  readonly domain: EstateSettlementDomain
  readonly status: 'missing' | 'blocked' | 'invalid' | 'ready'
  readonly coverage: DeathSettlementDomainCoverage
  readonly evidenceId: DeathSettlementEvidenceId | null
  readonly issues: readonly string[]
}

export type DeathSettlementCoordinationIssue =
  | 'death-settlement-scope-empty'
  | 'death-settlement-scope-deceased-missing'
  | 'death-settlement-scope-death-event-missing'
  | 'death-settlement-scope-death-time-missing'
  | 'death-settlement-scope-death-time-invalid'
  | 'death-settlement-scope-death-time-mismatch'
  | 'death-settlement-scope-domain-duplicate'
  | 'death-settlement-scope-domain-unknown'
  | 'death-settlement-assessment-domain-duplicate'
  | 'death-settlement-assessment-domain-undeclared'
  | 'death-settlement-assessment-deceased-mismatch'
  | 'death-settlement-assessment-death-event-mismatch'
  | 'death-settlement-canonical-inventory-missing'
  | 'death-settlement-inventory-not-complete'
  | 'death-settlement-domain-validator-blocked'
  | 'death-settlement-domain-readiness-contradicts-issues'
  | 'death-settlement-domain-readiness-contradicts-inventory'

export interface DeathSettlementCoordinationResult {
  readonly status: 'invalid' | 'incomplete' | 'settled'
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly declaredDomains: readonly EstateSettlementDomain[]
  readonly reviews: readonly DeathSettlementDomainReviewResult[]
  readonly issues: readonly DeathSettlementCoordinationIssue[]
}

/**
 * Coordinates only the explicitly declared scope. Domain validators and their
 * readiness functions remain authoritative and must be run before constructing
 * each assessment. This function validates shared identity, chronology,
 * evidence coverage and the supplied domain-review result; it never mutates
 * Person, DeathRecord, EstateSettlementRef or any canonical inventory.
 */
export function coordinateDeathSettlement(
  scope: DeathSettlementScopeDeclaration,
  assessments: readonly DeathSettlementDomainAssessment[],
  refs: DeathSettlementEvidenceReferences,
  deathAt: WorldTime,
): DeathSettlementCoordinationResult {
  const issues: DeathSettlementCoordinationIssue[] = []
  const reviews: DeathSettlementDomainReviewResult[] = []

  if (!scope.deceased.trim()) issues.push('death-settlement-scope-deceased-missing')
  if (!scope.deathEvent.trim() || !refs.events.includes(scope.deathEvent)) {
    issues.push('death-settlement-scope-death-event-missing')
  }
  const knownDomains: readonly EstateSettlementDomain[] = [
    'office', 'debt', 'asset', 'membership', 'relation', 'goal',
  ]
  if (scope.domains.length === 0) issues.push('death-settlement-scope-empty')
  if (scope.domains.some(domain => !knownDomains.includes(domain))) {
    issues.push('death-settlement-scope-domain-unknown')
  }
  if (new Set(scope.domains).size !== scope.domains.length) {
    issues.push('death-settlement-scope-domain-duplicate')
  }

  if (!isValidWorldTime(deathAt)) {
    issues.push('death-settlement-scope-death-time-invalid')
  } else {
    const recordedDeathAt = refs.eventTimes.get(scope.deathEvent)
    if (!recordedDeathAt) {
      issues.push('death-settlement-scope-death-time-missing')
    } else if (!isValidWorldTime(recordedDeathAt)) {
      issues.push('death-settlement-scope-death-time-invalid')
    } else if (compareWorldTime(recordedDeathAt, deathAt) !== 0) {
      issues.push('death-settlement-scope-death-time-mismatch')
    }
  }

  const declared = new Set(scope.domains)
  const byDomain = new Map<EstateSettlementDomain, DeathSettlementDomainAssessment[]>()
  for (const assessment of assessments) {
    byDomain.set(assessment.domain, [
      ...(byDomain.get(assessment.domain) ?? []),
      assessment,
    ])
    if (!declared.has(assessment.domain)) {
      issues.push('death-settlement-assessment-domain-undeclared')
    }
  }

  for (const domain of scope.domains) {
    const matches = byDomain.get(domain) ?? []
    if (matches.length === 0) {
      reviews.push({
        domain,
        status: 'missing',
        coverage: 'missing',
        evidenceId: null,
        issues: ['death-settlement-domain-evidence-missing'],
      })
      continue
    }
    if (matches.length > 1) {
      issues.push('death-settlement-assessment-domain-duplicate')
      reviews.push({
        domain,
        status: 'invalid',
        coverage: 'unknown',
        evidenceId: null,
        issues: ['death-settlement-assessment-domain-duplicate'],
      })
      continue
    }

    const assessment = matches[0]
    const domainIssues: string[] = []
    let invalid = false
    let blocked = false

    if (assessment.evidence.deceased !== scope.deceased) {
      domainIssues.push('death-settlement-assessment-deceased-mismatch')
      issues.push('death-settlement-assessment-deceased-mismatch')
      invalid = true
    }
    if (assessment.evidence.deathEvent !== scope.deathEvent) {
      domainIssues.push('death-settlement-assessment-death-event-mismatch')
      issues.push('death-settlement-assessment-death-event-mismatch')
      invalid = true
    }
    if (!assessment.canonical) {
      domainIssues.push('death-settlement-canonical-inventory-missing')
      issues.push('death-settlement-canonical-inventory-missing')
      invalid = true
    }

    const evidenceIssues = validateDeathSettlementDomainEvidence(
      assessment.evidence,
      assessment.canonical,
      refs,
      deathAt,
    )
    if (evidenceIssues.length > 0) {
      domainIssues.push(...evidenceIssues)
      invalid = true
    }

    if (assessment.readiness === 'ready' && assessment.domainIssues.length > 0) {
      domainIssues.push('death-settlement-domain-readiness-contradicts-issues')
      issues.push('death-settlement-domain-readiness-contradicts-issues')
      invalid = true
    }
    if (assessment.readiness === 'blocked') {
      blocked = true
      domainIssues.push('death-settlement-domain-validator-blocked')
      issues.push('death-settlement-domain-validator-blocked')
      domainIssues.push(...assessment.domainIssues)
    }
    if (assessment.evidence.status !== 'complete') {
      blocked = true
      domainIssues.push('death-settlement-inventory-not-complete')
      issues.push('death-settlement-inventory-not-complete')
      if (assessment.readiness === 'ready') {
        domainIssues.push('death-settlement-domain-readiness-contradicts-inventory')
        issues.push('death-settlement-domain-readiness-contradicts-inventory')
        invalid = true
      }
    }

    const structurallyValid = !invalid && !blocked
    const coverage: DeathSettlementDomainCoverage = !structurallyValid || assessment.canonical === null
      ? 'unknown'
      : assessment.canonical.entries.length === 0 && assessment.evidence.entries.length === 0
        ? 'empty-reviewed'
        : 'reviewed-with-items'

    reviews.push({
      domain,
      status: invalid ? 'invalid' : blocked ? 'blocked' : 'ready',
      coverage,
      evidenceId: assessment.evidence.id,
      issues: [...new Set(domainIssues)],
    })
  }

  const incompleteIssueCodes: readonly DeathSettlementCoordinationIssue[] = [
    'death-settlement-domain-validator-blocked',
    'death-settlement-inventory-not-complete',
  ]
  const hasInvalid = issues.some(issue => !incompleteIssueCodes.includes(issue))
    || reviews.some(review => review.status === 'invalid')
  const hasIncomplete = reviews.some(review =>
    review.status === 'missing' || review.status === 'blocked')
  const status = hasInvalid
    ? 'invalid'
    : hasIncomplete
      ? 'incomplete'
      : reviews.length > 0 && reviews.every(review => review.status === 'ready')
        ? 'settled'
        : 'incomplete'

  return {
    status,
    deceased: scope.deceased,
    deathEvent: scope.deathEvent,
    declaredDomains: [...scope.domains],
    reviews,
    issues: [...new Set(issues)],
  }
}
