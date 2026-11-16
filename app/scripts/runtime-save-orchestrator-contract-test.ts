import type { JsonValue, WorldId } from '../src/domain/event-ledger'
import type { StreamCursor } from '../src/domain/event-replay'
import type { SavePackageVerification } from '../src/domain/save-package'
import type {
  SaveRepository,
  SaveRepositoryIssue,
  SaveRepositoryResult,
  SaveWorldSummary,
  StoredWorldSave,
} from '../src/persistence/save-repository'
import { createPreviewRuntimeSession, dispatchPreviewRuntimeIntent } from '../src/game/runtime-orchestrator'
import { createInitialGameState } from '../src/game/initial-state'
import { reducePreviewRuntimeEvent } from '../src/game/runtime-projection'
import type { PreviewRuntimeEventKind } from '../src/game/runtime-registry'
import {
  savePreviewRuntimeSession,
  SAVE_PACKAGE_CHAIN_NODE_LIMIT,
  shouldPromoteToFullCheckpoint,
} from '../src/persistence/runtime-save-orchestrator'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

function sameCursor(left: StreamCursor | null, right: StreamCursor | null): boolean {
  return left === null || right === null
    ? left === right
    : left.kind === right.kind && left.seq === right.seq
      && (left.kind === 'genesis' || (right.kind === 'event' && left.eventId === right.eventId))
}

class MemorySaveRepository implements SaveRepository {
  current: StoredWorldSave | null = null
  failNextCommit: SaveRepositoryIssue | null = null

  async loadWorld(): Promise<SaveRepositoryResult<StoredWorldSave | null>> {
    return { status: 'success', value: this.current }
  }

  async commitWorld(input: {
    readonly worldId: WorldId
    readonly packageChain: StoredWorldSave['packageChain']
    readonly expectedHead: StreamCursor | null
    readonly savedAt: string
  }): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (this.failNextCommit) {
      const issue = this.failNextCommit
      this.failNextCommit = null
      return { status: 'rejected', issue }
    }
    const currentHead = this.current?.streamHead ?? null
    if (!sameCursor(currentHead, input.expectedHead)) {
      return { status: 'rejected', issue: 'save-repository-head-conflict' }
    }
    this.current = Object.freeze({
      worldId: input.worldId,
      packageChain: input.packageChain,
      streamHead: input.packageChain.snapshot.streamHead,
      savedAt: input.savedAt,
    })
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

  async listWorlds(): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>> {
    return { status: 'success', value: [] }
  }

  async deleteWorld(): Promise<SaveRepositoryResult<boolean>> {
    this.current = null
    return { status: 'success', value: true }
  }
}

function verificationFor(session: ReturnType<typeof createPreviewRuntimeSession>): SavePackageVerification<PreviewRuntimeEventKind> {
  return {
    registry: session.registry,
    initialState: createInitialGameState() as unknown as JsonValue,
    reduce: (state, event) => reducePreviewRuntimeEvent(
      state as unknown as ReturnType<typeof createInitialGameState>,
      event,
    ) as unknown as JsonValue,
  }
}

function appendGoal(session: ReturnType<typeof createPreviewRuntimeSession>, goalId: string) {
  const result = dispatchPreviewRuntimeIntent(session, {
    kind: 'goal.selected',
    payload: { goalId },
  })
  if (result.status !== 'appended') throw new Error(`runtime-save-test-append-failed:${result.status}`)
  return result.session
}

