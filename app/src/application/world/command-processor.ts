/**
 * W6-I-3A — shared, side-effect-free world command preparation.
 *
 * This module owns command intent/schema/ledger/replay semantics shared by
 * memory and durable adapters. Persistence adapters commit only a prepared
 * candidate using an expected-head compare-and-swap; this module never writes
 * storage or publishes projections.
 */
import {
  appendLedgerEvent,
  type EventLedger,
  type JsonValue,
} from '../../domain/event-ledger'
import type { EventRegistry } from '../../domain/event-registry'
import type { StreamCursor } from '../../domain/event-replay'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type { WorldDomainEventKind } from './event-catalog'
import {
  validateWorldDomainEventPayload,
} from './event-catalog'
import type {
  WorldCommandReceipt,
  WorldCommandRequest,
  WorldProjectionPort,
} from './ports'

const intentKinds: Readonly<Record<string, WorldDomainEventKind>> = Object.freeze({
  'world.initialize': 'world.initialized',
  'world.time.advance': 'world.time.advanced',
  'life.state.fact.record': 'life.state.fact.recorded',
  'person.create': 'person.created',
  'organization.register': 'organization.registered',
  'identity.assign': 'identity.assignment.added',
  'authorization.grant': 'authorization.granted',
  'relation.create': 'relation.created',
  'relation.claim': 'relation.claim.recorded',
  'relation.evidence.record': 'relation.evidence.recorded',
  'knowledge.record': 'knowledge.recorded',
  'message.send': 'message.sent',
  'message.stage': 'message.stage.recorded',
  'message.fail': 'message.failed',
  'message.propagate': 'message.propagated',
  'organization.membership.add': 'organization.membership.added',
  'organization.membership.end': 'organization.membership.ended',
  'relation.lifecycle.change': 'relation.lifecycle.changed',
  'goal.create': 'goal.created',
  'goal.status.change': 'goal.status.changed',
  'schedule.entry.plan': 'schedule.entry.planned',
  'schedule.entry.execution': 'schedule.entry.execution.recorded',
  'schedule.entry.deviation': 'schedule.entry.deviation.recorded',
  'debt.record': 'debt.recorded',
  'debt.settle': 'debt.settled',
  'asset.register': 'asset.registered',
  'asset.custody.transfer': 'asset.custody.transferred',
  'asset.right.grant': 'asset.right.granted',
  'asset.right.revoke': 'asset.right.revoked',
  'person.exposure.record': 'person.exposure.recorded',
})

export interface PrepareWorldCommandOptions {
  readonly ledger: EventLedger<WorldDomainEventKind>
  readonly aggregate: WorldAggregate
  readonly request: WorldCommandRequest
  readonly registry: EventRegistry<WorldDomainEventKind>
  readonly projector: WorldProjectionPort<WorldDomainEventKind>
}

export type PreparedWorldCommandResult =
  | {
      readonly status: 'prepared'
      readonly ledger: EventLedger<WorldDomainEventKind>
      readonly aggregate: WorldAggregate
      readonly receipt: WorldCommandReceipt & { readonly status: 'committed' }
    }
  | {
      readonly status: 'duplicate' | 'conflict' | 'rejected'
      readonly receipt: WorldCommandReceipt
    }

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

function snapshotJsonValue(value: JsonValue, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('world-command-payload-not-json')
    return value
  }
  if (typeof value !== 'object') throw new Error('world-command-payload-not-json')
  if (ancestors.has(value)) throw new Error('world-command-payload-circular-reference')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map(item => snapshotJsonValue(item, ancestors)))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('world-command-payload-not-plain-object')
    }
    const record = value as { readonly [key: string]: JsonValue }
    const entries: [string, JsonValue][] = []
    for (const key of Object.keys(record)) {
      entries.push([key, snapshotJsonValue(record[key]!, ancestors)])
    }
    return Object.freeze(Object.fromEntries(entries)) as { readonly [key: string]: JsonValue }
  } finally {
    ancestors.delete(value)
  }
}

