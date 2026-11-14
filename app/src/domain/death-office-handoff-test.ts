import { brandedId, field, validateDeathOfficeAppointmentClosure } from './index'
import type { Appointment, Person } from './index'
import type { EventId } from './shared/ids'
import type { WorldTime } from './shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const personId = brandedId<'PersonId'>('death-office-person')
const officeId = brandedId<'OfficeId'>('death-office-office')
const deathEvent = brandedId<'EventId'>('death-office-death')
const priorEndEvent = brandedId<'EventId'>('death-office-prior-end')
const wrongEndEvent = brandedId<'EventId'>('death-office-wrong-end')
const deathAt: WorldTime = { day: 8, period: '午' }
const priorEndAt: WorldTime = { day: 7, period: '暮' }
const person: Person = {
  id: personId,
  displayName: '死亡任职交接测试人物',
  birth: field.notApplicable,
  lifeState: 'dead',
  archiveState: 'active',
  death: field.value({ at: deathAt, causeEvent: deathEvent, estateSettlements: [
    { domain: 'office', settlementEvent: deathEvent, status: 'pending' },
    { domain: 'debt', settlementEvent: deathEvent, status: 'pending' },
    { domain: 'asset', settlementEvent: deathEvent, status: 'pending' },
    { domain: 'membership', settlementEvent: deathEvent, status: 'pending' },
    { domain: 'relation', settlementEvent: deathEvent, status: 'pending' },
    { domain: 'goal', settlementEvent: deathEvent, status: 'pending' },
  ] }),
  capability: brandedId<'CapabilityRef'>('death-office-capability'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('death-office-body'),
    mind: brandedId<'MindScopeRef'>('death-office-mind'),
    knowledge: brandedId<'KnowledgeScopeId'>('death-office-knowledge'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('death-office-schedule'),
    economy: brandedId<'EconomyScopeId'>('death-office-economy'),
    location: brandedId<'LocationStateRef'>('death-office-location'),
  },
  history: brandedId<'LifeHistoryRef'>('death-office-history'),
}
const appointment: Appointment = {
  id: brandedId<'AppointmentId'>('death-office-appointment'),
  office: officeId,
  person: personId,
  from: { day: 2, period: '晨' },
  to: field.value(deathAt),
  endedBy: field.value(deathEvent),
}
const refs = {
  events: [deathEvent, priorEndEvent, wrongEndEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt],
    [priorEndEvent, priorEndAt],
    [wrongEndEvent, deathAt],
  ]),
}
check('appointment closed by the death event at the death instant passes',
  validateDeathOfficeAppointmentClosure(person, [appointment], refs).length === 0)
check('no appointment history is a valid no-office case',
  validateDeathOfficeAppointmentClosure(person, [], refs).length === 0)
check('appointment still open at death is rejected',
  validateDeathOfficeAppointmentClosure(person, [{ ...appointment, to: field.notApplicable, endedBy: field.notApplicable }], refs)
    .includes('death-office-appointment-open-at-death'))
check('appointment ending after death is rejected',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, to: field.value({ day: 9, period: '晨' }),
    endedBy: field.value(wrongEndEvent),
  }], refs).includes('death-office-appointment-ends-after-death'))
check('appointment beginning at death is rejected',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, from: deathAt, to: field.value({ day: 9, period: '晨' }),
    endedBy: field.value(wrongEndEvent),
  }], refs).includes('death-office-appointment-starts-at-or-after-death'))
check('death-time closure must cite the death event',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, endedBy: field.value(wrongEndEvent),
  }], refs).includes('death-office-appointment-end-event-not-death-event'))
check('missing closure event is rejected',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, endedBy: field.value(brandedId<'EventId'>('missing-event')),
  }], refs).includes('death-office-appointment-end-event-missing'))
check('closure event time must match appointment end',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, to: field.value(priorEndAt), endedBy: field.value(wrongEndEvent),
  }], refs).includes('death-office-appointment-end-event-time-mismatch'))
check('prior appointment end before death remains valid',
  validateDeathOfficeAppointmentClosure(person, [{
    ...appointment, to: field.value(priorEndAt), endedBy: field.value(priorEndEvent),
  }], refs).length === 0)
check('living person cannot be validated as deceased office handoff',
  validateDeathOfficeAppointmentClosure({ ...person, lifeState: 'alive' }, [appointment], refs)
    .includes('death-office-person-alive'))
check('missing death record is rejected',
  validateDeathOfficeAppointmentClosure({ ...person, death: field.notApplicable }, [appointment], refs)
    .includes('death-office-record-missing'))
check('closure validation is read-only',
  appointment.to.kind === 'value' && appointment.to.value === deathAt
    && appointment.endedBy.kind === 'value' && appointment.endedBy.value === deathEvent)

if (failed > 0) throw new Error(`Death office handoff tests failed: ${failed}/${passed + failed}`)
console.log(`Death office handoff tests: ${passed}/${passed + failed} passed`)
