import { brandedId, field, personLifeTimeBoundaryViolations } from './index'
import type { Person } from './person/model'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const person: Person = {
  id: brandedId<'PersonId'>('life-time-person'),
  displayName: '生命时间边界测试人物',
  birth: field.value({ day: 10, period: '午' }),
  lifeState: 'dead',
  archiveState: 'active',
  death: field.value({
    at: { day: 30, period: '暮' },
    causeEvent: brandedId<'EventId'>('life-time-death-event'),
    estateSettlements: [],
  }),
  capability: brandedId<'CapabilityRef'>('life-time-capability'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('life-time-body'),
    mind: brandedId<'MindScopeRef'>('life-time-mind'),
    knowledge: brandedId<'KnowledgeScopeId'>('life-time-knowledge'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('life-time-schedule'),
    economy: brandedId<'EconomyScopeId'>('life-time-economy'),
    location: brandedId<'LocationStateRef'>('life-time-location'),
  },
  history: brandedId<'LifeHistoryRef'>('life-time-history'),
}

check('strictly before birth is rejected', personLifeTimeBoundaryViolations(person, {
  day: 10, period: '晨',
}).includes('before-birth'))
check('exact birth instant is allowed', personLifeTimeBoundaryViolations(person, {
  day: 10, period: '午',
}).length === 0)
check('between birth and death is allowed', personLifeTimeBoundaryViolations(person, {
  day: 20, period: '午',
}).length === 0)
check('exact death instant is allowed', personLifeTimeBoundaryViolations(person, {
  day: 30, period: '暮',
}).length === 0)
check('strictly after death is rejected', personLifeTimeBoundaryViolations(person, {
  day: 30, period: '夜',
}).includes('after-death'))
check('unknown birth does not invent a lower boundary', personLifeTimeBoundaryViolations({
  ...person, birth: field.unknown,
}, { day: 1, period: '晨' }).length === 0)
check('unknown death does not invent an upper boundary', personLifeTimeBoundaryViolations({
  ...person, death: field.unknown,
}, { day: 999, period: '夜' }).length === 0)
check('not-generated birth does not invent a lower boundary', personLifeTimeBoundaryViolations({
  ...person, birth: field.notGenerated,
}, { day: 1, period: '晨' }).length === 0)
check('not-applicable death does not invent an upper boundary', personLifeTimeBoundaryViolations({
  ...person, death: field.notApplicable,
}, { day: 999, period: '夜' }).length === 0)
check('invalid record time is left to the owning validator', personLifeTimeBoundaryViolations(person, {
  day: 0, period: '晨',
}).length === 0)

if (failed > 0) throw new Error(`Life time boundary tests failed: ${failed}/${passed + failed}`)
console.log(`Life time boundary tests: ${passed}/${passed + failed} passed`)
