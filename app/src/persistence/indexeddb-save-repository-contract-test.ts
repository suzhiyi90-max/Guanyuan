import { brandedId } from '../domain/shared/ids'
import type { FullSavePackage } from '../domain/save-package'
import type { IncrementalSavePackage } from '../domain/incremental-save-package'
import type { WorldId } from '../domain/event-ledger'
import type { EventId } from '../domain/shared/ids'
import { IndexedDbSaveRepository } from './indexeddb-save-repository'

const worldId = brandedId<'WorldId'>('w5-d1-browser-contract') as WorldId
const genesis = { kind: 'genesis', seq: 0 } as const
const head1 = { kind: 'event', seq: 1, eventId: brandedId<'EventId'>(`evt:${worldId}:1`) as EventId } as const
const checksum1 = `sha256:${'1'.repeat(64)}`
const checksum2 = `sha256:${'2'.repeat(64)}`

const full = {
  packageKind: 'full',
  worldId,
  schemaVersion: 1,
  streamRange: { fromExclusive: genesis, toInclusive: genesis },
  events: [],
  snapshot: { schemaVersion: 1, worldId, streamHead: genesis, checkpointAt: { day: 1, period: '晨' }, materialized: {} },
  checksum: checksum1,
} as unknown as FullSavePackage

const incremental = {
  packageKind: 'incremental',
  worldId,
  schemaVersion: 1,
  streamRange: { fromExclusive: genesis, toInclusive: head1 },
  events: [],
  snapshot: { schemaVersion: 1, worldId, streamHead: head1, checkpointAt: { day: 1, period: '午' }, materialized: {} },
  basePackage: full,
  checksum: checksum2,
} as unknown as IncrementalSavePackage

export async function runIndexedDbSaveRepositoryContractTests(): Promise<readonly string[]> {
  const passed: string[] = []
  const check = (name: string, condition: boolean): void => {
    if (!condition) throw new Error(`FAIL ${name}`)
    passed.push(name)
    console.log(`PASS ${name}`)
  }
  const suffix = `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const repository = new IndexedDbSaveRepository(globalThis.indexedDB, `guanyuan-${suffix}`)
  const unavailable = new IndexedDbSaveRepository(undefined, `guanyuan-${suffix}-none`)
  check('missing IndexedDB is reported as unavailable', (await unavailable.loadWorld(worldId)).status === 'rejected')
  const first = await repository.commitWorld({
    worldId, packageChain: full, expectedHead: null, savedAt: '2026-11-16T00:00:00.000Z',
  })
  check('genesis full package is committed for a new world', first.status === 'success')
  const loaded = await repository.loadWorld(worldId)
  check('full package survives IndexedDB structured-clone round trip', loaded.status === 'success'
    && loaded.value?.packageChain.checksum === checksum1 && loaded.value.streamHead.kind === 'genesis')
  const conflict = await repository.commitWorld({
    worldId, packageChain: incremental, expectedHead: null, savedAt: '2026-11-16T00:01:00.000Z',
  })
  check('stale expected head is rejected without replacing current world pointer', conflict.status === 'rejected'
    && conflict.issue === 'save-repository-head-conflict')
  const second = await repository.commitWorld({
    worldId, packageChain: incremental, expectedHead: genesis, savedAt: '2026-11-16T00:02:00.000Z',
  })
  check('incremental package is committed only against its stored base', second.status === 'success')
  const restored = await repository.loadWorld(worldId)
  check('incremental base chain is normalized in storage and hydrated on load', restored.status === 'success'
    && restored.value?.packageChain.packageKind === 'incremental'
    && restored.value.packageChain.basePackage.checksum === checksum1
    && restored.value.streamHead.seq === 1)
  const list = await repository.listWorlds()
  check('world index exposes head metadata without loading package payloads', list.status === 'success'
    && list.value.some(item => item.worldId === worldId && item.streamHead.seq === 1))
  const deleted = await repository.deleteWorld(worldId, head1)
  check('world deletion is guarded by the expected head', deleted.status === 'success' && deleted.value)
  const afterDelete = await repository.loadWorld(worldId)
  check('deletion removes the world and its package chain', afterDelete.status === 'success' && afterDelete.value === null)
  repository.close()
  unavailable.close()
  return Object.freeze(passed)
}
