import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { LifeStageFact } from './life/stage'
import {
  appendLifeStageFact,
  currentLifeStageFacts,
  validateLifeStageFacts,
} from './life/stage-validation'
import type { EventId } from './shared/ids'
import type { LifeStageReferences } from './life/stage-validation'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const personId = brandedId<'PersonId'>('stage-person')
const event1 = brandedId<'EventId'>('stage-event-1')
const event2 = brandedId<'EventId'>('stage-event-2')
const event3 = brandedId<'EventId'>('stage-event-3')
const person: Person = {
  id: personId, displayName: '阶段测试人物', birth: field.notApplicable,
  lifeState: 'alive', archiveState: 'active', death: field.notApplicable,
  capability: brandedId<'CapabilityRef'>('stage-capability'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('stage-body'),
    mind: brandedId<'MindScopeRef'>('stage-mind'),
    knowledge: brandedId<'KnowledgeScopeId'>('stage-knowledge'), goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('stage-schedule'),
    economy: brandedId<'EconomyScopeId'>('stage-economy'),
    location: brandedId<'LocationStateRef'>('stage-location'),
  },
  history: brandedId<'LifeHistoryRef'>('stage-history'),
}
const refs: LifeStageReferences = {
  persons: [person], events: [event1, event2, event3],
  eventTimes: new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
    [event1, { day: 1, period: '晨' }], [event2, { day: 1, period: '午' }],
    [event3, { day: 2, period: '晨' }],
  ]),
}
const first: LifeStageFact = {
  id: brandedId<'LifeStageFactId'>('stage-fact-1'), person: personId,
  track: 'education', code: 'studying', detail: field.unknown,
  sourceEvent: event1, at: { day: 1, period: '晨' },
  supersedes: field.notApplicable, visibility: { observer: 'player', level: 'private' },
}
const second: LifeStageFact = {
  ...first, id: brandedId<'LifeStageFactId'>('stage-fact-2'), code: 'exam-candidate',
  sourceEvent: event2, at: { day: 1, period: '午' }, supersedes: field.value(first.id),
}
const familyTrack: LifeStageFact = {
  ...first, id: brandedId<'LifeStageFactId'>('stage-family'), track: 'family',
  code: 'unmarried', sourceEvent: event3, at: { day: 2, period: '晨' },
}

check('root stage validates', validateLifeStageFacts([first], refs).length === 0)
check('independent tracks coexist', validateLifeStageFacts([first, familyTrack], refs).length === 0)
const appended = appendLifeStageFact([first], second, refs)
check('stage transition appends immutably', appended.issues.length === 0
  && appended.facts.length === 2 && appended.facts[0] === first)
check('current projection keeps successor', currentLifeStageFacts(appended.facts).length === 1
  && currentLifeStageFacts(appended.facts)[0].id === second.id)
check('empty track rejected', validateLifeStageFacts([{ ...first, track: ' ' }], refs)
  .includes('life-stage-empty-track'))
check('empty stage code rejected', validateLifeStageFacts([{ ...first, code: ' ' }], refs)
  .includes('life-stage-empty-code'))
check('event time mismatch rejected', validateLifeStageFacts([
  { ...first, at: { day: 1, period: '午' } },
], refs).includes('life-stage-event-time-mismatch'))
check('duplicate root in same track rejected', validateLifeStageFacts([
  first, { ...first, id: brandedId<'LifeStageFactId'>('stage-root-2'),
    sourceEvent: event2, at: { day: 1, period: '午' } },
], refs).includes('life-stage-track-root-duplicate'))
check('root must explicitly use n/a', validateLifeStageFacts([
  { ...first, supersedes: field.unknown },
], refs).includes('life-stage-root-must-be-not-applicable'))
check('transition must be later', validateLifeStageFacts([
  first, { ...second, at: { day: 1, period: '晨' }, sourceEvent: event1 },
], refs).includes('life-stage-supersedes-time-not-later'))
check('transition cannot cross tracks', validateLifeStageFacts([
  first, { ...second, track: 'family' },
], refs).includes('life-stage-supersedes-track-mismatch'))
check('transition cannot cross persons', validateLifeStageFacts([
  first, { ...second, person: brandedId<'PersonId'>('other-stage-person') },
], refs).includes('life-stage-supersedes-person-mismatch'))
check('predecessor cannot be replaced twice', validateLifeStageFacts([
  first, second, { ...second, id: brandedId<'LifeStageFactId'>('stage-fact-3'),
    sourceEvent: event3, at: { day: 2, period: '晨' }, supersedes: field.value(first.id) },
], refs).includes('life-stage-supersedes-already-replaced'))
const failedAppend = appendLifeStageFact([first], {
  ...second, at: { day: 1, period: '晨' }, sourceEvent: event1,
}, refs)
check('failed append preserves original collection', failedAppend.issues.length > 0
  && failedAppend.facts.length === 1 && failedAppend.facts[0] === first)
const bornPerson: Person = {
  ...person, birth: field.value({ day: 1, period: '晨' }),
}
check('stage before birth rejected', validateLifeStageFacts([
  first,
], { ...refs, persons: [{ ...bornPerson, birth: field.value({ day: 1, period: '午' }) }] })
  .includes('life-stage-before-birth'))
check('stage at birth time remains admissible', validateLifeStageFacts([
  first,
], { ...refs, persons: [bornPerson] }).length === 0)

const deceased: Person = {
  ...bornPerson, lifeState: 'dead',
  death: field.value({ at: { day: 1, period: '午' }, causeEvent: event2, estateSettlements: [] }),
}
check('post-death stage updates rejected', validateLifeStageFacts([
  { ...familyTrack, at: { day: 2, period: '晨' } },
], { ...refs, persons: [deceased] }).includes('life-stage-after-death'))
check('stage at death time remains admissible', validateLifeStageFacts([
  { ...first, sourceEvent: event2, at: { day: 1, period: '午' } },
], { ...refs, persons: [deceased] }).length === 0)
check('stage code does not require an age threshold', validateLifeStageFacts([
  { ...first, code: 'elder-care' },
], refs).length === 0)

if (failed > 0) throw new Error(`Life stage tests failed: ${failed}/${passed + failed}`)
console.log(`Life stage tests: ${passed}/${passed + failed} passed`)
