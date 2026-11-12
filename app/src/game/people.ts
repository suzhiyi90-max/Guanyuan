import type { GameState } from './useGame'
import type { Person, RevealDepth, SceneId } from '../types'
import { people } from '../data'
import { presentPeopleOf } from './presence'
import { worldEvents } from './schedule'

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

/* --- FE-164 人物全貌档案只读投影（C-162）：不新增事实，只聚合既有权威数据 --- */

const archiveScenes: SceneId[] = ['county', 'river', 'study']

/** 当前时段此人在哪处场景（当值表 × 公开日程）；不在场返回 null。零费读取。 */
export function personPresenceOf(state: GameState, personId: string): { scene: SceneId; reason: string } | null {
  const period = (['晨', '午', '暮', '夜'] as const)[state.periodIndex] ?? '晨'
  for (const scene of archiveScenes) {
    const hit = presentPeopleOf(state, scene, period).find(item => item.person.id === personId)
    if (hit) return { scene, reason: hit.reason }
  }
  return null
}

/** 此人相关的既有凭据号（作者已写定的解锁语义）；展示前须按 state.unlocked 过认知闸。 */
export function personEvidenceIdsOf(personId: string): string[] {
  const map: Record<string, string[]> = {
    zhubu: ['E-002'],
    liangshang: ['E-003'],
    foreman: ['E-007'],
    expert: ['E-008'],
  }
  return map[personId] ?? []
}

/** 公开日程里与此人相关的安排（今日与未来）；只读作者写定的 worldEvents.present，不推断私下行踪。 */
export function personScheduleOf(state: GameState, personId: string): Array<{ day: number; title: string; when: '今日' | '未来' }> {
  const person = people.find(item => item.id === personId)
  if (!person) return []
  return worldEvents
    .filter(event => event.day >= state.day && (event.present.includes(person.name) || event.present.includes(person.role)))
    .map(event => ({ day: event.day, title: event.title, when: event.day === state.day ? '今日' as const : '未来' as const }))
}
