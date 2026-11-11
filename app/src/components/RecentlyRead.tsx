/**
 * C-96 最近看过：案头底部三枚窄签，记这一次会话里翻过的纸。
 * 只存内存（刷新归零）、不写存档、不改任何业务；与「回 · 上一处」分工：
 * 后者是「刚从哪儿跳来」的单跳来处，这里是「这一路翻过哪几张」。
 */
import type { DocMode, OverlayId, SectionId } from '../types'

export interface RecentSpot {
  key: string
  label: string
  detail?: string
  section: SectionId
  overlay: OverlayId
  docMode?: DocMode
}

const marks = ['一', '二', '三']

export function RecentlyRead({ items, onJump }: { items: RecentSpot[], onJump: (spot: RecentSpot) => void }) {
  if (items.length === 0) return null
  return (
    <section className="recent-slips" aria-label="最近看过 · 只记这一次会话">
      <header><span>刚才</span><small>只记这一回 · 刷新即散</small></header>
      <ol>
        {items.slice(0, 3).map((item, index) => (
          <li key={item.key}>
            <button type="button" onClick={() => onJump(item)} aria-label={`回到${item.label}${item.detail ? ` · ${item.detail}` : ''}`}>
              <i aria-hidden="true">{marks[index]}</i>
              <b>{item.label}</b>
              {item.detail && <small>{item.detail}</small>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
