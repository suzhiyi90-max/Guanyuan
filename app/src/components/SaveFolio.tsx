/**
 * C-92 存档案卷：立志纸左下的一枚压角折页。
 * 只做三件事——读本档现状（只读投影）、导出底稿（只读下载）、另立新志（两段落印，复用既有 resetGame）。
 * 目录只读列出既有 WorldId；恢复必须经 restore coordinator 完整验链与重放，不直接发布索引数据。
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Download, RotateCcw, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import type { PortableSaveImportResult, PortableSavePrepareResult } from '../persistence/portable-save-import'
import { PORTABLE_SAVE_MAX_BYTES } from '../persistence/strict-json'
import type { SaveRepositoryResult, SaveWorldSummary } from '../persistence/save-repository'

export interface SaveSummary {
  day: number
  period: string
  goal: string | null
  funds: number
  clues: number
  plan: string | null
  restored: boolean
}

const dayNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function SaveFolio({ summary, onExport, onReset, onPrepareImport, onCommitImport, onListSavedWorlds, onChooseSavedWorld, onDeleteSavedWorld, activeWorldId, extra }: { summary: SaveSummary, onExport?: () => void | Promise<void>, onReset: () => void, onPrepareImport?: (file: File) => Promise<PortableSavePrepareResult>, onCommitImport?: (file: File) => Promise<PortableSaveImportResult>, onListSavedWorlds?: () => Promise<SaveRepositoryResult<readonly SaveWorldSummary[]>>, onChooseSavedWorld?: (worldId: string) => Promise<void>, onDeleteSavedWorld?: (worldId: string) => Promise<{ readonly status: 'success'; readonly deleted: boolean } | { readonly status: 'rejected'; readonly issue: string }>, activeWorldId?: string | null, extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<PortableSavePrepareResult | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'checking' | 'ready' | 'committing' | 'success' | 'error'>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const [worlds, setWorlds] = useState<readonly SaveWorldSummary[]>([])
  const [worldsStatus, setWorldsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [worldsError, setWorldsError] = useState<string | null>(null)
  const [restoringWorldId, setRestoringWorldId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SaveWorldSummary | null>(null)
  const [deletingWorldId, setDeletingWorldId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const headRef = useRef<HTMLButtonElement | null>(null)
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const armTimer = useRef(0)
  const savedTimer = useRef(0)

  // 落印只等一次呼吸：8 秒内不再按，就自己收起。
  useEffect(() => {
    if (!armed) return
    armTimer.current = window.setTimeout(() => setArmed(false), 8000)
    return () => window.clearTimeout(armTimer.current)
  }, [armed])

  useEffect(() => () => {
    window.clearTimeout(armTimer.current)
    window.clearTimeout(savedTimer.current)
  }, [])

  // Esc 先撤印、再折页；拦在本组件内，不让它顺手关掉整张立志纸。
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (armed) setArmed(false)
      else { setOpen(false); headRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, armed])

  const handleExport = async () => {
    if (!onExport) return
    try {
      await onExport()
      setSaved(true)
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(false), 2600)
    } catch {
      setSaved(false)
    }
  }


  const refreshWorlds = useCallback(async () => {
    if (!onListSavedWorlds) return
    setWorldsStatus('loading')
    setWorldsError(null)
    try {
      const result = await onListSavedWorlds()
      if (result.status === 'success') {
        setWorlds(result.value)
        setWorldsStatus('ready')
      } else {
        setWorldsStatus('error')
        setWorldsError(`读取本机档案失败：${result.issue}`)
      }
    } catch {
      setWorldsStatus('error')
      setWorldsError('读取本机档案时发生异常。')
    }
  }, [onListSavedWorlds])

  useEffect(() => {
    if (open && onListSavedWorlds) void refreshWorlds()
  }, [open, onListSavedWorlds, refreshWorlds])

  const handleChooseWorld = async (worldId: string) => {
    if (!onChooseSavedWorld || restoringWorldId || deletingWorldId) return
    setRestoringWorldId(worldId)
    try {
      await onChooseSavedWorld(worldId)
    } finally {
      setRestoringWorldId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteSavedWorld || deletingWorldId || worldsStatus !== 'ready') return
    const target = deleteTarget
    setDeletingWorldId(target.worldId)
    setDeleteError(null)
    try {
      const result = await onDeleteSavedWorld(target.worldId)
      if (result.status === 'success' && result.deleted) {
        setDeleteTarget(null)
        await refreshWorlds()
      } else if (result.status === 'success') {
        setDeleteTarget(null)
        setDeleteError('档案已不存在，目录已重新核对。')
        await refreshWorlds()
      } else {
        const messages: Record<string, string> = {
          'active-world': '当前正在接续的人生不能删除。',
          'archive-operation-busy': '另一项档案操作正在进行，请稍后重试。',
          'active-session-changed': '等待期间当前人生发生变化，删除已取消。',
          'save-repository-head-conflict': '档案在确认期间发生新保存，请刷新目录后重试。',
          'save-repository-record-corrupt': '档案索引结构异常，已阻止普通删除。',
          'save-repository-unavailable': '本机存储不可用，未删除档案。',
          'save-repository-storage-error': '本机存储事务失败，未删除档案。',
        }
        setDeleteError(messages[result.issue] ?? `删除未完成：${result.issue}`)
      }
    } catch {
      setDeleteError('删除过程发生异常；档案状态未被确认，请刷新目录。')
    } finally {
      setDeletingWorldId(null)
    }
  }

  useEffect(() => {
    if (!deleteTarget) return
    deleteConfirmRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deletingWorldId) {
        event.preventDefault()
        event.stopPropagation()
        setDeleteTarget(null)
        setDeleteError(null)
        window.requestAnimationFrame(() => deleteTriggerRef.current?.focus())
        return
      }
      if (event.key === 'Tab') {
        const first = deleteCancelRef.current
        const last = deleteConfirmRef.current
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [deleteTarget, deletingWorldId])

  const clearImport = () => {
    setImportFile(null)
    setImportPreview(null)
    setImportStatus('idle')
    setImportError(null)
  }

  const handleImportSelect = async (file: File | undefined) => {
    if (!file) return
    setImportFile(file)
    setImportPreview(null)
    setImportError(null)
    setImportStatus('checking')
    if (file.size > PORTABLE_SAVE_MAX_BYTES) {
      setImportStatus('error')
      setImportError('文件超过 128 MiB 上限。')
      return
    }
    let result: PortableSavePrepareResult | undefined
    try {
      result = await onPrepareImport?.(file)
    } catch {
      setImportStatus('error')
      setImportError('文件预检意外中断；未写入档案，请重新选择。')
      return
    }
    if (!result) {
      setImportStatus('error')
      setImportError('导入服务尚未就绪。')
    } else if (result.status === 'rejected') {
      setImportStatus('error')
      setImportError(importIssueText(result.issue))
    } else {
      setImportPreview(result)
      setImportStatus('ready')
    }
  }

  const handleImportCommit = async () => {
    if (!importFile || !importPreview || !onCommitImport) return
    setImportStatus('committing')
    setImportError(null)
    let result: PortableSaveImportResult
    try {
      result = await onCommitImport(importFile)
    } catch {
      setImportStatus('error')
      setImportError('导入提交意外中断；请检查本机档案后再重试。')
      return
    }
    if (result.status === 'imported') {
      setImportStatus('success')
      setImportError('导入成功：档案已加入本机存档列表；当前人生未切换。')
      await refreshWorlds()
    } else {
      setImportStatus('error')
      setImportError(importIssueText(result.issue))
    }
  }

  function importIssueText(issue: string): string {
    const messages: Record<string, string> = {
      'file-too-large': '文件超过 128 MiB 上限。',
      'file-read-failed': '文件读取失败，请重新选择。',
      'json-invalid': 'JSON 格式无效或包含不允许的结构。',
      'envelope-invalid': '存档包结构不完整。',
      'format-unsupported': '不支持此存档格式或版本。',
      'envelope-checksum-failed': '存档摘要校验失败，文件可能已被修改。',
      'world-mismatch': '世界标识或事件流头不一致。',
      'schema-unsupported': '此存档版本与当前运行时不兼容。',
      'chain-corrupt': '存档链损坏，无法通过完整重放验证。',
      'checksum-failed': '存档校验和不匹配。',
      'world-exists': '本机已存在相同 WorldId 的档案。',
      'storage-quota-exceeded': '本机存储空间不足。',
      'storage-conflict': '存档写入发生并发冲突，请重试。',
      'storage-error': '本机存储不可用，导入未完成。',
    }
    return messages[issue] ?? '导入失败，未写入档案。'
  }

  const handleReset = () => {
    if (!armed) { setArmed(true); return }
    setArmed(false)
    onReset()
  }

  return (
    <div className="save-folio" ref={rootRef} data-open={open ? 'true' : 'false'} data-armed={armed ? 'true' : 'false'}>
      <button
        ref={headRef}
        type="button"
        className="save-folio-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setArmed(false); setOpen(value => !value) }}
      >
        <span className="save-folio-seal" aria-hidden="true">存</span>
        <span className="save-folio-title"><b>存档案卷</b><small>{summary.restored ? '本机存档 · 可继续接续' : '本机存档待写入'}</small></span>
        <span className="save-folio-day">第{dayNames[summary.day - 1]}日 · {summary.period}</span>
        <ChevronDown size={14} className="save-folio-chevron" aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="save-folio-body"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}
          >
            <div className="save-folio-inner">
              <dl className="save-folio-facts">
                <div><dt>志向</dt><dd>{summary.goal ?? '尚未立志'}</dd></div>
                <div><dt>私囊</dt><dd>{summary.funds} 两</dd></div>
                <div><dt>疑点</dt><dd>{summary.clues} 条</dd></div>
                <div><dt>抢护</dt><dd>{summary.plan ? '已发起' : '未发起'}<small>{summary.plan ? ' · 按日程走' : ''}</small></dd></div>
              </dl>

              <div className="save-folio-acts">
                <button type="button" className="save-folio-act" onClick={handleExport} disabled={!onExport}>
                  <Download size={13} aria-hidden="true" />
                  <span>{saved ? '便携包已导出' : '导出便携存档'}</span>
                </button>
                <button
                  type="button"
                  className={`save-folio-act is-danger ${armed ? 'is-armed' : ''}`}
                  onClick={handleReset}
                  aria-describedby={`${panelId}-note`}
                >
                  {armed ? <ShieldAlert size={13} aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
                  <span>{armed ? '再按一次 · 另立新志' : '清空重立志'}</span>
                </button>
              </div>

              {armed && <div className="save-folio-countdown" aria-hidden="true"><i /></div>}

              {onListSavedWorlds && (
                <section className="save-folio-library" aria-label="本机人生档案">
                  <div className="save-folio-library-head"><b>本机人生档案</b><button type="button" className="save-folio-act" onClick={() => void refreshWorlds()} disabled={worldsStatus === 'loading'}>刷新列表</button></div>
                  {worldsStatus === 'loading' && <p role="status">正在读取档案目录…</p>}
                  {worldsError && <p role="alert">{worldsError}</p>}
                  {worldsStatus === 'ready' && worlds.length === 0 && <p>本机尚无已保存的人生档案。</p>}
                  {worldsStatus === 'ready' && worlds.length > 0 && <ul className="save-folio-world-list">{worlds.map(world => (
                    <li key={world.worldId} className="save-folio-world">
                      <div><b>人生档案 · {world.worldId.slice(-8)}</b><small>{new Date(world.savedAt).toLocaleString()} · {world.packageKind === 'full' ? '完整卷' : '续记卷'} · {world.streamHead.seq} 条事件</small><small>校验摘要：{world.checksum.slice(0, 19)}…</small></div>
                      <div className="save-folio-world-actions">
                        <button type="button" className="save-folio-act" onClick={() => void handleChooseWorld(world.worldId)} disabled={restoringWorldId !== null || deletingWorldId !== null}>{restoringWorldId === world.worldId ? '正在验卷…' : '选择并恢复'}</button>
                        {onDeleteSavedWorld && <button
                          type="button"
                          className="save-folio-act is-danger"
                          ref={element => { if (deleteTarget?.worldId === world.worldId || (!deleteTarget && element)) deleteTriggerRef.current = element }}
                          onClick={() => { setDeleteError(null); setDeleteTarget(world) }}
                          disabled={worldsStatus !== 'ready' || restoringWorldId !== null || deletingWorldId !== null || activeWorldId === world.worldId}
                          title={activeWorldId === world.worldId ? '当前正在接续的人生不能删除' : worldsStatus !== 'ready' ? '请先成功刷新档案目录' : '删除此本机档案'}
                        >{activeWorldId === world.worldId ? '当前人生' : <><Trash2 size={12} />删除档案</>}</button>}
                      </div>
                    </li>
                  ))}</ul>}
                  <p>列表仅展示索引摘要。选择恢复时会重新读取存档，并执行完整校验链与事件重放；未成功验证前不会替换当前人生。</p>
                  {worldsStatus === 'error' && worlds.length > 0 && <p role="status">当前显示的是上次成功读取的旧目录；刷新成功前禁止删除。</p>}
                  {deleteError && <p role="alert">{deleteError}</p>}
                  {deleteTarget && (
                    <div className="save-folio-delete-backdrop">
                      <section className="save-folio-delete-dialog" role="dialog" aria-modal="true" aria-labelledby={`${panelId}-delete-title`} aria-describedby={`${panelId}-delete-description`}>
                        <span className="eyebrow">本机档案管理 · 删除确认</span>
                        <h3 id={`${panelId}-delete-title`}>确认删除此人生档案？</h3>
                        <p id={`${panelId}-delete-description`}>人生档案 · {deleteTarget.worldId.slice(-8)}</p>
                        <p>此操作不可撤销，只删除本机该人生及其完整存档链，不影响当前正在接续的人生。</p>
                        {deleteError && <p role="alert">{deleteError}</p>}
                        <div className="save-folio-delete-actions">
                          <button ref={deleteCancelRef} type="button" className="save-folio-act" onClick={() => { if (deletingWorldId) return; setDeleteTarget(null); setDeleteError(null); window.requestAnimationFrame(() => deleteTriggerRef.current?.focus()) }} disabled={deletingWorldId !== null}>取消</button>
                          <button ref={deleteConfirmRef} type="button" className="save-folio-act is-danger" onClick={() => void handleDeleteConfirm()} disabled={deletingWorldId !== null || worldsStatus !== 'ready' || activeWorldId === deleteTarget.worldId}>
                            {deletingWorldId === deleteTarget.worldId ? '正在删除…' : '确认删除此档案'}
                          </button>
                        </div>
                      </section>
                    </div>
                  )}
                </section>
              )}

              {onPrepareImport && onCommitImport && (
                <section className="save-folio-import" aria-label="导入便携存档">
                  <label className="save-folio-act" htmlFor={`${panelId}-import-file`}>
                    <Upload size={13} aria-hidden="true" />
                    <span>选择便携存档导入（JSON）</span>
                  </label>
                  <input
                    id={`${panelId}-import-file`}
                    type="file"
                    accept="application/json,.json"
                    onChange={event => { void handleImportSelect(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
                    disabled={importStatus === 'checking' || importStatus === 'committing'}
                    className="sr-only"
                  />
                  {importStatus === 'checking' && <p role="status">正在读取并完整验证存档；此阶段不会写入。</p>}
                  {importPreview?.status === 'prepared' && importStatus !== 'success' && (
                    <div className="save-folio-import-preview">
                      <b>预检通过 · 尚未写入</b>
                      <dl>
                        <div><dt>WorldId</dt><dd>{importPreview.worldId}</dd></div>
                        <div><dt>导出时间</dt><dd>{importPreview.exportedAt}</dd></div>
                        <div><dt>事件流序号</dt><dd>{importPreview.streamHead.seq}</dd></div>
                        <div><dt>存档链节点</dt><dd>{importPreview.chainNodeCount}</dd></div>
                      </dl>
                      <p>确认后将重新读取并验证文件，再新增本机档案；不会切换当前人生。</p>
                      <button type="button" className="save-folio-act" onClick={() => void handleImportCommit()} disabled={importStatus === 'committing'}>
                        {importStatus === 'committing' ? '正在提交…' : '确认导入'}
                      </button>
                      <button type="button" className="save-folio-act" onClick={clearImport} disabled={importStatus === 'committing'}>
                        <X size={13} />取消
                      </button>
                    </div>
                  )}
                  {importError && <p role={importStatus === 'error' ? 'alert' : 'status'}>{importError}</p>}
                  {(importStatus === 'error' || importStatus === 'success') && <button type="button" className="save-folio-act" onClick={clearImport}>关闭</button>}
                </section>
              )}

              <p className={`save-folio-note ${armed ? 'is-armed' : ''}`} id={`${panelId}-note`}>
                {armed
                  ? '重立志会创建新世界；已有本机存档保留，不自动删除。'
                  : '当前世界自动保存于本机；便携存档包含完整校验链，可供后续独立导入流程使用。'}
              </p>
              {extra}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
