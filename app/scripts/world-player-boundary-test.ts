import { brandedId, createEmptyWorldAggregate } from '../src/domain'
import {
  createWorldPlayerBoundary,
  type WorldCommandPort,
  type WorldCommandReceipt,
  type WorldCommandRequest,
  type WorldObserverQueryPort,
  type WorldQueryPort,
  type WorldObserverSocialView,
} from '../src/application'
import type { WorldAggregate } from '../src/domain'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world:player-boundary-test')
const principalId = brandedId<'PersonId'>('person:authenticated-player')
const otherPersonId = brandedId<'PersonId'>('person:other-observer')
let worldAggregate: WorldAggregate = {
  ...createEmptyWorldAggregate(worldId, { day: 1, period: '晨' }),
  playerPersonId: principalId,
}
const eventId = brandedId<'EventId'>('event:player-boundary-test')
const receipt: WorldCommandReceipt = {
  status: 'committed',
  worldId,
  clientRequestId: 'player-boundary-test',
  eventId,
  streamHead: { kind: 'event', seq: 1, eventId },
}
let rawSubmissions = 0
let rawAggregateReads = 0
let holdAggregateRead = false
let resolveAggregateRead: ((aggregate: WorldAggregate | null) => void) | null = null
let signalAggregateReadStarted: (() => void) | null = null
let aggregateReadStarted = Promise.resolve()
let queriedObserver: string | null = null
let subscribedObserver: string | null = null
let observerUnsubscribed = 0
let observerSubscribeCalls = 0
let emitObserverView: ((view: WorldObserverSocialView) => void) | null = null
let holdObserverRead = false
let observerReadResult: WorldObserverSocialView | null = null
let resolveObserverRead: ((view: WorldObserverSocialView | null) => void) | null = null
let signalObserverReadStarted: (() => void) | null = null
let observerReadStarted = Promise.resolve()
let resolveObserverSubscribed: () => void = () => undefined
const observerSubscribed = new Promise<void>(resolve => { resolveObserverSubscribed = resolve })
const rawCommands: WorldCommandPort = {
  async submit(): Promise<WorldCommandReceipt> {
    rawSubmissions += 1
    return receipt
  },
}
const rawQueries: WorldQueryPort = {
  async read(): Promise<WorldAggregate | null> {
    rawAggregateReads += 1
    if (!holdAggregateRead) return worldAggregate
    signalAggregateReadStarted?.()
    return new Promise(resolve => { resolveAggregateRead = resolve })
  },
  subscribe(): () => void { return () => undefined },
}
const rawObserverQueries: WorldObserverQueryPort = {
  async read(_id, observer) {
    queriedObserver = observer
    if (!holdObserverRead) return observerReadResult
    resolveObserverRead?.(null)
    signalObserverReadStarted?.()
    return new Promise(resolve => { resolveObserverRead = resolve })
  },
  subscribe(_id, observer, listener) {
    observerSubscribeCalls += 1
    subscribedObserver = observer
    emitObserverView = listener
    resolveObserverSubscribed()
    return () => { observerUnsubscribed += 1 }
  },
}
const policy = {
  schemaVersion: 'w6-command-authorization/1' as const,
  policyId: 'player-boundary-empty-policy',
  revision: '1',
  rules: [{ intentKind: 'player.command.test', permission: 'world.command.test', scope: { kind: 'world' as const } }],
}
let authenticated: string | null = principalId
const principals = {
  resolve: () => authenticated as typeof principalId | null,
}
const boundary = createWorldPlayerBoundary({
  commands: rawCommands,
  queries: rawQueries,
  observerQueries: rawObserverQueries,
  principals,
  authorizationPolicy: policy,
})

const commandRequest: WorldCommandRequest = {
  worldId,
  clientRequestId: 'player-boundary-unknown-command',
  actor: 'forged-ui-actor',
  source: 'player-command',
  intentKind: 'unregistered.player.intent',
  requestedAt: { day: 1, period: '晨' },
  expectedHead: { kind: 'genesis', seq: 0 },
  payload: { scope: { kind: 'world' } },
}

