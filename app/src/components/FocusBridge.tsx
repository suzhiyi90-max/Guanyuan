import { useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useFocus } from '../focusContext'

/**
 * C-62 回查焦点桥：跳转后给目标纸片加朱砂焦点框并滚入视野，2.8 秒后撤去。
 * 各屏只挂静态 data-focus-id，不包裹 DOM、不改 props，也不触碰业务状态。
 */
export function FocusBridge() {
  const { key, nonce } = useFocus()
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (!key) return
    const root = document.documentElement
    // 高亮由根属性 + CSS 选择器驱动，React 重渲染也不会冲掉焦点。
    root.dataset.focusKey = key
    let target: HTMLElement | null = null
    const timers: number[] = []
    let tries = 0
    // 叠层有进退场，找到目标纸片再落焦点；同一目标重复点击靠 nonce 重播。
    const find = () => {
      target = document.querySelector<HTMLElement>(`[data-focus-id="${key}"]`)
      if (!target) {
        if (tries++ < 10) timers.push(window.setTimeout(find, 70))
        return
      }
      target.classList.add('is-focus-target')
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
    }
    timers.push(window.setTimeout(find, 90))
    timers.push(window.setTimeout(() => { root.removeAttribute('data-focus-key'); target?.classList.remove('is-focus-target') }, 2800))
    return () => {
      timers.forEach(id => window.clearTimeout(id))
      root.removeAttribute('data-focus-key')
      target?.classList.remove('is-focus-target')
    }
  }, [key, nonce, reduceMotion])
  return null
}
