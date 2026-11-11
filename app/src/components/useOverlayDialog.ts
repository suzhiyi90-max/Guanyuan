import { useEffect, useRef } from 'react'

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
let activeOverlayDialogs = 0
let bodyOverflowBeforeOverlay = ''

export function useOverlayDialog<T extends HTMLElement>() {
  const dialogRef = useRef<T>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (activeOverlayDialogs === 0) bodyOverflowBeforeOverlay = document.body.style.overflow
    activeOverlayDialogs += 1
    // FE-140：roving 停靠件 tabIndex=-1 会被浏览器 Tab 跳过，trap 边界须同口径，否则末位不回收。
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(item => item.getClientRects().length > 0 && item.tabIndex >= 0)
    const focusFrame = requestAnimationFrame(() => (focusable()[0] ?? dialog).focus())
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    dialog.addEventListener('keydown', trapFocus)
    return () => {
      cancelAnimationFrame(focusFrame)
      dialog.removeEventListener('keydown', trapFocus)
      activeOverlayDialogs = Math.max(0, activeOverlayDialogs - 1)
      if (activeOverlayDialogs === 0) {
        document.body.style.overflow = bodyOverflowBeforeOverlay
        // FE-122：若旧叠层退场时已有新叠层接上，焦点交给新叠层，不再回落到背后的触发按钮。
        const nextDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
          .find(item => item !== dialog && item.getClientRects().length > 0)
        if (nextDialog) {
          requestAnimationFrame(() => {
            const target = Array.from(nextDialog.querySelectorAll<HTMLElement>(focusableSelector)).find(item => item.getClientRects().length > 0) ?? nextDialog
            target.focus()
          })
        } else if (opener?.isConnected) requestAnimationFrame(() => opener.focus())
      }
    }
  }, [])

  return dialogRef
}
