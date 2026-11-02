import type { GameState } from './useGame'
import type { Person, RevealDepth } from '../types'

export const capabilityKeys = ['行政', '财政', '工程', '司法', '交涉'] as const
export const needKeys = ['仕途', '家族', '财富', '名声', '安全', '安逸'] as const

const titleLadder = ['生疏', '略懂', '熟手', '能吏', '专精', '大家']

export function capabilityTitleOf(value: number): string {
  return titleLadder[Math.max(0, Math.min(5, Math.round(value)))]
}

const specialty: Record<(typeof capabilityKeys)[number], string> = {
  行政: '庶政',
  财政: '钱谷',
  工程: '河工',
  司法: '刑名',
  交涉: '说合',
}

export function specialtyOf(person: Person): { key: (typeof capabilityKeys)[number], value: number, label: string } {
  const key = capabilityKeys.reduce((best, k) => person.capability[k] > person.capability[best] ? k : best, capabilityKeys[0])
  const value = person.capability[key]
  return { key, value, label: `${specialty[key]}${capabilityTitleOf(value)}` }
}

export function topNeedsOf(person: Person): Array<{ key: (typeof needKeys)[number], value: number }> {
  return needKeys
    .map(key => ({ key, value: person.needs[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
}

export function reputationLabelOf(person: Person): string {
  return person.reputation.join(' · ')
}

export function revealDepthOf(personId: string, state: GameState): RevealDepth {
  if (state.plan?.leader === personId) return '共事'
  if (personId === 'xiancheng' && state.plan) return '共事'
  if (personId === 'expert' && state.officialActions.includes('commissioner')) return '共事'
  if (personId === 'foreman' && state.probeKnown) return '共事'
  if (personId === 'zhubu' && (state.completedActions.includes('audit') || state.giftEntries.some(e => e.includes('闭门查旧册')))) return '共事'
  if ((personId === 'liangshang' || personId === 'gentry') && state.giftEntries.some(e => e.includes('亲赴'))) return '共事'
  if (state.asked.includes(personId)) return '相识'
  return '闻名'
}

export function sharedHistoryOf(personId: string, state: GameState): string[] {
  const rows: string[] = []
  const dayLabel = (day: number) => `第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][day - 1]}日`
  if (state.plan?.leader === personId) rows.push(`${dayLabel(state.plan.day)} 你托他主办东堤抢护 料${state.plan.material}垛 夫${state.plan.labor}人`)
  if (personId === 'xiancheng' && state.plan) rows.push(`${dayLabel(state.plan.day)} 抢护以他会勘留痕 责任共担`)
  if (personId === 'expert' && state.officialActions.includes('commissioner')) rows.push('委员覆勘 他的工法判断被勘报印证')
  if (personId === 'foreman' && state.probeKnown) rows.push('你随他下坑探挖 闸底淘空三尺亲见')
  if (personId === 'zhubu' && (state.completedActions.includes('audit') || state.giftEntries.some(e => e.includes('闭门查旧册')))) rows.push('你夜查旧册 他的借领状出了库房')
  if ((personId === 'liangshang' || personId === 'gentry') && state.giftEntries.some(e => e.includes('亲赴'))) rows.push('桑宅接风宴上 旧欠与坟图都摆到了桌面')
  if (state.asked.includes(personId)) rows.push('你正式问了他一回 说法已入情报台账')
  return rows.slice(0, 3)
}
