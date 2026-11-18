/**
 * W6-C — versioned production-world event catalogue.
 *
 * This is a new domain-event registry. It does not mutate the frozen preview
 * registry or alter W3 registry semantics.
 */
import type { JsonValue, LedgerEventInput, LedgerSource } from '../../domain/event-ledger'
import type { Person } from '../../domain/person/model'
import type { PersonOrigin } from '../../domain/person/provenance'
import type { IdentityAssignment, Authorization } from '../../domain/identity/model'
import type { Organization, Relation, RelationClaim, RelationEvidence, Membership, RelationLifecycleStatus } from '../../domain/relations/model'
import type { EntityRef, FailureKind, KnowledgeEntry, Message, MessagePropagation } from '../../domain/cognition/model'
import type { WorldBootstrapMetadata } from '../../domain/world/metadata'
import type { WorldBootstrapDescriptor } from './bootstrap'
import {
  createEventRegistry,
  freezeEventRegistry,
  registerEventSchema,
  validateEventPayload,
  type EventRegistry,
  type EventSchemaValidator,
  type EventSchemaValidationResult,
} from '../../domain/event-registry'
import type { WorldTime } from '../../domain/shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../../domain/shared/world-time'

export type WorldDomainEventKind =
  | 'world.initialized'
  | 'person.created'
  | 'organization.registered'
  | 'identity.assignment.added'
  | 'authorization.granted'
  | 'relation.created'
  | 'relation.claim.recorded'
  | 'relation.evidence.recorded'
  | 'knowledge.recorded'
  | 'message.sent'
  | 'message.stage.recorded'
  | 'message.failed'
  | 'message.propagated'
  | 'organization.membership.added'
  | 'organization.membership.ended'
  | 'relation.lifecycle.changed'

export type PersonCreationData = Omit<Person, 'lifeState' | 'archiveState' | 'death'>
export type IdentityAssignmentCreationData = Omit<IdentityAssignment, 'validFrom' | 'validTo' | 'sourceEvent'>
export type AuthorizationGrantData = Omit<Authorization,
  'grantedBy' | 'validFrom' | 'validTo' | 'revokedBy' | 'revokedAt'>
export type RelationCreationData = Pick<Relation, 'id' | 'from' | 'to' | 'type' | 'visibility'>
export type RelationClaimCreationData = Omit<RelationClaim, 'assertedAt' | 'sourceEvent'>
export type RelationEvidenceCreationData = Omit<RelationEvidence, 'sourceEvent'>
export type KnowledgeCreationData = Omit<KnowledgeEntry, 'sourceEvent' | 'acquiredAt'>
export type MessageCreationData = Pick<Message, 'id' | 'sender' | 'recipient' | 'channel' | 'contentRefs' | 'parentMessage' | 'distortion'>
export type MessageStage = 'delivered' | 'read' | 'understood' | 'replied'
export type MessagePropagationCreationData = Omit<MessagePropagation, 'propagatedAt'>
export type MembershipCreationData = Omit<Membership, 'validFrom' | 'validTo' | 'sourceEvent'>

export interface WorldDomainEventPayloadMap {
  readonly 'world.initialized': WorldBootstrapMetadata
  readonly 'person.created': { readonly person: PersonCreationData; readonly origin: PersonOrigin }
  readonly 'organization.registered': { readonly organization: Organization }
  readonly 'identity.assignment.added': { readonly assignment: IdentityAssignmentCreationData }
  readonly 'authorization.granted': { readonly authorization: AuthorizationGrantData }
  readonly 'relation.created': { readonly relation: RelationCreationData }
  readonly 'relation.claim.recorded': { readonly claim: RelationClaimCreationData }
  readonly 'relation.evidence.recorded': { readonly evidence: RelationEvidenceCreationData }
  readonly 'knowledge.recorded': { readonly entry: KnowledgeCreationData }
  readonly 'message.sent': { readonly message: MessageCreationData }
  readonly 'message.stage.recorded': { readonly messageId: string; readonly stage: MessageStage }
  readonly 'message.failed': { readonly messageId: string; readonly failureCode: string }
  readonly 'message.propagated': { readonly propagation: MessagePropagationCreationData }
  readonly 'organization.membership.added': { readonly membership: MembershipCreationData }
  readonly 'organization.membership.ended': { readonly membershipId: string }
  readonly 'relation.lifecycle.changed': { readonly relationId: string; readonly status: RelationLifecycleStatus }
}

