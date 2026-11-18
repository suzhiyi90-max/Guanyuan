import { brandedId } from '../src/domain'
import type { EventId } from '../src/domain'
import type { WorldId } from '../src/domain'
import { bootstrapWorld, initializeWorldThroughPorts } from '../src/application'
import type { WorldBootstrapRequest, WorldCommandPort, WorldCommandReceipt, WorldQueryPort } from '../src/application'
import type { StreamCursor } from '../src/domain'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

function createHarness(worldId: WorldId) {
  let sequence = 0
  let head: StreamCursor = { kind: 'genesis', seq: 0 }
  const receipts = new Map<string, WorldCommandReceipt>()
  const submitted: Array<{ intentKind: string; clientRequestId: string; payload: unknown }> = []
  let failRequestId: string | null = null

  const commands: WorldCommandPort = {
    async submit(request) {
      submitted.push({
        intentKind: request.intentKind,
        clientRequestId: request.clientRequestId,
        payload: request.payload,
      })
      const previous = receipts.get(request.clientRequestId)
      if (previous) return {
        ...previous,
        status: 'duplicate' as const,
        streamHead: head,
      }
      if (failRequestId === request.clientRequestId) {
        return {
          status: 'rejected',
          worldId,
          clientRequestId: request.clientRequestId,
          reason: 'test-injected-command-failure',
          streamHead: head,
        }
      }
      if (request.expectedHead.seq !== head.seq) {
        return {
          status: 'conflict',
          worldId,
          clientRequestId: request.clientRequestId,
          reason: 'expected-head-conflict',
          streamHead: head,
        }
      }
      sequence += 1
      const eventId = brandedId<'EventId'>(`evt:${worldId}:${sequence}`)
      head = { kind: 'event', seq: sequence, eventId }
      const receipt: WorldCommandReceipt = {
        status: 'committed',
        worldId,
        clientRequestId: request.clientRequestId,
        eventId,
        streamHead: head,
      }
      receipts.set(request.clientRequestId, receipt)
      return receipt
    },
  }
  const queries: WorldQueryPort = {
    async read() { return null },
    subscribe() { return () => undefined },
  }
  return {
    ports: { commands, queries },
    submitted,
    setFailure(value: string | null) { failRequestId = value },
    get head() { return head },
  }
}

function requestFor(worldIdValue: string): WorldBootstrapRequest {
  return {
    worldId: brandedId<'WorldId'>(worldIdValue) as WorldId,
    seed: 'w6-application-bootstrap-seed',
    scenarioPackId: 'scenario:test-world',
    rulesetVersion: 'ruleset-test-1',
    contentPackVersion: 'content-test-1',
    worldTime: { day: 1, period: '晨' },
    locationCode: 'test-county',
    roleSlots: [{ roleCode: 'county-clerk', tier: 'county', minCount: 2, maxCount: 2 }],
    namePool: {
      surnames: ['王', '李', '张', '赵'],
      givenNames: ['守仁', '文远', '景初', '仲平'],
    },
    historicalMinisters: [],
  }
}

async function main(): Promise<void> {
  const request = requestFor('world-initialize-application-test')
  const expected = bootstrapWorld(request)
  if (expected.status !== 'ready') throw new Error('test-bootstrap-fixture-invalid')
  const harness = createHarness(request.worldId)

  const first = await initializeWorldThroughPorts(request, harness.ports)
  check('application bootstrap commits world initialization and every generated person',
    first.status === 'ready'
    && first.createdPersonIds.length === 2
    && first.existingPersonCount === 0
    && first.streamHead.seq === 3)
  check('bootstrap uses one stable world-init command followed by person-create commands',
    harness.submitted.length === 3
    && harness.submitted[0]?.intentKind === 'world.initialize'
    && harness.submitted.slice(1).every(item => item.intentKind === 'person.create'))
  const personPayloads = harness.submitted.slice(1).map(item => item.payload as {
    readonly person: { readonly id: string; readonly displayName: string }
    readonly origin: { readonly kind: string; readonly populationTier?: string }
  })
  check('all county candidates remain seeded-random and receive deterministic state-domain references',
    personPayloads.length === 2
    && personPayloads.every((payload, index) =>
      payload.origin.kind === 'seeded-random'
      && payload.origin.populationTier === 'county'
      && payload.person.id === expected.generatedPeople[index]?.id
      && payload.person.displayName === expected.generatedPeople[index]?.displayName))

  const retry = await initializeWorldThroughPorts(request, harness.ports)
  check('retry is idempotent and reports already committed people rather than new creations',
    retry.status === 'ready'
    && retry.createdPersonIds.length === 0
    && retry.existingPersonCount === 2
    && retry.streamHead.seq === 3)
  check('retry reuses exactly the original request IDs',
    harness.submitted.length === 6
    && new Set(harness.submitted.map(item => item.clientRequestId)).size === 3)

  const partialRequest = requestFor('world-initialize-partial-test')
  const partialExpected = bootstrapWorld(partialRequest)
  if (partialExpected.status !== 'ready') throw new Error('test-partial-bootstrap-fixture-invalid')
  const partialHarness = createHarness(partialRequest.worldId)
  const failedPerson = partialExpected.generatedPeople[1]
  if (!failedPerson) throw new Error('test-second-generated-person-missing')
  partialHarness.setFailure(`w6-bootstrap:${partialRequest.worldId}:person:${failedPerson.id}`)
  const partial = await initializeWorldThroughPorts(partialRequest, partialHarness.ports)
  check('failed population command returns explicit resumable partial progress',
    partial.status === 'partial'
    && partial.createdPersonIds.length === 1
    && partial.remainingPersonIds.length === 1
    && partial.reason === 'test-injected-command-failure')

  partialHarness.setFailure(null)
  const resumed = await initializeWorldThroughPorts(partialRequest, partialHarness.ports)
  check('resuming a partial bootstrap skips the committed prefix and completes remaining people',
    resumed.status === 'ready'
    && resumed.createdPersonIds.length === 1
    && resumed.createdPersonIds[0] === failedPerson.id
    && resumed.existingPersonCount === 1
    && resumed.streamHead.seq === 3)

  const invalid = await initializeWorldThroughPorts({
    ...request,
    seed: ' ',
  }, harness.ports)
  check('invalid bootstrap input is rejected before any additional command is submitted',
    invalid.status === 'rejected'
    && invalid.reason === 'bootstrap-validation-failed'
    && harness.submitted.length === 9)

  if (failed > 0) throw new Error(`World application initialization tests failed: ${failed}/${passed + failed}`)
  console.log(`World application initialization tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => {
  console.error(error)
  throw error
})
