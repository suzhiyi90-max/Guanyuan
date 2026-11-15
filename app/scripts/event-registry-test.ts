import {
  createEventRegistry,
  freezeEventRegistry,
  registerEventSchema,
  validateEventPayload,
} from '../src/domain/event-registry'

const registry = createEventRegistry<'smoke.event'>('smoke', '1')
const registered = registerEventSchema(registry, {
  kind: 'smoke.event', schemaVersion: 1,
  validate: payload => payload !== null && typeof payload === 'object' && !Array.isArray(payload),
})
const frozen = registered.status === 'registered' ? freezeEventRegistry(registered.registry) : null
const result = frozen?.status === 'frozen'
  ? validateEventPayload(frozen.registry, 'smoke.event', { ok: true })
  : null
if (result?.status !== 'valid') throw new Error('Event registry script smoke failed')
console.log('Event registry script: 1/1 passed')
