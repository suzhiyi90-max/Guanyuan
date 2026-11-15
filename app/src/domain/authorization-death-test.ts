import { brandedId, field, hasAuthorization } from './index'
import type { Authorization, AuthorizationRequest } from './identity/model'
import type { Person } from './person/model'
import type { WorldTime } from './shared/world-time'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const principalId = brandedId<'PersonId'>('authorization-death-principal')
const otherPersonId = brandedId<'PersonId'>('authorization-death-target')
const officeId = brandedId<'OfficeId'>('authorization-death-office')
const eventId = brandedId<'EventId'>('authorization-death-event')
const birthAt: WorldTime = { day: 1, period: '晨' }
const deathAt: WorldTime = { day: 10, period: '午' }
const beforeDeath: WorldTime = { day: 10, period: '晨' }
const atDeath: WorldTime = deathAt
const afterDeath: WorldTime = { day: 10, period: '暮' }

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: principalId,
    displayName: '授权主体',
    birth: field.value(birthAt),
    lifeState: 'alive',
    archiveState: 'active',
    death: field.notApplicable,
    capability: brandedId<'CapabilityRef'>('authorization-death-capability'),
    stateDomains: {
      body: brandedId<'BodyScopeRef'>('authorization-death-body'),
      mind: brandedId<'MindScopeRef'>('authorization-death-mind'),
      knowledge: brandedId<'KnowledgeScopeId'>('authorization-death-knowledge'),
      goals: [],
      scheduleScope: brandedId<'ScheduleScopeId'>('authorization-death-schedule'),
      economy: brandedId<'EconomyScopeId'>('authorization-death-economy'),
      location: brandedId<'LocationStateRef'>('authorization-death-location'),
    },
    history: brandedId<'LifeHistoryRef'>('authorization-death-history'),
    ...overrides,
  }
}

const living = makePerson()
const grant: Authorization = {
  id: brandedId<'AuthorizationId'>('authorization-death-grant'),
  principal: principalId,
  permission: 'issue.local-order',
  scope: { kind: 'office', office: officeId },
  grantedBy: eventId,
  validFrom: birthAt,
  validTo: field.notApplicable,
  revocable: true,
  revokedBy: field.notApplicable,
  revokedAt: field.notApplicable,
}
const request: AuthorizationRequest = {
  principal: principalId,
  permission: 'issue.local-order',
  scope: { kind: 'office', office: officeId },
  at: afterDeath,
}

const dead = makePerson({
  lifeState: 'dead',
  death: field.value({ at: deathAt, causeEvent: eventId, estateSettlements: [] }),
})
check('living principal can exercise an otherwise-valid grant',
  hasAuthorization([grant], { ...request, at: beforeDeath }, [living]))
check('dead principal is denied at the exact death instant',
  !hasAuthorization([grant], { ...request, at: atDeath }, [dead]))
check('dead principal is denied after death',
  !hasAuthorization([grant], request, [dead]))
check('historical authorization before recorded death remains valid',
  hasAuthorization([grant], { ...request, at: beforeDeath }, [dead]))
check('missing principal record fails closed',
  !hasAuthorization([grant], request, []))
check('duplicate principal records fail closed',
  !hasAuthorization([grant], request, [living, living]))
check('dead principal without a death record fails closed',
  !hasAuthorization([grant], request, [makePerson({ lifeState: 'dead' })]))
check('living principal with a death record is contradictory and denied',
  !hasAuthorization([grant], request, [makePerson({
    lifeState: 'alive',
    death: field.value({ at: deathAt, causeEvent: eventId, estateSettlements: [] }),
  })]))
check('unknown death state fails closed',
  !hasAuthorization([grant], request, [makePerson({ death: field.unknown })]))
check('principal cannot exercise authority before recorded birth',
  !hasAuthorization([grant], { ...request, at: { day: 0, period: '暮' } }, [living]))
check('archived living principal remains eligible',
  hasAuthorization([grant], request, [makePerson({ archiveState: 'archived' })]))
check('death gate applies regardless of grant scope',
  !hasAuthorization([{ ...grant, scope: { kind: 'world' } }], request, [dead]))
check('a deceased person used as the scoped target does not implicitly revoke a living principal grant',
  hasAuthorization([{ ...grant, scope: { kind: 'person', person: otherPersonId } }], {
    ...request, scope: { kind: 'person', person: otherPersonId },
  }, [living]))
check('ordinary revocation rules still apply to living principals',
  !hasAuthorization([{
    ...grant,
    revokedBy: field.value(eventId),
    revokedAt: field.value(beforeDeath),
  }], request, [living]))
check('authorization evaluation does not mutate the source grant',
  grant.revokedBy.kind === 'n/a' && grant.revokedAt.kind === 'n/a')

if (failed > 0) throw new Error(`Authorization death gate tests failed: ${failed}/${passed + failed}`)
console.log(`Authorization death gate tests: ${passed}/${passed + failed} passed`)
