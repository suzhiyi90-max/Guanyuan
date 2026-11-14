import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { LifeStateFact } from './life/state'
import {
  appendLifeStateFact,
  currentLifeStateFacts,
  validateLifeStateFacts,
} from './life/state-validation'
import type { EventId } from './shared/ids'
import type { LifeStateReferences } from './life/state-validation'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const personId = brandedId<'PersonId'>('state-person')
const bodyScope = brandedId<'BodyScopeRef'>('state-body')
const mindScope = brandedId<'MindScopeRef'>('state-mind')
const event1 = brandedId<'EventId'>('state-event-1')
const event2 = brandedId<'EventId'>('state-event-2')
const event3 = brandedId<'EventId'>('state-event-3')

const person: Person = {
  id: personId,
  displayName: '状态测试人物',
  birth: field.notApplicable,
  lifeState: 'alive',
  archiveState: 'active',
  death: field.notApplicable,
  capability: brandedId<'CapabilityRef'>('state-capability'),
  stateDomains: {
    body: bodyScope,
    mind: mindScope,
    knowledge: brandedId<'KnowledgeScopeId'>('state-knowledge'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('state-schedule'),
    economy: brandedId<'EconomyScopeId'>('state-economy'),
    location: brandedId<'LocationStateRef'>('state-location'),
  },
  history: brandedId<'LifeHistoryRef'>('state-history'),
}

const refs: LifeStateReferences = {
  persons: [person],
  events: [event1, event2, event3],
  eventTimes: new Map<EventId, { day: number; period: '晨' | '午' | '暮' | '夜' }>([
    [event1, { day: 1, period: '晨' }],
    [event2, { day: 1, period: '午' }],
    [event3, { day: 2, period: '晨' }],
  ]),
}

const first: LifeStateFact = {
  id: brandedId<'LifeStateFactId'>('state-fact-1'),
  person: personId,
  domain: 'body',
  scope: bodyScope,
  dimension: 'fatigue',
  sourceEvent: event1,
  at: { day: 1, period: '晨' },
  value: field.value({ kind: 'qualitative', code: 'elevated' }),
  supersedes: field.notApplicable,
  visibility: { observer: 'player', level: 'private' },
}

const second: LifeStateFact = {
  ...first,
  id: brandedId<'LifeStateFactId'>('state-fact-2'),
  sourceEvent: event2,
  at: { day: 1, period: '午' },
  value: field.value({
    kind: 'quantitative',
    value: 12,
    scale: 'fatigue-scale-v0',
    unit: field.value('point'),
  }),
  supersedes: field.value(first.id),
}

const mind: LifeStateFact = {
  ...first,
  id: brandedId<'LifeStateFactId'>('state-mind-fact'),
  domain: 'mind',
  scope: mindScope,
  dimension: 'stress',
  sourceEvent: event3,
  at: { day: 2, period: '晨' },
  value: field.value({
    kind: 'classified',
    code: 'under-pressure',
    detail: field.unknown,
  }),
}

check('initial fact validates', validateLifeStateFacts([first], refs).length === 0)
check('append is immutable', appendLifeStateFact([], first, refs).facts.length === 1)

const appended = appendLifeStateFact([first], second, refs)
check('revision preserves predecessor', appended.issues.length === 0
  && appended.facts.length === 2 && appended.facts[0] === first)
check('current projection returns successor', currentLifeStateFacts(appended.facts).length === 1
  && currentLifeStateFacts(appended.facts)[0].id === second.id)
check('body and mind use separate scopes', validateLifeStateFacts([first, mind], refs).length === 0)
check('cross-scope write is rejected', validateLifeStateFacts([
  { ...first, scope: mindScope as never },
], refs).includes('life-state-scope-mismatch'))
check('event time mismatch is rejected', validateLifeStateFacts([
  { ...first, at: { day: 1, period: '午' } },
], refs).includes('life-state-event-time-mismatch'))
check('non-finite quantitative value is rejected', validateLifeStateFacts([
  { ...second, value: field.value({
    kind: 'quantitative', value: Number.POSITIVE_INFINITY, scale: 'scale', unit: field.notApplicable,
  }) },
], refs).includes('life-state-invalid-quantitative-value'))
check('quantitative value requires a scale', validateLifeStateFacts([
  { ...second, value: field.value({
    kind: 'quantitative', value: 1, scale: ' ', unit: field.notApplicable,
  }) },
], refs).includes('life-state-empty-scale'))
check('revision must be later than predecessor', validateLifeStateFacts([
  first, { ...second, at: { day: 1, period: '晨' }, sourceEvent: event1 },
], refs).includes('life-state-supersedes-time-not-later'))
check('revision cannot cross persons', validateLifeStateFacts([
  first, { ...second, person: brandedId<'PersonId'>('other-person') },
], refs).includes('life-state-supersedes-person-mismatch'))
check('predecessor cannot be superseded twice', validateLifeStateFacts([
  first,
  second,
  {
    ...second,
    id: brandedId<'LifeStateFactId'>('state-fact-3'),
    sourceEvent: event3,
    at: { day: 2, period: '晨' },
    supersedes: field.value(first.id),
  },
], refs).includes('life-state-supersedes-already-replaced'))
check('duplicate roots for one dimension are rejected', validateLifeStateFacts([
  first,
  {
    ...first,
    id: brandedId<'LifeStateFactId'>('state-root-2'),
    sourceEvent: event2,
    at: { day: 1, period: '午' },
  },
], refs).includes('life-state-dimension-root-duplicate'))
check('root must explicitly use n/a', validateLifeStateFacts([
  { ...first, supersedes: field.unknown },
], refs).includes('life-state-root-must-be-not-applicable'))

const failedAppend = appendLifeStateFact([first], {
  ...second,
  at: { day: 1, period: '晨' },
  sourceEvent: event1,
}, refs)
check('failed append returns original collection', failedAppend.issues.length > 0
  && failedAppend.facts.length === 1 && failedAppend.facts[0] === first)

const deceased: Person = {
  ...person,
  lifeState: 'dead',
  death: field.value({
    at: { day: 1, period: '午' },
    causeEvent: event2,
    estateSettlements: [],
  }),
}
const bornPerson: Person = { ...person, birth: field.value({ day: 1, period: '午' }) }
check('pre-birth state facts are rejected', validateLifeStateFacts([first], {
  ...refs, persons: [bornPerson],
}).includes('life-state-before-birth'))
check('state fact at exact birth time is allowed', validateLifeStateFacts([{
  ...first, at: { day: 1, period: '午' }, sourceEvent: event2,
}], { ...refs, persons: [bornPerson] }).length === 0)
check('post-death facts are rejected', validateLifeStateFacts([
  { ...mind, at: { day: 2, period: '晨' } },
], { ...refs, persons: [deceased] }).includes('life-state-after-death'))
check('facts at death time remain admissible', validateLifeStateFacts([
  { ...first, at: { day: 1, period: '午' }, sourceEvent: event2 },
], { ...refs, persons: [deceased] }).length === 0)
check('unknown and n/a values remain explicit', validateLifeStateFacts([
  { ...first, value: field.unknown },
  { ...mind, value: field.notApplicable },
], refs).length === 0)

// @ts-expect-error raw strings cannot be used as LifeStateFactId
const invalidFactId: import('./shared/ids').LifeStateFactId = 'raw'
void invalidFactId

if (failed > 0) throw new Error(`Life state tests failed: ${failed}/${passed + failed}`)
console.log(`Life state tests: ${passed}/${passed + failed} passed`)
