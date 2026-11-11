import { useEffect, useState } from 'react'
import { paperPlates, type PaperPlateId } from '../paperArt'

/**
 * C-64 纸面美术层：探测两张纸样，成功后只设置 CSS 变量，纸纹由 styles.css 叠在五处纸面上。
 * 图未到时退回素纸、顶栏标「纸样待补 · 暂借素纸」；不用代码补画纸纹或界格。
 * 「纸样」开关是纯视觉本地状态，不写存档、不改任何业务 props。
 */
export function PaperTexture() {
  const [fallback, setFallback] = useState(false)
  const [on, setOn] = useState(true)
  useEffect(() => {
    const root = document.documentElement
    let cancelled = false
    ;(Object.keys(paperPlates) as PaperPlateId[]).forEach(id => {
      const spec = paperPlates[id]
      if (!spec.src) return
      const variable = `--paper-${id}`
      const probe = new Image()
      probe.onload = () => {
        if (cancelled) return
        root.style.setProperty(variable, `url("${spec.src}")`)
        if (id === 'grain' || id === 'ruled') root.dataset.paperReady = 'true'
        // FE-066：骑缝半印是待补图位，图到位才显示印位，缺图不铺空白块、不代码补画。
        if (id === 'seam') root.dataset.paperSeam = 'true'
        if (id === 'ghost') root.dataset.paperGhost = 'true'
        if (id === 'readacross') root.dataset.readacrossFallback = 'false'
      }
      probe.onerror = () => {
        if (cancelled) return
        if (id === 'grain' || id === 'ruled') { root.dataset.paperFallback = 'true'; setFallback(true); return }
        if (id === 'readacross') { root.dataset.readacrossFallback = 'true'; return }
        root.dataset[`${id}Fallback`] = 'true'
        // FE-126 / FE-127：谱纸与卷宗布面自带界面底样，缺图时只落标记，不写变量、不铺旧纸，
        // 免得把界面的网格 / 布面盖掉。图到位后变量照常写入。
        if (spec.cssFallback) return
        if (spec.fallbackSrc) {
          const fallback = new Image()
          fallback.onload = () => { if (!cancelled) root.style.setProperty(variable, `url("${spec.fallbackSrc}")`) }
          fallback.src = spec.fallbackSrc
        } else root.style.setProperty(variable, 'var(--paper-grain)')
      }
      probe.src = spec.src
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { document.documentElement.dataset.paperOn = on ? 'true' : 'false' }, [on])
  return <>
    <button className="paper-seal" onClick={() => setOn(current => !current)} aria-pressed={on} title="纸样 · 旧纸纹理开关" aria-label="切换纸样"><span>纸</span><small>样</small></button>
    {fallback && <span className="paper-pending-note" role="status">纸样待补 · 暂借素纸</span>}
  </>
}
