import {
  brandedId,
  createEmptyWorldAggregate,
  field,
  type Authorization,
  type Person,
  type WorldAggregate,
} from '../src/domain'
import {
  createAuthorizationGatedWorldCommandPort,
  createWorldCommandAuthorizationRequirementResolver,
  type WorldCommandAuthorizationRequirement,
} from '../src/application'
import type {
  WorldCommandPort,
  WorldCommandReceipt,
  WorldCommandRequest,
  WorldQueryPort,
} from '../src/application'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const worldId = brandedId<'WorldId'>('world:authorization-gate-test')
const personId = brandedId<'PersonId'>('person:authorization-gate-test')
const eventId = brandedId<'EventId'>('event:authorization-gate-grant')
const now = { day: 8, period: '午' } as const
const person: Person = {
  id: personId,
  displayName: '授权测试人物',
  birth: field.unknown,
  lifeState: 'alive',
  archiveState: 'active',
  death: field.notApplicable,
  capability: brandedId<'CapabilityRef'>('cap:authorization-gate-test'),
  stateDomains: {
    body: brandedId<'BodyScopeRef'>('body:authorization-gate-test'),
    mind: brandedId<'MindScopeRef'>('mind:authorization-gate-test'),
    knowledge: brandedId<'KnowledgeScopeId'>('knowledge:authorization-gate-test'),
    goals: [],
    scheduleScope: brandedId<'ScheduleScopeId'>('schedule:authorization-gate-test'),
    economy: brandedId<'EconomyScopeId'>('economy:authorization-gate-test'),
    location: brandedId<'LocationStateRef'>('location:authorization-gate-test'),
  },
  history: brandedId<'LifeHistoryRef'>('history:authorization-gate-test'),
}
const grant: Authorization = {
  id: brandedId<'AuthorizationId'>('authorization:issue-order'),
  principal: personId,
  permission: 'county.order.issue',
  scope: { kind: 'office', office: brandedId<'OfficeId'>('office:county-magistrate') },
  grantedBy: eventId,
  validFrom: { day: 1, period: '晨' },
  validTo: field.notApplicable,
  revocable: true,
  revokedBy: field.notApplicable,
  revokedAt: field.notApplicable,
}
const empty = createEmptyWorldAggregate(worldId, { day: 1, period: '晨' })
const authorizedAggregate: WorldAggregate = {
  ...empty,
  persons: [person],
  identity: { ...empty.identity, authorizations: [grant] },
}
let currentAggregate: WorldAggregate | null = authorizedAggregate
let submitted = 0
let submittedActor: string | null = null
const receipt: WorldCommandReceipt = {
  status: 'committed',
  worldId,
  clientRequestId: 'authorization-gate-command',
  eventId,
  streamHead: { kind: 'event', seq: 1, eventId },
}
const commands: WorldCommandPort = {
  async submit(command): Promise<WorldCommandReceipt> {
    submitted += 1
    submittedActor = command.actor
    return receipt
  },
}
const queries: WorldQueryPort = {
  async read(): Promise<WorldAggregate | null> { return currentAggregate },
  subscribe(): () => void { return () => undefined },
}
const requirement: WorldCommandAuthorizationRequirement = {
  permission: 'county.order.issue',
  scope: grant.scope,
}
const requirements = {
  resolve: (): WorldCommandAuthorizationRequirement => requirement,
}
const principals = { resolve: () => personId }
const gated = createAuthorizationGatedWorldCommandPort({ commands, queries, requirements, principals })
const request: WorldCommandRequest = {
  worldId,
  clientRequestId: 'authorization-gate-command',
  actor: 'untrusted-display-actor',
  source: 'player-command',
  intentKind: 'county.order.issue',
  requestedAt: now,
  expectedHead: empty.streamHead,
  payload: {},
}

