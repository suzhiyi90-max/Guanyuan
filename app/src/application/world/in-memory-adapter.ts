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
  createEventLedger,
  type EventLedger,
  type WorldId,
} from '../../domain/event-ledger'
import type { StreamCursor } from '../../domain/event-replay'
import type { EventRegistry } from '../../domain/event-registry'
import type { WorldTime } from '../../domain/shared/world-time'
import { createEmptyWorldAggregate, type WorldAggregate } from '../../domain/world/aggregate'
import {
  createWorldDomainEventRegistry,
  type WorldDomainEventKind,
} from './event-catalog'
import { prepareWorldCommand } from './command-processor'
import { createWorldAggregateProjector } from './projector'
import { projectWorldForObserver } from './observer-view'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldProjectionPort,
  WorldQueryPort,
  WorldObserverQueryPort,
} from './ports'

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
    const prepared = await prepareWorldCommand({
      ledger,
      aggregate,
      request,
      registry,
      projector,
    })
    if (prepared.status !== 'prepared') return prepared.receipt

    // The in-memory adapter serializes commands above this boundary. Durable
    // adapters use the same prepared candidate but commit it with an atomic
    // expected-head compare-and-swap before publishing.
    ledger = prepared.ledger
    aggregate = prepared.aggregate
    for (const listener of listeners) {
      try { listener(aggregate) } catch { /* subscriber failures cannot roll back a committed fact */ }
    }
    return prepared.receipt
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
