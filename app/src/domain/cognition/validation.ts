import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type {
  EventId,
  KnowledgeId,
  MessageId,
  OrgId,
  PersonId,
  RelationClaimId,
  RelationId,
  OfficeId,
  AssetId,
  DebtId,
} from '../shared/ids'
import type { EntityRef, KnowledgeEntry, Message, MessagePropagation, CognitionIssue } from './model'

function duplicateIds<T>(items: readonly T[], getId: (item: T) => string): boolean {
  const seen = new Set<string>()
  for (const item of items) {
    const id = getId(item)
    if (seen.has(id)) return true
    seen.add(id)
  }
  return false
}

function hasId(ids: readonly string[], id: string): boolean {
  return ids.includes(id)
}

function validEntityRef(ref: EntityRef, known: {
  persons: readonly PersonId[]
  relations: readonly RelationId[]
  claims: readonly RelationClaimId[]
  offices: readonly OfficeId[]
  organizations: readonly OrgId[]
  assets: readonly AssetId[]
  debts: readonly DebtId[]
  events: readonly EventId[]
  knowledge: readonly KnowledgeId[]
  messages: readonly MessageId[]
}): boolean {
  switch (ref.kind) {
    case 'person': return hasId(known.persons, ref.id)
    case 'relation': return hasId(known.relations, ref.id)
    case 'claim': return hasId(known.claims, ref.id)
    case 'office': return hasId(known.offices, ref.id)
    case 'org': return hasId(known.organizations, ref.id)
    case 'asset': return hasId(known.assets, ref.id)
    case 'debt': return hasId(known.debts, ref.id)
    case 'event': return hasId(known.events, ref.id)
    case 'knowledge': return hasId(known.knowledge, ref.id)
    case 'message': return hasId(known.messages, ref.id)
  }
}

export interface CognitionReferences {
  persons: readonly PersonId[]
  relations: readonly RelationId[]
  claims: readonly RelationClaimId[]
  offices: readonly OfficeId[]
  organizations: readonly OrgId[]
  assets: readonly AssetId[]
  debts: readonly DebtId[]
  events: readonly EventId[]
  knowledge: readonly KnowledgeId[]
  messages: readonly MessageId[]
}

export function validateKnowledgeEntry(entry: KnowledgeEntry, refs: CognitionReferences): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  if (!refs.persons.includes(entry.holder)) issues.push('knowledge-holder-missing')
  if (!refs.events.includes(entry.sourceEvent)) issues.push('knowledge-source-event-missing')
  if (!entry.proposition.trim()) issues.push('knowledge-empty-proposition')
  if (!isValidWorldTime(entry.acquiredAt)) issues.push('knowledge-invalid-time')
  if (!['known', 'believed', 'suspected', 'misunderstood'].includes(entry.stance)) {
    issues.push('knowledge-invalid-stance')
  }
  if (!['public', 'private', 'secret'].includes(entry.secrecy)) issues.push('knowledge-invalid-secrecy')
  if (!validEntityRef(entry.subject, refs)) issues.push('knowledge-subject-missing')
  return issues
}

export function validateKnowledgeSet(entries: readonly KnowledgeEntry[], refs: CognitionReferences): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  if (duplicateIds(entries, item => item.id)) issues.push('knowledge-duplicate-id')
  for (const entry of entries) issues.push(...validateKnowledgeEntry(entry, refs))
  return issues
}

/** Belief must remain a KnowledgeEntry whose stance is believed or misunderstood. */
export function validateBelief(entry: KnowledgeEntry): CognitionIssue[] {
  return entry.stance === 'believed' || entry.stance === 'misunderstood'
    ? []
    : ['belief-invalid-stance']
}

/** Return only a holder's own B-layer entries; never mix NPC knowledge scopes. */
export function knowledgeForHolder(entries: readonly KnowledgeEntry[], holder: PersonId): readonly KnowledgeEntry[] {
  return entries.filter(entry => entry.holder === holder)
}

function validateMessageStages(message: Message): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  const stages = [
    message.deliveredAt,
    message.readAt,
    message.understoodAt,
    message.repliedAt,
  ] as const
  const times: Array<{ index: number; time: import('../shared/world-time').WorldTime }> = isValidWorldTime(message.sentAt)
    ? [{ index: -1, time: message.sentAt }]
    : []
  stages.forEach((stage, index) => {
    if (stage.kind === 'value') {
      if (!isValidWorldTime(stage.value)) issues.push('message-invalid-time')
      else times.push({ index, time: stage.value })
    }
  })
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i].kind === 'value' && stages.slice(0, i).some(prior => prior.kind !== 'value')) {
      issues.push('message-stage-prerequisite')
    }
  }
  for (let i = 1; i < times.length; i += 1) {
    if (compareWorldTime(times[i - 1].time, times[i].time) > 0) issues.push('message-stage-order')
  }
  if (message.failure.kind === 'value' && stages.some(stage => stage.kind === 'value')) {
    issues.push('message-failure-after-progress')
  }
  return issues
}

