interface RadarValue {
  label: string
  value: number
  hint?: string
}

export function RadarChart({ title, values, max, caption }: { title: string, values: RadarValue[], max: number, caption?: string }) {
  const size = 168
  const center = size / 2
  const radius = size / 2 - 30
  const n = values.length
  const point = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio] as const
  }
  const ring = (ratio: number) => values.map((_, i) => point(i, ratio).join(',')).join(' ')
  const shape = values.map((v, i) => point(i, Math.max(0.04, v.value / max)).join(',')).join(' ')

  return (
    <figure className="radar">
      <figcaption><span>{title}</span>{caption && <small>{caption}</small>}</figcaption>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
        {[1 / 3, 2 / 3, 1].map(ratio => <polygon key={ratio} points={ring(ratio)} fill="none" stroke="#c9bbA3" strokeWidth={ratio === 1 ? 1 : 0.6} />)}
        {values.map((_, i) => {
          const [x, y] = point(i, 1)
          return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#d6c9b2" strokeWidth={0.6} />
        })}
        <polygon points={shape} fill="#2e475622" stroke="#2e4756" strokeWidth={1.4} strokeLinejoin="round" />
        {values.map((v, i) => {
          const [x, y] = point(i, Math.max(0.04, v.value / max))
          return <circle key={i} cx={x} cy={y} r={2.4} fill="#a33a2b" />
        })}
        {values.map((v, i) => {
          const [x, y] = point(i, 1.24)
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
              {v.label}
            </text>
          )
        })}
      </svg>
      <ul className="radar-values">
        {values.map(v => <li key={v.label}><span>{v.label}</span><b>{v.value}</b>{v.hint && <small>{v.hint}</small>}</li>)}
      </ul>
    </figure>
  )
}
