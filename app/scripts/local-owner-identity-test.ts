import { ownerIdFromTrustedValue } from '../src/application/identity/owner'
import {
  createLocalOwnerIdentityPort,
  LOCAL_OWNER_IDENTITY_STORAGE_KEY,
  type OwnerIdentityStoragePort,
} from '../src/infrastructure/local-owner-identity'

// The application OwnerId stays provider-neutral; only this adapter accepts the local UUID namespace.
let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}
class MemoryStorage implements OwnerIdentityStoragePort {
  readonly values = new Map<string, string>()
  failRead = false
  failWrite = false
  ignoreWrite = false
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('read denied')
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error('write denied')
    if (!this.ignoreWrite) this.values.set(key, value)
  }
}

const uuidA = '123e4567-e89b-42d3-a456-426614174000'
const uuidB = '123e4567-e89b-42d3-a456-426614174001'

async function main(): Promise<void> {
  const serverMappedOwner = ownerIdFromTrustedValue('owner:account:server-verified-subject')
  check('application OwnerId accepts a trusted provider-neutral server mapping', serverMappedOwner === 'owner:account:server-verified-subject')
  let emptyOwnerRejected = false
  try { ownerIdFromTrustedValue('   ') } catch (error) {
    emptyOwnerRejected = error instanceof Error && error.message === 'owner-identity-value-empty'
  }
  check('application OwnerId rejects empty trusted identity values', emptyOwnerRejected)

  const storage = new MemoryStorage()
  let allocations = 0
  const first = createLocalOwnerIdentityPort({
    storage,
    allocateUuid: () => { allocations += 1; return uuidA },
  })
  const firstId = await first.resolve()
  check('first resolution allocates and persists one namespaced local OwnerId',
    firstId === `owner:local:${uuidA}`
    && storage.values.get(LOCAL_OWNER_IDENTITY_STORAGE_KEY) === firstId
    && allocations === 1)

  const restarted = createLocalOwnerIdentityPort({
    storage,
    allocateUuid: () => { allocations += 1; return uuidB },
  })
  const restartedId = await restarted.resolve()
  check('a new adapter instance recovers the same OwnerId after restart without reallocating',
    restartedId === firstId && allocations === 1)

  const corruptStorage = new MemoryStorage()
  corruptStorage.values.set(LOCAL_OWNER_IDENTITY_STORAGE_KEY, 'owner:local:tampered')
  let corruptAllocation = 0
  let corruptRejected = false
  try {
    await createLocalOwnerIdentityPort({
      storage: corruptStorage,
      allocateUuid: () => { corruptAllocation += 1; return uuidA },
    }).resolve()
  } catch (error) {
    corruptRejected = error instanceof Error && error.message === 'owner-identity-storage-corrupt'
  }
  check('corrupt persisted identity fails closed instead of silently changing ownership',
    corruptRejected && corruptAllocation === 0)

  const readFailure = new MemoryStorage()
  readFailure.failRead = true
  let readRejected = false
  try {
    await createLocalOwnerIdentityPort({ storage: readFailure, allocateUuid: () => uuidA }).resolve()
  } catch (error) {
    readRejected = error instanceof Error && error.message === 'owner-identity-storage-read-failed'
  }
  check('unavailable identity storage fails closed on read', readRejected)

  const writeFailure = new MemoryStorage()
  writeFailure.failWrite = true
  let writeRejected = false
  try {
    await createLocalOwnerIdentityPort({ storage: writeFailure, allocateUuid: () => uuidA }).resolve()
  } catch (error) {
    writeRejected = error instanceof Error && error.message === 'owner-identity-storage-write-failed'
  }
  check('unavailable identity storage fails closed on first write', writeRejected)

  const unconfirmedStorage = new MemoryStorage()
  unconfirmedStorage.ignoreWrite = true
  let unconfirmedRejected = false
  try {
    await createLocalOwnerIdentityPort({ storage: unconfirmedStorage, allocateUuid: () => uuidA }).resolve()
  } catch (error) {
    unconfirmedRejected = error instanceof Error && error.message === 'owner-identity-storage-write-failed'
  }
  check('identity write must be confirmed by read-back before resolution succeeds', unconfirmedRejected)

  let invalidUuidRejected = false
  try {
    await createLocalOwnerIdentityPort({
      storage: new MemoryStorage(),
      allocateUuid: () => 'not-a-uuid',
    }).resolve()
  } catch (error) {
    invalidUuidRejected = error instanceof Error && error.message === 'owner-identity-format-invalid'
  }
  check('malformed allocator output is rejected before persistence', invalidUuidRejected)

  if (failed > 0) throw new Error(`Local owner identity tests failed: ${failed}/${passed + failed}`)
  console.log(`Local owner identity tests: ${passed}/${passed + failed} passed`)
}
void main().catch(error => { console.error(error); throw error })
