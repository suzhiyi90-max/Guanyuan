import { isValidWorldTime } from '../shared/world-time'
import type { PersonId, OrgId, RelationId } from '../shared/ids'
import type {
  Membership,
  Organization,
  Relation,
  RelationClaim,
  RelationEvidence,
  RelationIssue,
} from './model'

function duplicateIds<T>(items: readonly T[], getId: (item: T) => string): boolean {
  const ids = new Set<string>()
  for (const item of items) {
    const id = getId(item)
    if (ids.has(id)) return true
    ids.add(id)
  }
  return false
}

function isNonEmpty(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidEvidenceReference(value: RelationEvidence['evidence']): boolean {
  switch (value.kind) {
    case 'event':
    case 'person':
    case 'organization':
      return isNonEmpty(value.id)
    case 'document':
      return isNonEmpty(value.id)
  }
}

/**
 * Structural validation only. EventId ordering/existence is intentionally left to W3,
 * because W1-C has no authoritative EventStream with which to resolve chronology.
 */
export function validateRelation(relation: Relation): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (!isNonEmpty(relation.type)) issues.push('relation-empty-type')
  if (relation.lifecycle.validTo !== 'open'
    && relation.lifecycle.validTo === relation.lifecycle.validFrom) {
    issues.push('relation-empty-validity')
  }
  if (!['active', 'dormant', 'severed'].includes(relation.lifecycle.status)) {
    issues.push('relation-invalid-lifecycle')
  }
  if (!['public', 'contact', 'private', 'secret'].includes(relation.visibility.level)) {
    issues.push('relation-invalid-visibility')
  }
  return issues
}

export function validateRelationSet(
  relations: readonly Relation[],
  personIds: readonly PersonId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (duplicateIds(relations, (item) => item.id)) issues.push('relation-duplicate-id')
  const people = new Set<string>(personIds)
  for (const relation of relations) {
    issues.push(...validateRelation(relation))
    if (!people.has(relation.from)) issues.push('relation-source-person-missing')
    if (!people.has(relation.to)) issues.push('relation-target-person-missing')
  }
  return issues
}

export function validateRelationClaim(
  claim: RelationClaim,
  relationIds: readonly RelationId[],
  personIds: readonly PersonId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (!relationIds.includes(claim.relation)) issues.push('claim-relation-missing')
  if (claim.claimant !== 'player' && !personIds.includes(claim.claimant)) issues.push('claim-person-missing')
  if (!isValidWorldTime(claim.assertedAt)) issues.push('claim-invalid-time')
  if (!['confirmed', 'reported', 'suspected', 'unverified'].includes(claim.certainty)) {
    issues.push('claim-invalid-certainty')
  }
  return issues
}

export function validateRelationClaimSet(
  claims: readonly RelationClaim[],
  relationIds: readonly RelationId[],
  personIds: readonly PersonId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (duplicateIds(claims, (item) => item.id)) issues.push('claim-duplicate-id')
  for (const claim of claims) issues.push(...validateRelationClaim(claim, relationIds, personIds))
  return issues
}

export function validateRelationEvidence(
  evidence: RelationEvidence,
  claimIds: readonly string[],
  personIds: readonly PersonId[],
  organizationIds: readonly OrgId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (!claimIds.includes(evidence.claim)) issues.push('evidence-claim-missing')
  if (!isValidEvidenceReference(evidence.evidence)) issues.push('evidence-reference-invalid')
  if (evidence.evidence.kind === 'person' && !personIds.includes(evidence.evidence.id)) {
    issues.push('evidence-person-missing')
  }
  if (evidence.evidence.kind === 'organization' && !organizationIds.includes(evidence.evidence.id)) {
    issues.push('evidence-organization-missing')
  }
  if (!['direct', 'corroborating', 'hearsay'].includes(evidence.weight)) {
    issues.push('evidence-invalid-weight')
  }
  return issues
}

export function validateRelationEvidenceSet(
  evidence: readonly RelationEvidence[],
  claimIds: readonly string[],
  personIds: readonly PersonId[],
  organizationIds: readonly OrgId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (duplicateIds(evidence, (item) => item.id)) issues.push('evidence-duplicate-id')
  for (const item of evidence) issues.push(...validateRelationEvidence(item, claimIds, personIds, organizationIds))
  return issues
}

export function validateOrganization(organization: Organization): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (!isNonEmpty(organization.type)) issues.push('organization-empty-type')
  if (!isNonEmpty(organization.name)) issues.push('organization-empty-name')
  if (!isNonEmpty(organization.purpose)) issues.push('organization-empty-purpose')
  if (!isNonEmpty(organization.region)) issues.push('organization-empty-region')
  if (organization.rules.some((rule) => !isNonEmpty(rule))) issues.push('organization-invalid-rule')
  if (new Set(organization.rules).size !== organization.rules.length) issues.push('organization-duplicate-rule')
  return issues
}

export function validateOrganizationSet(organizations: readonly Organization[]): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (duplicateIds(organizations, (item) => item.id)) issues.push('organization-duplicate-id')
  for (const organization of organizations) issues.push(...validateOrganization(organization))
  return issues
}

export function validateMembership(membership: Membership): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (!isNonEmpty(membership.role)) issues.push('membership-empty-role')
  if (membership.validTo !== 'open' && membership.validTo === membership.validFrom) {
    issues.push('membership-empty-validity')
  }
  if (membership.obligations.some((item) => !isNonEmpty(item))) {
    issues.push('membership-invalid-obligation')
  }
  if (new Set(membership.obligations).size !== membership.obligations.length) {
    issues.push('membership-duplicate-obligation')
  }
  return issues
}

export function validateMembershipSet(
  memberships: readonly Membership[],
  organizationIds: readonly OrgId[],
  personIds: readonly PersonId[],
): RelationIssue[] {
  const issues: RelationIssue[] = []
  if (duplicateIds(memberships, (item) => item.id)) issues.push('membership-duplicate-id')
  const organizations = new Set<string>(organizationIds)
  const people = new Set<string>(personIds)
  for (const membership of memberships) {
    issues.push(...validateMembership(membership))
    if (!organizations.has(membership.organization)) issues.push('membership-organization-missing')
    if (!people.has(membership.person)) issues.push('membership-person-missing')
  }
  return issues
}

/** Type helper for callers that need to preserve the relation ID brand. */
export function relationIdExists(id: RelationId, relations: readonly Relation[]): boolean {
  return relations.some((relation) => relation.id === id)
}