export type WorldDomainEventInput<Kind extends WorldDomainEventKind = WorldDomainEventKind> =
  Omit<LedgerEventInput<Kind>, 'payload'> & { readonly payload: WorldDomainEventPayloadMap[Kind] }

type JsonRecord = { readonly [key: string]: JsonValue }

function isRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => allowed.has(key))
}

function isNonEmptyString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: JsonValue | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every(item => isNonEmptyString(item))
}

function isField<T extends JsonValue>(
  value: JsonValue | undefined,
  isValue: (value: JsonValue) => value is T,
): boolean {
  if (!value || !isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'value') {
    return hasExactKeys(value, ['kind', 'value']) && isValue(value.value)
  }
  return ['unknown', 'not-generated', 'n/a'].includes(value.kind)
    && hasExactKeys(value, ['kind'])
}

function isWorldTimeValue(value: JsonValue): value is JsonValue {
  return isValidWorldTime(value as unknown as WorldTime)
}

function isHistoricalMinisterAllowListEntry(value: JsonValue): boolean {
  if (!isRecord(value) || !hasExactKeys(value, [
    'personId', 'displayName', 'category', 'evidenceRefs', 'validFrom', 'validThrough', 'scope',
  ])) return false
  if (![value.personId, value.displayName].every(isNonEmptyString)
    || value.category !== 'famous-minister'
    || !isStringArray(value.evidenceRefs)
    || value.evidenceRefs.length === 0
    || !isWorldTimeValue(value.validFrom)
    || (value.validThrough !== null && (!isWorldTimeValue(value.validThrough)
      || compareWorldTime(value.validThrough as unknown as WorldTime, value.validFrom as unknown as WorldTime) < 0))
    || !isRecord(value.scope)
    || typeof value.scope.kind !== 'string') return false
  if (value.scope.kind === 'world') return hasExactKeys(value.scope, ['kind'])
  return value.scope.kind === 'location'
    && hasExactKeys(value.scope, ['kind', 'locationCode'])
    && isNonEmptyString(value.scope.locationCode)
}

function isBootstrapMetadata(value: JsonValue): value is JsonValue {
  if (!isRecord(value) || !hasExactKeys(value, [
    'scenarioPackId', 'rulesetVersion', 'contentPackVersion', 'seed',
    'seedFingerprint', 'locationCode', 'populationPolicyVersion', 'historicalNameAllowList',
  ])) return false
  if (![value.scenarioPackId, value.rulesetVersion, value.contentPackVersion,
    value.seedFingerprint, value.locationCode, value.populationPolicyVersion].every(isNonEmptyString)
    || !Array.isArray(value.historicalNameAllowList)
    || !value.historicalNameAllowList.every(isHistoricalMinisterAllowListEntry)) return false
  const ids = value.historicalNameAllowList.map(entry => (entry as JsonRecord).personId)
  const names = value.historicalNameAllowList.map(entry => (entry as JsonRecord).displayName)
  return new Set(ids).size === ids.length && new Set(names).size === names.length
}

