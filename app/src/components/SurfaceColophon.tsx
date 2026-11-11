/**
 * C-133 卷末落款：与章末卷末纸带同族的一条只读落款带。
 * 只显示表面名与既有说明文字；「回卷首」只移 DOM 焦点，1.2s 自撤、不写存档。
 * 不新增业务内容、不生成账 / 疑 / 礼、不参与任何判定。
 */
import { returnToFolioHead } from '../folioReturn'

export function SurfaceColophon({ surface, note, className = '', onReturn }: { surface: string; note?: string; className?: string; onReturn?: (from: HTMLElement) => void }) {
  const run = onReturn ?? returnToFolioHead
  return (
    <footer className={`surface-colophon ${className}`.trim()} data-folio-band="true" data-surface-colophon={surface}>
      <span>卷末落款 · {surface}</span>
      {note && <p>{note}</p>}
      <button type="button" className="read-colhead-return" data-folio-mount="true" onClick={event => run(event.currentTarget)} aria-label="回卷首 · 只把焦点送回本表面卷首题签">回卷首 <small>Alt ↑</small></button>
    </footer>
  )
}
