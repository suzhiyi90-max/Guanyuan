import { brandedId, field } from './index'
import {
  deriveMessageStatus,
  knowledgeForHolder,
  validateBelief,
  validateKnowledgeEntry,
  validateKnowledgeSet,
  validateMessage,
  validateMessagePropagation,
  validateMessagePropagationSet,
} from './cognition/validation'
import type { CognitionReferences } from './cognition/validation'
import type { KnowledgeEntry, Message, MessagePropagation } from './cognition/model'

let passed=0
let failed=0
function check(name:string, condition:boolean):void {
  if(condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const p1=brandedId<'PersonId'>('person-1')
const p2=brandedId<'PersonId'>('person-2')
const p3=brandedId<'PersonId'>('person-3')
const rel=brandedId<'RelationId'>('relation-1')
const event=brandedId<'EventId'>('event-1')
const knowledgeId=brandedId<'KnowledgeId'>('knowledge-1')
const messageId=brandedId<'MessageId'>('message-1')
const channel=brandedId<'ChannelRef'>('channel-letter')
const now={day:3,period:'午'} as const
const refs:CognitionReferences={
  persons:[p1,p2,p3],relations:[rel],claims:[],offices:[],organizations:[],
  assets:[],debts:[],events:[event],knowledge:[knowledgeId],messages:[messageId],
}
const entry:KnowledgeEntry={
  id:knowledgeId,holder:p1,subject:{kind:'relation',id:rel},
  proposition:'某人与某人为师生关系',stance:'believed',sourceEvent:event,
  acquiredAt:now,secrecy:'private',
}
check('valid holder-scoped knowledge accepted',validateKnowledgeEntry(entry,refs).length===0)
check('knowledge rejects missing holder',validateKnowledgeEntry({...entry,holder:brandedId<'PersonId'>('missing')},refs).includes('knowledge-holder-missing'))
check('knowledge rejects missing subject',validateKnowledgeEntry({...entry,subject:{kind:'person',id:brandedId<'PersonId'>('missing')}},refs).includes('knowledge-subject-missing'))
check('knowledge collection rejects duplicate IDs',validateKnowledgeSet([entry,entry],refs).includes('knowledge-duplicate-id'))
check('belief is constrained to believed or misunderstood',validateBelief(entry).length===0)
check('known fact cannot be reclassified as belief',validateBelief({...entry,stance:'known'}).includes('belief-invalid-stance'))
check("holder projection excludes other people's knowledge",knowledgeForHolder([entry,{...entry,id:brandedId<'KnowledgeId'>('knowledge-2'),holder:p2}],p1).length===1)

const message:Message={
  id:messageId,sender:p1,recipient:p2,channel,contentRefs:[{kind:'relation',id:rel}],
  sentAt:now,deliveredAt:field.value({day:3,period:'暮'}),
  readAt:field.value({day:3,period:'暮'}),understoodAt:field.unknown,
  repliedAt:field.unknown,failure:field.unknown,distortion:0.15,parentMessage:field.notApplicable,
}
check('valid message lifecycle accepted',validateMessage(message,refs).length===0)
check('message status is derived from milestones',deriveMessageStatus(message)==='read')
check('message rejects empty channel',validateMessage({...message,channel:' ' as never},refs).includes('message-empty-channel'))
check('message rejects invalid distortion',validateMessage({...message,distortion:1.2},refs).includes('message-invalid-distortion'))
check('message requires delivered before read',validateMessage({...message,deliveredAt:field.unknown},refs).includes('message-stage-prerequisite'))
check('message rejects reversed stage times',validateMessage({...message,readAt:field.value({day:3,period:'晨'})},refs).includes('message-stage-order'))
check('message delivery cannot precede send',validateMessage({...message,deliveredAt:field.value({day:3,period:'晨'})},refs).includes('message-stage-order'))
check('failed message cannot also be delivered',validateMessage({...message,failure:field.value('lost' as never)},refs).includes('message-failure-after-progress'))
check('message parent must resolve',validateMessage({...message,parentMessage:field.value(brandedId<'MessageId'>('missing'))},refs).includes('message-parent-missing'))

const propagation:MessagePropagation={
  id:brandedId<'MessagePropagationId'>('propagation-1'),message:messageId,
  fromHolder:p1,toHolder:p3,propagatedAt:{day:4,period:'晨'},
  sourceKnowledge:[knowledgeId],
  resultingKnowledge:[brandedId<'KnowledgeId'>('knowledge-3')],
}
const recipientKnowledge:KnowledgeEntry={...entry,id:brandedId<'KnowledgeId'>('knowledge-3'),holder:p3,sourceEvent:event}
check('valid knowledge propagation resolves both holder scopes',validateMessagePropagation(
  propagation,[message, {...message,id:brandedId<'MessageId'>('message-2'),recipient:p3}], [entry,recipientKnowledge],[p1,p2,p3],
).length===0)
check('propagation rejects source holder mismatch',validateMessagePropagation(
  {...propagation,fromHolder:p3,toHolder:p2},[message],[entry,recipientKnowledge],[p1,p2,p3],
).includes('propagation-source-holder-mismatch'))
check('propagation cannot predate its source knowledge',validateMessagePropagation(
  {...propagation,propagatedAt:{day:2,period:'晨'}},[message],[entry,recipientKnowledge],[p1,p2,p3],
).includes('propagation-time-before-source'))
check('propagation rejects missing message',validateMessagePropagation(
  {...propagation,message:brandedId<'MessageId'>('missing')},[],[entry,recipientKnowledge],[p1,p2,p3],
).includes('propagation-message-missing'))
check('propagation collection rejects duplicate IDs',validateMessagePropagationSet(
  [propagation,propagation],[message,{...message,id:brandedId<'MessageId'>('message-2'),recipient:p3}],
  [entry,recipientKnowledge],[p1,p2,p3],
).includes('propagation-duplicate-id'))

// @ts-expect-error raw strings cannot be used as KnowledgeId
const invalidKnowledgeId:import('./shared/ids').KnowledgeId='raw'
// @ts-expect-error raw strings cannot be used as MessageId
const invalidMessageId:import('./shared/ids').MessageId='raw'
void invalidKnowledgeId
void invalidMessageId

if(failed>0) throw new Error(`Cognition contract tests failed: ${failed}/${passed+failed}`)
console.log(`Cognition contract tests: ${passed}/${passed+failed} passed`)