async function main(): Promise<void> {
  const keys = Object.keys(boundary).sort().join(',')
  check('player boundary exposes only gated commands and principal-bound queries',
    keys === 'commands,queries'
    && !('rawCommands' in boundary)
    && !('aggregateQueries' in boundary)
    && !('observerQueries' in boundary))

  const view = await boundary.queries.read(worldId)
  check('player query binds the observer to the trusted authenticated principal and matching world player',
    view === null && queriedObserver === principalId)

  const observerView = {
    worldId, observer: principalId, observerPersonId: principalId,
  } as WorldObserverSocialView
  observerReadResult = observerView
  const acceptedView = await boundary.queries.read(worldId)
  check('player query accepts a projection only when world and observer identities match', acceptedView === observerView)
  observerReadResult = { ...observerView, observerPersonId: otherPersonId }
  const mismatchedView = await boundary.queries.read(worldId)
  check('player query rejects a projection for another observer', mismatchedView === null)
  observerReadResult = null
  holdObserverRead = true
  observerReadStarted = new Promise<void>(resolve => { signalObserverReadStarted = resolve })
  const pendingRead = boundary.queries.read(worldId)
  await observerReadStarted
  authenticated = otherPersonId
  resolveObserverRead?.(observerView)
  const switchedSessionView = await pendingRead
  check('read begun by a prior session is discarded after principal changes', switchedSessionView === null)
  authenticated = principalId
  holdObserverRead = false

  worldAggregate = { ...worldAggregate, playerPersonId: otherPersonId }
  queriedObserver = null
  const foreignWorldView = await boundary.queries.read(worldId)
  check('a principal who is not this world player receives no player-scoped view',
    foreignWorldView === null && queriedObserver === null)
  worldAggregate = { ...worldAggregate, playerPersonId: principalId }

  let notified = false
  const unsubscribe = boundary.queries.subscribe(worldId, () => { notified = true })
  await observerSubscribed
  check('player subscription binds the observer to the trusted authenticated principal',
    subscribedObserver === principalId && !notified)
  authenticated = otherPersonId
  emitObserverView?.(observerView)
  await Promise.resolve()
  await Promise.resolve()
  check('existing subscription stops delivering and is revoked after authenticated principal changes',
    !notified && observerUnsubscribed === 1)
  authenticated = principalId
  emitObserverView?.(observerView)
  await Promise.resolve()
  await Promise.resolve()
  check('revoked subscription cannot resume delivering after the prior principal returns', !notified)
  unsubscribe()
  check('player query subscription cleanup is idempotent after principal revocation',
    observerUnsubscribed === 1)

  const aggregateReadsBeforeDeniedCommand = rawAggregateReads
  const denied = await boundary.commands.submit(commandRequest)
  check('unknown player intent is denied by the composed boundary',
    denied.status === 'rejected'
    && denied.reason === 'world-command-authorization-requirement-missing'
    && rawSubmissions === 0
    && rawAggregateReads === aggregateReadsBeforeDeniedCommand)

  const playerCommandRequest: WorldCommandRequest = {
    ...commandRequest,
    clientRequestId: 'player-boundary-wrong-world-player',
    intentKind: 'player.command.test',
  }
  worldAggregate = { ...worldAggregate, playerPersonId: otherPersonId }
  const wrongPlayerCommand = await boundary.commands.submit(playerCommandRequest)
  check('a different person cannot submit player commands even if the intent has a policy mapping',
    wrongPlayerCommand.status === 'rejected'
    && wrongPlayerCommand.reason === 'world-command-principal-not-world-player'
    && rawSubmissions === 0)
  worldAggregate = { ...worldAggregate, playerPersonId: principalId }

  worldAggregate = { ...worldAggregate, playerPersonId: principalId }
  holdAggregateRead = true
  aggregateReadStarted = new Promise<void>(resolve => { signalAggregateReadStarted = resolve })
  const switchingCommand = boundary.commands.submit({
    ...playerCommandRequest,
    clientRequestId: 'player-boundary-principal-switch',
  })
  await aggregateReadStarted
  authenticated = otherPersonId
  resolveAggregateRead?.(worldAggregate)
  const switchedCommand = await switchingCommand
  check('command authorization is discarded when the authenticated principal changes during world lookup',
    switchedCommand.status === 'rejected'
    && switchedCommand.reason === 'world-command-principal-changed'
    && rawSubmissions === 0)
  authenticated = principalId
  holdAggregateRead = false

  authenticated = null
  queriedObserver = null
  const anonymousView = await boundary.queries.read(worldId)
  let anonymousSubscriptionCalled = false
  const stopAnonymous = boundary.queries.subscribe(worldId, () => { anonymousSubscriptionCalled = true })
  await Promise.resolve()
  await Promise.resolve()
  check('missing principal yields no player view and cannot subscribe as another person',
    anonymousView === null
    && queriedObserver === null
    && subscribedObserver === principalId
    && observerSubscribeCalls === 1
    && !anonymousSubscriptionCalled)
  stopAnonymous()

  if (failed > 0) throw new Error(`World player boundary tests failed: ${failed}/${passed + failed}`)
  console.log(`World player boundary tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => { console.error(error); throw error })