export function validateMessage(message: Message, refs: CognitionReferences): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  if (!message.channel.trim()) issues.push('message-empty-channel')
  if (message.failure.kind === 'value' && !message.failure.value.trim()) issues.push('message-invalid-failure-code')
  if (!refs.persons.includes(message.sender)) issues.push('message-sender-missing')
  if (!refs.persons.includes(message.recipient)) issues.push('message-recipient-missing')
  if (!isValidWorldTime(message.sentAt)) issues.push('message-invalid-time')
  if (!Number.isFinite(message.distortion) || message.distortion < 0 || message.distortion > 1) {
    issues.push('message-invalid-distortion')
  }
  if (message.parentMessage.kind === 'value' && !refs.messages.includes(message.parentMessage.value)) {
    issues.push('message-parent-missing')
  }
  for (const ref of message.contentRefs) {
    if (!validEntityRef(ref, refs)) issues.push('message-content-reference-missing')
  }
  issues.push(...validateMessageStages(message))
  return issues
}

export function validateMessageSet(messages: readonly Message[], refs: CognitionReferences): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  if (duplicateIds(messages, item => item.id)) issues.push('message-duplicate-id')
  for (const message of messages) issues.push(...validateMessage(message, refs))
  return issues
}

export function validateMessagePropagation(
  propagation: MessagePropagation,
  messages: readonly Message[],
  knowledge: readonly KnowledgeEntry[],
  personIds: readonly PersonId[],
): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  const message = messages.find(item => item.id === propagation.message)
  if (!message) issues.push('propagation-message-missing')
  if (!personIds.includes(propagation.fromHolder) || !personIds.includes(propagation.toHolder)) {
    issues.push('propagation-holder-missing')
  }
  if (propagation.fromHolder === propagation.toHolder) issues.push('propagation-self-transfer')
  if (propagation.sourceKnowledge.length === 0) issues.push('propagation-empty-source')
  if (propagation.resultingKnowledge.length === 0) issues.push('propagation-empty-result')
  if (!isValidWorldTime(propagation.propagatedAt)) issues.push('propagation-invalid-time')
  for (const id of propagation.sourceKnowledge) {
    const source = knowledge.find(item => item.id === id)
    if (!source) issues.push('propagation-source-knowledge-missing')
    else {
      if (source.holder !== propagation.fromHolder) issues.push('propagation-source-holder-mismatch')
      if (isValidWorldTime(source.acquiredAt) && isValidWorldTime(propagation.propagatedAt)
        && compareWorldTime(source.acquiredAt, propagation.propagatedAt) > 0) {
        issues.push('propagation-time-before-source')
      }
    }
  }
  for (const id of propagation.resultingKnowledge) {
    const result = knowledge.find(item => item.id === id)
    if (!result) issues.push('propagation-result-knowledge-missing')
    else {
      if (result.holder !== propagation.toHolder) issues.push('propagation-result-holder-mismatch')
      if (isValidWorldTime(result.acquiredAt) && isValidWorldTime(propagation.propagatedAt)
        && compareWorldTime(result.acquiredAt, propagation.propagatedAt) < 0) {
        issues.push('propagation-time-after-result')
      }
    }
  }
  if (message && message.sender !== propagation.fromHolder && message.recipient !== propagation.fromHolder) {
    issues.push('propagation-source-holder-mismatch')
  }
  if (message && isValidWorldTime(message.sentAt) && isValidWorldTime(propagation.propagatedAt)
    && compareWorldTime(propagation.propagatedAt, message.sentAt) < 0) {
    issues.push('propagation-time-before-message')
  }
  if (message && propagation.fromHolder === message.recipient) {
    if (message.deliveredAt.kind !== 'value' || message.readAt.kind !== 'value') {
      issues.push('propagation-recipient-not-read')
    } else if (isValidWorldTime(message.readAt.value) && isValidWorldTime(propagation.propagatedAt)
      && compareWorldTime(propagation.propagatedAt, message.readAt.value) < 0) {
      issues.push('propagation-time-before-message')
    }
  }
  return issues
}

export function validateMessagePropagationSet(
  items: readonly MessagePropagation[],
  messages: readonly Message[],
  knowledge: readonly KnowledgeEntry[],
  personIds: readonly PersonId[],
): CognitionIssue[] {
  const issues: CognitionIssue[] = []
  if (duplicateIds(items, item => item.id)) issues.push('propagation-duplicate-id')
  for (const item of items) issues.push(...validateMessagePropagation(item, messages, knowledge, personIds))
  return issues
}

/** Derived status is a view; it does not write back to the message or world. */
export function deriveMessageStatus(message: Message):
  | 'failed'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'understood'
  | 'replied' {
  if (message.failure.kind === 'value') return 'failed'
  if (message.repliedAt.kind === 'value') return 'replied'
  if (message.understoodAt.kind === 'value') return 'understood'
  if (message.readAt.kind === 'value') return 'read'
  if (message.deliveredAt.kind === 'value') return 'delivered'
  return 'sent'
}
