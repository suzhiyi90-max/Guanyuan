/**
 * W6-E — deterministic in-memory command/query adapter.
 *
 * This is an executable adapter for preview, integration tests and local
 * composition. Durable persistence remains an outer adapter concern. Every
 * write validates the frozen event schema, appends through the canonical
 * ledger API, rebuilds through read-only replay, and publishes only a valid
 * aggregate. It does not touch the W5 runtime or persistence implementation.
 */
import {
  appendLedgerEvent,
  createEventLedger,
  type EventLedger,
  type JsonValue,
  type WorldId,
} from '../../domain/event-ledger'
import type { StreamCursor } from '../../domain/event-replay'
import type { EventRegistry } from '../../domain/event-registry'
import type { WorldTime } from '../../domain/shared/world-time'
import { createEmptyWorldAggregate, type WorldAggregate } from '../../domain/world/aggregate'
import {
  createWorldDomainEventRegistry,
  validateWorldDomainEventPayload,
  type WorldDomainEventKind,
} from './event-catalog'
import { createWorldAggregateProjector } from './projector'
import { projectWorldForObserver } from './observer-view'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldProjectionPort,
  WorldQueryPort,
  WorldObserverQueryPort,
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

export interface InMemoryWorldAdapterOptions {
  readonly worldId: WorldId
  readonly worldStartTime: WorldTime
  readonly registry?: EventRegistry<WorldDomainEventKind>
}

export interface InMemoryWorldAdapter {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
  readonly observerQueries: WorldObserverQueryPort
  readonly projector: WorldProjectionPort<WorldDomainEventKind>
  /** Read-only ledger snapshot for adapter diagnostics and test assertions. */
  readLedger(): EventLedger<WorldDomainEventKind>
}

function sameCursor(left: StreamCursor, right: StreamCursor): boolean {
  return left.kind === right.kind && left.seq === right.seq
    && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

export function createInMemoryWorldAdapter(options: InMemoryWorldAdapterOptions): InMemoryWorldAdapter {
  const registry = options.registry ?? createWorldDomainEventRegistry()
  if (!registry.frozen || !Object.isFrozen(registry)) throw new Error('world-adapter-registry-not-frozen')

  let ledger = createEventLedger<WorldDomainEventKind>(options.worldId)
  let aggregate: WorldAggregate = createEmptyWorldAggregate(options.worldId, options.worldStartTime)
  const projector = createWorldAggregateProjector({ registry, worldStartTime: options.worldStartTime })
  const listeners = new Set<(value: WorldAggregate) => void>()

  let commandQueue: Promise<void> = Promise.resolve()
  const submitCommand = async (
    request: Parameters<WorldCommandPort['submit']>[0],
  ): Promise<WorldCommandReceipt> => {
      if (request.worldId !== options.worldId) {
        return {
          status: 'rejected',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: 'world-command-world-id-mismatch',
          streamHead: aggregate.streamHead,
        }
      }
      const kind = intentKinds[request.intentKind]
      if (!kind) {
        return {
          status: 'rejected',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: 'world-command-intent-unsupported',
          streamHead: aggregate.streamHead,
        }
      }
      const schema = validateWorldDomainEventPayload(registry, kind, request.payload)
      if (schema.status !== 'valid') {
        return {
          status: 'rejected',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: `world-command-payload-${schema.status}:${kind}`,
          streamHead: aggregate.streamHead,
        }
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
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          eventId: appended.event.id,
          streamHead: aggregate.streamHead,
        }
      }
      if (appended.status === 'idempotency-conflict') {
        return {
          status: 'conflict',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: 'world-command-idempotency-conflict',
          streamHead: aggregate.streamHead,
        }
      }
      if (appended.status === 'rejected') {
        return {
          status: 'rejected',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: appended.issues.join(','),
          streamHead: aggregate.streamHead,
        }
      }

      if (!sameCursor(request.expectedHead, aggregate.streamHead)) {
        return {
          status: 'conflict',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: 'world-command-expected-head-conflict',
          streamHead: aggregate.streamHead,
        }
      }

      const tail = appended.event
      const projected = await projector.rebuild({
        ledger: appended.ledger,
        target: { kind: 'event', seq: tail.seq, eventId: tail.id },
      })
      if (projected.status !== 'valid') {
        return {
          status: 'rejected',
          worldId: request.worldId,
          clientRequestId: request.clientRequestId,
          reason: projected.issues.map(issue => issue.code).join(','),
          streamHead: aggregate.streamHead,
        }
      }

      ledger = appended.ledger
      aggregate = projected.aggregate
      for (const listener of listeners) {
        try { listener(aggregate) } catch { /* subscriber failures cannot roll back a committed fact */ }
      }
      return {
        status: 'committed',
        worldId: request.worldId,
        clientRequestId: request.clientRequestId,
        eventId: tail.id,
        streamHead: aggregate.streamHead,
      }
  }
  const commands: WorldCommandPort = {
    submit(request) {
      const result = commandQueue.then(() => submitCommand(request))
      commandQueue = result.then(() => undefined, () => undefined)
      return result
    },
  }

  const queries: WorldQueryPort = {
    async read(worldId) {
      return worldId === options.worldId ? aggregate : null
    },
    subscribe(worldId, listener) {
      if (worldId !== options.worldId) return () => undefined
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }

  const observerQueries: WorldObserverQueryPort = {
    async read(worldId, observer) {
      return worldId === options.worldId ? projectWorldForObserver(aggregate, observer) : null
    },
    subscribe(worldId, observer, listener) {
      if (worldId !== options.worldId) return () => undefined
      const project = (value: WorldAggregate) => listener(projectWorldForObserver(value, observer))
      listeners.add(project)
      return () => { listeners.delete(project) }
    },
  }

  return Object.freeze({
    commands,
    queries,
    observerQueries,
    projector,
    readLedger: () => ledger,
  })
}
