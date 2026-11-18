/**
 * W6-D — resumable world initialization through application ports.
 *
 * This coordinator turns deterministic bootstrap candidates into canonical
 * command submissions. It never writes a ledger, invokes a reducer, assigns
 * offices, creates relationships, or treats candidate-provider output as fact.
 */
import { field } from '../../domain/shared/field'
import { brandedId, type PersonId } from '../../domain/shared/ids'
import type { StreamCursor } from '../../domain/event-replay'
import type { WorldAggregate } from '../../domain/world/aggregate'
import type { WorldBootstrapMetadata } from '../../domain/world/metadata'
import type { WorldId } from '../../domain/event-ledger'
import {
  bootstrapWorld,
  generatedCandidateOrigin,
  historicalCandidateOrigin,
  type WorldBootstrapRequest,
  type WorldBootstrapIssue,
  type GeneratedPersonCandidate,
  type FixedHistoricalPersonCandidate,
} from './bootstrap'
import {
  createPersonCreatedEventInput,
  createWorldInitializationEventInput,
  toLedgerEventInput,
  type PersonCreationData,
} from './event-catalog'
import type { WorldCommandPort, WorldCommandReceipt, WorldQueryPort } from './ports'

export interface WorldInitializationPorts {
  readonly commands: WorldCommandPort
  readonly queries: WorldQueryPort
}

export type WorldInitializationResult =
  | {
      readonly status: 'ready'
      readonly worldId: WorldId
      readonly descriptor: WorldBootstrapMetadata
      readonly createdPersonIds: readonly PersonId[]
      readonly existingPersonCount: number
      readonly streamHead: StreamCursor
    }
  | {
      readonly status: 'partial'
      readonly worldId: WorldId
      readonly descriptor: WorldBootstrapMetadata
      readonly createdPersonIds: readonly PersonId[]
      readonly remainingPersonIds: readonly PersonId[]
      readonly streamHead: StreamCursor
      readonly reason: string
    }
  | {
      readonly status: 'rejected'
      readonly worldId: WorldId
      readonly reason: string
      readonly issues?: readonly WorldBootstrapIssue[]
    }

