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
import type { Organization } from '../../domain/relations/model'
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

export type PersonCreationData = Omit<Person, 'lifeState' | 'archiveState' | 'death'>
export type IdentityAssignmentCreationData = Omit<IdentityAssignment, 'validFrom' | 'validTo' | 'sourceEvent'>
export type AuthorizationGrantData = Omit<Authorization,
  'grantedBy' | 'validFrom' | 'validTo' | 'revokedBy' | 'revokedAt'>

export interface WorldDomainEventPayloadMap {
  readonly 'world.initialized': WorldBootstrapMetadata
  readonly 'person.created': { readonly person: PersonCreationData; readonly origin: PersonOrigin }
  readonly 'organization.registered': { readonly organization: Organization }
  readonly 'identity.assignment.added': { readonly assignment: IdentityAssignmentCreationData }
  readonly 'authorization.granted': { readonly authorization: AuthorizationGrantData }
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

const schemas: ReadonlyArray<{ readonly kind: WorldDomainEventKind; readonly validate: EventSchemaValidator }> = [
  { kind: 'world.initialized', validate: isBootstrapMetadata },
  { kind: 'person.created', validate: isPersonCreationPayload },
  { kind: 'organization.registered', validate: isOrganizationPayload },
  { kind: 'identity.assignment.added', validate: isIdentityAssignmentPayload },
  { kind: 'authorization.granted', validate: isAuthorizationPayload },
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

/** Convert the typed payload envelope to the W3 JSON-only ledger contract. */
export function toLedgerEventInput<Kind extends WorldDomainEventKind>(
  input: WorldDomainEventInput<Kind>,
): LedgerEventInput<Kind> {
  return { ...input, payload: input.payload as unknown as JsonValue }
}
