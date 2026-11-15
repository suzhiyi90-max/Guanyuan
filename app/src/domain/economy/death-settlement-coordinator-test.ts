import {
  brandedId,
  coordinateDeathSettlement,
} from '../index'
import type {
  DeathSettlementDomainAssessment,
  DeathSettlementScopeDeclaration,
  EstateSettlementDomain,
} from '../index'
import type { EventId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const deceased = brandedId<'PersonId'>('coordinator-deceased')
const otherPerson = brandedId<'PersonId'>('coordinator-other-person')
const deathEvent = brandedId<'EventId'>('coordinator-death')
const inventoryEvent = brandedId<'EventId'>('coordinator-review')
const deathAt: WorldTime = { day: 5, period: '午' }
const reviewAt: WorldTime = { day: 5, period: '暮' }
const refs = {
  events: [deathEvent, inventoryEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt],
    [inventoryEvent, reviewAt],
  ]),
}
const allDomains: readonly EstateSettlementDomain[] = [
  'office', 'debt', 'asset', 'membership', 'relation', 'goal',
]
const scope: DeathSettlementScopeDeclaration = { deceased, deathEvent, domains: allDomains }

const assessments: DeathSettlementDomainAssessment[] = [
  {
    domain: 'office',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-office'),
      deceased, deathEvent, inventoryEvent, domain: 'office',
      inventory: brandedId<'DeathOfficeInventoryId'>('i-office'),
      status: 'complete', entries: [], appointments: [], authorizations: [],
    },
    canonical: {
      id: 'i-office', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
  {
    domain: 'debt',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-debt'),
      deceased, deathEvent, inventoryEvent, domain: 'debt',
      inventory: brandedId<'DebtDeathInventoryId'>('i-debt'),
      status: 'complete', entries: [], positions: [],
    },
    canonical: {
      id: 'i-debt', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
  {
    domain: 'asset',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-asset'),
      deceased, deathEvent, inventoryEvent, domain: 'asset',
      inventory: brandedId<'EstateAssetInventoryId'>('i-asset'),
      status: 'complete', entries: [], assets: [],
    },
    canonical: {
      id: 'i-asset', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
  {
    domain: 'membership',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-membership'),
      deceased, deathEvent, inventoryEvent, domain: 'membership',
      inventory: brandedId<'MembershipDeathInventoryId'>('i-membership'),
      status: 'complete', entries: [], memberships: [],
    },
    canonical: {
      id: 'i-membership', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
  {
    domain: 'relation',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-relation'),
      deceased, deathEvent, inventoryEvent, domain: 'relation',
      inventory: brandedId<'RelationDeathInventoryId'>('i-relation'),
      status: 'complete', entries: [], relations: [],
    },
    canonical: {
      id: 'i-relation', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
  {
    domain: 'goal',
    evidence: {
      id: brandedId<'DeathSettlementEvidenceId'>('e-goal'),
      deceased, deathEvent, inventoryEvent, domain: 'goal',
      inventory: brandedId<'GoalDeathInventoryId'>('i-goal'),
      status: 'complete', entries: [], goals: [],
    },
    canonical: {
      id: 'i-goal', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
    },
    domainIssues: [], readiness: 'ready',
  },
]

const settled = coordinateDeathSettlement(scope, assessments, refs, deathAt)
check('all six explicitly declared and reviewed empty domains settle', settled.status === 'settled')
check('empty-but-reviewed is distinct for each domain', settled.reviews.length === 6
  && settled.reviews.every(review => review.coverage === 'empty-reviewed' && review.status === 'ready'))
check('the coordinator reports the declared scope without mutating source evidence',
  assessments.every(assessment => assessment.evidence.status === 'complete')
  && refs.eventTimes.get(deathEvent) === deathAt)

const missing = coordinateDeathSettlement(scope, assessments.slice(1), refs, deathAt)
check('missing domain evidence is incomplete, not an empty review', missing.status === 'incomplete'
  && missing.reviews.find(review => review.domain === 'office')?.coverage === 'missing')

const unknownCanonical = assessments.map((assessment, index) => index === 2
  ? { ...assessment, canonical: null, readiness: 'blocked' } as DeathSettlementDomainAssessment
  : assessment)
const unknown = coordinateDeathSettlement(scope, unknownCanonical, refs, deathAt)
check('present evidence without its canonical inventory is unknown, not empty-reviewed',
  unknown.status === 'invalid'
  && unknown.reviews.find(review => review.domain === 'asset')?.coverage === 'unknown')

const duplicate = coordinateDeathSettlement(scope, [...assessments, assessments[0]], refs, deathAt)
check('duplicate domain assessments are invalid', duplicate.status === 'invalid'
  && duplicate.issues.includes('death-settlement-assessment-domain-duplicate'))

const subsetScope: DeathSettlementScopeDeclaration = { deceased, deathEvent, domains: ['debt'] }
check('a one-domain result is scoped only to that explicit declaration',
  coordinateDeathSettlement(subsetScope, [assessments[1]], refs, deathAt).status === 'settled')

check('an undeclared assessment cannot silently expand the scope',
  coordinateDeathSettlement(subsetScope, assessments, refs, deathAt).status === 'invalid')

const wrongPerson = assessments.map((assessment, index) => index === 0
  ? { ...assessment, evidence: { ...assessment.evidence, deceased: otherPerson } } as DeathSettlementDomainAssessment
  : assessment)
check('wrong deceased identity is rejected', coordinateDeathSettlement(scope, wrongPerson, refs, deathAt).status === 'invalid')

const wrongDeathEvent = assessments.map((assessment, index) => index === 0
  ? { ...assessment, evidence: { ...assessment.evidence, deathEvent: brandedId<'EventId'>('other-death') } } as DeathSettlementDomainAssessment
  : assessment)
check('wrong death event identity is rejected', coordinateDeathSettlement(scope, wrongDeathEvent, refs, deathAt).status === 'invalid')

const staleRefs = {
  ...refs,
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt],
    [inventoryEvent, { day: 5, period: '晨' }],
  ]),
}
check('pre-death inventory chronology is rejected', coordinateDeathSettlement(scope, assessments, staleRefs, deathAt).status === 'invalid')

const wrongCanonical = assessments.map((assessment, index) => index === 2
  ? { ...assessment, canonical: { ...assessment.canonical!, entries: [{ id: 'wrong-entry', itemRef: 'asset:wrong' }] } }
      as DeathSettlementDomainAssessment
  : assessment)
check('canonical inventory mismatch is rejected', coordinateDeathSettlement(scope, wrongCanonical, refs, deathAt).status === 'invalid')

const debtBlocked: DeathSettlementDomainAssessment = {
  domain: 'debt',
  evidence: {
    id: brandedId<'DeathSettlementEvidenceId'>('e-debt-blocked'),
    deceased, deathEvent, inventoryEvent, domain: 'debt',
    inventory: brandedId<'DebtDeathInventoryId'>('i-debt'),
    status: 'complete',
    entries: [{ id: brandedId<'DebtDeathInventoryEntryId'>('debt-entry') }],
    positions: [{ debt: brandedId<'DebtId'>('unpaid-debt'), role: 'debtor' }],
  },
  canonical: {
    id: 'i-debt', deceased, deathEvent, inventoryEvent, status: 'complete',
    entries: [{ id: 'debt-entry', itemRef: 'debt:unpaid-debt:debtor' }],
  },
  domainIssues: ['debt-death-inventory-entry-pending'],
  readiness: 'blocked',
}
const blocked = coordinateDeathSettlement(scope, assessments.map((item, index) =>
  index === 1 ? debtBlocked : item), refs, deathAt)
check('domain-specific unresolved debt blocks overall settlement without invalidating the envelope',
  blocked.status === 'incomplete'
  && blocked.reviews.find(review => review.domain === 'debt')?.status === 'blocked')

const openInventory: DeathSettlementDomainAssessment = {
  domain: 'asset',
  evidence: {
    id: brandedId<'DeathSettlementEvidenceId'>('e-asset-open'),
    deceased, deathEvent, inventoryEvent, domain: 'asset',
    inventory: brandedId<'EstateAssetInventoryId'>('i-asset'),
    status: 'open', entries: [], assets: [],
  },
  canonical: {
    id: 'i-asset', deceased, deathEvent, inventoryEvent, status: 'open', entries: [],
  },
  domainIssues: [],
  readiness: 'blocked',
}
check('open inventory cannot be promoted by an otherwise valid evidence envelope',
  coordinateDeathSettlement(scope, assessments.map((item, index) =>
    index === 2 ? openInventory : item), refs, deathAt).status === 'incomplete')

const contradictoryReady: DeathSettlementDomainAssessment = {
  domain: 'debt',
  evidence: {
    id: brandedId<'DeathSettlementEvidenceId'>('e-debt-contradictory'),
    deceased, deathEvent, inventoryEvent, domain: 'debt',
    inventory: brandedId<'DebtDeathInventoryId'>('i-debt'),
    status: 'complete', entries: [], positions: [],
  },
  canonical: {
    id: 'i-debt', deceased, deathEvent, inventoryEvent, status: 'complete', entries: [],
  },
  domainIssues: ['debt-death-inventory-invalid'],
  readiness: 'ready',
}
check('ready result contradicting domain validator issues is invalid',
  coordinateDeathSettlement(scope, assessments.map((item, index) =>
    index === 1 ? contradictoryReady : item), refs, deathAt).status === 'invalid')

check('empty declared scope is invalid', coordinateDeathSettlement(
  { deceased, deathEvent, domains: [] }, [], refs, deathAt,
).status === 'invalid')
check('duplicate declared domain is invalid', coordinateDeathSettlement(
  { deceased, deathEvent, domains: ['debt', 'debt'] }, [assessments[1]], refs, deathAt,
).status === 'invalid')

check('unknown runtime domain values are rejected', coordinateDeathSettlement(
  { deceased, deathEvent, domains: ['estate' as EstateSettlementDomain] }, [], refs, deathAt,
).issues.includes('death-settlement-scope-domain-unknown'))
check('death event time mismatch is rejected', coordinateDeathSettlement(
  scope, assessments, { ...refs, eventTimes: new Map([[deathEvent, { day: 5, period: '晨' }], [inventoryEvent, reviewAt]]) }, deathAt,
).status === 'invalid')

if (failed > 0) throw new Error(`Death settlement coordinator tests failed: ${failed}/${passed + failed}`)
console.log(`Death settlement coordinator contracts: ${passed}/${passed + failed} passed`)
