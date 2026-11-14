import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId } from '../shared/ids'
import type { Person } from '../person/model'
import type { Visibility } from '../shared/visibility'
import type { LifeStateFact, LifeStateIssue, LifeStateValue } from './state'
export interface LifeStateReferences {readonly persons:readonly Person[];readonly events:readonly EventId[];readonly eventTimes:ReadonlyMap<EventId,import('../shared/world-time').WorldTime>}
const levels=['public','contact','private','secret'] as const
function validVisibility(v:Visibility,ps:readonly Person[]):boolean{return(v.observer==='player'||ps.some(p=>p.id===v.observer))&&levels.includes(v.level)}
function validateValue(v:LifeStateValue):LifeStateIssue[]{const o:LifeStateIssue[]=[];if(v.kind==='qualitative'&&!v.code.trim())o.push('life-state-empty-value-code');if(v.kind==='classified'){if(!v.code.trim())o.push('life-state-empty-value-code');if(v.detail.kind==='value'&&!v.detail.value.trim())o.push('life-state-empty-detail')}if(v.kind==='quantitative'){if(!Number.isFinite(v.value))o.push('life-state-invalid-quantitative-value');if(!v.scale.trim())o.push('life-state-empty-scale');if(v.unit.kind==='value'&&!v.unit.value.trim())o.push('life-state-empty-unit')}return o}
function dimensionKey(f:LifeStateFact):string{return JSON.stringify([f.person,f.domain,f.scope,f.dimension])}
export function validateLifeStateFacts(fs:readonly LifeStateFact[],r:LifeStateReferences):LifeStateIssue[]{
 const o:LifeStateIssue[]=[],byId=new Map(fs.map(f=>[f.id,f])),ids=new Set<string>(),replaced=new Set<string>(),roots=new Set<string>()
 for(const f of fs){
  if(ids.has(f.id))o.push('life-state-duplicate-id');ids.add(f.id)
  if(f.supersedes.kind==='n/a'){const k=dimensionKey(f);if(roots.has(k))o.push('life-state-dimension-root-duplicate');roots.add(k)}
  else if(f.supersedes.kind!=='value')o.push('life-state-root-must-be-not-applicable')
  const p=r.persons.find(x=>x.id===f.person)
  if(!p)o.push('life-state-person-missing');else{const s=f.domain==='body'?p.stateDomains.body:p.stateDomains.mind;if(f.scope!==s)o.push('life-state-scope-mismatch');if(p.death.kind==='value'&&isValidWorldTime(f.at)&&isValidWorldTime(p.death.value.at)&&compareWorldTime(f.at,p.death.value.at)>0)o.push('life-state-after-death')}
  if(!r.events.includes(f.sourceEvent))o.push('life-state-event-missing')
  const at=r.eventTimes.get(f.sourceEvent);if(!at||!isValidWorldTime(at))o.push('life-state-event-time-missing');else if(!isValidWorldTime(f.at)||compareWorldTime(f.at,at)!==0)o.push('life-state-event-time-mismatch')
  if(!isValidWorldTime(f.at))o.push('life-state-invalid-time');if(!f.dimension.trim())o.push('life-state-empty-dimension')
  if(f.value.kind==='value')o.push(...validateValue(f.value.value));if(!validVisibility(f.visibility,r.persons))o.push('life-state-invalid-visibility')
  if(f.supersedes.kind==='value'){const prev=byId.get(f.supersedes.value);if(!prev)o.push('life-state-supersedes-missing');else{
   if(prev.id===f.id)o.push('life-state-supersedes-self');if(prev.person!==f.person)o.push('life-state-supersedes-person-mismatch')
   if(prev.domain!==f.domain)o.push('life-state-supersedes-domain-mismatch');if(prev.dimension!==f.dimension)o.push('life-state-supersedes-dimension-mismatch')
   if(prev.scope!==f.scope)o.push('life-state-supersedes-scope-mismatch')
   if(isValidWorldTime(prev.at)&&isValidWorldTime(f.at)&&compareWorldTime(f.at,prev.at)<=0)o.push('life-state-supersedes-time-not-later')
   if(replaced.has(prev.id))o.push('life-state-supersedes-already-replaced');replaced.add(prev.id)
  }}
 }
 return o
}
export function appendLifeStateFact(fs:readonly LifeStateFact[],f:LifeStateFact,r:LifeStateReferences):{readonly facts:readonly LifeStateFact[];readonly issues:readonly LifeStateIssue[]}{
 const issues=[...new Set([...validateLifeStateFacts(fs,r),...validateLifeStateFacts([...fs,f],r)])]
 return issues.length?{facts:fs,issues}:{facts:[...fs,f],issues:[]}
}
export function currentLifeStateFacts(fs:readonly LifeStateFact[]):readonly LifeStateFact[]{const gone=new Set(fs.flatMap(f=>f.supersedes.kind==='value'?[f.supersedes.value]:[]));return fs.filter(f=>!gone.has(f.id))}
