import type { WorldId } from '../src/domain/event-ledger'
import type { StreamCursor } from '../src/domain/event-replay'
import type {
  SaveRepository, SaveRepositoryIssue, SaveRepositoryResult, SaveWorldSummary, StoredWorldSave,
} from '../src/persistence/save-repository'
import { createPreviewRuntimeSession, dispatchPreviewRuntimeIntent } from '../src/game/runtime-orchestrator'
import { savePreviewRuntimeSession } from '../src/persistence/runtime-save-orchestrator'
import { exportPortableSave, validatePortableSaveEnvelope } from '../src/persistence/portable-save-export'
import { importPortableSaveBytes } from '../src/persistence/portable-save-import'

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
  async loadWorld(): Promise<SaveRepositoryResult<StoredWorldSave | null>> {
    return { status: 'success', value: this.current }
  }
  async commitWorld(input: { worldId: WorldId; packageChain: StoredWorldSave['packageChain']; expectedHead: StreamCursor | null; savedAt: string }): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (!sameCursor(this.current?.streamHead ?? null, input.expectedHead)) return { status: 'rejected', issue: 'save-repository-head-conflict' }
    this.current = Object.freeze({ worldId: input.worldId, packageChain: input.packageChain, streamHead: input.packageChain.snapshot.streamHead, savedAt: input.savedAt })
    return { status: 'success', value: this.current }
  }
  async importWorld(input: { worldId: WorldId; packageChain: StoredWorldSave['packageChain']; streamHead: StreamCursor; savedAt: string }): Promise<SaveRepositoryResult<StoredWorldSave>> {
    if (this.current) return { status: 'rejected', issue: 'save-repository-world-exists' }
    this.current = Object.freeze({ worldId: input.worldId, packageChain: input.packageChain, streamHead: input.streamHead, savedAt: input.savedAt })
    return { status: 'success', value: this.current }
  }
  async listWorlds(): Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>> { return { status: 'success', value: [] } }
  async deleteWorld(): Promise<SaveRepositoryResult<boolean>> { return { status: 'success', value: false } }
}
function appendGoal(session: ReturnType<typeof createPreviewRuntimeSession>, goalId: string) {
  const result = dispatchPreviewRuntimeIntent(session, { kind: 'goal.selected', payload: { goalId } })
  if (result.status !== 'appended') throw new Error('portable-export-test-append-failed')
  return result.session
}
async function main(): Promise<void> {
  const repo = new MemorySaveRepository()
  const session0 = createPreviewRuntimeSession('w5-e1-portable-test')
  const absent = await exportPortableSave(session0, repo, { now: () => '2026-11-16T08:00:00.000Z' })
  check('unsaved world is not exported', absent.status === 'rejected' && absent.issue === 'not-saved-yet')
  await savePreviewRuntimeSession(session0, repo, { now: () => '2026-11-16T08:01:00.000Z' })
  const fullBefore = repo.current
  const initialState = session0.state
  const initialLedger = session0.ledger
  const fullExport = await exportPortableSave(session0, repo, { now: () => '2026-11-16T08:02:00.000Z' })
  check('valid Full-only chain exports with independently verifiable envelope checksum',
    fullExport.status === 'exported' && fullExport.envelope.packageChain.packageKind === 'full'
      && await validatePortableSaveEnvelope(fullExport.envelope))
  check('pending save blocks export', (await exportPortableSave(session0, repo, { pending: true })).status === 'rejected'
    && (await exportPortableSave(session0, repo, { pending: true })).status === 'rejected')
  if (fullExport.status === 'exported') {
    const mutated = { ...fullExport.envelope, exportedAt: '2026-11-16T08:03:00.000Z' }
    check('envelope field tampering fails checksum validation', !(await validatePortableSaveEnvelope(mutated)))
    check('unknown envelope fields are rejected', !(await validatePortableSaveEnvelope({ ...fullExport.envelope, unexpected: true })))
  } else check('envelope field tampering fails checksum validation', false)
  check('export is read-only for Full-only repository', repo.current === fullBefore
    && session0.ledger === initialLedger && session0.state === initialState)
  if (fullExport.status === 'exported') {
    const importedRepo = new MemorySaveRepository()
    const bytes = new TextEncoder().encode(JSON.stringify(fullExport.envelope))
    const imported = await importPortableSaveBytes(bytes, importedRepo, { now: () => '2026-11-16T08:03:00.000Z' })
    check('verified Full-only portable envelope imports through domain replay', imported.status === 'imported'
      && imported.value.packageChain.packageKind === 'full')
    check('portable import adds a local archive without changing active session', session0.ledger === initialLedger
      && session0.state === initialState && importedRepo.current?.worldId === session0.worldId)
    const duplicate = await importPortableSaveBytes(bytes, importedRepo)
    check('portable import refuses an existing WorldId', duplicate.status === 'rejected' && duplicate.issue === 'world-exists')
    const malformedShape = {
      ...fullExport.envelope,
      packageChain: { ...fullExport.envelope.packageChain, snapshot: undefined },
    }
    const malformedResult = await importPortableSaveBytes(
      new TextEncoder().encode(JSON.stringify(malformedShape)),
      new MemorySaveRepository(),
    )
    check('malformed package shape is rejected without throwing', malformedResult.status === 'rejected'
      && malformedResult.issue === 'world-mismatch')
  } else {
    check('verified Full-only portable envelope imports through domain replay', false)
    check('portable import adds a local archive without changing active session', false)
    check('portable import refuses an existing WorldId', false)
  }

  const session1 = appendGoal(session0, 'river-repair')
  await savePreviewRuntimeSession(session1, repo)
  const session2 = appendGoal(session1, 'canal-inspection')
  await savePreviewRuntimeSession(session2, repo)
  const incrementalBefore = repo.current
  const incrementalExport = await exportPortableSave(session2, repo, { now: () => '2026-11-16T08:04:00.000Z' })
  check('multi-Incremental chain exports complete ancestry', incrementalExport.status === 'exported'
    && incrementalExport.envelope.packageChain.packageKind === 'incremental'
    && incrementalExport.envelope.packageChain.basePackage.packageKind === 'incremental'
    && await validatePortableSaveEnvelope(incrementalExport.envelope))
  check('multi-Incremental export leaves session and repository unchanged', repo.current === incrementalBefore
    && session2.ledger.head === 2 && session2.state.day === 1)
  const foreign = createPreviewRuntimeSession('w5-e1-foreign-world')
  check('different WorldId cannot export another world package', (await exportPortableSave(foreign, repo)).status === 'rejected')
  const validIncremental = repo.current!
  const brokenBase = Object.freeze({
    ...validIncremental,
    packageChain: Object.freeze({ ...validIncremental.packageChain, basePackage: undefined }) as unknown as typeof validIncremental.packageChain,
  })
  repo.current = brokenBase
  const missingBase = await exportPortableSave(session2, repo)
  check('incremental chain without base package is rejected', missingBase.status === 'rejected'
    && (missingBase.issue === 'chain-corrupt' || missingBase.issue === 'checksum-failed'))

  repo.current = Object.freeze({
    ...validIncremental,
    packageChain: Object.freeze({ ...validIncremental.packageChain, schemaVersion: 'unsupported-schema' }) as unknown as typeof validIncremental.packageChain,
  })
  const unsupportedSchema = await exportPortableSave(session2, repo)
  check('unsupported package schema is rejected', unsupportedSchema.status === 'rejected'
    && unsupportedSchema.issue === 'schema-unsupported')

  repo.current = Object.freeze({
    ...validIncremental,
    streamHead: { kind: 'event', seq: 1, eventId: 'not-the-chain-head' } as unknown as StreamCursor,
  })
  const headMismatch = await exportPortableSave(session2, repo)
  check('repository stream head mismatch is rejected', headMismatch.status === 'rejected'
    && headMismatch.issue === 'world-mismatch')

  repo.current = Object.freeze({
    ...validIncremental,
    packageChain: Object.freeze({
      ...validIncremental.packageChain,
      snapshot: Object.freeze({
        ...validIncremental.packageChain.snapshot,
        streamHead: { kind: 'event', seq: 1, eventId: 'not-the-session-head' } as unknown as StreamCursor,
      }),
    }) as unknown as typeof validIncremental.packageChain,
  })
  const chainHeadMismatch = await exportPortableSave(session2, repo)
  check('package snapshot head mismatch is rejected', chainHeadMismatch.status === 'rejected')

  repo.current = validIncremental
  const corrupt = repo.current!
  repo.current = Object.freeze({ ...corrupt, packageChain: Object.freeze({
    ...corrupt.packageChain, checksum: 'sha256:' + '0'.repeat(64),
  }) as typeof corrupt.packageChain })
  const rejected = await exportPortableSave(session2, repo)
  check('corrupt package checksum is rejected', rejected.status === 'rejected'
    && (rejected.issue === 'checksum-failed' || rejected.issue === 'chain-corrupt'))
  if (failed > 0) throw new Error(`portable-save-export: ${failed} failed, ${passed} passed`)
  console.log(`portable-save-export: ${passed}/${passed} passed`)
}
void main().catch(error => { console.error(error); throw error })
