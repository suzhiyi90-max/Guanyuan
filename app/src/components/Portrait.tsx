import { useState } from 'react'
import type { Person } from '../types'

export function Portrait({ person, silhouette = false, size = 92 }: { person: Person, silhouette?: boolean, size?: number }) {
  const [failed, setFailed] = useState(false)
  const showImage = !silhouette && !failed

  return (
    <div className={`portrait ${showImage ? 'has-image' : 'is-silhouette'}`} style={{ width: size, height: size * 1.2 }} aria-label={`${person.name}肖像`}>
      {showImage ? (
        <img src={`/assets/portraits/${person.id}.jpg`} alt={`${person.name}半身像`} onError={() => setFailed(true)} />
      ) : (
        <svg viewBox="0 0 100 120" aria-hidden="true">
          <defs>
            <linearGradient id={`ink-${person.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a4a42" stopOpacity=".82" />
              <stop offset="1" stopColor="#4a4a42" stopOpacity=".38" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="38" r="17" fill={`url(#ink-${person.id})`} />
          <path d="M18 112c2-27 15-42 32-42s30 15 32 42Z" fill={`url(#ink-${person.id})`} />
          <path d="M33 30c4-12 30-12 34 0l-3 4c-8-6-20-6-28 0Z" fill="#3d3d36" opacity=".7" />
        </svg>
      )}
      <span className="portrait-monogram">{person.monogram}</span>
    </div>
  )
}
