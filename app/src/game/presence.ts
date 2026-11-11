import { people } from '../data'
import { worldEvents } from './schedule'
import type { GameState } from './useGame'
import type { Period, Person, SceneId } from '../types'

/**
 * FE-145 在场投影（C-153）：只读，不写状态、不读新字段。
 * 在场只由「已声明当值位次（具名 + 未具名两层）× 时段」与「当日公开日程」决定；
 * 不做移动模拟、不做随机、不给未具名者姓名 / 面目 / 立场。
 * 两张静态表写在代码里，不落存档。
 */

export type PresenceSource = 'post' | 'schedule'
export interface PresentPerson { person: Person; reason: string; source: PresenceSource }
export interface AmbientPresence { text: string; count: number }

const scenePlaces: Record<SceneId, string> = {
  county: '县衙 · 签押房',
  river: '东堤 · 旧闸险工',
  study: '县衙 · 夜书房',
}

// 具名当值表：名册职掌 × 时段。县丞会勘在堤须 state.plan 存在。
const postTable: Array<{ scene: SceneId; id: string; periods: Period[]; reason: string; needsPlan?: boolean }> = [
  { scene: 'county', id: 'xiancheng', periods: ['晨', '午'], reason: '佐贰 · 早衙在签押房' },
  { scene: 'county', id: 'zhubu', periods: ['晨', '午', '暮'], reason: '主簿 · 掌账库，常在签押房' },
  { scene: 'river', id: 'foreman', periods: ['晨', '午', '暮', '夜'], reason: '堡夫头 · 常驻堤上' },
  { scene: 'river', id: 'expert', periods: ['晨', '午'], reason: '河工幕友 · 在堤看工' },
  { scene: 'river', id: 'xiancheng', periods: ['午', '暮'], reason: '县丞 · 会勘在堤', needsPlan: true },
  { scene: 'study', id: 'expert', periods: ['夜'], reason: '幕友 · 灯下校勘报' },
]

// 未具名在场表：只计公开度，不列名、不可点。暮后县衙散值、夜里东堤只余守夜棚、书房私第无外人。
const ambientTable: Record<SceneId, Partial<Record<Period, AmbientPresence>>> = {
  county: { 晨: { text: '书办 2 · 衙役 1', count: 3 }, 午: { text: '书办 2', count: 2 } },
  river: { 晨: { text: '夫役 3 · 堡夫 2', count: 5 }, 午: { text: '夫役 2 · 堡夫 1', count: 3 }, 暮: { text: '堡夫 1', count: 1 } },
  study: {},
}

// 职掌别名 → 名册 id；日程 present 串里出现姓名或别名即并入。
const aliasToId: Array<[string, string]> = [
  ['县丞', 'xiancheng'], ['主簿', 'zhubu'], ['幕友', 'expert'],
  ['堡夫头', 'foreman'], ['工头', 'foreman'], ['粮商', 'liangshang'], ['士绅', 'gentry'],
]

// 排序：日程人物在前；其余按品级 / 职掌（县丞 → 主簿 → 幕友 → 堡夫头 → 粮商 → 士绅）。
const rankOrder = ['xiancheng', 'zhubu', 'expert', 'foreman', 'liangshang', 'gentry']

export function ambientPeopleOf(_state: GameState, scene: SceneId, period: Period): AmbientPresence {
  return ambientTable[scene][period] ?? { text: '', count: 0 }
}

export function presentPeopleOf(state: GameState, scene: SceneId, period: Period): PresentPerson[] {
  const found = new Map<string, PresentPerson>()
  for (const row of postTable) {
    if (row.scene !== scene || !row.periods.includes(period)) continue
    if (row.needsPlan && !state.plan) continue
    const person = people.find(item => item.id === row.id)
    if (person) found.set(row.id, { person, reason: row.reason, source: 'post' })
  }
  // 当日公开日程与当前场景同名才并入；同人去重、日程优先。
  const event = worldEvents.find(item => item.day === state.day && item.scene === scenePlaces[scene])
  if (event) {
    for (const person of people) {
      const named = event.present.includes(person.name)
      const aliased = aliasToId.some(([alias, id]) => id === person.id && event.present.includes(alias))
      if (named || aliased) found.set(person.id, { person, reason: `公开日程 · ${event.title}`, source: 'schedule' })
    }
  }
  return [...found.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'schedule' ? -1 : 1
    return rankOrder.indexOf(a.person.id) - rankOrder.indexOf(b.person.id)
  })
}