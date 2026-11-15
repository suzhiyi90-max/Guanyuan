import {
  createEventRegistry,
  freezeEventRegistry,
  registerEventSchema,
  type EventRegistry,
  type EventSchemaValidator,
} from '../domain/event-registry'

export type PreviewRuntimeEventKind =
  | 'goal.selected'
  | 'document.remembered'
  | 'ledger.remembered'
  | 'person.asked'
  | 'records.audited'
  | 'river.probed'
  | 'plan.previewed'
  | 'river.plan.confirmed'
  | 'banquet.choice'
  | 'official.action'
  | 'world.event.resolved'
  | 'day.advanced'
  | 'candidate.validated'
  | 'ai.generated-event.resolved'

export const PREVIEW_RUNTIME_REGISTRY_ID = 'guanyuan.preview-runtime'
export const PREVIEW_RUNTIME_REGISTRY_VERSION = '0.2.0'
export const PREVIEW_RUNTIME_SCHEMA_VERSION = 1

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function stringList(value: unknown, minimum = 0): value is string[] {
  return Array.isArray(value) && value.length >= minimum
    && value.every(item => nonEmptyString(item))
}

function emptyPayload(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, [])
}

function oneString(key: string): EventSchemaValidator {
  return payload => isRecord(payload) && hasExactKeys(payload, [key]) && nonEmptyString(payload[key])
}

function selectedIdsPayload(payload: unknown): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['selectedIds']) && stringList(payload.selectedIds, 2)
}

function riverPlanPayload(payload: unknown): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['plan']) || !isRecord(payload.plan)) return false
  const plan = payload.plan
  return hasExactKeys(plan, ['leader', 'leaderName', 'material', 'labor', 'supervisor', 'detail'])
    && nonEmptyString(plan.leader)
    && nonEmptyString(plan.leaderName)
    && typeof plan.material === 'number' && Number.isFinite(plan.material) && plan.material >= 0
    && typeof plan.labor === 'number' && Number.isFinite(plan.labor) && plan.labor >= 0
    && nonEmptyString(plan.supervisor)
    && nonEmptyString(plan.detail)
}

function banquetChoicePayload(payload: unknown): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['choice'])
    && (payload.choice === 'attend' || payload.choice === 'delegate' || payload.choice === 'audit')
}

function officialActionPayload(payload: unknown): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['key'])
    && ['endorse', 'commissioner', 'files', 'citation', 'impeach', 'suppress'].includes(String(payload.key))
}

function worldEventPayload(payload: unknown): boolean {
  return isRecord(payload) && hasExactKeys(payload, ['eventId', 'optionId'])
    && nonEmptyString(payload.eventId) && nonEmptyString(payload.optionId)
}

function generatedEventResolutionPayload(payload: unknown): boolean {
  if (!isRecord(payload) || !hasExactKeys(payload, ['generatedEventId', 'optionId', 'effect', 'result', 'refs'])) return false
  return typeof payload.generatedEventId === 'string' && payload.generatedEventId.startsWith('ai-')
    && nonEmptyString(payload.optionId) && nonEmptyString(payload.effect)
    && typeof payload.result === 'string' && payload.result.length >= 1 && payload.result.length <= 140
    && stringList(payload.refs)
}

const definitions: readonly {
  readonly kind: Exclude<PreviewRuntimeEventKind, 'candidate.validated'>
  readonly validate: EventSchemaValidator
}[] = [
  { kind: 'goal.selected', validate: oneString('goalId') },
  { kind: 'document.remembered', validate: selectedIdsPayload },
  { kind: 'ledger.remembered', validate: selectedIdsPayload },
  { kind: 'person.asked', validate: oneString('personId') },
  { kind: 'records.audited', validate: emptyPayload },
  { kind: 'river.probed', validate: emptyPayload },
  { kind: 'plan.previewed', validate: emptyPayload },
  { kind: 'river.plan.confirmed', validate: riverPlanPayload },
  { kind: 'banquet.choice', validate: banquetChoicePayload },
  { kind: 'official.action', validate: officialActionPayload },
  { kind: 'world.event.resolved', validate: worldEventPayload },
  { kind: 'day.advanced', validate: emptyPayload },
  { kind: 'ai.generated-event.resolved', validate: generatedEventResolutionPayload },
]

/**
 * Creates the finite v0.1 registry for the current playable preview.
 * candidate.validated is intentionally not registered here: W3-D/W3-E
 * validate it as a fixed built-in ledger control event.
 */
export function createPreviewRuntimeRegistry(): EventRegistry<PreviewRuntimeEventKind> {
  let registry = createEventRegistry<PreviewRuntimeEventKind>(
    PREVIEW_RUNTIME_REGISTRY_ID,
    PREVIEW_RUNTIME_REGISTRY_VERSION,
  )
  for (const definition of definitions) {
    const result = registerEventSchema(registry, {
      kind: definition.kind,
      schemaVersion: PREVIEW_RUNTIME_SCHEMA_VERSION,
      validate: definition.validate,
    })
    if (result.status !== 'registered') throw new Error(`preview-runtime-registry-${result.status}`)
    registry = result.registry
  }
  const frozen = freezeEventRegistry(registry)
  if (frozen.status !== 'frozen') throw new Error(`preview-runtime-registry-${frozen.status}`)
  return frozen.registry
}
