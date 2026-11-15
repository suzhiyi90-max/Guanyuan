import { brandedId, field } from '../index'
import type { EventId, MembershipDeathHandoffId, MembershipId, OrgId, PersonId } from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Membership } from './model'
import {
  validateMembershipDeathContinuity,
  validateMembershipDeathHandoffs,
} from './death-handoff'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error('FAIL ' + name) }
}

const deceasedId = brandedId<'PersonId'>('membership-death-deceased')
const successorId = brandedId<'PersonId'>('membership-death-successor')
const otherId = brandedId<'PersonId'>('membership-death-other')
const orgId = brandedId<'OrgId'>('membership-death-org')
const deathEvent = brandedId<'EventId'>('membership-death-event')
const sourceStart = brandedId<'EventId'>('membership-source-start')
const handoffEvent = brandedId<'EventId'>('membership-handoff-event')
const earlierEnd = brandedId<'EventId'>('membership-earlier-end')
const sourceMembershipId = brandedId<'MembershipId'>('membership-source')
const successorMembershipId = brandedId<'MembershipId'>('membership-successor')
const deathAt: WorldTime = { day: 8, period: '午' }
const startAt: WorldTime = { day: 1, period: '晨' }
const handoffAt: WorldTime = { day: 8, period: '暮' }
const refs = {
  events: [deathEvent, sourceStart, handoffEvent, earlierEnd],
  eventTimes: new Map<EventId, WorldTime>([
    [deathEvent, deathAt],
    [sourceStart, startAt],
    [handoffEvent, handoffAt],
    [earlierEnd, { day: 7, period: '暮' }],
  ]),
}
function makePerson(id: PersonId, lifeState: 'alive' | 'dead', death: Person['death']): Person {
  return {
    id, displayName: id, birth: field.notApplicable, lifeState, archiveState: 'active', death,
    capability: brandedId<'CapabilityRef'>('capability-' + id),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('body-' + id),
      mind: brandedId<'MindScopeRef'>('mind-' + id),
      knowledge: brandedId<'KnowledgeScopeId'>('knowledge-' + id),
      goals: [], scheduleScope: brandedId<'ScheduleScopeId'>('schedule-' + id),
      economy: brandedId<'EconomyScopeId'>('economy-' + id),
      location: brandedId<'LocationStateRef'>('location-' + id),
    },
    history: brandedId<'LifeHistoryRef'>('history-' + id),
  }
}
const deceased = makePerson(deceasedId, 'dead', field.value({
  at: deathAt, causeEvent: deathEvent, estateSettlements: [],
}))
const successor = makePerson(successorId, 'alive', field.notApplicable)
const other = makePerson(otherId, 'alive', field.notApplicable)
const source: Membership = {
  id: sourceMembershipId, organization: orgId, person: deceasedId, role: '会首',
  obligations: ['议事'], validFrom: sourceStart, validTo: deathEvent, sourceEvent: sourceStart,
}
const target: Membership = {
  id: successorMembershipId, organization: orgId, person: successorId, role: '新任账房',
  obligations: ['核账'], validFrom: handoffEvent, validTo: 'open', sourceEvent: handoffEvent,
}
const handoff = {
  id: brandedId<'MembershipDeathHandoffId'>('membership-handoff-1'),
  sourceMembership: sourceMembershipId, deceased: deceasedId, deathEvent,
  successorMembership: successorMembershipId, handoffEvent,
}
const people = [deceased, successor, other]

check('membership active at death closes on death event',
  validateMembershipDeathContinuity([source], people, refs).length === 0)
check('membership still open at death is rejected',
  validateMembershipDeathContinuity([{ ...source, validTo: 'open' }], people, refs)
    .includes('membership-death-membership-open-at-death'))
check('membership ending after death is rejected',
  validateMembershipDeathContinuity([{ ...source, validTo: handoffEvent }], people, refs)
    .includes('membership-death-membership-ends-after-death'))
check('membership ending at death must cite death event',
  validateMembershipDeathContinuity([{ ...source, validTo: earlierEnd }], people, {
    ...refs, eventTimes: new Map(refs.eventTimes).set(earlierEnd, deathAt),
  }).includes('membership-death-membership-end-not-death-event'))
check('membership ended before death remains historical',
  validateMembershipDeathContinuity([{ ...source, validTo: earlierEnd }], people, refs).length === 0)
check('membership beginning at death is rejected',
  validateMembershipDeathContinuity([{ ...source, validFrom: deathEvent }], people, refs)
    .includes('membership-death-membership-starts-at-or-after-death'))
check('missing death record is rejected',
  validateMembershipDeathContinuity([source], [makePerson(deceasedId, 'dead', field.notApplicable)], refs)
    .includes('membership-death-record-missing'))
