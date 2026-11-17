import type { WorldId } from '../src/domain/event-ledger'
import type { StreamCursor } from '../src/domain/event-replay'
import type {
  SaveRepository, SaveRepositoryIssue, SaveRepositoryResult, SaveWorldSummary, StoredWorldSave,
} from '../src/persistence/save-repository'
import { createPreviewRuntimeSession, dispatchPreviewRuntimeIntent } from '../src/game/runtime-orchestrator'
import { savePreviewRuntimeSession } from '../src/persistence/runtime-save-orchestrator'
import { restorePreviewRuntimeSession, restoreSingleSavedRuntimeWorld } from '../src/persistence/runtime-restore-orchestrator'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) { passed += 1; console.log(`PASS ${name}`) }
  else { failed += 1; console.error(`FAIL ${name}`) }
}
function sameCursor(left: StreamCursor | null, right: StreamCursor | null): boolean {
  return left === null || right === null ? left === right
    : left.kind === right.kind && left.seq === right.seq
      && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}
class MemorySaveRepository implements SaveRepository {
  current: StoredWorldSave | null = null
  loadIssue: SaveRepositoryIssue | null = null
  async loadWorld(worldId: WorldId): Promise<SaveRepositoryResult<StoredWorldSave | null>> {
    if (this.loadIssue) return { status: 'rejected', issue: this.loadIssue }
    return { status: 'success', value: this.current?.worldId === worldId ? this.current : null }
  }
  async commitWorld(input: { readonly worldId: WorldId; readonly packageChain: StoredWorldSave['packageChain']; readonly expectedHead: StreamCursor | null; readonly savedAt: string }): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (!sameCursor(this.current?.streamHead ?? null, input.expectedHead)) return { status: 'rejected', issue: 'save-repository-head-conflict' }
    this.current = Object.freeze({ worldId: input.worldId, packageChain: input.packageChain, streamHead: input.packageChain.snapshot.streamHead, savedAt: input.savedAt })
    return { status: 'success', value: this.current }
  }
  async importWorld(input: {
    readonly worldId: WorldId
    readonly packageChain: StoredWorldSave['packageChain']
    readonly streamHead: StreamCursor
    readonly savedAt: string
  }): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (this.current) return { status: 'rejected', issue: 'save-repository-world-exists' }
    this.current = Object.freeze({
      worldId: input.worldId,
      packageChain: input.packageChain,
      streamHead: input.streamHead,
      savedAt: input.savedAt,
    })
    return { status: 'success', value: this.current }
  }
  async listWorlds(): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>> { return { status: 'success', value: [] } }
  async deleteWorld(): Promise<SaveRepositoryResult<boolean>> { this.current = null; return { status: 'success', value: true } }
}
async function main(): Promise<void> {
  const repository = new MemorySaveRepository()
  const original = createPreviewRuntimeSession('w5-d3-restore-test')
  const missing = await restorePreviewRuntimeSession(original.worldId, repository)
  check('missing save returns missing without manufacturing a session', missing.status === 'missing' && original.ledger.head === 0)

  const first = dispatchPreviewRuntimeIntent(original, { kind: 'goal.selected', payload: { goalId: 'achievement' } })
  if (first.status !== 'appended') throw new Error('restore-test-first-append-failed')
  const saved = await savePreviewRuntimeSession(first.session, repository)
  check('fixture saved as a genesis-based full package', saved.status === 'saved' && saved.packageKind === 'full')

  let beforeAdvance = first.session
  for (const [intent, id] of [
    [{ kind: 'person.asked', payload: { personId: 'xiancheng' } }, 'restore-ask-xiancheng'],
    [{ kind: 'records.audited', payload: {} }, 'restore-audit'],
    [{ kind: 'river.probed', payload: {} }, 'restore-probe'],
  ] as const) {
    const result = dispatchPreviewRuntimeIntent(beforeAdvance, intent as never, id)
    if (result.status !== 'appended') throw new Error(`restore-test-pre-advance-failed:${id}`)
    beforeAdvance = result.session
  }
  const second = dispatchPreviewRuntimeIntent(beforeAdvance, { kind: 'day.advanced', payload: {} })
  if (second.status !== 'appended') throw new Error('restore-test-second-append-failed')
  const incremented = await savePreviewRuntimeSession(second.session, repository)
  check('fixture extended by an incremental package', incremented.status === 'saved' && incremented.packageKind === 'incremental')


  const otherWorld = createPreviewRuntimeSession('w5-d3-other-world')
  const storedIncrement = incremented.status === 'saved' ? incremented.stored : null
  const savedChain = storedIncrement?.packageChain ?? null
  const schemaRepository = new MemorySaveRepository()
  schemaRepository.current = storedIncrement && savedChain ? Object.freeze({
    ...storedIncrement,
    packageChain: Object.freeze({ ...savedChain, schemaVersion: 999 }) as StoredWorldSave['packageChain'],
  }) : null
  const schemaMismatch = await restorePreviewRuntimeSession(original.worldId, schemaRepository)
  check('unknown save schema is rejected before replay', schemaMismatch.status === 'rejected'
    && schemaMismatch.issue === 'runtime-restore-schema-mismatch')

  const headRepository = new MemorySaveRepository()
  headRepository.current = incremented.status === 'saved' ? Object.freeze({
    ...incremented.stored,
    streamHead: { kind: 'event', seq: 1, eventId: `evt:${original.worldId}:1` } as StreamCursor,
  }) : null
  const headMismatch = await restorePreviewRuntimeSession(original.worldId, headRepository)
  check('repository head divergence from package head is rejected', headMismatch.status === 'rejected'
    && headMismatch.issue === 'runtime-restore-package-invalid')

  const missingBaseRepository = new MemorySaveRepository()
  const incrementalPackage = savedChain
  missingBaseRepository.current = incrementalPackage?.packageKind === 'incremental'
    ? Object.freeze({
      ...storedIncrement!,
      packageChain: Object.freeze({ ...incrementalPackage, basePackage: null }) as unknown as StoredWorldSave['packageChain'],
    })
    : null
  const missingBase = await restorePreviewRuntimeSession(original.worldId, missingBaseRepository)
  check('incremental package with missing base is rejected', missingBase.status === 'rejected'
    && missingBase.issue === 'runtime-restore-package-invalid')

  const multiRepository = new MemorySaveRepository()
  multiRepository.listWorlds = async () => ({
    status: 'success',
    value: [
      { worldId: original.worldId, streamHead: { kind: 'event', seq: 2, eventId: `evt:${original.worldId}:2` } as StreamCursor, savedAt: '2026-11-16T00:00:00.000Z', packageKind: 'incremental', checksum: 'sha256:' + '1'.repeat(64) },
      { worldId: otherWorld.worldId, streamHead: { kind: 'genesis', seq: 0 }, savedAt: '2026-11-15T00:00:00.000Z', packageKind: 'full', checksum: 'sha256:' + '2'.repeat(64) },
    ],
  })
  const selection = await restoreSingleSavedRuntimeWorld(multiRepository)
  check('multiple saved lives require explicit selection', selection.status === 'selection-required'
    && selection.worlds.length === 2)

  const singleRepository = new MemorySaveRepository()
  singleRepository.current = storedIncrement
  singleRepository.listWorlds = async () => ({
    status: 'success',
    value: storedIncrement ? [{
      worldId: storedIncrement.worldId,
      streamHead: storedIncrement.streamHead,
      savedAt: storedIncrement.savedAt,
      packageKind: storedIncrement.packageChain.packageKind,
      checksum: storedIncrement.packageChain.checksum,
    }] : [],
  })
  const singleRestore = await restoreSingleSavedRuntimeWorld(singleRepository)
  check('exactly one saved life is restored without requiring a manual choice',
    singleRestore.status === 'restored' && singleRestore.session.worldId === original.worldId
      && singleRestore.session.ledger.head === 5)

  const restored = await restorePreviewRuntimeSession(original.worldId, repository)
  check('full plus incremental chain restores the exact world and stream head', restored.status === 'restored'
    && restored.session.worldId === original.worldId && restored.session.ledger.head === 5
    && restored.session.ledger.events.length === 5 && restored.session.state.day === second.session.state.day
    && restored.session.state.goalId === second.session.state.goalId)
  check('restore reconstructs request sequence for collision-free next command ids', restored.status === 'restored'
    && restored.session.requestSequence === 5)

  if (restored.status === 'restored') {
    const continued = dispatchPreviewRuntimeIntent(restored.session, {
      kind: 'world.event.resolved', payload: { eventId: 'material-arrival', optionId: 'weigh' },
    })
    check('restored ledger remains writable and appends the next sequence', continued.status === 'appended'
      && continued.session.ledger.head === 6 && continued.event.clientRequestId === 'player-command-6')
  } else check('restored ledger remains writable and appends the next sequence', false)

  const activeBefore = second.session
  const beforeCorruption = repository.current!
  repository.current = Object.freeze({
    ...beforeCorruption,
    packageChain: Object.freeze({ ...beforeCorruption.packageChain, checksum: 'sha256:' + '0'.repeat(64) }) as typeof beforeCorruption.packageChain,
  })
  const corrupt = await restorePreviewRuntimeSession(original.worldId, repository)
  check('corrupt checksum rejects restore', corrupt.status === 'rejected' && corrupt.issue === 'runtime-restore-package-invalid')
  check('failed restore cannot mutate the previously active session', activeBefore.ledger.head === 5
    && activeBefore.state === second.session.state)

  repository.current = null
  repository.loadIssue = 'save-repository-storage-error'
  const storageFailure = await restorePreviewRuntimeSession(original.worldId, repository)
  check('repository failures remain explicit and do not become empty saves', storageFailure.status === 'rejected'
    && storageFailure.issue === 'save-repository-storage-error')

  repository.loadIssue = null
  const validStored = incremented.status === 'saved' ? incremented.stored : null
  const mismatchRepository = new MemorySaveRepository()
  mismatchRepository.loadWorld = async () => ({
    status: 'success',
    value: validStored ? Object.freeze({ ...validStored, worldId: otherWorld.worldId }) : null,
  })
  const mismatch = await restorePreviewRuntimeSession(otherWorld.worldId, mismatchRepository)
  check('world identity mismatch is rejected', mismatch.status === 'rejected'
    && mismatch.issue === 'runtime-restore-world-mismatch')

  if (failed > 0) throw new Error(`runtime-restore-orchestrator: ${failed} failed, ${passed} passed`)
  console.log(`runtime-restore-orchestrator: ${passed}/${passed} passed`)
}
void main().catch(error => { console.error(error); throw error })
