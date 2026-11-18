import { brandedId } from '../src/domain'
import { bootstrapWorld } from '../src/application'
import type { HistoricalMinisterException, WorldBootstrapRequest } from '../src/application'
import type { WorldId } from '../src/domain'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world-bootstrap-test') as WorldId
const historicalMinister: HistoricalMinisterException = {
  personId: brandedId<'PersonId'>('person:historical:minister-001'),
  displayName: '史载名臣',
  category: 'famous-minister',
  evidenceStatus: 'verified',
  evidenceRefs: ['source:chronicle:volume-01'],
  validFrom: { day: 1, period: '晨' },
  validThrough: null,
  scope: { kind: 'world' },
}

const baseRequest: WorldBootstrapRequest = {
  worldId,
  seed: 'jiajing2-world-seed-001',
  scenarioPackId: 'scenario:ming-jiajing-02',
  rulesetVersion: 'ruleset-0.16',
  contentPackVersion: 'ming-content-0.1',
  worldTime: { day: 1, period: '晨' },
  locationCode: 'peixian',
  roleSlots: [
    { roleCode: 'county-clerk', tier: 'county', minCount: 3, maxCount: 5 },
    { roleCode: 'grassroots-runner', tier: 'grassroots', minCount: 3, maxCount: 5 },
  ],
  namePool: {
    surnames: ['王', '李', '张', '赵', '陈', '周'],
    givenNames: ['守仁', '文远', '景初', '仲平', '元礼', '士衡'],
  },
  historicalMinisters: [historicalMinister],
}

const first = bootstrapWorld(baseRequest)
const second = bootstrapWorld(baseRequest)
check('valid bootstrap request is accepted', first.status === 'ready')
check('same seed and same input produce identical population', first.status === 'ready'
  && second.status === 'ready'
  && JSON.stringify(first.generatedPeople) === JSON.stringify(second.generatedPeople))
check('county and grassroots population is always generated', first.status === 'ready'
  && first.generatedPeople.length >= 6
  && first.generatedPeople.every(person => person.provenance === 'seeded-random'
    && (person.populationTier === 'county' || person.populationTier === 'grassroots')))
check('fixed historical appearance is limited to the verified minister exception', first.status === 'ready'
  && first.historicalPeople.length === 1
  && first.historicalPeople[0].category === 'famous-minister'
  && first.historicalPeople[0].provenance === 'verified-historical-exception')
check('generated population does not create relations or office assignments', first.status === 'ready'
  && first.generatedPeople.every(person => !('relations' in person) && !('office' in person)))
check('bootstrap stores a seed fingerprint rather than a raw seed in descriptor', first.status === 'ready'
  && first.descriptor.seedFingerprint.length === 8
  && !('seed' in first.descriptor))

const changedSeed = bootstrapWorld({ ...baseRequest, seed: 'jiajing2-world-seed-002' })
check('different seed changes deterministic population identity', first.status === 'ready'
  && changedSeed.status === 'ready'
  && first.descriptor.seedFingerprint !== changedSeed.descriptor.seedFingerprint)

const unverified = bootstrapWorld({
  ...baseRequest,
  historicalMinisters: [{ ...historicalMinister, evidenceStatus: 'unverified' }],
})
check('unverified historical name is rejected', unverified.status === 'rejected'
  && unverified.issues.includes('bootstrap-historical-person-not-verified'))

const wrongLocation = bootstrapWorld({
  ...baseRequest,
  historicalMinisters: [{
    ...historicalMinister,
    scope: { kind: 'location', locationCode: 'another-county' },
  }],
})
check('location-scoped historical exception cannot appear elsewhere', wrongLocation.status === 'rejected'
  && wrongLocation.issues.includes('bootstrap-historical-person-location-mismatch'))

const notFamous = bootstrapWorld({
  ...baseRequest,
  historicalMinisters: [{
    ...historicalMinister,
    category: 'local-official',
  } as unknown as HistoricalMinisterException],
})
check('local official cannot enter the fixed-name exception lane', notFamous.status === 'rejected'
  && notFamous.issues.includes('bootstrap-historical-person-not-famous-minister'))

const futureMinister = bootstrapWorld({
  ...baseRequest,
  historicalMinisters: [{
    ...historicalMinister,
    validFrom: { day: 2, period: '晨' },
  }],
})
check('future historical appearance is rejected', futureMinister.status === 'rejected'
  && futureMinister.issues.includes('bootstrap-historical-person-not-yet-active'))

const exhaustedNames = bootstrapWorld({
  ...baseRequest,
  roleSlots: [{ roleCode: 'county-clerk', tier: 'county', minCount: 2, maxCount: 2 }],
  namePool: { surnames: ['王'], givenNames: ['守仁'] },
  historicalMinisters: [],
})
check('name pool exhaustion rejects rather than duplicates people', exhaustedNames.status === 'rejected'
  && exhaustedNames.issues.includes('bootstrap-generated-name-pool-exhausted'))

const duplicateRole = bootstrapWorld({
  ...baseRequest,
  roleSlots: [
    { roleCode: 'county-clerk', tier: 'county', minCount: 1, maxCount: 1 },
    { roleCode: 'county-clerk', tier: 'grassroots', minCount: 1, maxCount: 1 },
  ],
})
check('duplicate role template codes are rejected', duplicateRole.status === 'rejected'
  && duplicateRole.issues.includes('bootstrap-role-code-duplicate'))

if (failed > 0) throw new Error(`World bootstrap tests failed: ${failed}/${passed + failed}`)
console.log(`World bootstrap contract tests: ${passed}/${passed + failed} passed`)
