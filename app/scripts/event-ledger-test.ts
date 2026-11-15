import { appendLedgerEvent, createEventLedger, type LedgerEventInput, type WorldId } from '../src/domain/event-ledger'
import { brandedId } from '../src/domain/shared/ids'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}
const world = brandedId<'WorldId'>('script-world') as WorldId
const time = { day: 1, period: '晨' } as const
const input: LedgerEventInput<'system.probe'> = {
  source: 'rule', kind: 'system.probe', intentKind: 'probe', actor: 'system',
  requestWorldTime: time, clientRequestId: 'probe-001', payload: { ok: true },
}
const appended = appendLedgerEvent(createEventLedger(world), input, time)
check('ledger script smoke append', appended.status === 'appended' && appended.event.seq === 1)
if (failed > 0) throw new Error(`Event ledger script failed: ${failed}/${passed + failed}`)
console.log(`Event ledger script: ${passed}/${passed + failed} passed`)
