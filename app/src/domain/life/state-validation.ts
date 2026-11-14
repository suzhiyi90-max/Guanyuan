import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId } from '../shared/ids'
import type { Person } from '../person/model'
import type { Visibility } from '../shared/visibility'
import type { LifeStateFact, LifeStateIssue, LifeStateValue } from './state'
export interface LifeStateReferences { readonly persons: readonly Person[]; readonly events: readonly EventId[]; readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime> }
const levels = ['public', 'contact', 'private', 'secret'] as const
function validVisibility(v: Visibility, persons: readonly Person[]): boolean { return (v.observer === 'player' || persons.some(p => p.id === v.observer)) && levels.includes(v.level) }
function validateValue(v: LifeStateValue): LifeStateIssue[] {
 const out: LifeStateIssue[]=[]
 if (v.kind==='qualitative' && !v.code.trim()) out.push('life-state-empty-value-code')
 if (v.kind==='classified') { if(!v.code.trim()) out.push('life-state-empty-value-code'); if(v.detail.kind==='value'&&!v.detail.value.trim()) out.push('life-state-empty-detail') }
 if (v.kind==='quantitative') { if(!Number.isFinite(v.value)) out.push('life-state-invalid-quantitative-value'); if(!v.scale.trim()) out.push('life-state-empty-scale'); if(v.unit.kind==='value'&&!v.unit.value.trim()) out.push('life-state-empty-unit') }
 return out
}
export function validateLifeStateFacts(facts: readonly LifeStateFact[], refs: LifeStateReferences): LifeStateIssue[] {
 const out: LifeStateIssue[]=[]; const byId=new Map(facts.map(f=>[f.id,f])); const ids=new Set<string>(); const replaced=new Set<string>()
 for(const f of facts) {
  if(ids.has(f.id)) out.push('life-state-duplicate-id'); ids.add(f.id)
  const p=refs.persons.find(x=>x.id===f.person)
  if(!p) out.push('life-state-person-missing')
  else {
   const scope=f.domain==='body'?p.stateDomains.body:p.stateDomains.mind
   if(f.scope!==scope) out.push('life-state-scope-mismatch')
   if(p.death.kind==='value'&&isValidWorldTime(f.at)&&isValidWorldTime(p.death.value.at)&&compareWorldTime(f.at,p.death.value.at)>0) out.push('life-state-after-death')
  }
  if(!refs.events.includes(f.sourceEvent)) out.push('life-state-event-missing')
  const at=refs.eventTimes.get(f.sourceEvent)
  if(!at||!isValidWorldTime(at)) out.push('life-state-event-time-missing')
  else if(!isValidWorldTime(f.at)||compareWorldTime(f.at,at)!==0) out.push('life-state-event-time-mismatch')
  if(!isValidWorldTime(f.at)) out.push('life-state-invalid-time')
  if(!f.dimension.trim()) out.push('life-state-empty-dimension')
  if(f.value.kind==='value') out.push(...validateValue(f.value.value))
  if(!validVisibility(f.visibility,refs.persons)) out.push('life-state-invalid-visibility')
  if(f.supersedes.kind==='value') {
   const prev=byId.get(f.supersedes.value)
   if(!prev) out.push('life-state-supersedes-missing')
   else {
    if(prev.id===f.id) out.push('life-state-supersedes-self')
    if(prev.person!==f.person) out.push('life-state-supersedes-person-mismatch')
    if(prev.domain!==f.domain) out.push('life-state-supersedes-domain-mismatch')
    if(prev.dimension!==f.dimension) out.push('life-state-supersedes-dimension-mismatch')
    if(prev.scope!==f.scope) out.push('life-state-supersedes-scope-mismatch')
    if(isValidWorldTime(prev.at)&&isValidWorldTime(f.at)&&compareWorldTime(f.at,prev.at)<=0) out.push('life-state-supersedes-time-not-later')
    if(replaced.has(prev.id)) out.push('life-state-supersedes-already-replaced'); replaced.add(prev.id)
   }
  }
 }
 return out
}
export function appendLifeStateFact(facts: readonly LifeStateFact[], fact: LifeStateFact, refs: LifeStateReferences): {readonly facts: readonly LifeStateFact[]; readonly issues: readonly LifeStateIssue[]} {
 const issues=[...new Set([...validateLifeStateFacts(facts,refs),...validateLifeStateFacts([...facts,fact],refs)])]
 return issues.length?{facts,issues}:{facts:[...facts,fact],issues:[]}
}
export function currentLifeStateFacts(facts: readonly LifeStateFact[]): readonly LifeStateFact[] {
 const superseded=new Set(facts.flatMap(f=>f.supersedes.kind==='value'?[f.supersedes.value]:[]))
 return facts.filter(f=>!superseded.has(f.id))
}