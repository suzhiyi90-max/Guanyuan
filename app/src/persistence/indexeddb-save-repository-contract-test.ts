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
const checksum3 = `sha256:${'3'.repeat(64)}`
const checksum4 = `sha256:${'4'.repeat(64)}`

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
  const databaseName = `guanyuan-${suffix}`
  const repository = new IndexedDbSaveRepository(globalThis.indexedDB, databaseName)
  const unavailable = new IndexedDbSaveRepository(null, `${databaseName}-none`)
  check('missing IndexedDB is reported as unavailable', (await unavailable.loadWorld(worldId)).status === 'rejected')
  const malformed = await repository.commitWorld({
    worldId, packageChain: { ...full, checksum: 'bad-checksum' } as unknown as FullSavePackage,
    expectedHead: null, savedAt: '2026-11-16T00:00:00.000Z',
  })
  check('malformed package envelope is rejected before storage', malformed.status === 'rejected'
    && malformed.issue === 'save-repository-package-invalid')
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
  const missingBasePackage = { ...full, checksum: checksum3 } as FullSavePackage
  const missingBaseIncremental = { ...incremental, basePackage: missingBasePackage, checksum: checksum4 } as IncrementalSavePackage
  const missingBase = await repository.commitWorld({
    worldId, packageChain: missingBaseIncremental, expectedHead: genesis, savedAt: '2026-11-16T00:01:30.000Z',
  })
  check('incremental package cannot reference a base absent from repository', missingBase.status === 'rejected'
    && missingBase.issue === 'save-repository-base-missing')
  const wrongBase = {
    ...full,
    streamRange: { fromExclusive: genesis, toInclusive: head1 },
    snapshot: { ...full.snapshot, streamHead: head1 },
    checksum: checksum3,
  } as unknown as FullSavePackage
  const mismatchedIncremental = { ...incremental, basePackage: wrongBase } as IncrementalSavePackage
  const mismatch = await repository.commitWorld({
    worldId, packageChain: mismatchedIncremental, expectedHead: genesis, savedAt: '2026-11-16T00:01:45.000Z',
  })
  check('incremental package base head must equal its fromExclusive cursor', mismatch.status === 'rejected'
    && mismatch.issue === 'save-repository-package-invalid')
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
  const olderWorldId = brandedId<'WorldId'>('w5-d1-browser-contract-older') as WorldId
  const olderFull = { ...full, worldId: olderWorldId, snapshot: { ...full.snapshot, worldId: olderWorldId } } as unknown as FullSavePackage
  const olderWorld = await repository.commitWorld({
    worldId: olderWorldId, packageChain: olderFull, expectedHead: null, savedAt: '2026-11-15T00:00:00.000Z',
  })
  check('older world can coexist for deterministic index ordering', olderWorld.status === 'success')
  const orderedList = await repository.listWorlds()
  check('world index sorts newest savedAt first', orderedList.status === 'success'
    && orderedList.value[0]?.worldId === worldId && orderedList.value[1]?.worldId === olderWorldId)
  const staleDelete = await repository.deleteWorld(worldId, genesis)
  check('stale delete cannot remove a world after its head advanced', staleDelete.status === 'rejected'
    && staleDelete.issue === 'save-repository-head-conflict')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(databaseName, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const tamper = db.transaction('worlds', 'readwrite')
  const tamperDone = new Promise<void>((resolve, reject) => {
    tamper.oncomplete = () => resolve()
    tamper.onabort = () => reject(tamper.error)
    tamper.onerror = () => reject(tamper.error)
  })
  const worlds = tamper.objectStore('worlds')
  const worldRequest = worlds.get(worldId)
  worldRequest.onsuccess = () => worlds.put({ ...worldRequest.result, latestPackageKey: 'missing-package-node' })
  await tamperDone
  const corrupted = await repository.loadWorld(worldId)
  check('corrupt package pointer is reported, never treated as an empty world', corrupted.status === 'rejected'
    && corrupted.issue === 'save-repository-record-corrupt')
  const corruptDelete = await repository.deleteWorld(worldId, head1)
  check('corrupt world index cannot be deleted as if it were a valid archive', corruptDelete.status === 'rejected'
    && corruptDelete.issue === 'save-repository-record-corrupt')
  const repair = db.transaction('worlds', 'readwrite')
  const repairDone = new Promise<void>((resolve, reject) => {
    repair.oncomplete = () => resolve()
    repair.onabort = () => reject(repair.error)
    repair.onerror = () => reject(repair.error)
  })
  const repairStore = repair.objectStore('worlds')
  const repairRequest = repairStore.get(worldId)
  repairRequest.onsuccess = () => repairStore.put({ ...repairRequest.result, latestPackageKey: `${worldId}::${checksum2}` })
  await repairDone
  db.close()
  const deleted = await repository.deleteWorld(worldId, head1)
  check('world deletion is guarded by the expected head', deleted.status === 'success' && deleted.value)
  const afterDelete = await repository.loadWorld(worldId)
  check('deletion removes the world and its package chain', afterDelete.status === 'success' && afterDelete.value === null)
  const verifyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(databaseName, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const verifyTx = verifyDb.transaction('packages', 'readonly')
  const verifyDone = new Promise<void>((resolve, reject) => {
    verifyTx.oncomplete = () => resolve()
    verifyTx.onabort = () => reject(verifyTx.error)
    verifyTx.onerror = () => reject(verifyTx.error)
  })
  const deletedRows = await new Promise<unknown[]>((resolve, reject) => {
    const request = verifyTx.objectStore('packages').index('worldId').getAll(worldId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const survivingRows = await new Promise<unknown[]>((resolve, reject) => {
    const request = verifyTx.objectStore('packages').index('worldId').getAll(olderWorldId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await verifyDone
  const survivingWorld = await repository.loadWorld(olderWorldId)
  check('deletion removes every package row for the target WorldId', deletedRows.length === 0)
  check('deletion preserves another WorldId and its package chain', survivingRows.length === 1
    && survivingWorld.status === 'success' && survivingWorld.value?.worldId === olderWorldId
    && survivingWorld.value.packageChain.packageKind === 'full')
  verifyDb.close()

  const importRepository = new IndexedDbSaveRepository(globalThis.indexedDB, `${databaseName}-import`)
  const imported = await importRepository.importWorld({
    worldId, packageChain: incremental, streamHead: head1, savedAt: '2026-11-16T00:03:00.000Z',
  })
  check('foreign Full-to-Incremental chain imports into an empty repository', imported.status === 'success')
  const importedLoad = await importRepository.loadWorld(worldId)
  check('imported chain hydrates with its complete base ancestry', importedLoad.status === 'success'
    && importedLoad.value?.packageChain.packageKind === 'incremental'
    && importedLoad.value.packageChain.basePackage.packageKind === 'full'
    && importedLoad.value.streamHead.seq === 1)
  const importedList = await importRepository.listWorlds()
  check('imported world appears in local world index', importedList.status === 'success'
    && importedList.value.some(item => item.worldId === worldId && item.streamHead.seq === 1))
  const duplicateImport = await importRepository.importWorld({
    worldId, packageChain: full, streamHead: genesis, savedAt: '2026-11-16T00:04:00.000Z',
  })
  check('existing WorldId is rejected without overwriting imported chain', duplicateImport.status === 'rejected'
    && duplicateImport.issue === 'save-repository-world-exists')
  const stillImported = await importRepository.loadWorld(worldId)
  check('duplicate import preserves original imported head', stillImported.status === 'success'
    && stillImported.value?.streamHead.seq === 1)

  const concurrentRepository = new IndexedDbSaveRepository(globalThis.indexedDB, `${databaseName}-concurrent`)
  const concurrent = await Promise.all([1, 2].map(() => concurrentRepository.importWorld({
    worldId, packageChain: incremental, streamHead: head1, savedAt: '2026-11-16T00:05:00.000Z',
  })))
  check('concurrent same-WorldId imports allow exactly one winner', concurrent.filter(result => result.status === 'success').length === 1
    && concurrent.filter(result => result.status === 'rejected' && result.issue === 'save-repository-world-exists').length === 1)
  const raceRepository = new IndexedDbSaveRepository(globalThis.indexedDB, `${databaseName}-delete-races`)
  const raceWorldId = brandedId<'WorldId'>('w5-e3-delete-race') as WorldId
  const raceFull = { ...full, worldId: raceWorldId, snapshot: { ...full.snapshot, worldId: raceWorldId } } as unknown as FullSavePackage
  const raceIncremental = {
    ...incremental,
    worldId: raceWorldId,
    snapshot: { ...incremental.snapshot, worldId: raceWorldId },
    basePackage: raceFull,
  } as unknown as IncrementalSavePackage
  const raceSeed = await raceRepository.commitWorld({
    worldId: raceWorldId, packageChain: raceFull, expectedHead: null, savedAt: '2026-11-16T00:06:00.000Z',
  })
  check('delete race fixture commits a genesis world', raceSeed.status === 'success')
  const [raceDelete, raceSave] = await Promise.all([
    raceRepository.deleteWorld(raceWorldId, genesis),
    raceRepository.commitWorld({ worldId: raceWorldId, packageChain: raceIncremental, expectedHead: genesis, savedAt: '2026-11-16T00:07:00.000Z' }),
  ])
  const raceFinal = await raceRepository.loadWorld(raceWorldId)
  const raceIsAtomic = raceFinal.status === 'success' && (
    raceFinal.value === null
    || (raceFinal.value.streamHead.kind === 'event' && raceFinal.value.streamHead.seq === 1
      && raceFinal.value.packageChain.packageKind === 'incremental')
  )
  const raceOutcome = (raceDelete.status === 'success' && raceDelete.value === true
    && raceSave.status === 'rejected' && raceSave.issue === 'save-repository-head-conflict')
    || (raceSave.status === 'success'
      && raceDelete.status === 'rejected' && raceDelete.issue === 'save-repository-head-conflict')
  check('concurrent save and delete settle as one serialized outcome', raceIsAtomic && raceOutcome)
  await raceRepository.close()

  const importDeleteRepository = new IndexedDbSaveRepository(globalThis.indexedDB, `${databaseName}-import-delete-race`)
  const importDeleteWorldId = brandedId<'WorldId'>('w5-e3-import-delete-race') as WorldId
  const importDeleteFull = { ...full, worldId: importDeleteWorldId, snapshot: { ...full.snapshot, worldId: importDeleteWorldId } } as unknown as FullSavePackage
  const importDeleteSeed = await importDeleteRepository.commitWorld({
    worldId: importDeleteWorldId, packageChain: importDeleteFull, expectedHead: null, savedAt: '2026-11-16T00:08:00.000Z',
  })
  const [deleteDuringImport, importDuringDelete] = await Promise.all([
    importDeleteRepository.deleteWorld(importDeleteWorldId, genesis),
    importDeleteRepository.importWorld({
      worldId: importDeleteWorldId, packageChain: importDeleteFull, streamHead: genesis, savedAt: '2026-11-16T00:09:00.000Z',
    }),
  ])
  const importDeleteFinal = await importDeleteRepository.loadWorld(importDeleteWorldId)
  const importDeleteConsistent = importDeleteSeed.status === 'success'
    && deleteDuringImport.status === 'success' && deleteDuringImport.value
    && ((importDuringDelete.status === 'success' && importDeleteFinal.status === 'success'
        && importDeleteFinal.value?.streamHead.kind === 'genesis')
      || (importDuringDelete.status === 'rejected' && importDuringDelete.issue === 'save-repository-world-exists'
        && importDeleteFinal.status === 'success' && importDeleteFinal.value === null))
  check('concurrent import and delete preserve one transactionally valid final state', importDeleteConsistent)
  if (importDeleteFinal.status === 'success' && importDeleteFinal.value === null) {
    const retryImport = await importDeleteRepository.importWorld({
      worldId: importDeleteWorldId, packageChain: importDeleteFull, streamHead: genesis, savedAt: '2026-11-16T00:10:00.000Z',
    })
    check('delete racing with import leaves no orphan package keys', retryImport.status === 'success')
  } else {
    check('delete racing with import leaves no orphan package keys', importDeleteFinal.status === 'success'
      && importDeleteFinal.value?.packageChain.checksum === checksum1)
  }
  importDeleteRepository.close()
  await importRepository.deleteWorld(worldId, head1)
  await concurrentRepository.deleteWorld(worldId, head1)
  importRepository.close()
  concurrentRepository.close()
  repository.close()
  unavailable.close()
  return Object.freeze(passed)
}
