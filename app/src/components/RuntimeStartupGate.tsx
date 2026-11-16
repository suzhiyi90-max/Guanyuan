import { useState } from 'react'
import { AlertTriangle, BookOpen, LoaderCircle, ScrollText } from 'lucide-react'
import type { RuntimeStartupView } from '../persistence/runtime-startup-types'

function issueLabel(issue: string): string {
  const labels: Record<string, string> = {
    'save-repository-unavailable': '本机存档仓库不可用。请检查浏览器是否允许本地存储。',
    'save-repository-storage-error': '读取本机存档时发生存储错误。原存档未被改写。',
    'save-repository-record-corrupt': '存档索引或存档包记录损坏。为保护人生记录，系统没有将它当作空档。',
    'runtime-restore-package-invalid': '存档链校验未通过。原存档保持不动。',
    'runtime-restore-replay-failed': '事件重放失败，无法安全恢复这段人生。',
    'runtime-restore-schema-mismatch': '该存档版本与当前运行时不兼容，未执行自动迁移。',
  }
  return labels[issue] ?? `启动恢复未完成（${issue}）。原存档保持不动。`
}

export function RuntimeStartupGate({ startup, onSelect, onRetry }: {
  startup: RuntimeStartupView
  onSelect: (worldId: string) => void
  onRetry: () => void
}) {
  const [selecting, setSelecting] = useState<string | null>(null)
  return (
    <main className="runtime-startup" aria-live="polite">
      <div className="runtime-startup-paper">
        <div className="runtime-startup-mark" aria-hidden="true">观远</div>
        <span className="eyebrow">本机档案 · 启动校验</span>
        {startup.status === 'loading' && (
          <section className="runtime-startup-state">
            <LoaderCircle className="runtime-startup-spinner" size={24} aria-hidden="true" />
            <h1>正在检阅旧卷</h1>
            <p>先核对存档索引、事件账本与校验链。完成前不会开启新案头。</p>
          </section>
        )}
        {startup.status === 'selection-required' && (
          <section className="runtime-startup-state">
            <ScrollText size={24} aria-hidden="true" />
            <h1>案头不止一卷</h1>
            <p>检测到多段人生。请明确选择要接续的存档；系统不会替你挑选。</p>
            <div className="runtime-startup-worlds">
              {startup.worlds.map((world) => {
                const busy = selecting === world.worldId
                return (
                  <button
                    key={world.worldId}
                    type="button"
                    className="runtime-startup-world"
                    disabled={selecting !== null}
                    onClick={() => {
                      setSelecting(world.worldId)
                      onSelect(world.worldId)
                    }}
                  >
                    <span className="runtime-startup-world-seal"><BookOpen size={17} /></span>
                    <span className="runtime-startup-world-copy">
                      <b>人生档案 · {world.worldId.slice(-8)}</b>
                      <small>{new Date(world.savedAt).toLocaleString()} · {world.packageKind === 'full' ? '完整卷' : '续记卷'} · {world.streamHead.seq} 条事件</small>
                    </span>
                    <span className="runtime-startup-world-action">{busy ? '正在验卷…' : '接续此卷'}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
        {startup.status === 'error' && (
          <section className="runtime-startup-state">
            <AlertTriangle size={24} aria-hidden="true" />
            <h1>旧卷暂不能开启</h1>
            <p>{issueLabel(startup.issue)}</p>
            <button type="button" className="runtime-startup-retry" onClick={onRetry}>重新检阅</button>
          </section>
        )}
        <footer>校验通过后才会发布运行时会话 · 不自动读取旧版 v1 底稿</footer>
      </div>
    </main>
  )
}
