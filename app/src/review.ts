/**
 * FE-093 批阅尺的共享目次：四组批注与移焦顺序。
 * 只描述「在看哪一组」，不改文书、选证与判定。
 */
export const reviewGroups = [
  { id: 'cause', mark: '因', label: '渗水因由' },
  { id: 'scope', mark: '略', label: '险工范围' },
  { id: 'work', mark: '工', label: '处置工法' },
  { id: 'material', mark: '料', label: '拨料数目' },
] as const

export type ReviewGroupId = (typeof reviewGroups)[number]['id']

export const reviewFocusOrder = reviewGroups.flatMap(group => [`${group.id}-initial`, `${group.id}-final`])

export function reviewGroupOf(focus: string) {
  const id = focus.replace(/-(initial|final)$/, '')
  return reviewGroups.find(group => group.id === id) ?? reviewGroups[0]
}

export function reviewFocusLabel(focus: string) {
  const group = reviewGroupOf(focus)
  return `${group.mark} · ${group.label}`
}
