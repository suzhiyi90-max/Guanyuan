/**
 * W6-C — production world projection adapter over the frozen W3 replay API.
 *
 * The adapter rebuilds from genesis, supports historical cursors, and validates
 * the resulting materialized aggregate against the exact ledger prefix.
 */
import type { EventLedger, JsonValue } from '../../domain/event-ledger'
import { rebuildReadOnlyProjection, type StreamCursor } from '../../domain/event-replay'
import type { EventRegistry } from '../../domain/event-registry'
import type { WorldTime } from '../../domain/shared/world-time'
import { isValidWorldTime } from '../../domain/shared/world-time'
import type { WorldAggregate, WorldAggregateValidation } from '../../domain/world/aggregate'
import { createEmptyWorldAggregate, validateWorldAggregate } from '../../domain/world/aggregate'
import type { WorldProjectionPort, WorldProjectionRequest } from './ports'
import type { WorldDomainEventKind } from './event-catalog'
import { reduceWorldDomainEvent } from './reducer'

type JsonRecord = { readonly [key: string]: JsonValue }

function isRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringRecord(value: JsonValue | undefined): value is JsonRecord {
  return value !== undefined && isRecord(value)
}

function isCursor(value: JsonValue | undefined): value is JsonRecord {
  if (value === undefined || !isRecord(value)) return false
  if (value.kind === 'genesis') return value.seq === 0
  return value.kind === 'event'
    && Number.isSafeInteger(value.seq)
    && Number(value.seq) > 0
    && typeof value.eventId === 'string'
    && value.eventId.length > 0
}

function isAggregateShape(value: JsonValue): value is JsonRecord {
  if (!isRecord(value)) return false
  if (!Number.isSafeInteger(value.schemaVersion) || typeof value.worldId !== 'string'
    || !isValidWorldTime(value.worldTime as unknown as WorldTime)
    || !isCursor(value.streamHead)
    || !(value.bootstrap === null || isRecord(value.bootstrap))
    || !(value.playerPersonId === null || typeof value.playerPersonId === 'string')
    || !Array.isArray(value.personOrigins)
    || !Array.isArray(value.persons)) return false

  const groups = ['identity', 'society', 'cognition', 'planning', 'economy', 'life'] as const
  if (!groups.every(key => isStringRecord(value[key]))) return false
  const arrays = [
    'assignments', 'offices', 'appointments', 'authorizations',
    'relations', 'claims', 'evidence', 'organizations', 'memberships',
    'knowledge', 'messages', 'propagations',
    'goals', 'goalStatusTransitions', 'goalDeathDispositions', 'scheduleScopes', 'scheduleEntries',
    'assets', 'debts', 'rightRevocations', 'debtPartySuccessions',
    'histories', 'hooks', 'stateFacts', 'stageFacts',
  ]
  const allArrays = groups.every(key => {
    const group = value[key]
    return isRecord(group) && arrays
      .filter(name => {
        if (key === 'identity') return ['assignments', 'offices', 'appointments', 'authorizations'].includes(name)
        if (key === 'society') return ['relations', 'claims', 'evidence', 'organizations', 'memberships'].includes(name)
        if (key === 'cognition') return ['knowledge', 'messages', 'propagations'].includes(name)
        if (key === 'planning') return ['goals', 'goalStatusTransitions', 'goalDeathDispositions', 'scheduleScopes', 'scheduleEntries'].includes(name)
        if (key === 'economy') return ['assets', 'debts', 'rightRevocations', 'debtPartySuccessions'].includes(name)
        return ['histories', 'hooks', 'stateFacts', 'stageFacts'].includes(name)
      })
      .every(name => Array.isArray(group[name]))
  })
  if (!allArrays) return false
  const planning = value.planning
  return isRecord(planning) && (planning.playerGoal === null || isRecord(planning.playerGoal))
}

function decodeAggregate(value: JsonValue): WorldAggregate {
  if (!isAggregateShape(value)) throw new Error('world-projection-state-invalid')
  return value as unknown as WorldAggregate
}

function encodeAggregate(value: WorldAggregate): JsonValue {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('world-projection-state-not-json')
  return JSON.parse(encoded) as JsonValue
}

function prefixLedger<Kind extends string>(
  ledger: EventLedger<Kind>,
  target: StreamCursor,
): EventLedger<Kind> {
  const events = target.kind === 'genesis'
    ? []
    : ledger.events.filter(event => event.seq <= target.seq)
  const eventIds = new Set(events.map(event => event.id))
  return Object.freeze({
    worldId: ledger.worldId,
    head: events.length,
    events: Object.freeze(events),
    idempotency: Object.freeze(ledger.idempotency.filter(item => eventIds.has(item.eventId))),
  })
}

function rejected(code: string): WorldAggregateValidation {
  return {
    status: 'rejected',
    issues: Object.freeze([{ domain: 'envelope', code }]),
  }
}

export interface WorldAggregateProjectorOptions {
  readonly registry: EventRegistry<WorldDomainEventKind>
  readonly worldStartTime: WorldTime
}

export function createWorldAggregateProjector(
  options: WorldAggregateProjectorOptions,
): WorldProjectionPort<WorldDomainEventKind> {
  if (!options.registry.frozen || !Object.isFrozen(options.registry)) {
    throw new Error('world-projector-registry-not-frozen')
  }
  if (!isValidWorldTime(options.worldStartTime)) throw new Error('world-projector-start-time-invalid')

  return {
    async rebuild(request: WorldProjectionRequest<WorldDomainEventKind>): Promise<WorldAggregateValidation> {
      const { ledger, target } = request
      const initial = createEmptyWorldAggregate(ledger.worldId, options.worldStartTime)
      const replay = rebuildReadOnlyProjection({
        worldId: ledger.worldId,
        fromExclusive: { kind: 'genesis', seq: 0 },
        toInclusive: target,
        events: target.kind === 'genesis' ? [] : ledger.events.filter(event => event.seq <= target.seq),
        registry: options.registry,
        initialState: encodeAggregate(initial),
        reduce: (state, event) => encodeAggregate(
          reduceWorldDomainEvent(decodeAggregate(state), event, options.registry),
        ),
      })
      if (replay.status !== 'rebuilt') return rejected(`world-replay-${replay.issue}`)
      let aggregate: WorldAggregate
      try {
        aggregate = decodeAggregate(replay.state)
      } catch {
        return rejected('world-projection-state-invalid')
      }
      const scopedLedger = prefixLedger(ledger, target)
      return validateWorldAggregate(aggregate, scopedLedger)
    },
  }
}