async function main(): Promise<void> {
  const accepted = await gated.submit(request)
  check('explicit active grant reaches the command port with the authenticated principal as actor',
    accepted.status === 'committed' && submitted === 1 && submittedActor === personId)

  currentAggregate = { ...authorizedAggregate, identity: { ...empty.identity, authorizations: [] } }
  const noGrant = await gated.submit({ ...request, clientRequestId: 'authorization-gate-no-grant' })
  check('missing grant fails closed before any fact-write command', noGrant.status === 'rejected' && submitted === 1)

  currentAggregate = {
    ...authorizedAggregate,
    persons: [{ ...person, lifeState: 'dead', death: field.value({
      at: now, causeEvent: eventId, estateSettlements: [],
    }) }],
  }
  const deadPrincipal = await gated.submit({ ...request, clientRequestId: 'authorization-gate-dead-principal' })
  check('dead principal cannot exercise an otherwise active grant',
    deadPrincipal.status === 'rejected' && submitted === 1)

  currentAggregate = authorizedAggregate
  const missingRequirement = createAuthorizationGatedWorldCommandPort({
    commands, queries, requirements: { resolve: () => null }, principals,
  })
  const unresolved = await missingRequirement.submit({ ...request, clientRequestId: 'authorization-gate-unresolved' })
  check('unmapped player command is denied rather than inheriting rank or actor text',
    unresolved.status === 'rejected' && submitted === 1)

  const missingPrincipalGate = createAuthorizationGatedWorldCommandPort({
    commands, queries, requirements, principals: { resolve: () => null },
  })
  const missingPrincipal = await missingPrincipalGate.submit({
    ...request, clientRequestId: 'authorization-gate-missing-principal',
  })
  check('request actor text cannot substitute for a missing authenticated principal',
    missingPrincipal.status === 'rejected' && submitted === 1)

  const spoofedInternal = await gated.submit({
    ...request, source: 'rule', clientRequestId: 'authorization-gate-internal-rule',
  })
  check('player-facing gate rejects caller-supplied internal source labels',
    spoofedInternal.status === 'rejected' && submitted === 1)

  const missingWorld: WorldQueryPort = {
    async read() { return null },
    subscribe() { return () => undefined },
  }
  const missingWorldGate = createAuthorizationGatedWorldCommandPort({
    commands, queries: missingWorld, requirements, principals,
  })
  const missing = await missingWorldGate.submit({ ...request, clientRequestId: 'authorization-gate-missing-world' })
  check('missing world projection is denied without command submission',
    missing.status === 'rejected' && submitted === 1)


  const authorizationPolicy = {
    schemaVersion: 'w6-command-authorization/1' as const,
    policyId: 'county-command-permissions',
    revision: '1',
    rules: [{
      intentKind: 'county.order.issue',
      permission: 'county.order.issue',
      scope: grant.scope,
    }],
  }
  const policyRequirements = createWorldCommandAuthorizationRequirementResolver(authorizationPolicy)
  const exactRequirement = await policyRequirements.resolve(request.intentKind)
  check('versioned policy maps an exact command intent to its declared permission and scope',
    exactRequirement?.permission === 'county.order.issue'
    && JSON.stringify(exactRequirement.scope) === JSON.stringify(grant.scope))
  const unmappedRequirement = await policyRequirements.resolve('county.treasury.withdraw')
  check('unmapped command and caller-supplied payload scope cannot widen authorization',
    unmappedRequirement === null)
  let duplicatePolicyRejected = false
  try {
    createWorldCommandAuthorizationRequirementResolver({
      ...authorizationPolicy,
      rules: [...authorizationPolicy.rules, ...authorizationPolicy.rules],
    })
  } catch {
    duplicatePolicyRejected = true
  }
  check('duplicate intent mappings invalidate the policy instead of selecting an arbitrary grant',
    duplicatePolicyRejected)

  const mutablePolicy = {
    ...authorizationPolicy,
    rules: authorizationPolicy.rules.map(rule => ({ ...rule })),
  }
  const snapshottedRequirements = createWorldCommandAuthorizationRequirementResolver(mutablePolicy)
  mutablePolicy.rules[0]!.permission = 'county.treasury.withdraw'
  const afterProviderMutation = await snapshottedRequirements.resolve(request.intentKind)
  check('mutating the source policy after composition cannot change active authorization',
    afterProviderMutation?.permission === 'county.order.issue'
    && JSON.stringify(afterProviderMutation.scope) === JSON.stringify(grant.scope))

  if (failed > 0) throw new Error(`World authorization gate tests failed: ${failed}/${passed + failed}`)
  console.log(`World authorization gate tests: ${passed}/${passed + failed} passed`)
}

void main().catch(error => { console.error(error); throw error })
