import {brandedId,field} from './index'
import type {Person} from './person/model'
import type {LifeStateFact} from './life/state'
import {appendLifeStateFact,currentLifeStateFacts,validateLifeStateFacts} from './life/state-validation'
import type {EventId} from './shared/ids'
import type {LifeStateReferences} from './life/state-validation'
let pass=0,fail=0;function check(n:string,v:boolean){if(v)pass++;else{fail++;console.error('FAIL '+n)}}
const pid=brandedId<'PersonId'>('p'),body=brandedId<'BodyScopeRef'>('b'),mind=brandedId<'MindScopeRef'>('m'),e1=brandedId<'EventId'>('e1'),e2=brandedId<'EventId'>('e2'),e3=brandedId<'EventId'>('e3')
const p:Person={id:pid,displayName:'p',birth:field.notApplicable,lifeState:'alive',archiveState:'active',death:field.notApplicable,capability:brandedId<'CapabilityRef'>('c'),stateDomains:{body,mind,knowledge:brandedId<'KnowledgeScopeId'>('k'),goals:[],scheduleScope:brandedId<'ScheduleScopeId'>('s'),economy:brandedId<'EconomyScopeId'>('ec'),location:brandedId<'LocationStateRef'>('l')},history:brandedId<'LifeHistoryRef'>('h')}
const refs:LifeStateReferences={persons:[p],events:[e1,e2,e3],eventTimes:new Map<EventId,{day:number;period:'晨'|'午'|'暮'|'夜'}>([[e1,{day:1,period:'晨'}],[e2,{day:1,period:'午'}],[e3,{day:2,period:'晨'}]])}
const a:LifeStateFact={id:brandedId<'LifeStateFactId'>('a'),person:pid,domain:'body',scope:body,dimension:'fatigue',sourceEvent:e1,at:{day:1,period:'晨'},value:field.value({kind:'qualitative',code:'high'}),supersedes:field.notApplicable,visibility:{observer:'player',level:'private'}}
const b:LifeStateFact={...a,id:brandedId<'LifeStateFactId'>('b'),sourceEvent:e2,at:{day:1,period:'午'},value:field.value({kind:'quantitative',value:12,scale:'fatigue-v0',unit:field.value('point')}),supersedes:field.value(a.id)}
const m:LifeStateFact={...a,id:brandedId<'LifeStateFactId'>('m'),domain:'mind',scope:mind,dimension:'stress',sourceEvent:e3,at:{day:2,period:'晨'},value:field.value({kind:'classified',code:'pressure',detail:field.unknown})}
check('initial fact validates',validateLifeStateFacts([a],refs).length===0)
check('append is immutable',appendLifeStateFact([],a,refs).facts.length===1)
const result=appendLifeStateFact([a],b,refs)
check('revision preserves predecessor',result.issues.length===0&&result.facts[0]===a&&result.facts.length===2)
check('current projection returns successor',currentLifeStateFacts(result.facts).length===1&&currentLifeStateFacts(result.facts)[0].id===b.id)
check('body and mind are separate scopes',validateLifeStateFacts([a,m],refs).length===0)
check('cross scope rejected',validateLifeStateFacts([{...a,scope:mind as never}],refs).includes('life-state-scope-mismatch'))
check('event time mismatch rejected',validateLifeStateFacts([{...a,at:{day:1,period:'午'}}],refs).includes('life-state-event-time-mismatch'))
check('nonfinite quantity rejected',validateLifeStateFacts([{...b,value:field.value({kind:'quantitative',value:Infinity,scale:'s',unit:field.notApplicable})}],refs).includes('life-state-invalid-quantitative-value'))
check('missing scale rejected',validateLifeStateFacts([{...b,value:field.value({kind:'quantitative',value:1,scale:' ',unit:field.notApplicable})}],refs).includes('life-state-empty-scale'))
check('revision must be later',validateLifeStateFacts([a,{...b,at:{day:1,period:'晨'},sourceEvent:e1}],refs).includes('life-state-supersedes-time-not-later'))
check('cross-person supersession rejected',validateLifeStateFacts([a,{...b,person:brandedId<'PersonId'>('other')}],refs).includes('life-state-supersedes-person-mismatch'))
check('a predecessor cannot be superseded twice',validateLifeStateFacts([a,b,{...b,id:brandedId<'LifeStateFactId'>('c'),sourceEvent:e3,at:{day:2,period:'晨'},supersedes:field.value(a.id)}],refs).includes('life-state-supersedes-already-replaced'))
check('duplicate roots for one dimension rejected',validateLifeStateFacts([a,{...a,id:brandedId<'LifeStateFactId'>('root2'),sourceEvent:e2,at:{day:1,period:'午'}}],refs).includes('life-state-dimension-root-duplicate'))
const failedAppend=appendLifeStateFact([a],{...b,at:{day:1,period:'晨'},sourceEvent:e1},refs)
check('failed append returns original collection',failedAppend.issues.length>0&&failedAppend.facts.length===1&&failedAppend.facts[0]===a)
const dead:Person={...p,lifeState:'dead',death:field.value({at:{day:1,period:'午'},causeEvent:e2,estateSettlements:[]})}
check('post-death facts rejected',validateLifeStateFacts([{...m,at:{day:2,period:'晨'}}],{...refs,persons:[dead]}).includes('life-state-after-death'))
check('death-time fact allowed',validateLifeStateFacts([{...a,at:{day:1,period:'午'},sourceEvent:e2}],{...refs,persons:[dead]}).length===0)
check('unknown and n/a explicit',validateLifeStateFacts([{...a,value:field.unknown},{...m,value:field.notApplicable}],refs).length===0)
// @ts-expect-error raw string cannot be LifeStateFactId
const bad:import('./shared/ids').LifeStateFactId='raw';void bad
if(fail)throw new Error(`Life state tests failed ${fail}/${pass+fail}`);console.log(`Life state tests ${pass}/${pass+fail}`)