async function main(): Promise<void> {
  const repository = new MemorySaveRepository()
  const initial = createPreviewRuntimeSession('w5-d2-runtime-save')
  const untouchedState = initial.state

  const first = await savePreviewRuntimeSession(initial, repository, { now: () => '2026-11-16T08:00:00.000Z' })
  check('first save creates a full genesis package', first.status === 'saved'
    && first.packageKind === 'full' && first.streamHead.kind === 'genesis')
  check('save does not mutate the supplied runtime session', initial.state === untouchedState
    && initial.ledger.head === 0)

  const oneEvent = appendGoal(initial, 'river-repair')
  const second = await savePreviewRuntimeSession(oneEvent, repository, { now: () => '2026-11-16T08:01:00.000Z' })
  check('subsequent save creates an incremental package', second.status === 'saved'
    && second.packageKind === 'incremental' && second.streamHead.seq === 1)
  check('incremental package contains only events after the saved head', second.status === 'saved'
    && second.stored.packageChain.packageKind === 'incremental'
    && second.stored.packageChain.events.length === 1)

  const savedAtBeforeRetry = repository.current?.savedAt
  const repeated = await savePreviewRuntimeSession(oneEvent, repository, { now: () => '2026-11-16T08:02:00.000Z' })
  check('repeated save at the exact head is idempotent and does not append an empty package',
    repeated.status === 'saved' && repeated.stored === repository.current
      && repeated.packageKind === 'incremental'
      && repository.current?.savedAt === savedAtBeforeRetry
      && second.status === 'saved' && repository.current?.packageChain === second.stored.packageChain)

  const validChain = repository.current
  const validated = validChain
    ? await import('../src/domain/incremental-save-package').then(module =>
      module.validateSavePackageChain(validChain.packageChain, verificationFor(oneEvent)))
    : null
  check('persisted package chain revalidates checksum, replay and snapshot', validated?.status === 'valid')

  const twoEvents = appendGoal(oneEvent, 'canal-inspection')
  const third = await savePreviewRuntimeSession(twoEvents, repository)
  check('second incremental save extends the same immutable package chain', third.status === 'saved'
    && third.packageKind === 'incremental'
    && third.stored.packageChain.packageKind === 'incremental'
    && third.stored.packageChain.basePackage.packageKind === 'incremental')

  const stale = await savePreviewRuntimeSession(initial, repository)
  check('stale runtime cannot overwrite a newer persisted head', stale.status === 'rejected'
    && stale.issue === 'runtime-save-base-ahead')

  const threeEvents = appendGoal(twoEvents, 'flood-control-review')
  repository.failNextCommit = 'save-repository-head-conflict'
  const concurrent = await savePreviewRuntimeSession(threeEvents, repository)
  check('repository CAS conflict is surfaced without mutating runtime state', concurrent.status === 'rejected'
    && concurrent.issue === 'save-repository-head-conflict'
    && threeEvents.ledger.head === 3
    && repository.current?.streamHead.seq === 2)

  const beforeCorruption = repository.current!
  repository.current = Object.freeze({
    ...beforeCorruption,
    packageChain: Object.freeze({
      ...beforeCorruption.packageChain,
      checksum: 'sha256:' + '0'.repeat(64),
    }) as typeof beforeCorruption.packageChain,
  })
  const corrupt = await savePreviewRuntimeSession(twoEvents, repository)
  check('corrupt existing chain is rejected rather than overwritten', corrupt.status === 'rejected'
    && corrupt.issue === 'runtime-save-package-invalid')

  let syntheticChain = { packageKind: 'full' } as unknown as import('../src/domain/incremental-save-package').SavePackageChain
  for (let index = 1; index < SAVE_PACKAGE_CHAIN_NODE_LIMIT; index += 1) {
    syntheticChain = { packageKind: 'incremental', basePackage: syntheticChain } as typeof syntheticChain
  }
  check('checkpoint policy promotes at the adapter chain-node ceiling',
    SAVE_PACKAGE_CHAIN_NODE_LIMIT === 128 && shouldPromoteToFullCheckpoint(syntheticChain))

  if (failed > 0) throw new Error(`runtime-save-orchestrator: ${failed} failed, ${passed} passed`)
  console.log(`runtime-save-orchestrator: ${passed}/${passed} passed`)
}

void main().catch(error => { console.error(error); throw error })
