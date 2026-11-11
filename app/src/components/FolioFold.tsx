/**
 * C-118 卷末总签：390 下把被隐藏的 inline 合卷索引收进一枚原生 details 折叠。
 * 不新增叠层 / OverlayId / 一级入口；展开只读既有索引，只换显示，不写任何状态到存档。
 */
import { FolioIndex } from './FolioIndex'
import type { FolioKey } from '../folioIndex'

export function FolioFold({ active, onOpen }: {
  active?: FolioKey
  onOpen?: (key: FolioKey) => void
}) {
  return (
    <details className="folio-fold" data-folio-fold="true">
      <summary data-folio-mount="true">卷末总签 · 展开只读合卷索引</summary>
      <div className="folio-fold-body">
        <FolioIndex variant="full" active={active} onOpen={onOpen} />
      </div>
    </details>
  )
}