function isPersonOrigin(value: JsonValue | undefined): boolean {
  if (!value || !isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'seeded-random') {
    return hasExactKeys(value, ['kind', 'candidateId', 'seedFingerprint', 'roleCode', 'populationTier'])
      && [value.candidateId, value.seedFingerprint, value.roleCode].every(isNonEmptyString)
      && ['county', 'grassroots', 'other'].includes(String(value.populationTier))
  }
  if (value.kind === 'historical-minister') {
    if (!hasExactKeys(value,
      ['kind', 'category', 'evidenceRefs', 'validFrom', 'validThrough', 'scope'])) return false
    if (value.category !== 'famous-minister' || !isStringArray(value.evidenceRefs)
      || value.evidenceRefs.length === 0 || !isWorldTimeValue(value.validFrom)) return false
    if (value.validThrough !== null && !isWorldTimeValue(value.validThrough)) return false
    if (!isRecord(value.scope) || typeof value.scope.kind !== 'string') return false
    if (value.scope.kind === 'world') return hasExactKeys(value.scope, ['kind'])
    return value.scope.kind === 'location'
      && hasExactKeys(value.scope, ['kind', 'locationCode'])
      && isNonEmptyString(value.scope.locationCode)
  }
  return value.kind === 'player-character' && hasExactKeys(value, ['kind'])
}

function isPersonCreationPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['person', 'origin']) || !isRecord(payload.person)) return false
  const person = payload.person
  if (!hasExactKeys(person,
    ['id', 'displayName', 'birth', 'capability', 'stateDomains', 'history'],
    ['fixture'])) return false
  if (![person.id, person.displayName, person.capability, person.history].every(isNonEmptyString)) return false
  if (!isField(person.birth, isWorldTimeValue)) return false
  if (person.fixture !== undefined && !isField(person.fixture, isNonEmptyString)) return false
  if (!isRecord(person.stateDomains)
    || !hasExactKeys(person.stateDomains, ['body', 'mind', 'knowledge', 'goals', 'scheduleScope', 'economy', 'location'])) {
    return false
  }
  const domains = person.stateDomains
  return [domains.body, domains.mind, domains.knowledge, domains.scheduleScope, domains.economy, domains.location]
    .every(isNonEmptyString)
    && isStringArray(domains.goals)
    && isPersonOrigin(payload.origin)
}

function isOrganizationPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['organization']) || !isRecord(payload.organization)) return false
  const organization = payload.organization
  return hasExactKeys(organization, ['id', 'type', 'name', 'purpose', 'region', 'rules'])
    && [organization.id, organization.type, organization.name, organization.purpose, organization.region].every(isNonEmptyString)
    && isStringArray(organization.rules)
}

function isVisibility(value: JsonValue | undefined): boolean {
  return !!value && isRecord(value)
    && hasExactKeys(value, ['observer', 'level'])
    && (value.observer === 'player' || isNonEmptyString(value.observer))
    && ['public', 'contact', 'private', 'secret'].includes(String(value.level))
}

function isIdentityAssignmentPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['assignment']) || !isRecord(payload.assignment)) return false
  const assignment = payload.assignment
  return hasExactKeys(assignment, ['id', 'person', 'axis', 'code', 'visibility', 'certainty'])
    && [assignment.id, assignment.person, assignment.code].every(isNonEmptyString)
    && ['institutional', 'social', 'family', 'organizational'].includes(String(assignment.axis))
    && ['confirmed', 'reported', 'suspected', 'unverified'].includes(String(assignment.certainty))
    && isVisibility(assignment.visibility)
}

function isAuthorizationScope(value: JsonValue | undefined): boolean {
  if (!value || !isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'world') return hasExactKeys(value, ['kind'])
  if (value.kind === 'institution') return hasExactKeys(value, ['kind', 'institution']) && isNonEmptyString(value.institution)
  if (value.kind === 'office') return hasExactKeys(value, ['kind', 'office']) && isNonEmptyString(value.office)
  if (value.kind === 'person') return hasExactKeys(value, ['kind', 'person']) && isNonEmptyString(value.person)
  return false
}

function isAuthorizationPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['authorization']) || !isRecord(payload.authorization)) return false
  const authorization = payload.authorization
  return hasExactKeys(authorization, ['id', 'principal', 'permission', 'scope', 'revocable'])
    && [authorization.id, authorization.principal, authorization.permission].every(isNonEmptyString)
    && typeof authorization.revocable === 'boolean'
    && isAuthorizationScope(authorization.scope)
}

function isRelationPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['relation']) || !isRecord(payload.relation)) return false
  const relation = payload.relation
  return hasExactKeys(relation, ['id', 'from', 'to', 'type', 'visibility'])
    && [relation.id, relation.from, relation.to, relation.type].every(isNonEmptyString)
    && isVisibility(relation.visibility)
}

function isRelationClaimPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['claim']) || !isRecord(payload.claim)) return false
  const claim = payload.claim
  return hasExactKeys(claim, ['id', 'relation', 'claimant', 'certainty'])
    && [claim.id, claim.relation].every(isNonEmptyString)
    && (claim.claimant === 'player' || isNonEmptyString(claim.claimant))
    && ['confirmed', 'reported', 'suspected', 'unverified'].includes(String(claim.certainty))
}

function isEvidenceReference(value: JsonValue | undefined): boolean {
  if (!value || !isRecord(value) || !hasExactKeys(value, ['kind', 'id']) || !isNonEmptyString(value.id)) {
    return false
  }
  return ['event', 'person', 'organization', 'document'].includes(String(value.kind))
}

function isRelationEvidencePayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['evidence']) || !isRecord(payload.evidence)) return false
  const evidence = payload.evidence
  return hasExactKeys(evidence, ['id', 'claim', 'evidence', 'weight'])
    && [evidence.id, evidence.claim].every(isNonEmptyString)
    && isEvidenceReference(evidence.evidence)
    && ['direct', 'corroborating', 'hearsay'].includes(String(evidence.weight))
}

function isEntityRef(value: JsonValue | undefined): value is JsonValue {
  return !!value && isRecord(value)
    && hasExactKeys(value, ['kind', 'id'])
    && isNonEmptyString(value.id)
    && ['person', 'relation', 'claim', 'office', 'org', 'asset', 'debt', 'event', 'knowledge', 'message']
      .includes(String(value.kind))
}

function isKnowledgePayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['entry']) || !isRecord(payload.entry)) return false
  const entry = payload.entry
  return hasExactKeys(entry, ['id', 'holder', 'subject', 'proposition', 'stance', 'secrecy'])
    && [entry.id, entry.holder, entry.proposition].every(isNonEmptyString)
    && isEntityRef(entry.subject)
    && ['known', 'believed', 'suspected', 'misunderstood'].includes(String(entry.stance))
    && ['public', 'private', 'secret'].includes(String(entry.secrecy))
}

function isMessagePayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['message']) || !isRecord(payload.message)) return false
  const message = payload.message
  return hasExactKeys(message, ['id', 'sender', 'recipient', 'channel', 'contentRefs', 'parentMessage', 'distortion'])
    && [message.id, message.sender, message.recipient, message.channel].every(isNonEmptyString)
    && Array.isArray(message.contentRefs)
    && message.contentRefs.every(isEntityRef)
    && isField(message.parentMessage, isNonEmptyString)
    && typeof message.distortion === 'number'
    && Number.isFinite(message.distortion)
    && message.distortion >= 0
    && message.distortion <= 1
}

function isMessageStagePayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['messageId', 'stage'])) return false
  return isNonEmptyString(payload.messageId)
    && ['delivered', 'read', 'understood', 'replied'].includes(String(payload.stage))
}

function isMessageFailurePayload(payload: JsonValue): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['messageId', 'failureCode'])
    && isNonEmptyString(payload.messageId) && isNonEmptyString(payload.failureCode)
}

function isMessagePropagationPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['propagation']) || !isRecord(payload.propagation)) return false
  const item = payload.propagation
  return hasExactKeys(item, [
    'id', 'message', 'fromHolder', 'toHolder', 'sourceKnowledge', 'resultingKnowledge',
  ])
    && [item.id, item.message, item.fromHolder, item.toHolder].every(isNonEmptyString)
    && isStringArray(item.sourceKnowledge) && item.sourceKnowledge.length > 0
    && isStringArray(item.resultingKnowledge) && item.resultingKnowledge.length > 0
}

