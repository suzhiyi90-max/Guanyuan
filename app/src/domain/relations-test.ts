import { brandedId } from './index'
import {
  validateMembership,
  validateMembershipSet,
  validateOrganization,
  validateOrganizationSet,
  validateRelation,
  validateRelationClaim,
  validateRelationClaimSet,
  validateRelationEvidence,
  validateRelationEvidenceSet,
  validateRelationSet,
} from './relations/validation'
import type {
  Membership,
  Organization,
  Relation,
  RelationClaim,
  RelationEvidence,
} from './relations/model'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const p1 = brandedId<'PersonId'>('person-001')
const p2 = brandedId<'PersonId'>('person-002')
const orgId = brandedId<'OrgId'>('org-001')
const event1 = brandedId<'EventId'>('event-001')
const event2 = brandedId<'EventId'>('event-002')
const relationId = brandedId<'RelationId'>('relation-001')
const claimId = brandedId<'RelationClaimId'>('claim-001')
const now = { day: 4, period: '午' } as const

const relation: Relation = {
  id: relationId,
  from: p1,
  to: p2,
  type: 'mentor' as Relation['type'],
  lifecycle: { status: 'active', validFrom: event1, validTo: 'open' },
  sourceEvent: event1,
  visibility: { observer: 'player', level: 'public' },
}
check('valid directed relation is accepted', validateRelation(relation).length === 0)
check('directed edge may coexist with reverse edge', validateRelationSet([
  relation,
  { ...relation, id: brandedId<'RelationId'>('relation-002'), from: p2, to: p1, type: 'colleague' as Relation['type'] },
], [p1, p2]).length === 0)
check('multiple relation types between same pair are preserved', validateRelationSet([
  relation,
  { ...relation, id: brandedId<'RelationId'>('relation-002'), type: 'friend' as Relation['type'] },
], [p1, p2]).length === 0)
check('duplicate relation id is rejected', validateRelationSet([relation, relation], [p1, p2]).includes('relation-duplicate-id'))
check('dangling relation source is rejected', validateRelationSet([relation], [p2]).includes('relation-source-person-missing'))
check('dangling relation target is rejected', validateRelationSet([relation], [p1]).includes('relation-target-person-missing'))
check('relation type cannot be empty', validateRelation({ ...relation, type: '  ' as Relation['type'] }).includes('relation-empty-type'))
check('relation cannot have empty validity boundary', validateRelation({
  ...relation, lifecycle: { ...relation.lifecycle, validTo: event1 },
}).includes('relation-empty-validity'))
check('relation lifecycle is explicit', validateRelation({
  ...relation, lifecycle: { ...relation.lifecycle, status: 'unknown' as never },
}).includes('relation-invalid-lifecycle'))

const claim: RelationClaim = {
  id: claimId,
  relation: relationId,
  claimant: p1,
  certainty: 'reported',
  assertedAt: now,
  sourceEvent: event2,
}
check('claim resolves to objective relation', validateRelationClaim(claim, [relationId], [p1, p2]).length === 0)
check('claim cannot create relation by dangling reference', validateRelationClaim({
  ...claim, relation: brandedId<'RelationId'>('missing-relation'),
}, [relationId], [p1, p2]).includes('claim-relation-missing'))
check('claim certainty is independent and bounded', validateRelationClaim({
  ...claim, certainty: 'certain' as never,
}, [relationId], [p1, p2]).includes('claim-invalid-certainty'))
check('claim collection rejects duplicate IDs', validateRelationClaimSet([claim, claim], [relationId], [p1, p2]).includes('claim-duplicate-id'))
check('claim time is validated', validateRelationClaim({
  ...claim, assertedAt: { day: 0, period: '晨' } as never,
}, [relationId], [p1, p2]).includes('claim-invalid-time'))
check('claimant person reference must resolve', validateRelationClaim({
  ...claim, claimant: brandedId<'PersonId'>('missing-person'),
}, [relationId], [p2]).includes('claim-person-missing'))

