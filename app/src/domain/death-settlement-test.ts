import { brandedId, field, validateDeathSettlementReferences } from './index'
import type { Person } from './person/model'
import type { EventId } from './shared/ids'
import type { WorldTime } from './shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const personId = brandedId<'PersonId'>('death-settlement-person')
const deathEvent = brandedId<'EventId'>('death-settlement-death')
const settlementEvent = brandedId<'EventId'>('death-settlement-domain')
const deathAt: WorldTime = { day: 8, period: '午' }
const settlementAt: WorldTime = { day: 8, period: '暮' }
const domains = ['office', 'debt', 'asset', 'membership', 'relation', 'goal'] as const
const person: Person = {
  id: personId,
  displayName: '身后结算测试人物',
  birth: field.notApplicable,
  lifeState: 'dead',
  archiveState: 'active',
  death: field.value({
    at: deathAt,
    causeEvent: deathEvent,
    estateSettlements: domains.map(domain => ({
      domain, settlementEvent, status: 'pending' as const,
    })),
  }),
  capability: brandedId<'CapabilityRef'>('death-settlement-capability'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('death-settlement-body'),
    mind: brandedId<'MindScopeRef'>('death-settlement-mind'),
    knowledge: brandedId<'KnowledgeScopeId'>('death-settlement-knowledge'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('death-settlement-schedule'),
    economy: brandedId<'EconomyScopeId'>('death-settlement-economy'),
    location: brandedId<'LocationStateRef'>('death-settlement-location'),
  },
  history: brandedId<'LifeHistoryRef'>('death-settlement-history'),
}
const deathRecord = person.death.kind === 'value' ? person.death.value : undefined
const refs = {
  events: [deathEvent, settlementEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt],
    [settlementEvent, settlementAt],
  ]),
}
check('six-domain settlement references with valid chronology pass',
  validateDeathSettlementReferences(person, refs).length === 0)
check('missing death cause event is rejected',
  validateDeathSettlementReferences(person, { ...refs, events: [settlementEvent] })
    .includes('death-settlement-death-event-missing'))
check('missing death cause time is rejected',
  validateDeathSettlementReferences(person, { ...refs, eventTimes: new Map([[settlementEvent, settlementAt]]) })
    .includes('death-settlement-death-event-time-missing'))
check('invalid death record time is rejected',
  validateDeathSettlementReferences({
    ...person,
    death: deathRecord ? field.value({ ...deathRecord, at: { day: 0, period: '午' } }) : field.notApplicable,
  }, refs).includes('death-settlement-death-time-invalid'))
check('death event time must match death record',
  validateDeathSettlementReferences(person, {
    ...refs, eventTimes: new Map([[deathEvent, { day: 8, period: '晨' }], [settlementEvent, settlementAt]]),
  }).includes('death-settlement-death-time-mismatch'))
check('missing domain settlement event is rejected',
  validateDeathSettlementReferences(person, { ...refs, events: [deathEvent] })
    .includes('death-settlement-event-missing'))
check('missing domain settlement time is rejected',
  validateDeathSettlementReferences(person, {
    ...refs, eventTimes: new Map([[deathEvent, deathAt]]),
  }).includes('death-settlement-event-time-missing'))
check('settlement event before death is rejected',
  validateDeathSettlementReferences(person, {
    ...refs, eventTimes: new Map([
      [deathEvent, deathAt],
      [settlementEvent, { day: 8, period: '晨' }],
    ]),
  }).includes('death-settlement-before-death'))
check('living person cannot run death settlement validation',
  validateDeathSettlementReferences({ ...person, lifeState: 'alive' }, refs)
    .includes('death-settlement-person-alive'))
check('missing death record is rejected',
  validateDeathSettlementReferences({ ...person, death: field.notApplicable }, refs)
    .includes('death-settlement-record-missing'))
check('invalid runtime settlement status is rejected',
  validateDeathSettlementReferences({
    ...person,
    death: field.value({
      ...(deathRecord ?? { at: deathAt, causeEvent: deathEvent, estateSettlements: [] }),
      estateSettlements: (deathRecord?.estateSettlements ?? []).map((item, index) =>
        index === 0 ? { ...item, status: 'completed' as never } : item),
    }),
  }, refs).includes('death-settlement-invalid-status'))
check('settlement validation is read-only',
  deathRecord !== undefined
    && deathRecord.estateSettlements.every(item => item.status === 'pending'))

if (failed > 0) throw new Error(`Death settlement contract tests failed: ${failed}/${passed + failed}`)
console.log(`Death settlement contract tests: ${passed}/${passed + failed} passed`)
