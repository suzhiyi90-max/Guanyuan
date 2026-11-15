import type { JsonValue } from './event-ledger'

export type EventSchemaValidator = (payload: JsonValue) => boolean

export interface EventSchemaDefinition<Kind extends string = string> {
  readonly kind: Kind
  readonly schemaVersion: number
  readonly validate: EventSchemaValidator
}

export interface RegisteredEventSchema<Kind extends string = string> extends EventSchemaDefinition<Kind> {
  readonly registryId: string
  readonly registryVersion: string
}

export interface EventRegistry<Kind extends string = string> {
  readonly registryId: string
  readonly registryVersion: string
  readonly frozen: boolean
  readonly schemas: readonly RegisteredEventSchema<Kind>[]
}

export interface EventSchemaRef<Kind extends string = string> {
  readonly registryId: string
  readonly registryVersion: string
  readonly kind: Kind
  readonly schemaVersion: number
}

export type RegisterEventSchemaResult<Kind extends string = string> =
  | { readonly status: 'registered'; readonly registry: EventRegistry<Kind>; readonly schema: RegisteredEventSchema<Kind> }
  | { readonly status: 'duplicate-kind'; readonly registry: EventRegistry<Kind> }
  | { readonly status: 'registry-frozen'; readonly registry: EventRegistry<Kind> }
  | { readonly status: 'invalid-definition'; readonly registry: EventRegistry<Kind> }

export type FreezeEventRegistryResult<Kind extends string = string> =
  | { readonly status: 'frozen'; readonly registry: EventRegistry<Kind> }
  | { readonly status: 'already-frozen'; readonly registry: EventRegistry<Kind> }
  | { readonly status: 'invalid-registry'; readonly registry: EventRegistry<Kind> }

export type EventSchemaValidationResult<Kind extends string = string> =
  | { readonly status: 'valid'; readonly schemaRef: EventSchemaRef<Kind> }
  | { readonly status: 'invalid-registry' }
  | { readonly status: 'registry-not-frozen' }
  | { readonly status: 'schema-not-found' }
  | { readonly status: 'payload-invalid'; readonly schemaRef: EventSchemaRef<Kind> }
  | { readonly status: 'validator-threw'; readonly schemaRef: EventSchemaRef<Kind> }

/**
 * A registry is a versioned schema catalogue. It is mutable only by replacing
 * the immutable registry value before freeze; a frozen registry is a read-only
 * validation authority. New definitions require a new registry version.
 */
export function createEventRegistry<Kind extends string = string>(
  registryId: string,
  registryVersion: string,
): EventRegistry<Kind> {
  if (!registryId.trim() || !registryVersion.trim()) throw new Error('event-registry-identity-empty')
  return Object.freeze({
    registryId,
    registryVersion,
    frozen: false,
    schemas: Object.freeze([]) as readonly RegisteredEventSchema<Kind>[],
  })
}

function isValidRegistry<Kind extends string>(registry: EventRegistry<Kind>): boolean {
  if (registry === null || typeof registry !== 'object') return false
  if (typeof registry.registryId !== 'string' || !registry.registryId.trim()
    || typeof registry.registryVersion !== 'string' || !registry.registryVersion.trim()
    || typeof registry.frozen !== 'boolean'
    || !Array.isArray(registry.schemas)) return false
  const kinds = new Set<string>()
  for (const schema of registry.schemas) {
    if (schema === null || typeof schema !== 'object'
      || typeof schema.kind !== 'string' || !schema.kind.trim()
      || !Number.isInteger(schema.schemaVersion) || schema.schemaVersion < 1
      || schema.registryId !== registry.registryId
      || schema.registryVersion !== registry.registryVersion
      || typeof schema.validate !== 'function'
      || kinds.has(schema.kind)) return false
    kinds.add(schema.kind)
  }
  return true
}

export function registerEventSchema<Kind extends string>(
  registry: EventRegistry<Kind>,
  definition: EventSchemaDefinition<Kind>,
): RegisterEventSchemaResult<Kind> {
  if (!isValidRegistry(registry)) return { status: 'invalid-definition', registry }
  if (registry.frozen) return { status: 'registry-frozen', registry }
  if (definition === null || typeof definition !== 'object'
    || typeof definition.kind !== 'string'
    || !definition.kind.trim()
    || !Number.isInteger(definition.schemaVersion)
    || definition.schemaVersion < 1
    || typeof definition.validate !== 'function') {
    return { status: 'invalid-definition', registry }
  }
  if (registry.schemas.some(schema => schema.kind === definition.kind)) {
    return { status: 'duplicate-kind', registry }
  }
  const schema: RegisteredEventSchema<Kind> = Object.freeze({
    registryId: registry.registryId,
    registryVersion: registry.registryVersion,
    kind: definition.kind,
    schemaVersion: definition.schemaVersion,
    validate: definition.validate,
  })
  const next: EventRegistry<Kind> = Object.freeze({
    registryId: registry.registryId,
    registryVersion: registry.registryVersion,
    frozen: false,
    schemas: Object.freeze([...registry.schemas, schema]),
  })
  return { status: 'registered', registry: next, schema }
}

export function freezeEventRegistry<Kind extends string>(
  registry: EventRegistry<Kind>,
): FreezeEventRegistryResult<Kind> {
  if (!isValidRegistry(registry)) return { status: 'invalid-registry', registry }
  if (registry.frozen) return { status: 'already-frozen', registry }
  return {
    status: 'frozen',
    registry: Object.freeze({
      registryId: registry.registryId,
      registryVersion: registry.registryVersion,
      frozen: true,
      schemas: Object.freeze([...registry.schemas]),
    }),
  }
}

export function validateEventPayload<Kind extends string>(
  registry: EventRegistry<Kind>,
  kind: Kind,
  payload: JsonValue,
): EventSchemaValidationResult<Kind> {
  if (!isValidRegistry(registry)) return { status: 'invalid-registry' }
  if (!registry.frozen) return { status: 'registry-not-frozen' }
  const schema = registry.schemas.find(item => item.kind === kind)
  if (!schema) return { status: 'schema-not-found' }
  const schemaRef: EventSchemaRef<Kind> = Object.freeze({
    registryId: schema.registryId,
    registryVersion: schema.registryVersion,
    kind: schema.kind,
    schemaVersion: schema.schemaVersion,
  })
  try {
    return schema.validate(payload)
      ? { status: 'valid', schemaRef }
      : { status: 'payload-invalid', schemaRef }
  } catch {
    return { status: 'validator-threw', schemaRef }
  }
}