check('missing death event time is rejected',
  validateMembershipDeathContinuity([source], people, {
    ...refs, eventTimes: new Map([[sourceStart, startAt]]),
  }).includes('membership-death-event-time-missing'))
check('death event time must match death record',
  validateMembershipDeathContinuity([source], people, {
    ...refs, eventTimes: new Map(refs.eventTimes).set(deathEvent, { day: 8, period: '暮' }),
  }).includes('membership-death-event-time-mismatch'))
check('living member is not death-closed',
  validateMembershipDeathContinuity([{ ...source, person: successorId, validTo: 'open' }], people, refs).length === 0)

check('explicit same-organization successor membership is accepted',
  validateMembershipDeathHandoffs([source, target], [handoff], people, refs).length === 0)
check('successor role and obligations are explicit, not copied from source',
  target.role === '新任账房' && target.obligations[0] === '核账'
    && source.role === '会首' && source.obligations[0] === '议事'
    && validateMembershipDeathHandoffs([source, target], [handoff], people, refs).length === 0)
check('source membership must belong to deceased',
  validateMembershipDeathHandoffs([{ ...source, person: otherId }, target], [handoff], people, refs)
    .includes('membership-death-source-person-mismatch'))
check('source membership must close at death',
  validateMembershipDeathHandoffs([{ ...source, validTo: 'open' }, target], [handoff], people, refs)
    .includes('membership-death-source-not-closed-by-death'))
check('successor must be in same organization',
  validateMembershipDeathHandoffs([source, { ...target, organization: brandedId<'OrgId'>('other-org') }], [handoff], people, refs)
    .includes('membership-death-successor-organization-mismatch'))
check('successor must be a distinct membership',
  validateMembershipDeathHandoffs([source], [{ ...handoff, successorMembership: sourceMembershipId }], people, refs)
    .includes('membership-death-successor-same-membership'))
check('successor membership must exist',
  validateMembershipDeathHandoffs([source], [handoff], people, refs)
    .includes('membership-death-successor-membership-missing'))
check('handoff event must exist',
  validateMembershipDeathHandoffs([source, target], [{ ...handoff, handoffEvent: brandedId<'EventId'>('missing') }], people, refs)
    .includes('membership-death-handoff-event-missing'))
check('handoff must occur strictly after death',
  validateMembershipDeathHandoffs([source, { ...target, validFrom: deathEvent }], [{
    ...handoff, handoffEvent: deathEvent, successorMembership: successorMembershipId,
  }], people, refs).includes('membership-death-handoff-before-death'))
check('successor membership start must match handoff event',
  validateMembershipDeathHandoffs([source, { ...target, validFrom: sourceStart }], [handoff], people, refs)
    .includes('membership-death-successor-start-mismatch'))
check('successor membership source event must be the explicit handoff',
  validateMembershipDeathHandoffs([source, { ...target, sourceEvent: sourceStart }], [handoff], people, refs)
    .includes('membership-death-successor-source-event-mismatch'))
check('ambiguous deceased person reference is rejected',
  validateMembershipDeathHandoffs([source, target], [handoff], [deceased, { ...deceased }, successor], refs)
    .includes('membership-death-person-ambiguous'))
check('handoff death event must match the death record',
  validateMembershipDeathHandoffs([source, target], [{ ...handoff, deathEvent: sourceStart }], people, refs)
    .includes('membership-death-event-mismatch'))
check('successor must be alive at handoff time',
  validateMembershipDeathHandoffs([source, { ...target, person: deceasedId }], [handoff], people, refs)
    .includes('membership-death-successor-person-not-alive'))
check('duplicate handoff IDs are rejected',
  validateMembershipDeathHandoffs([source, target], [handoff, handoff], people, refs)
    .includes('membership-death-handoff-duplicate-id'))
check('one source membership cannot be handed off twice',
  validateMembershipDeathHandoffs([source, target], [handoff, { ...handoff, id: brandedId<'MembershipDeathHandoffId'>('membership-handoff-2') }], people, refs)
    .includes('membership-death-handoff-duplicate-source'))
check('one target membership cannot be claimed by multiple handoffs',
  validateMembershipDeathHandoffs([source, target], [handoff, {
    ...handoff, id: brandedId<'MembershipDeathHandoffId'>('membership-handoff-2'),
    sourceMembership: brandedId<'MembershipId'>('second-source'),
  }], people, refs).includes('membership-death-handoff-duplicate-successor'))
check('organization record remains outside member death transition',
  source.organization === target.organization && source.organization === orgId)
check('handoff validation is read-only',
  source.validTo === deathEvent && target.validTo === 'open')

if (failed > 0) throw new Error('Membership death continuity tests failed: ' + failed + '/' + (passed + failed))
console.log('Membership death continuity contracts: ' + passed + '/' + (passed + failed) + ' passed')
