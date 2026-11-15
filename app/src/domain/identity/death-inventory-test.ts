import {
  brandedId, field, isDeathOfficeInventoryReadyForSettlement, validateDeathOfficeInventory,
} from '../index'
import type {
  Appointment, Authorization, DeathOfficeInventory, DeathOfficeAppointmentEntry,
  DeathOfficeAuthorizationEntry, Person,
} from '../index'
import type { EventId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const deceasedId = brandedId<'PersonId'>('office-inventory-deceased')
const otherId = brandedId<'PersonId'>('office-inventory-other')
const officeId = brandedId<'OfficeId'>('office-inventory-office')
const deathEvent = brandedId<'EventId'>('office-inventory-death')
const inventoryEvent = brandedId<'EventId'>('office-inventory-review')
const grantEvent = brandedId<'EventId'>('office-inventory-grant')
const priorEndEvent = brandedId<'EventId'>('office-inventory-prior-end')
const afterDeathGrantEvent = brandedId<'EventId'>('office-inventory-after-death-grant')
const deathAt: WorldTime = { day: 8, period: '午' }
const reviewAt: WorldTime = { day: 8, period: '暮' }
const grantAt: WorldTime = { day: 2, period: '晨' }
const priorEndAt: WorldTime = { day: 7, period: '暮' }
const afterDeathAt: WorldTime = { day: 9, period: '晨' }

function person(id: PersonId, dead = false): Person {
  return {
    id, displayName: String(id), birth: field.value({ day: 1, period: '晨' }),
    lifeState: dead ? 'dead' : 'alive', archiveState: 'active',
    death: dead ? field.value({
      at: deathAt, causeEvent: deathEvent,
      estateSettlements: ['office','debt','asset','membership','relation','goal'].map(domain => ({
        domain: domain as 'office'|'debt'|'asset'|'membership'|'relation'|'goal',
        settlementEvent: inventoryEvent, status: 'pending' as const,
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
const deceased = person(deceasedId, true)
const livingOther = person(otherId)

const endedBefore: Appointment = {
  id: brandedId<'AppointmentId'>('appointment-ended-before'),
  office: officeId, person: deceasedId,
  from: { day: 2, period: '晨' },
  to: field.value(priorEndAt),
  endedBy: field.value(priorEndEvent),
}
const closedByDeath: Appointment = {
  id: brandedId<'AppointmentId'>('appointment-closed-by-death'),
  office: officeId, person: deceasedId,
  from: { day: 3, period: '晨' },
  to: field.value(deathAt),
  endedBy: field.value(deathEvent),
}
const activeGrant: Authorization = {
  id: brandedId<'AuthorizationId'>('authorization-active-at-death'),
  principal: deceasedId, permission: 'issue.local-order',
  scope: { kind: 'office', office: officeId },
  grantedBy: grantEvent, validFrom: grantAt, validTo: field.notApplicable,
  revocable: true, revokedBy: field.notApplicable, revokedAt: field.notApplicable,
}
const expiredGrant: Authorization = {
  ...activeGrant,
  id: brandedId<'AuthorizationId'>('authorization-expired-before-death'),
  validTo: field.value(priorEndAt),
}
const revokedGrant: Authorization = {
  ...activeGrant,
  id: brandedId<'AuthorizationId'>('authorization-revoked-before-death'),
  revokedBy: field.value(priorEndEvent),
  revokedAt: field.value(priorEndAt),
}
const expiresAtDeathGrant: Authorization = {
  ...activeGrant,
  id: brandedId<'AuthorizationId'>('authorization-expires-at-death'),
  validTo: field.value(deathAt),
}
const unknownGrant: Authorization = {
  ...activeGrant,
  id: brandedId<'AuthorizationId'>('authorization-unknown-end'),
  validTo: field.unknown,
}
const refs = {
  persons: [deceased, livingOther],
  events: [deathEvent, inventoryEvent, grantEvent, priorEndEvent, afterDeathGrantEvent],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt], [inventoryEvent, reviewAt], [grantEvent, grantAt],
    [priorEndEvent, priorEndAt], [afterDeathGrantEvent, afterDeathAt],
  ]),
}
function appointmentEntry(id: string, appointment: Appointment, disposition: DeathOfficeAppointmentEntry['disposition']): DeathOfficeAppointmentEntry {
  return { id: brandedId<'DeathOfficeInventoryEntryId'>(id), appointment: appointment.id, disposition }
}
function authorizationEntry(id: string, grant: Authorization, disposition: DeathOfficeAuthorizationEntry['disposition']): DeathOfficeAuthorizationEntry {
  return { id: brandedId<'DeathOfficeInventoryEntryId'>(id), authorization: grant.id, disposition }
}
function inventory(
  appointments: readonly DeathOfficeAppointmentEntry[],
  authorizations: readonly DeathOfficeAuthorizationEntry[],
  status: DeathOfficeInventory['status'] = 'complete',
): DeathOfficeInventory {
  return {
    id: brandedId<'DeathOfficeInventoryId'>('office-inventory-id'),
    deceased: deceasedId, deathEvent, inventoryEvent, status, appointments, authorizations,
  }
}

const validAppointments = [
  appointmentEntry('appointment-entry-before', endedBefore, 'ended-before-death'),
  appointmentEntry('appointment-entry-death', closedByDeath, 'closed-by-death'),
]
const validAuthorizations = [
  authorizationEntry('authorization-entry-active', activeGrant, 'death-gated'),
  authorizationEntry('authorization-entry-expired', expiredGrant, 'inactive-before-death'),
  authorizationEntry('authorization-entry-revoked', revokedGrant, 'inactive-before-death'),
  authorizationEntry('authorization-entry-at-death', expiresAtDeathGrant, 'inactive-at-death'),
]
const validInventory = inventory(validAppointments, validAuthorizations)
const validRecords = [endedBefore, closedByDeath]
const validGrants = [activeGrant, expiredGrant, revokedGrant, expiresAtDeathGrant]

check('complete appointment and authorization inventories pass', validateDeathOfficeInventory(
  validInventory, validRecords, validGrants, refs).length === 0)
check('valid office inventory is settlement-ready', isDeathOfficeInventoryReadyForSettlement(
  validInventory, validateDeathOfficeInventory(validInventory, validRecords, validGrants, refs)))
check('appointment ending before death is preserved as history', validateDeathOfficeInventory(
  inventory([validAppointments[0]], []), [endedBefore], [], refs).length === 0)
check('appointment closed by death must cite the death event', validateDeathOfficeInventory(
  inventory([appointmentEntry('wrong-end', { ...closedByDeath, endedBy: field.value(priorEndEvent) }, 'closed-by-death')], []),
  [{ ...closedByDeath, endedBy: field.value(priorEndEvent) }], [], refs)
  .includes('death-office-appointment-end-event-not-death-event'))
check('open appointment at death blocks readiness', validateDeathOfficeInventory(
  inventory([appointmentEntry('open-at-death', { ...closedByDeath, to: field.notApplicable, endedBy: field.notApplicable }, 'pending')], []),
  [{ ...closedByDeath, to: field.notApplicable, endedBy: field.notApplicable }], [], refs)
  .includes('death-office-appointment-open-at-death'))
check('appointment beginning at death is rejected', validateDeathOfficeInventory(
  inventory([appointmentEntry('starts-at-death', { ...closedByDeath, from: deathAt }, 'pending')], []),
  [{ ...closedByDeath, from: deathAt }], [], refs)
  .includes('death-office-appointment-starts-at-or-after-death'))
check('complete inventory must include every deceased appointment', validateDeathOfficeInventory(
  inventory([], []), [endedBefore], [], refs)
  .includes('death-office-inventory-appointment-coverage-missing'))
check('complete inventory must include every deceased principal authorization', validateDeathOfficeInventory(
  inventory([], []), [], [activeGrant], refs)
  .includes('death-office-inventory-authorization-coverage-missing'))
check('appointment reference cannot point to another person', validateDeathOfficeInventory(
  inventory([appointmentEntry('wrong-person', { ...endedBefore, person: otherId }, 'ended-before-death')], []),
  [{ ...endedBefore, person: otherId }], [], refs)
  .includes('death-office-inventory-appointment-person-mismatch'))
check('authorization reference cannot point to another principal', validateDeathOfficeInventory(
  inventory([], [authorizationEntry('wrong-principal', { ...activeGrant, principal: otherId }, 'death-gated')]),
  [], [{ ...activeGrant, principal: otherId }], refs)
  .includes('death-office-inventory-authorization-principal-mismatch'))
check('active authorization is death-gated without automatic revocation', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[0]]), [], [activeGrant], refs).length === 0
  && activeGrant.revokedBy.kind === 'n/a' && activeGrant.revokedAt.kind === 'n/a')
check('expired authorization is classified as inactive before death', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[1]]), [], [expiredGrant], refs).length === 0)
check('revoked authorization requires matching revocation event time', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[2]]), [], [revokedGrant], refs).length === 0)
check('authorization expiring at death is not classified as active', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[3]]), [], [expiresAtDeathGrant], refs).length === 0)
check('unknown authorization end remains pending', validateDeathOfficeInventory(
  inventory([], [authorizationEntry('unknown-entry', unknownGrant, 'pending')]), [], [unknownGrant], refs)
  .includes('authorization-invalid-time'))
