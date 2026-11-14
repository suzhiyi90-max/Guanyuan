import { brandedId, field } from './index'
import type { Person } from './person/model'
import type { LifeStateFact } from './life/state'
import { appendLifeStateFact, currentLifeStateFacts, validateLifeStateFacts } from './life/state-validation'
import type { EventId } from './shared/ids'
import type { LifeStateReferences } from './life/state-validation'
let passed=0, failed=0
function check(n:string,c:boolean){if(c)passed++;else{failed++;console.error('FAIL '+n)}}
const pid=brandedId<'PersonId'>('state-person'), body=brandedId<'BodyScopeRef'>('state-body'), mind=brandedId<'MindScopeRef'>('state-mind')
const e1=brandedId<'EventId'>('state-e1'),e2=brandedId<'EventId'>('state-e2'),e3=brandedId<'EventId'>('state-e3')
const p:Person={id:pid,displayName:'状态人物',birth:field.notApplicable,lifeState:'alive',archiveState:'active',death:field.notApplicable,capability:brandedId<'CapabilityRef'>('cap'),stateDomains:{body,mind,knowledge:brandedId<'KnowledgeScopeId'>('k'),goals:[],scheduleScope:brandedId<'ScheduleScopeId'>('s'),economy:brandedId<'EconomyScopeId'>('eco'),location:brandedId<'LocationStateRef'>('loc')},history:brandedId<'LifeHistoryRef'>('hist')}
const refs:LifeStateReferences={persons:[p],events:[e1,e2,e3],eventTimes:new Map<EventId,{day:number;period:'晨'|'午'|'暮'|'夜'}>([[e1,{day:1,period:'晨'}],[e2,{day:1,period:'午'}],[e3,{day:2,period:'晨'}]])}
const f1:LifeStateFact={id:brandedId<'LifeStateFactId'>('f1'),person:pid,domain:'body',scope:body,dimension:'fatigue',sourceEvent:e1,at:{day:1,period:'晨'},value:field.value({kind:'qualitative',code:'elevated'}),supersedes:field.notApplicable,visibility:{observer:'player',level:'private'}}
const f2:LifeStateFact={...f1,id:brandedId<'LifeStateFactId'>('f2'),sourceEvent:e2,at:{day:1,period:'午'},value:field.value({kind:'quantitative',value:12,scale:'fatigue-scale-v0',unit:field.value('point')}),supersedes:field.value(f1.id)}
const fm:LifeStateFact={...f1,id:brandedId<'LifeStateFactId'>('fm'),domain:'mind',scope:mind,dimension:'stress',sourceEvent:e3,at:{day:2,period:'晨'},value:field.value({kind:'classified',code:'under-pressure',detail:field.unknown})}
check('initial fact validates',validateLifeStateFacts([f1],refs).length===0)
check('append immutable',appendLifeStateFact([],f1,refs).facts.length===1)
const appended=appendLifeStateFact([f1],f2,refs)
check('revision preserves history',appended.issues.length===0&&appended.facts.length===2&&appended.facts[0]===f1)
check('current projection selects successor',currentLifeStateFacts(appended.facts).length===1&&currentLifeStateFacts(appended.facts)[0].id===f2.id)
check('body and mind scopes are independent',validateLifeStateFacts([f1,fm],refs).length===0)
check('cross-scope write rejected',validateLifeStateFacts([{...f1,scope:mind as never}],refs).includes('life-state-scope-mismatch'))
check('event timestamp mismatch rejected',validateLifeStateFacts([{...f1,at:{day:1,period:'午'}}],refs).includes('life-state-event-time-mismatch'))
check('non-finite quantitative value rejected',validateLifeStateFacts([{...f2,value:field.value({kind:'quantitative',value:Infinity,scale:'s',unit:field.notApplicable})}],refs).includes('life-state-invalid-quantitative-value'))
check('missing scale rejected',validateLifeStateFacts([{...f2,value:field.value({kind:'quantitative',value:1,scale:' ',unit:field.notApplicable})}],refs).includes('life-state-empty-scale'))
check('revision must be later',validateLifeStateFacts([f1,{...f2,at:{day:1,period:'晨'},sourceEvent:e1}],refs).includes('life-state-supersedes-time-not-later'))
check('revision cannot cross person',validateLifeStateFacts([f1,{...f2,person:brandedId<'PersonId'>('other')}],refs).includes('life-state-supersedes-person-mismatch'))
check('predecessor cannot be superseded twice',validateLifeStateFacts([f1,f2,{...f2,id:brandedId<'LifeStateFactId'>('f3'),sourceEvent:e3,at:{day:2,period:'晨'},supersedes:field.value(f1.id)}],refs).includes('life-state-supersedes-already-replaced'))
const failedAppend=appendLifeStateFact([f1],{...f2,at:{day:1,period:'晨'},sourceEvent:e1},refs)
check('failed append returns original collection',failedAppend.issues.length>0&&failedAppend.facts.length===1&&failedAppend.facts[0]===f1)
const dead:Person={...p,lifeState:'dead',death:field.value({at:{day:1,period:'午'},causeEvent:e2,estateSettlements:[]})}
check('post-death facts rejected',validateLifeStateFacts([{...fm,at:{day:2,period:'晨'}}],{...refs,persons:[dead]}).includes('life-state-after-death'))
check('death-time facts allowed',validateLifeStateFacts([{...f1,at:{day:1,period:'午'},sourceEvent:e2}],{...refs,persons:[dead]}).length===0)
check('unknown and n/a remain explicit',validateLifeStateFacts([{...f1,value:field.unknown},{...fm,value:field.notApplicable}],refs).length===0)
// @ts-expect-error raw strings cannot be used as LifeStateFactId
const bad:import('./shared/ids').LifeStateFactId='raw'
void bad
if(failed)throw new Error(`Life state tests failed: ${failed}/${passed+failed}`)
console.log(`Life state tests: ${passed}/${passed+failed} passed`)