function isMembershipPayload(payload: JsonValue): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['membership']) || !isRecord(payload.membership)) return false
  const item = payload.membership
  return hasExactKeys(item, ['id', 'organization', 'person', 'role', 'obligations'])
    && [item.id, item.organization, item.person, item.role].every(isNonEmptyString)
    && isStringArray(item.obligations)
}

function isMembershipEndPayload(payload: JsonValue): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['membershipId']) && isNonEmptyString(payload.membershipId)
}

function isRelationLifecyclePayload(payload: JsonValue): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['relationId', 'status'])
    && isNonEmptyString(payload.relationId)
    && ['active', 'dormant', 'severed'].includes(String(payload.status))
}

const schemas: ReadonlyArray<{ readonly kind: WorldDomainEventKind; readonly validate: EventSchemaValidator }> = [
  { kind: 'world.initialized', validate: isBootstrapMetadata },
  { kind: 'person.created', validate: isPersonCreationPayload },
  { kind: 'organization.registered', validate: isOrganizationPayload },
  { kind: 'identity.assignment.added', validate: isIdentityAssignmentPayload },
  { kind: 'authorization.granted', validate: isAuthorizationPayload },
  { kind: 'relation.created', validate: isRelationPayload },
  { kind: 'relation.claim.recorded', validate: isRelationClaimPayload },
  { kind: 'relation.evidence.recorded', validate: isRelationEvidencePayload },
  { kind: 'knowledge.recorded', validate: isKnowledgePayload },
  { kind: 'message.sent', validate: isMessagePayload },
  { kind: 'message.stage.recorded', validate: isMessageStagePayload },
  { kind: 'message.failed', validate: isMessageFailurePayload },
  { kind: 'message.propagated', validate: isMessagePropagationPayload },
  { kind: 'organization.membership.added', validate: isMembershipPayload },
  { kind: 'organization.membership.ended', validate: isMembershipEndPayload },
  { kind: 'relation.lifecycle.changed', validate: isRelationLifecyclePayload },
]

export function createWorldDomainEventRegistry(): EventRegistry<WorldDomainEventKind> {
  let registry = createEventRegistry<WorldDomainEventKind>('guanyuan.world-domain', '1.0.0')
  for (const schema of schemas) {
    const result = registerEventSchema(registry, {
      kind: schema.kind,
      schemaVersion: 1,
      validate: schema.validate,
    })
    if (result.status !== 'registered') throw new Error(`world-event-schema-register-failed:${schema.kind}:${result.status}`)
    registry = result.registry
  }
  const frozen = freezeEventRegistry(registry)
  if (frozen.status !== 'frozen') throw new Error(`world-event-registry-freeze-failed:${frozen.status}`)
  return frozen.registry
}

export function validateWorldDomainEventPayload<Kind extends WorldDomainEventKind>(
  registry: EventRegistry<WorldDomainEventKind>,
  kind: Kind,
  payload: JsonValue,
): EventSchemaValidationResult<WorldDomainEventKind> {
  return validateEventPayload(registry, kind, payload)
}

export function createWorldInitializationEventInput(
  descriptor: WorldBootstrapDescriptor,
  clientRequestId: string,
): WorldDomainEventInput<'world.initialized'> {
  return {
    source: 'rule',
    kind: 'world.initialized',
    intentKind: 'world.initialize',
    actor: 'system',
    requestWorldTime: descriptor.startedAt,
    clientRequestId,
    payload: {
      scenarioPackId: descriptor.scenarioPackId,
      rulesetVersion: descriptor.rulesetVersion,
      contentPackVersion: descriptor.contentPackVersion,
      seed: descriptor.seed,
      seedFingerprint: descriptor.seedFingerprint,
      locationCode: descriptor.locationCode,
      populationPolicyVersion: descriptor.populationPolicyVersion,
      historicalNameAllowList: descriptor.historicalNameAllowList,
    },
  }
}