function rejected(
  request: WorldCommandRequest,
  streamHead: StreamCursor,
  reason: string,
): PreparedWorldCommandResult {
  return {
    status: 'rejected',
    receipt: {
      status: 'rejected',
      worldId: request.worldId,
      clientRequestId: request.clientRequestId,
      reason,
      streamHead,
    },
  }
}

function conflict(
  request: WorldCommandRequest,
  streamHead: StreamCursor,
  reason: string,
): PreparedWorldCommandResult {
  return {
    status: 'conflict',
    receipt: {
      status: 'conflict',
      worldId: request.worldId,
      clientRequestId: request.clientRequestId,
      reason,
      streamHead,
    },
  }
}

/**
 * Prepare one command against an immutable canonical ledger snapshot.
 *
 * A prepared result is not committed. The caller must atomically persist its
 * event/idempotency/head against the exact prior ledger head, then publish the
 * returned aggregate. If compare-and-swap fails, reload and prepare again.
 */
export async function prepareWorldCommand(
  options: PrepareWorldCommandOptions,
): Promise<PreparedWorldCommandResult> {
  const { ledger, aggregate, registry, projector } = options
  let request: WorldCommandRequest
  try {
    request = Object.freeze({
      ...options.request,
      requestedAt: Object.freeze({ ...options.request.requestedAt }),
      expectedHead: Object.freeze({ ...options.request.expectedHead }),
      payload: snapshotJsonValue(options.request.payload),
    })
  } catch {
    return rejected(options.request, aggregate.streamHead, 'world-command-request-snapshot-failed')
  }
  if (request.worldId !== ledger.worldId || request.worldId !== aggregate.worldId) {
    return rejected(request, aggregate.streamHead, 'world-command-world-id-mismatch')
  }
  const kind = intentKinds[request.intentKind]
  if (!kind) {
    return rejected(request, aggregate.streamHead, 'world-command-intent-unsupported')
  }
  const schema = validateWorldDomainEventPayload(registry, kind, request.payload)
  if (schema.status !== 'valid') {
    return rejected(request, aggregate.streamHead, `world-command-payload-${schema.status}:${kind}`)
  }

  const appended = appendLedgerEvent(ledger, {
    source: request.source,
    kind,
    intentKind: request.intentKind,
    actor: request.actor,
    requestWorldTime: request.requestedAt,
    clientRequestId: request.clientRequestId,
    payload: request.payload as JsonValue,
  }, request.requestedAt)

  if (appended.status === 'duplicate') {
    return {
      status: 'duplicate',
      receipt: {
        status: 'duplicate',
        worldId: request.worldId,
        clientRequestId: request.clientRequestId,
        eventId: appended.event.id,
        streamHead: aggregate.streamHead,
      },
    }
  }
  if (appended.status === 'idempotency-conflict') {
    return conflict(request, aggregate.streamHead, 'world-command-idempotency-conflict')
  }
  if (appended.status === 'rejected') {
    return rejected(request, aggregate.streamHead, appended.issues.join(','))
  }

  // Preserve retry semantics: an already-appended identical request above is
  // duplicate even if its caller's expected cursor is now stale. New writes
  // must match the exact current projection cursor before replay validation.
  if (!sameCursor(request.expectedHead, aggregate.streamHead)) {
    return conflict(request, aggregate.streamHead, 'world-command-expected-head-conflict')
  }

  const tail = appended.event
  const projected = await projector.rebuild({
    ledger: appended.ledger,
    target: { kind: 'event', seq: tail.seq, eventId: tail.id },
  })
  if (projected.status !== 'valid') {
    return rejected(
      request,
      aggregate.streamHead,
      projected.issues.map(issue => issue.code).join(','),
    )
  }

  return {
    status: 'prepared',
    ledger: appended.ledger,
    aggregate: projected.aggregate,
    receipt: {
      status: 'committed',
      worldId: request.worldId,
      clientRequestId: request.clientRequestId,
      eventId: tail.id,
      streamHead: projected.aggregate.streamHead,
    },
  }
}
