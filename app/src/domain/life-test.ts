import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { LifeDomainHook, LifeHistory, LifeHistoryEntry } from './life/model'
import { appendLifeHistoryEntry, validateLifeDomainHookSet, validateLifeHistory } from './life/validation'
import type { EventId } from './shared/ids'
import type { LifeReferences } from './life/validation'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const personId = brandedId<'PersonId'>('person-life-1')
const event1 = brandedId<'EventId'>('life-event-1')
const event2 = brandedId<'EventId'>('life-event-2')
const event3 = brandedId<'EventId'>('life-event-3')
const event4 = brandedId<'EventId'>('life-event-4')
const bodyScope = brandedId<'BodyScopeRef'>('body-life-1')
const mindScope = brandedId<'MindScopeRef'>('mind-life-1')
const historyRef = brandedId<'LifeHistoryRef'>('history-life-1')
const visibility = { observer: 'player' as const, level: 'private' as const }

const person: Person = {
  id: personId, displayName: '人物甲', birth: field.notApplicable,
  lifeState: 'alive', archiveState: 'active', death: field.notApplicable,
  capability: brandedId<'CapabilityRef'>('cap-life-1'),
  stateDomains: {
    body: bodyScope, mind: mindScope,
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge-life-1'),
    goals: [], scheduleScope: brandedId<'ScheduleScopeId'>('schedule-life-1'),
    economy: brandedId<'EconomyScopeId'>('economy-life-1'),
    location: brandedId<'LocationStateRef'>('location-life-1'),
  },
  history: historyRef,
}
const eventTimes = new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
  [event1, { day: 1, period: '晨' }],
  [event2, { day: 1, period: '午' }],
  [event3, { day: 2, period: '晨' }],
  [event4, { day: 1, period: '晨' }],
])
const refs: LifeReferences = { persons: [person], events: [event1, event2, event3, event4], eventTimes }

const first: LifeHistoryEntry = {
  id: brandedId<'LifeHistoryEntryId'>('history-entry-1'),
  event: event1, at: { day: 1, period: '晨' }, visibility,
}
const history: LifeHistory = { id: historyRef, person: personId, entries: [first] }
check('event-backed life history validates', validateLifeHistory(history, refs).length === 0)

const second: LifeHistoryEntry = {
  id: brandedId<'LifeHistoryEntryId'>('history-entry-2'),
  event: event2, at: { day: 1, period: '午' }, visibility,
}
const appended = appendLifeHistoryEntry(history, second, refs)
check('life history appends immutably', appended.issues.length === 0 && appended.history.entries.length === 2 && history.entries.length === 1)
const duplicateAppend = appendLifeHistoryEntry(history, first, refs)
check('duplicate event cannot be appended twice', duplicateAppend.issues.includes('life-history-event-duplicate') && duplicateAppend.history === history)
check('out-of-order event cannot be appended', appendLifeHistoryEntry(appended.history, {
  id: brandedId<'LifeHistoryEntryId'>('history-entry-old'), event: event4,
  at: { day: 1, period: '晨' }, visibility,
}, refs).issues.includes('life-history-order-reversed'))
check('history reference must match Person.history', validateLifeHistory({ ...history, id: brandedId<'LifeHistoryRef'>('wrong-history') }, refs).includes('life-history-reference-mismatch'))
check('history event reference must resolve', validateLifeHistory({
  ...history, entries: [{ ...first, event: brandedId<'EventId'>('missing-event') }],
}, refs).includes('life-history-event-missing'))
check('history timestamp must match source event', validateLifeHistory({
  ...history, entries: [{ ...first, at: { day: 1, period: '暮' } }],
}, refs).includes('life-history-event-time-mismatch'))
check('archived person keeps the same life history reference', validateLifeHistory(history, {
  ...refs, persons: [{ ...person, archiveState: 'archived' }],
}).length === 0)
const bornPerson: Person = { ...person, birth: field.value({ day: 1, period: '午' }) }
check('life history before birth is rejected', validateLifeHistory(history, {
  ...refs, persons: [bornPerson],
}).includes('life-history-before-birth'))
check('life history at exact birth time is allowed', validateLifeHistory({
  ...history, entries: [{ ...first, event: event2, at: { day: 1, period: '午' } }],
}, { ...refs, persons: [bornPerson] }).length === 0)
check('life history after death is rejected', validateLifeHistory({
  ...history, entries: [first, second],
}, { ...refs, persons: [{ ...person, lifeState: 'dead', death: field.value({
  at: { day: 1, period: '晨' }, causeEvent: event1, estateSettlements: [],
}) }] }).includes('life-history-after-death'))

const bodyHook: LifeDomainHook = {
  id: brandedId<'LifeDomainHookId'>('hook-body-1'), person: personId,
  domain: 'body', scope: bodyScope, sourceEvent: event2,
  at: { day: 1, period: '午' }, code: 'body-fatigue-updated', visibility,
}
const mindHook: LifeDomainHook = {
  id: brandedId<'LifeDomainHookId'>('hook-mind-1'), person: personId,
  domain: 'mind', scope: mindScope, sourceEvent: event3,
  at: { day: 2, period: '晨' }, code: 'mind-concern-recorded', visibility,
}
check('body and mind hooks bind their own scopes', validateLifeDomainHookSet([bodyHook, mindHook], refs).length === 0)
check('body hook cannot write into mind scope', validateLifeDomainHookSet([
  { ...bodyHook, scope: mindScope as never },
], refs).includes('life-hook-scope-mismatch'))
check('life hook requires a source event', validateLifeDomainHookSet([
  { ...bodyHook, sourceEvent: brandedId<'EventId'>('missing-event') },
], refs).includes('life-hook-event-missing'))
check('life hook code must be non-empty', validateLifeDomainHookSet([
  { ...bodyHook, code: ' ' },
], refs).includes('life-hook-empty-code'))
check('duplicate life hook IDs rejected', validateLifeDomainHookSet([
  bodyHook, { ...bodyHook },
], refs).includes('life-hook-duplicate-id'))
check('life hook before birth is rejected', validateLifeDomainHookSet([bodyHook], {
  ...refs, persons: [{ ...person, birth: field.value({ day: 1, period: '暮' }) }],
}).includes('life-hook-before-birth'))
check('life hook after death is rejected', validateLifeDomainHookSet([mindHook], {
  ...refs, persons: [{ ...person, lifeState: 'dead', death: field.value({
    at: { day: 1, period: '午' }, causeEvent: event2, estateSettlements: [],
  }) }],
}).includes('life-hook-after-death'))

// @ts-expect-error raw strings cannot be used as LifeHistoryEntryId
const invalidEntryId: import('./shared/ids').LifeHistoryEntryId = 'raw'
// @ts-expect-error raw strings cannot be used as LifeDomainHookId
const invalidHookId: import('./shared/ids').LifeDomainHookId = 'raw'
void invalidEntryId
void invalidHookId

if (failed > 0) throw new Error(`Life domain contract tests failed: ${failed}/${passed + failed}`)
console.log(`Life domain contract tests: ${passed}/${passed + failed} passed`)
