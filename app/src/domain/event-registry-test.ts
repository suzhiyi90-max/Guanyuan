import {
  createEventRegistry,
  freezeEventRegistry,
  registerEventSchema,
  validateEventPayload,
  type EventRegistry,
} from './event-registry'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

type Kind = 'person.created' | 'person.moved'
const personCreated = (payload: unknown): boolean => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return typeof value.displayName === 'string' && value.displayName.length > 0
}
const personMoved = (payload: unknown): boolean => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false
  return typeof (payload as Record<string, unknown>).place === 'string'
}

let registry: EventRegistry<Kind> = createEventRegistry<Kind>('world-events', '1.0.0')
check('new registry starts mutable and empty', !registry.frozen && registry.schemas.length === 0)

const first = registerEventSchema(registry, { kind: 'person.created', schemaVersion: 1, validate: personCreated })
check('schema registers with explicit schema and registry versions', first.status === 'registered'
  && first.schema.registryVersion === '1.0.0' && first.schema.schemaVersion === 1)
if (first.status === 'registered') registry = first.registry

const duplicate = registerEventSchema(registry, { kind: 'person.created', schemaVersion: 2, validate: personCreated })
check('duplicate kind is rejected without mutating registry', duplicate.status === 'duplicate-kind'
  && duplicate.registry === registry && registry.schemas.length === 1)

const second = registerEventSchema(registry, { kind: 'person.moved', schemaVersion: 1, validate: personMoved })
check('second distinct kind registers', second.status === 'registered')
if (second.status === 'registered') registry = second.registry

const oldSnapshot = registry
const frozen = freezeEventRegistry(registry)
check('freeze returns a frozen immutable registry snapshot', frozen.status === 'frozen'
  && frozen.registry.frozen && Object.isFrozen(frozen.registry) && Object.isFrozen(frozen.registry.schemas))
if (frozen.status === 'frozen') registry = frozen.registry

const frozenAgain = freezeEventRegistry(registry)
check('freeze is idempotent', frozenAgain.status === 'already-frozen' && frozenAgain.registry === registry)

const late = registerEventSchema(registry, { kind: 'person.created', schemaVersion: 2, validate: personCreated })
check('frozen registry rejects late registration', late.status === 'registry-frozen'
  && late.registry === registry && registry.schemas.length === 2)

check('pre-freeze snapshot remains unchanged after freeze', !oldSnapshot.frozen
  && oldSnapshot.schemas.length === 2)

const valid = validateEventPayload(registry, 'person.created', { displayName: '甲' })
check('frozen registry accepts a valid payload and returns schema provenance', valid.status === 'valid'
  && valid.schemaRef.registryId === 'world-events'
  && valid.schemaRef.registryVersion === '1.0.0'
  && valid.schemaRef.schemaVersion === 1)

const invalid = validateEventPayload(registry, 'person.created', { displayName: 3 })
check('schema rejects invalid payload', invalid.status === 'payload-invalid')

const missing = validateEventPayload(registry, 'person.unknown' as Kind, {})
check('unknown event kind is rejected', missing.status === 'schema-not-found')

const throwingRegistryResult = registerEventSchema(
  createEventRegistry<Kind>('throwing', '1'),
  { kind: 'person.created', schemaVersion: 1, validate: () => { throw new Error('validator failure') } },
)
const throwingRegistry = throwingRegistryResult.status === 'registered'
  ? freezeEventRegistry(throwingRegistryResult.registry)
  : null
const thrown = throwingRegistry?.status === 'frozen'
  ? validateEventPayload(throwingRegistry.registry, 'person.created', {})
  : null
check('validator exception becomes a typed rejection', thrown?.status === 'validator-threw')

const mutableRegistry = createEventRegistry<Kind>('mutable', '1')
check('mutable registry cannot validate before freeze', validateEventPayload(mutableRegistry, 'person.created', {}).status
  === 'registry-not-frozen')

const invalidDefinition = registerEventSchema(registry, {
  kind: '' as Kind, schemaVersion: 0, validate: personCreated,
})
check('frozen registry rejects even malformed definitions as frozen', invalidDefinition.status === 'registry-frozen')

const malformedIdentity = ({ registryId: 7, registryVersion: '1', frozen: true, schemas: [] }
  as unknown) as EventRegistry<Kind>
check('malformed registry identity returns a typed invalid-registry result',
  validateEventPayload(malformedIdentity, 'person.created', {}).status === 'invalid-registry')
check('malformed registry cannot be frozen',
  freezeEventRegistry(malformedIdentity).status === 'invalid-registry')
check('malformed registry cannot accept schema registration',
  registerEventSchema(malformedIdentity, { kind: 'person.created', schemaVersion: 1, validate: personCreated })
    .status === 'invalid-definition')

const malformedSchema = {
  registryId: 'malformed',
  registryVersion: '1',
  frozen: true,
  schemas: [{ kind: null, schemaVersion: 1, registryId: 'malformed', registryVersion: '1', validate: personCreated }],
} as unknown as EventRegistry<Kind>
check('malformed schema entry is rejected without throwing',
  validateEventPayload(malformedSchema, 'person.created', {}).status === 'invalid-registry')

if (failed > 0) throw new Error(`Event registry contracts failed: ${failed}/${passed + failed}`)
console.log(`Event registry contracts: ${passed}/${passed + failed} passed`)
