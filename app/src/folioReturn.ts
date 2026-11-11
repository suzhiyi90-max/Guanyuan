/**
 * C-133 回卷首：只把 DOM 焦点送回本表面卷首题签，1.2s 朱砂回声自撤。
 * 不触发点击、不改任何回调、不写存档、不参与判定。
 * Escape 仍由 App.tsx 的全局 keydown 独占用于关闭叠层，这里只认 Alt + ↑，一律不抢。
 */
import type { KeyboardEvent } from 'react'

/** 从触发点向上找第一个含卷首题签的容器；窄屏题签被隐藏时退到本表面标题。 */
export function returnToFolioHead(from: HTMLElement) {
  let node: HTMLElement | null = from
  while (node && node !== document.body) {
    const head = node.querySelector<HTMLElement>('.folio-head')
    const heading = node.querySelector<HTMLElement>('h1, h2')
    const target = head && head.getClientRects().length > 0
      ? head
      : heading && heading.getClientRects().length > 0 ? heading : null
    if (target) {
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1
      target.focus()
      target.dataset.folioReturn = 'true'
      window.setTimeout(() => { delete target.dataset.folioReturn }, 1200)
      return
    }
    node = node.parentElement
  }
}

/** Alt + ↑ 回卷首。其余键照常交给浏览器与既有巡览。 */
export function isFolioReturnKey(event: KeyboardEvent<HTMLElement>) {
  return event.altKey && event.key === 'ArrowUp'
}

export function handleFolioReturnKey(event: KeyboardEvent<HTMLElement>) {
  if (!isFolioReturnKey(event)) return false
  event.preventDefault()
  returnToFolioHead(event.currentTarget)
  return true
}

/** 案头的「卷首」是栏顶那行日期，不是栏底的题签行：只把焦点送回栏顶并滚回顶部。 */
export function returnToDeskTop(from: HTMLElement) {
  const aside = from.closest<HTMLElement>('.today-aside')
  if (!aside) return
  const top = aside.querySelector<HTMLElement>('.aside-topline') ?? aside.querySelector<HTMLElement>('.desk-index')
  if (!top) return
  if (!top.hasAttribute('tabindex')) top.tabIndex = -1
  top.focus({ preventScroll: true })
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  aside.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  top.dataset.folioReturn = 'true'
  window.setTimeout(() => { delete top.dataset.folioReturn }, 1200)
}