const genesis: StreamCursor = Object.freeze({ kind: 'genesis', seq: 0 })

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item !== null && typeof item === 'object') {
      const record = item as Record<string, unknown>
      return Object.fromEntries(Object.keys(record).sort().map(key => [key, normalize(record[key])]))
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

function sameBootstrap(left: WorldBootstrapMetadata, right: WorldBootstrapMetadata): boolean {
  return left.scenarioPackId === right.scenarioPackId
    && left.rulesetVersion === right.rulesetVersion
    && left.contentPackVersion === right.contentPackVersion
    && left.seed === right.seed
    && left.seedFingerprint === right.seedFingerprint
    && left.locationCode === right.locationCode
    && left.populationPolicyVersion === right.populationPolicyVersion
    && stableJson(left.historicalNameAllowList) === stableJson(right.historicalNameAllowList)
}

function createPersonData(
  candidate: GeneratedPersonCandidate | FixedHistoricalPersonCandidate,
): PersonCreationData {
  const id = candidate.id
  const prefix = `w6:${id}`
  return Object.freeze({
    id,
    displayName: candidate.displayName,
    birth: field.unknown,
    capability: brandedId<'CapabilityRef'>(`${prefix}:capability`),
    stateDomains: Object.freeze({
      body: brandedId<'BodyScopeRef'>(`${prefix}:body`),
      mind: brandedId<'MindScopeRef'>(`${prefix}:mind`),
      knowledge: brandedId<'KnowledgeScopeId'>(`${prefix}:knowledge`),
      goals: Object.freeze([]),
      scheduleScope: brandedId<'ScheduleScopeId'>(`${prefix}:schedule`),
      economy: brandedId<'EconomyScopeId'>(`${prefix}:economy`),
      location: brandedId<'LocationStateRef'>(`${prefix}:location`),
    }),
    history: brandedId<'LifeHistoryRef'>(`${prefix}:history`),
  })
}

function originFor(candidate: GeneratedPersonCandidate | FixedHistoricalPersonCandidate) {
  return candidate.provenance === 'seeded-random'
    ? generatedCandidateOrigin(candidate)
    : historicalCandidateOrigin(candidate)
}

function existingPersonMatches(
  aggregate: WorldAggregate,
  candidate: GeneratedPersonCandidate | FixedHistoricalPersonCandidate,
): boolean {
  const person = aggregate.persons.find(item => item.id === candidate.id)
  const origin = aggregate.personOrigins.find(item => item.person === candidate.id)
  if (!person || !origin) return false
  return person.displayName === candidate.displayName
    && stableJson(origin.origin) === stableJson(originFor(candidate))
}

/**
 * Initialize a world and seed its people using idempotent command requests.
 * A failed run is resumable: retrying the same request skips committed people
 * and reuses stable request IDs. A different bootstrap descriptor is rejected.
 */
export async function initializeWorldThroughPorts(
  request: WorldBootstrapRequest,
  ports: WorldInitializationPorts,
): Promise<WorldInitializationResult> {
  const built = bootstrapWorld(request)
  if (built.status !== 'ready') {
    return { status: 'rejected', worldId: request.worldId, reason: 'bootstrap-validation-failed', issues: built.issues }
  }

  const { descriptor } = built
  const existing = await ports.queries.read(request.worldId)
  if (existing?.bootstrap && !sameBootstrap(existing.bootstrap, descriptor)) {
    return { status: 'rejected', worldId: request.worldId, reason: 'world-already-initialized-with-different-descriptor' }
  }
  if (existing && existing.streamHead.kind !== 'genesis' && !existing.bootstrap) {
    return { status: 'rejected', worldId: request.worldId, reason: 'world-stream-exists-without-bootstrap' }
  }

  let streamHead: StreamCursor = existing?.streamHead ?? genesis
  const createdPersonIds: PersonId[] = []
  let alreadyCommittedCount = 0
  const allCandidates = [...built.generatedPeople, ...built.historicalPeople]
  const existingIds = new Set<PersonId>()
  const completedIds = new Set<PersonId>()

  for (const candidate of allCandidates) {
    const existingPerson = existing?.persons.some(person => person.id === candidate.id) ?? false
    if (existingPerson) {
      if (!existing || !existingPersonMatches(existing, candidate)) {
        return {
          status: 'rejected',
          worldId: request.worldId,
          reason: `world-person-provenance-conflict:${candidate.id}`,
        }
      }
      existingIds.add(candidate.id)
      completedIds.add(candidate.id)
    }
  }

  const submit = async (
    intentKind: string,
    clientRequestId: string,
    payload: ReturnType<typeof toLedgerEventInput>['payload'],
  ): Promise<{ readonly head: StreamCursor; readonly duplicate: boolean } | { readonly reason: string }> => {
    let receipt: WorldCommandReceipt
    try {
      receipt = await ports.commands.submit({
        worldId: request.worldId,
        clientRequestId,
        actor: 'system',
        source: 'rule',
        intentKind,
        requestedAt: descriptor.startedAt,
        expectedHead: streamHead,
        payload,
      })
    } catch (error) {
      return { reason: error instanceof Error ? error.message : 'world-command-port-failed' }
    }
    if (receipt.status === 'rejected' || receipt.status === 'conflict') {
      return { reason: receipt.reason }
    }
    streamHead = receipt.streamHead
    return { head: streamHead, duplicate: receipt.status === 'duplicate' }
  }

  if (!existing?.bootstrap) {
    const input = toLedgerEventInput(createWorldInitializationEventInput(
      descriptor,
      `w6-bootstrap:${request.worldId}:world.initialized`,
    ))
    const result = await submit('world.initialize', input.clientRequestId, input.payload)
    if ('reason' in result) {
      return {
        status: 'partial',
        worldId: request.worldId,
        descriptor,
        createdPersonIds,
        remainingPersonIds: allCandidates.filter(item => !completedIds.has(item.id)).map(item => item.id),
        streamHead,
        reason: result.reason,
      }
    }
  }

  for (let index = 0; index < allCandidates.length; index += 1) {
    const candidate = allCandidates[index]!
    if (existingIds.has(candidate.id)) continue

    const person = createPersonData(candidate)
    const input = toLedgerEventInput(createPersonCreatedEventInput(
      person,
      originFor(candidate),
      {
        actor: 'system',
        source: 'rule',
        requestWorldTime: descriptor.startedAt,
        clientRequestId: `w6-bootstrap:${request.worldId}:person:${candidate.id}`,
      },
    ))
    const result = await submit('person.create', input.clientRequestId, input.payload)
    if ('reason' in result) {
      return {
        status: 'partial',
        worldId: request.worldId,
        descriptor,
        createdPersonIds,
        remainingPersonIds: allCandidates.slice(index).filter(item => !completedIds.has(item.id)).map(item => item.id),
        streamHead,
        reason: result.reason,
      }
    }
    completedIds.add(candidate.id)
    if (result.duplicate) alreadyCommittedCount += 1
    else createdPersonIds.push(candidate.id)
  }

  return {
    status: 'ready',
    worldId: request.worldId,
    descriptor,
    createdPersonIds: Object.freeze(createdPersonIds),
    existingPersonCount: existingIds.size + alreadyCommittedCount,
    streamHead,
  }
}
