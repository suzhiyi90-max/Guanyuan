import {
  brandedId,
  compareWorldTime,
  field,
  isFieldValue,
  isPersonLifecycleValid,
  isValidWorldTime,
  validatePersonLifecycle,
} from '../src/domain'
import type { EstateSettlementDomain, Person } from '../src/domain'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
  } else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const now = { day: 8, period: '暮' } as const
const basePerson: Person = {
  id: brandedId<'PersonId'>('p-fixture-001'),
  displayName: '测试人物',
  birth: field.value({ day: 1, period: '晨' } as const),
  lifeState: 'alive',
  archiveState: 'active',
  death: field.notApplicable,
  capability: brandedId<'CapabilityRef'>('cap-fixture-001'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('body-fixture-001'),
    mind: brandedId<'MindScopeRef'>('mind-fixture-001'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge-fixture-001'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule-fixture-001'),
    economy: brandedId<'EconomyScopeId'>('economy-fixture-001'),
    location: brandedId<'LocationStateRef'>('location-fixture-001'),
  },
  history: brandedId<'LifeHistoryRef'>('history-fixture-001'),
}

check('alive + n/a death is valid', isPersonLifecycleValid(basePerson, now))
check('archive state is independent of life state', isPersonLifecycleValid({ ...basePerson, archiveState: 'archived' }, now))
check('unknown is distinct from not-generated', String(field.unknown.kind) !== String(field.notGenerated.kind))
check('n/a is distinct from unknown', String(field.notApplicable.kind) !== String(field.unknown.kind))
check('Field value guard', isFieldValue(field.value('x')))
check('world time orders day before period', compareWorldTime({ day: 2, period: '夜' }, { day: 3, period: '晨' }) < 0)
check('world time orders periods within day', compareWorldTime({ day: 2, period: '午' }, { day: 2, period: '暮' }) < 0)
check('world time rejects inherited object keys', !isValidWorldTime({ day: 2, period: 'toString' } as never))

const deadWithoutRecord = { ...basePerson, lifeState: 'dead' as const }
check('dead without death record is rejected', validatePersonLifecycle(deadWithoutRecord, now).includes('dead-person-requires-death-record'))

const aliveWithRecord = {
  ...basePerson,
  death: field.value({
    at: { day: 7, period: '午' } as const,
    causeEvent: brandedId<'EventId'>('evt-death-001'),
    estateSettlements: [],
  }),
}
check('alive with record is rejected', validatePersonLifecycle(aliveWithRecord, now).includes('alive-person-must-not-have-death-record'))

const settlementDomains: readonly EstateSettlementDomain[] = [
  'office', 'debt', 'asset', 'membership', 'relation', 'goal',
]
const deathRecord = {
  at: { day: 7, period: '午' } as const,
  causeEvent: brandedId<'EventId'>('evt-death-001'),
  estateSettlements: settlementDomains.map((domain, index) => ({
    domain,
    settlementEvent: brandedId<'EventId'>(`evt-estate-${index + 1}`),
    status: 'pending' as const,
  })),
}
const deadPerson: Person = {
  ...basePerson,
  lifeState: 'dead',
  death: field.value(deathRecord),
}
check('dead + death record is valid', isPersonLifecycleValid(deadPerson, now))
check('incomplete estate settlement chain is rejected', validatePersonLifecycle({
  ...deadPerson,
  death: field.value({ ...deathRecord, estateSettlements: deathRecord.estateSettlements.slice(0, 1) }),
}, now).includes('death-settlement-chain-incomplete'))
check('invalid world time is rejected', validatePersonLifecycle({
  ...basePerson,
  birth: field.value({ day: 0, period: '晨' } as const),
}, now).includes('invalid-world-time'))
check('future death record is rejected', validatePersonLifecycle({
  ...deadPerson,
  death: field.value({ ...deathRecord, at: { day: 9, period: '晨' } as const }),
}, now).includes('death-record-is-in-the-future'))
check('future birth is rejected', validatePersonLifecycle({
  ...basePerson,
  birth: field.value({ day: 9, period: '晨' } as const),
}, now).includes('birth-is-in-the-future'))
check('death before birth is rejected', validatePersonLifecycle({
  ...deadPerson,
  birth: field.value({ day: 8, period: '暮' } as const),
  death: field.value({ ...deathRecord, at: { day: 8, period: '午' } as const }),
}, now).includes('death-precedes-birth'))

// Compile-time contract guards: null and unbranded identifiers must not pass.
// @ts-expect-error null is not a Field state
const nullField: import('../src/domain').Field<string> = null
// @ts-expect-error raw strings are not branded PersonId values
const unbrandedPersonId: import('../src/domain').PersonId = 'p-raw'
void nullField
void unbrandedPersonId

if (failed > 0) throw new Error(`Domain tests failed: ${failed}/${passed + failed}`)
console.log(`Domain contract tests: ${passed}/${passed + failed} passed`)