const evidence: RelationEvidence = {
  id: brandedId<'RelationEvidenceId'>('evidence-001'),
  claim: claimId,
  evidence: { kind: 'document', id: 'archive-doc-1' },
  weight: 'direct',
  sourceEvent: event2,
}
check('evidence resolves to a claim', validateRelationEvidence(evidence, [claimId], [p1, p2], [orgId]).length === 0)
check('dangling evidence claim is rejected', validateRelationEvidence({
  ...evidence, claim: brandedId<'RelationClaimId'>('missing-claim'),
}, [claimId], [p1, p2], [orgId]).includes('evidence-claim-missing'))
check('empty evidence reference is rejected', validateRelationEvidence({
  ...evidence, evidence: { kind: 'document', id: '  ' },
}, [claimId], [p1, p2], [orgId]).includes('evidence-reference-invalid'))
check('evidence weight is validated', validateRelationEvidence({
  ...evidence, weight: 'rumor' as never,
}, [claimId], [p1, p2], [orgId]).includes('evidence-invalid-weight'))
check('evidence person reference must resolve', validateRelationEvidence({
  ...evidence, evidence: { kind: 'person', id: brandedId<'PersonId'>('missing-person') },
}, [claimId], [p1, p2], [orgId]).includes('evidence-person-missing'))
check('evidence collection rejects duplicate IDs', validateRelationEvidenceSet([evidence, evidence], [claimId], [p1, p2], [orgId]).includes('evidence-duplicate-id'))

const organization: Organization = {
  id: orgId,
  type: 'bureau',
  name: '河工总局',
  purpose: '河道治理与工程协调',
  region: '直隶',
  rules: ['membership.register', 'membership.leave'],
}
check('valid organization is accepted', validateOrganization(organization).length === 0)
check('organization requires a name', validateOrganization({
  ...organization, name: ' ',
}).includes('organization-empty-name'))
check('organization rejects duplicate rules', validateOrganization({
  ...organization, rules: ['rule.a', 'rule.a'],
}).includes('organization-duplicate-rule'))
check('organization collection rejects duplicate IDs', validateOrganizationSet([
  organization, organization,
]).includes('organization-duplicate-id'))

const membership: Membership = {
  id: brandedId<'MembershipId'>('membership-001'),
  organization: orgId,
  person: p1,
  role: 'member',
  obligations: ['attend-council', 'submit-report'],
  validFrom: event1,
  validTo: 'open',
  sourceEvent: event1,
}
check('valid membership is accepted', validateMembership(membership).length === 0)
check('membership requires a role', validateMembership({
  ...membership, role: ' ',
}).includes('membership-empty-role'))
check('membership rejects duplicate obligations', validateMembership({
  ...membership, obligations: ['report', 'report'],
}).includes('membership-duplicate-obligation'))
check('membership rejects empty validity interval', validateMembership({
  ...membership, validTo: event1,
}).includes('membership-empty-validity'))
check('membership collection rejects duplicate IDs', validateMembershipSet([
  membership, membership,
], [orgId], [p1]).includes('membership-duplicate-id'))
check('membership organization reference must resolve', validateMembershipSet([
  membership,
], [], [p1]).includes('membership-organization-missing'))
check('membership person reference must resolve', validateMembershipSet([
  membership,
], [orgId], [p2]).includes('membership-person-missing'))

// @ts-expect-error raw strings cannot be used as RelationId
const invalidRelationId: import('./relations/model').RelationId = 'relation-raw'
// @ts-expect-error raw strings cannot be used as MembershipId
const invalidMembershipId: import('./relations/model').MembershipId = 'membership-raw'
void invalidRelationId
void invalidMembershipId

if (failed > 0) throw new Error(`Relations contract tests failed: ${failed}/${passed + failed}`)
console.log(`Relations contract tests: ${passed}/${passed + failed} passed`)
