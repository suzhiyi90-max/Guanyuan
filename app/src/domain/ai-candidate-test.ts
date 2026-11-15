import {
  appendCandidateValidationReceipt,
  appendLedgerEvent,
  createEventLedger,
  type EventLedger,
  type WorldId,
} from '../src/domain/event-ledger'
import {
  appendValidatedAiCandidateFact,
  candidatePayloadDigest,
  createCandidateLog,
  rejectAiCandidate,
  submitAiCandidate,
  validateAiCandidate,
} from '../src/domain/ai-candidate'
import {
  createEventRegistry,
  freezeEventRegistry,
  registerEventSchema,
} from '../src/domain/event-registry'
import { brandedId } from '../src/domain/shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

async function main(): Promise<void> {
  const world = brandedId<'WorldId'>('w3-d-world') as WorldId
  const time = { day: 1, period: '晨' } as const
  const later = { day: 1, period: '午' } as const
  const validatePerson = (payload: unknown): boolean => payload !== null
    && typeof payload === 'object' && !Array.isArray(payload)
    && typeof (payload as { name?: unknown }).name === 'string'
  let registry = createEventRegistry<'person.created'>('domain-events', '3.1.0')
  const registered = registerEventSchema(registry, { kind: 'person.created', schemaVersion: 1, validate: validatePerson })
  check('candidate test schema registers', registered.status === 'registered')
  if (registered.status === 'registered') registry = registered.registry
  const frozenResult = freezeEventRegistry(registry)
  check('candidate registry freezes', frozenResult.status === 'frozen')
  if (frozenResult.status !== 'frozen') throw new Error('test registry failed to freeze')
  const frozen = frozenResult.registry

  const payload = { name: '甲', rank: 7 }
  const digestA = await candidatePayloadDigest('person.created', '3.1.0', payload)
  const digestB = await candidatePayloadDigest('person.created', '3.1.0', { rank: 7, name: '甲' })
  check('canonical-json-v1 digest ignores object key insertion order', digestA === digestB)
  check('digest uses declared algorithm prefix', digestA.startsWith('sha256:'))
  check('canonical-json-v1 matches the fixed UTF-8 SHA-256 vector', digestA === 'sha256:698b6c00d91d7a34f904ce677f3fb795f3e29ef4c3ab585de88fc6ebe1780210')

  let log = createCandidateLog()
  let submitted = submitAiCandidate(log, {
    candidateId: 'cand-001', targetKind: 'person.created', payload, registryVersion: '3.1.0',
  })
  check('candidate accepted as pending', submitted.status === 'accepted'
    && submitted.status === 'accepted' && submitted.candidate.status === 'pending')
  if (submitted.status !== 'accepted') throw new Error('candidate submission failed')
  log = submitted.log
  const duplicate = submitAiCandidate(log, {
    candidateId: 'cand-001', targetKind: 'person.created', payload, registryVersion: '3.1.0',
  })
  check('candidate ID cannot be reused', duplicate.status === 'invalid-state' && duplicate.log === log)

  let ledger: EventLedger = createEventLedger(world)
  const premature = await appendValidatedAiCandidateFact(log, ledger, frozen, 'cand-001', time, time)
  check('pending candidate cannot append a fact', premature.status === 'rejected'
    && premature.reason === 'candidate-not-validated' && premature.ledger === ledger)

  const pendingSnapshot = log
  const validated = await validateAiCandidate(log, ledger, frozen, 'cand-001', 'rule:person-create', time, time)
  check('pending candidate validates and appends one receipt', validated.status === 'validated'
    && validated.ledger.head === 1 && validated.receipt.digestAlgorithm === 'sha-256/canonical-json-v1')
  if (validated.status !== 'validated') throw new Error('candidate validation failed')
  log = validated.log
  ledger = validated.ledger
  check('receipt is a rule-authored candidate.validated event', ledger.events[0].kind === 'candidate.validated'
    && ledger.events[0].source === 'rule')
  check('receipt digest and registry provenance match', validated.receipt.payloadDigest === digestA
    && validated.receipt.registryVersion === '3.1.0'
    && validated.receipt.validationEventId === ledger.events[0].id)
  const retryValidation = await validateAiCandidate(log, ledger, frozen, 'cand-001', 'rule:person-create', time, time)
  check('validated candidate cannot be validated a second time', retryValidation.status === 'invalid-state')
  const recoveredValidation = await validateAiCandidate(pendingSnapshot, ledger, frozen, 'cand-001', 'rule:person-create', time, time)
  check('retry recovers a committed receipt without appending a second one', recoveredValidation.status === 'validated'
    && recoveredValidation.ledger.head === 1 && recoveredValidation.receipt.validationEventId === validated.receipt.validationEventId)

  const fact = await appendValidatedAiCandidateFact(log, ledger, frozen, 'cand-001', later, later)
  check('validated candidate appends AI fact linked to receipt', fact.status === 'appended'
    && fact.event.source === 'ai-candidate'
    && fact.event.candidateRef === 'cand-001'
    && fact.event.validationRef === ledger.events[0].id
    && fact.event.seq === 2)
  if (fact.status !== 'appended') throw new Error('candidate fact append failed')
  ledger = fact.ledger
  const factRetry = await appendValidatedAiCandidateFact(log, ledger, frozen, 'cand-001', later, later)
  check('fact retry returns duplicate without appending a second fact', factRetry.status === 'duplicate'
    && factRetry.ledger.head === 2 && factRetry.event.id === fact.event.id)

  const fakeReceipt = appendLedgerEvent(ledger, {
    source: 'rule', kind: 'candidate.validated', intentKind: 'fake', actor: 'fake',
    requestWorldTime: later, clientRequestId: 'fake-receipt', payload: {},
  }, later)
  check('generic append cannot forge reserved validation receipt', fakeReceipt.status === 'rejected'
    && fakeReceipt.ledger === ledger)
  const forgedDigest = await appendCandidateValidationReceipt(ledger, frozen, {
    candidateId: 'cand-forged', targetKind: 'person.created', candidatePayload: payload,
    payloadDigest: `sha256:${'0'.repeat(64)}`, registryVersion: '3.1.0', validatedBy: 'rule:forged',
  }, later, later)
  check('receipt authority recomputes digest and rejects forged validation', forgedDigest.status === 'rejected'
    && forgedDigest.ledger === ledger)
  const fakeAi = appendLedgerEvent(ledger, {
    source: 'ai-candidate', kind: 'person.created', intentKind: 'fake', actor: 'ai-candidate',
    requestWorldTime: later, clientRequestId: 'fake-ai', payload,
  }, later)
  check('AI fact without candidate and validation refs is rejected', fakeAi.status === 'rejected'
    && fakeAi.ledger === ledger)

  const changedPayload = await submitAiCandidate(createCandidateLog(), {
    candidateId: 'cand-002', targetKind: 'person.created', payload: { name: 3 }, registryVersion: '3.1.0',
  })
  check('invalid schema candidate remains a candidate but cannot validate', changedPayload.status === 'accepted')
  if (changedPayload.status === 'accepted') {
    const invalid = await validateAiCandidate(changedPayload.log, ledger, frozen, 'cand-002', 'rule:person-create', later, later)
    check('schema-invalid candidate emits no receipt event', invalid.status === 'schema-invalid'
      && ledger.head === 2)
  }

  const wrongVersion = await submitAiCandidate(createCandidateLog(), {
    candidateId: 'cand-003', targetKind: 'person.created', payload, registryVersion: '3.0.0',
  })
  if (wrongVersion.status === 'accepted') {
    const mismatch = await validateAiCandidate(wrongVersion.log, ledger, frozen, 'cand-003', 'rule:person-create', later, later)
    check('registry version mismatch blocks validation', mismatch.status === 'registry-version-mismatch'
      && ledger.head === 2)
  } else check('wrong-version candidate fixture accepted', false)

  const rejectedCandidate = submitAiCandidate(createCandidateLog(), {
    candidateId: 'cand-004', targetKind: 'person.created', payload, registryVersion: '3.1.0',
  })
  if (rejectedCandidate.status === 'accepted') {
    const rejected = rejectAiCandidate(rejectedCandidate.log, 'cand-004', 'evidence-insufficient', 'rule:review')
    check('pending candidate can be rejected with external rejection record', rejected.status === 'rejected'
      && rejected.log.rejections.length === 1)
    if (rejected.status === 'rejected') {
      const secondReject = rejectAiCandidate(rejected.log, 'cand-004', 'again', 'rule:review')
      check('rejected candidate is terminal', secondReject.status === 'invalid-state')
      const validateRejected = await validateAiCandidate(rejected.log, ledger, frozen, 'cand-004', 'rule:review', later, later)
      check('rejected candidate cannot be validated', validateRejected.status === 'invalid-state')
    }
  } else check('rejection fixture accepted', false)

  const unfrozen = createEventRegistry<'person.created'>('domain-events', '3.1.0')
  const pending = submitAiCandidate(createCandidateLog(), {
    candidateId: 'cand-005', targetKind: 'person.created', payload, registryVersion: '3.1.0',
  })
  if (pending.status === 'accepted') {
    const blocked = await validateAiCandidate(pending.log, ledger, unfrozen, 'cand-005', 'rule:review', later, later)
    check('unfrozen registry cannot validate candidate', blocked.status === 'invalid-registry')
  } else check('unfrozen fixture accepted', false)

  check('ledger sequence remains contiguous after rejected candidate operations', ledger.head === 2
    && ledger.events.map(event => event.seq).join(',') === '1,2')
  console.log(`AI candidate pipeline: ${passed}/${passed + failed} passed`)
  if (failed > 0) throw new Error(`AI candidate pipeline failed: ${failed}/${passed + failed}`)
}

void main()