export function createOrganizationRegisteredEventInput(
  organization: Organization,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'organization.registered'> {
  return {
    source: options.source,
    kind: 'organization.registered',
    intentKind: 'organization.register',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { organization },
  }
}

export function createPersonCreatedEventInput(
  person: PersonCreationData,
  origin: PersonOrigin,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'person.created'> {
  return {
    source: options.source,
    kind: 'person.created',
    intentKind: 'person.create',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { person, origin },
  }
}

export function createRelationCreatedEventInput(
  relation: RelationCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'relation.created'> {
  return {
    source: options.source,
    kind: 'relation.created',
    intentKind: 'relation.create',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { relation },
  }
}

export function createRelationClaimRecordedEventInput(
  claim: RelationClaimCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'relation.claim.recorded'> {
  return {
    source: options.source,
    kind: 'relation.claim.recorded',
    intentKind: 'relation.claim',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { claim },
  }
}

export function createRelationEvidenceRecordedEventInput(
  evidence: RelationEvidenceCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'relation.evidence.recorded'> {
  return {
    source: options.source,
    kind: 'relation.evidence.recorded',
    intentKind: 'relation.evidence.record',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { evidence },
  }
}

export function createKnowledgeRecordedEventInput(
  entry: KnowledgeCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'knowledge.recorded'> {
  return {
    source: options.source,
    kind: 'knowledge.recorded',
    intentKind: 'knowledge.record',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { entry },
  }
}

export function createMessageSentEventInput(
  message: MessageCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'message.sent'> {
  return {
    source: options.source,
    kind: 'message.sent',
    intentKind: 'message.send',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { message },
  }
}

export function createMessageStageRecordedEventInput(
  messageId: string,
  stage: MessageStage,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'message.stage.recorded'> {
  return {
    source: options.source,
    kind: 'message.stage.recorded',
    intentKind: 'message.stage',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { messageId, stage },
  }
}

export function createMessageFailureRecordedEventInput(
  messageId: string,
  failureCode: FailureKind,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'message.failed'> {
  return {
    source: options.source,
    kind: 'message.failed',
    intentKind: 'message.fail',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { messageId, failureCode },
  }
}

export function createMessagePropagationRecordedEventInput(
  propagation: MessagePropagationCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'message.propagated'> {
  return {
    source: options.source,
    kind: 'message.propagated',
    intentKind: 'message.propagate',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { propagation },
  }
}

export function createMembershipAddedEventInput(
  membership: MembershipCreationData,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'organization.membership.added'> {
  return {
    source: options.source,
    kind: 'organization.membership.added',
    intentKind: 'organization.membership.add',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { membership },
  }
}

export function createMembershipEndedEventInput(
  membershipId: string,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'organization.membership.ended'> {
  return {
    source: options.source,
    kind: 'organization.membership.ended',
    intentKind: 'organization.membership.end',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { membershipId },
  }
}

export function createRelationLifecycleChangedEventInput(
  relationId: string,
  status: RelationLifecycleStatus,
  options: {
    readonly actor: string
    readonly source: Extract<LedgerSource, 'player-command' | 'rule'>
    readonly requestWorldTime: WorldTime
    readonly clientRequestId: string
  },
): WorldDomainEventInput<'relation.lifecycle.changed'> {
  return {
    source: options.source,
    kind: 'relation.lifecycle.changed',
    intentKind: 'relation.lifecycle.change',
    actor: options.actor,
    requestWorldTime: options.requestWorldTime,
    clientRequestId: options.clientRequestId,
    payload: { relationId, status },
  }
}

/** Convert the typed payload envelope to the W3 JSON-only ledger contract. */
export function toLedgerEventInput<Kind extends WorldDomainEventKind>(
  input: WorldDomainEventInput<Kind>,
): LedgerEventInput<Kind> {
  return { ...input, payload: input.payload as unknown as JsonValue }
}