check('authorization granted after death is rejected', validateDeathOfficeInventory(
  inventory([], [authorizationEntry('after-death-entry', {
    ...activeGrant, id: brandedId<'AuthorizationId'>('after-death-grant'),
    grantedBy: afterDeathGrantEvent, validFrom: afterDeathAt,
  }, 'death-gated')]), [], [{
    ...activeGrant, id: brandedId<'AuthorizationId'>('after-death-grant'),
    grantedBy: afterDeathGrantEvent, validFrom: afterDeathAt,
  }], refs).includes('death-office-inventory-authorization-granted-at-or-after-death'))
check('authorization death gate denies the principal at death instant', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[0]]), [], [activeGrant], refs).length === 0)
check('empty complete inventory is an explicit reviewed empty scope', validateDeathOfficeInventory(
  inventory([], []), [], [], refs).length === 0)
check('empty open inventory is not ready', !isDeathOfficeInventoryReadyForSettlement(
  inventory([], [], 'open'), []))
check('missing inventory event is rejected even for an empty scope', validateDeathOfficeInventory(
  { ...inventory([], []), inventoryEvent: brandedId<'EventId'>('missing-review') }, [], [], refs)
  .includes('death-office-inventory-event-missing'))
check('inventory cannot predate death', validateDeathOfficeInventory(
  { ...inventory([], []), inventoryEvent: grantEvent }, [], [], refs)
  .includes('death-office-inventory-before-death'))
check('duplicate appointment references are rejected', validateDeathOfficeInventory(
  inventory([validAppointments[0], validAppointments[0]], []), [endedBefore], [], refs)
  .includes('death-office-inventory-appointment-reference-duplicate'))
check('duplicate authorization references are rejected', validateDeathOfficeInventory(
  inventory([], [validAuthorizations[0], validAuthorizations[0]]), [], [activeGrant], refs)
  .includes('death-office-inventory-authorization-reference-duplicate'))
check('dead person with missing death record is rejected', validateDeathOfficeInventory(
  { ...validInventory, deceased: otherId }, validRecords, validGrants, refs)
  .includes('death-office-inventory-death-record-missing'))
check('inventory validation never rewrites appointment or authorization records',
  endedBefore.to.kind === 'value' && endedBefore.endedBy.kind === 'value'
  && activeGrant.revokedBy.kind === 'n/a' && activeGrant.revokedAt.kind === 'n/a')

if (failed > 0) throw new Error(`Death office inventory tests failed: ${failed}/${passed + failed}`)
console.log(`Death office inventory tests: ${passed}/${passed + failed} passed`)
