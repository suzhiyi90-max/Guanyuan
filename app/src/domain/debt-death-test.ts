import { brandedId, field, validateDebtPartySuccessions } from './index'
import type { Debt, DebtPartySuccession } from './economy/model'
import type { Person } from './person/model'
import type { EventId, PersonId } from './shared/ids'
import type { WorldTime } from './shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const creditor = brandedId<'PersonId'>('debt-death-creditor')
const debtor = brandedId<'PersonId'>('debt-death-debtor')
const heirA = brandedId<'PersonId'>('debt-death-heir-a')
const heirB = brandedId<'PersonId'>('debt-death-heir-b')
const deathEvent = brandedId<'EventId'>('debt-death-event')
const transferA = brandedId<'EventId'>('debt-transfer-a')
const transferB = brandedId<'EventId'>('debt-transfer-b')
const sourceEvent = brandedId<'EventId'>('debt-source-event')
const settlementEvent = brandedId<'EventId'>('debt-settlement-event')
const debtId = brandedId<'DebtId'>('debt-death-id')
const birthAt: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 8, period: '午' }
const transferAt: WorldTime = { day: 9, period: '晨' }

function makePerson(id: PersonId, lifeState: 'alive' | 'dead' = 'alive', deathAtValue?: WorldTime): Person {
  return {
    id, displayName: String(id), birth: field.value(birthAt), lifeState,
    archiveState: 'active',
    death: deathAtValue ? field.value({
      at: deathAtValue, causeEvent: deathEvent,
      estateSettlements: ['office','debt','asset','membership','relation','goal'].map(domain => ({
        domain: domain as 'office'|'debt'|'asset'|'membership'|'relation'|'goal',
        settlementEvent, status: 'pending' as const,
      })),
    }) : field.notApplicable,
    capability: brandedId<'CapabilityRef'>(`cap-${id}`),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>(`body-${id}`),
      mind: brandedId<'MindScopeRef'>(`mind-${id}`),
      knowledge: brandedId<'KnowledgeScopeId'>(`knowledge-${id}`),
      goals: [], scheduleScope: brandedId<'ScheduleScopeId'>(`schedule-${id}`),
      economy: brandedId<'EconomyScopeId'>(`economy-${id}`),
      location: brandedId<'LocationStateRef'>(`location-${id}`),
    },
    history: brandedId<'LifeHistoryRef'>(`history-${id}`),
  }
}
const deceasedCreditor = makePerson(creditor, 'dead', deathAt)
const deceasedDebtor = makePerson(debtor, 'dead', deathAt)
const livingA = makePerson(heirA)
const livingB = makePerson(heirB)
const debt: Debt = {
  id: debtId, creditor, debtor, principal: 120, kind: '借银',
  sourceEvent, status: 'open', settlements: [],
}
const eventTimes = new Map<EventId, WorldTime>([
  [deathEvent, deathAt], [sourceEvent, birthAt],
  [transferA, transferAt], [transferB, transferAt],
])
const refs = {
  persons: [deceasedCreditor, deceasedDebtor, livingA, livingB],
  organizations: [],
  events: [deathEvent, sourceEvent, transferA, transferB],
  eventTimes,
  revocations: [],
}
const succession = (
  id: string, role: 'creditor'|'debtor', deceased: PersonId, successor: PersonId,
  event: EventId, numerator=1, denominator=1,
): DebtPartySuccession => ({
  id: brandedId<'DebtPartySuccessionId'>(id), debt: debtId, role, deceased, successor,
  shareNumerator: numerator, shareDenominator: denominator,
  deathEvent, successionEvent: event,
})
const creditorTransfer = succession('creditor-successor-a','creditor',creditor,heirA,transferA)
const debtorTransfer = succession('debtor-successor-a','debtor',debtor,heirA,transferA)

check('explicit creditor claim succession is valid',
  validateDebtPartySuccessions([debt],[creditorTransfer],refs).length===0)
check('explicit debtor liability assumption is valid',
  validateDebtPartySuccessions([debt],[debtorTransfer],refs).length===0)
