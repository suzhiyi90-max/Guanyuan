/**
 * C-135 印刷表面：把「这一页」标在 html 上，再交给浏览器打印。
 * 只改一个静态 data-* 供 @media print 选择，不写存档、不改业务、不新增叠层。
 * 打印结束（afterprint / 兜底计时）即撤标记，后续 Ctrl+P 仍按默认。
 */
export type PrintSurface = 'epilogue' | 'epilogue-all' | 'document' | 'ledger' | 'evidence' | 'dossier-registry'

export function printSurface(surface: PrintSurface) {
  const root = document.documentElement
  const previous = root.dataset.printSurface
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    window.removeEventListener('afterprint', cleanup)
    if (previous) root.dataset.printSurface = previous
    else delete root.dataset.printSurface
  }
  root.dataset.printSurface = surface
  window.addEventListener('afterprint', cleanup)
  window.setTimeout(() => {
    window.print()
    window.setTimeout(cleanup, 1200)
  }, 40)
}
