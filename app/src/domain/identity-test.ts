import { brandedId, field } from './index'
import { hasAuthorization } from './identity/authorization'
import { validateAppointment, validateAuthorization, validateIdentityAssignment, validateOffice } from './identity/validation'
import type { Appointment, Authorization, IdentityAssignment, Office } from './identity/model'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const person = brandedId<'PersonId'>('person-001')
const otherPerson = brandedId<'PersonId'>('person-002')
const officeId = brandedId<'OfficeId'>('office-001')
const institution = brandedId<'OrgId'>('org-001')
const event = brandedId<'EventId'>('event-001')
const identityId = brandedId<'IdentityId'>('identity-001')
const now = { day: 10, period: '午' } as const

const identity: IdentityAssignment = {
  id: identityId,
  person,
  axis: 'institutional',
  code: 'county-magistrate',
  validFrom: event,
  validTo: 'open',
  sourceEvent: event,
  visibility: { observer: 'player', level: 'public' },
  certainty: 'confirmed',
}
check('identity record accepts institutional axis', validateIdentityAssignment(identity, []).length === 0)
check('identity axes are independent records', validateIdentityAssignment({
  ...identity, id: brandedId<'IdentityId'>('identity-002'), axis: 'family', code: 'clan-member',
}, [identity]).length === 0)
check('identity history cannot reuse an existing id', validateIdentityAssignment(identity, [identity]).includes('identity-id-already-exists'))
check('identity code cannot be empty', validateIdentityAssignment({ ...identity, code: '  ' }, []).includes('identity-empty-code'))
check('identity source may differ from effective-start event', validateIdentityAssignment({
  ...identity, sourceEvent: brandedId<'EventId'>('event-recorded-later'),
}, []).length === 0)
check('identity cannot end at its own start event', validateIdentityAssignment({
  ...identity, validTo: event,
}, []).includes('identity-validity-reference-mismatch'))

const office: Office = {
  id: officeId,
  institution,
  rank: '七品',
  title: '知县',
  holder: { kind: 'held', person },
  authorization: [],
  validFrom: event,
  validTo: 'open',
}
check('office held state is valid', validateOffice(office).length === 0)
check('office vacancy is objective and valid', validateOffice({ ...office, holder: { kind: 'vacant' } }).length === 0)

const appointment: Appointment = {
  id: brandedId<'AppointmentId'>('appointment-001'),
  office: officeId,
  person,
  from: { day: 2, period: '晨' },
  to: field.value({ day: 9, period: '夜' }),
}
check('appointment with increasing interval is valid', validateAppointment(appointment).length === 0)
check('appointment end must follow start', validateAppointment({
  ...appointment, to: field.value({ day: 1, period: '夜' }),
}).includes('appointment-end-before-start'))
check('open appointment interval is valid', validateAppointment({ ...appointment, to: field.notApplicable }).length === 0)

const grant: Authorization = {
  id: brandedId<'AuthorizationId'>('auth-001'),
  principal: person,
  permission: 'issue.local-order',
  scope: { kind: 'office', office: officeId },
  grantedBy: event,
  validFrom: { day: 3, period: '晨' },
  validTo: field.notApplicable,
  revocable: true,
  revokedBy: field.notApplicable,
  revokedAt: field.notApplicable,
}
const request = { principal: person, permission: 'issue.local-order', scope: { kind: 'office', office: officeId } as const, at: now }
check('explicit matching grant authorizes action', hasAuthorization([grant], request))
check('authorization defaults to deny', !hasAuthorization([], request))
check('different principal is denied', !hasAuthorization([grant], { ...request, principal: otherPerson }))
check('different permission is denied', !hasAuthorization([grant], { ...request, permission: 'issue.extraordinary-order' }))
check('different office scope is denied', !hasAuthorization([grant], {
  ...request, scope: { kind: 'office', office: brandedId<'OfficeId'>('office-002') },
}))
check('world scope explicitly covers requested scope', hasAuthorization([{
  ...grant, scope: { kind: 'world' },
}], request))
check('grant before validFrom is inactive', !hasAuthorization([grant], {
  ...request, at: { day: 2, period: '夜' },
}))
check('grant at validTo boundary is inactive', !hasAuthorization([{
  ...grant, validTo: field.value({ day: 10, period: '午' }),
}], request))
check('revoked grant is inactive at revocation boundary', !hasAuthorization([{
  ...grant, revokedBy: field.value(brandedId<'EventId'>('event-revoke')),
  revokedAt: field.value(now),
}], request))
check('unknown revocation state cannot grant authority', !hasAuthorization([{
  ...grant, revokedBy: field.unknown, revokedAt: field.unknown,
}], request))
check('non-revocable grant cannot carry revocation', validateAuthorization({
  ...grant, revocable: false,
  revokedBy: field.value(brandedId<'EventId'>('event-revoke')),
  revokedAt: field.value(now),
}).includes('authorization-revocation-forbidden'))
check('revocation event and time must travel together', validateAuthorization({
  ...grant, revokedBy: field.value(brandedId<'EventId'>('event-revoke')),
}).includes('authorization-revocation-inconsistent'))
check('unknown validity end is not treated as open-ended', !hasAuthorization([{
  ...grant, validTo: field.unknown,
}], request))
check('unknown authorization end fails validation', validateAuthorization({
  ...grant, validTo: field.unknown,
}).includes('authorization-invalid-time'))
check('empty permission cannot be granted', validateAuthorization({
  ...grant, permission: '  ',
}).includes('authorization-empty-permission'))
check('invalid revocation time is rejected', validateAuthorization({
  ...grant, revokedBy: field.value(brandedId<'EventId'>('event-revoke')),
  revokedAt: field.value({ day: 0, period: '晨' } as never),
}).includes('authorization-invalid-time'))

// @ts-expect-error unknown is not an objective Office holder
const invalidHolder: Office['holder'] = { kind: 'unknown' }
// @ts-expect-error raw strings cannot be used as OfficeId
const invalidOfficeId: import('./shared/ids').OfficeId = 'office-raw'
void invalidHolder
void invalidOfficeId

if (failed > 0) throw new Error(`Identity contract tests failed: ${failed}/${passed + failed}`)
console.log(`Identity contract tests: ${passed}/${passed + failed} passed`)