check('creditor death does not get confused with debtor position',
  validateDebtPartySuccessions([debt],[succession('wrong-role','debtor',creditor,heirA,transferA)],refs)
    .includes('debt-succession-party-role-mismatch'))
check('debtor death does not get confused with creditor position',
  validateDebtPartySuccessions([debt],[succession('wrong-role-2','creditor',debtor,heirA,transferA)],refs)
    .includes('debt-succession-party-role-mismatch'))
check('deceased party must have a death record',
  validateDebtPartySuccessions([debt],[succession('missing-death','debtor',debtor,heirA,transferA)],
    {...refs,persons:[deceasedCreditor,livingA]}).includes('debt-succession-deceased-missing'))
check('living party cannot be declared deceased',
  validateDebtPartySuccessions([debt],[succession('living-deceased','debtor',debtor,heirA,transferA)],
    {...refs,persons:[deceasedCreditor,livingA,makePerson(debtor)]}).includes('debt-succession-deceased-not-dead'))
check('death event must match death record',
  validateDebtPartySuccessions([debt],[{...creditorTransfer,deathEvent:sourceEvent}],refs)
    .includes('debt-succession-death-event-mismatch'))
check('death event time must match death record',
  validateDebtPartySuccessions([debt],[creditorTransfer],{
    ...refs,eventTimes:new Map([...eventTimes,[deathEvent,{day:8,period:'晨'}]]),
  }).includes('debt-succession-death-time-mismatch'))
check('successor must exist uniquely',
  validateDebtPartySuccessions([debt],[creditorTransfer],{...refs,persons:[deceasedCreditor,deceasedDebtor]})
    .includes('debt-succession-successor-missing'))
check('successor must be alive at succession event',
  validateDebtPartySuccessions([debt],[creditorTransfer],{
    ...refs,persons:[deceasedCreditor,deceasedDebtor,makePerson(heirA,'dead',deathAt)],
  }).includes('debt-succession-successor-not-alive'))
check('succession event must exist',
  validateDebtPartySuccessions([debt],[{...creditorTransfer,successionEvent:brandedId<'EventId'>('missing')}],refs)
    .includes('debt-succession-event-missing'))
check('succession cannot predate death',
  validateDebtPartySuccessions([debt],[{...creditorTransfer,successionEvent:sourceEvent}],refs)
    .includes('debt-succession-before-death'))
check('self succession is rejected',
  validateDebtPartySuccessions([debt],[succession('self','debtor',debtor,debtor,transferA)],refs)
    .includes('debt-succession-self-transfer'))
check('shares may be split across multiple successors',
  validateDebtPartySuccessions([debt],[
    succession('split-a','creditor',creditor,heirA,transferA,1,2),
    succession('split-b','creditor',creditor,heirB,transferB,1,2),
  ],refs).length===0)
check('total allocated share cannot exceed one',
  validateDebtPartySuccessions([debt],[
    succession('over-a','debtor',debtor,heirA,transferA,2,3),
    succession('over-b','debtor',debtor,heirB,transferB,1,2),
  ],refs).includes('debt-succession-overallocated'))
check('share must be a positive valid fraction',
  validateDebtPartySuccessions([debt],[succession('bad-share','debtor',debtor,heirA,transferA,0,2)],refs)
    .includes('debt-succession-invalid-share'))
check('missing debt is rejected',
  validateDebtPartySuccessions([], [creditorTransfer], refs).includes('debt-succession-debt-missing'))
check('source debt is never rewritten by succession validation',
  debt.creditor===creditor && debt.debtor===debtor && debt.status==='open' && debt.settlements.length===0)
check('no succession record leaves debt obligations untouched',
  validateDebtPartySuccessions([debt],[],refs).length===0
    && debt.creditor===creditor && debt.debtor===debtor && debt.status==='open')

if (failed>0) throw new Error(`Debt death continuity tests failed: ${failed}/${passed+failed}`)
console.log(`Debt death continuity tests: ${passed}/${passed+failed} passed`)
