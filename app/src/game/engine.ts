/**
 * FE-159 纯引擎：把时段 / 跨日 / 世界事件结算 / 考语投影从 useGame 抽成无 React 的纯函数。
 * 保行为抽取——数值、阈值、文案一条未改；useGame 只做 setState 包装与订阅。
 * FE-160 追加 verdictOf：只读既有事实的胜负投影，不引入任何新数值或新判定阈值。
 */
import { people } from '../data'
import type { GameState } from './useGame'
import type { OfficialActionId, Period } from '../types'
import { evaluateRiverTask, materialAfterArrival, worldEvents, type TaskOutcome } from './schedule'

export const periods: Period[] = ['晨', '午', '暮', '夜']

/** FE-161：自 useGame 原样移入纯引擎（口径一字未改），命令层与 UI 共用单源，避免另算一套可用性。 */
export function officialAvailableOf(state: GameState): boolean {
  return state.day >= 2 || state.periodIndex >= 2
}

export function advancePeriod(current: GameState): GameState {
  if (current.periodIndex < 3) return { ...current, periodIndex: current.periodIndex + 1 }
  return { ...current, periodIndex: 0, day: Math.min(10, current.day + 1) }
}

export function spendAction(current: GameState, key: string): GameState | null {
  if (current.completedActions.includes(key)) return null
  return advancePeriod({ ...current, completedActions: [...current.completedActions, key] })
}

const dayRumors: Record<number, string> = {
  2: '在途十垛到岸 粮商等着县衙一句「如数」',
  3: '主簿开始重新誊册 他要先定一个说法',
  5: '委员到县 先听的是主簿与书办',
  8: '上游暴雨 东堤昼夜巡守 街上开始搬沙袋',
  9: '洪峰过境 县里人人自危',
  10: '验收题销 这一任的第一笔考语将落',
}

export function advanceDay(current: GameState): GameState {
  const day = Math.min(10, current.day + 1)
  let next: GameState = { ...current, day, periodIndex: 0 }

  if (day === 2 && next.material.transit > 0) {
    next = { ...next, material: { arrived: next.material.arrived + next.material.transit, transit: 0, unsent: next.material.unsent } }
  }
  if (next.plan && !next.outcome && day >= next.plan.day + 3) {
    next = { ...next, outcome: evaluateRiverTask(next) }
  }
  if (dayRumors[day]) next = { ...next, log: { ...next.log, rumor: dayRumors[day] } }

  const event = worldEvents.find(e => e.day === day && !current.handledEvents.includes(e.id))
  if (event) next = { ...next, pendingEvent: event.id }
  return next
}

export function resolveWorldOptionPure(current: GameState, eventId: string, optionId: string): GameState {
  const base: GameState = { ...current, handledEvents: [...current.handledEvents, eventId], pendingEvent: null }
  if (eventId === 'material-arrival') {
    if (optionId === 'weigh') {
      const weighed = materialAfterArrival(base, true)
      return { ...weighed, log: { ...weighed.log, done: '料场复秤 在途十垛实收八垛半 虚松两垛入账', stuck: '虚松之垛与书办「如数收讫」须对质' } }
    }
    return { ...base, log: { ...base.log, rumor: '十垛记作如数收讫 无人再提虚松' } }
  }
  if (eventId === 'zhubu-visit') {
    if (optionId === 'confront') {
      return {
        ...base,
        clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: '主簿当堂改口：先称「借领与旧欠并非一事」，并置后无言。口径已录，日后再难翻供。', source: 'ledger' as const, refs: ['E-002', 'E-003'], day: base.day }],
        log: { ...base.log, done: '以借领状与旧欠并置 主簿当堂无言', stuck: '三百两名义已定 谁划去「损耗」一栏仍待上宪' },
      }
    }
    return { ...base, log: { ...base.log, rumor: '主簿重誊旧册 借领状那一页不见了' } }
  }
  if (eventId === 'commissioner-arrival') {
    if (optionId === 'inspect') {
      if (base.officialActions.includes('commissioner')) {
        return { ...base, log: { ...base.log, done: '委员二次赴堤 仍认定闸底淘空 抢护合式与否有公论' } }
      }
      return {
        ...base,
        officialRead: true,
        officialActions: [...base.officialActions, 'commissioner'],
        unlocked: [...new Set([...base.unlocked, 'E-008'])],
        log: { ...base.log, done: '委员赴东堤覆勘 勘报与你探挖相合', stuck: '闸底淘空已复核 抢护合式与否候委员定论', rumor: '委员到县 主簿先把旧册锁进了库房' },
      }
    }
    return { ...base, log: { ...base.log, rumor: '委员只看了县呈 未置一词 定性仍悬着' } }
  }
  if (eventId === 'storm') {
    if (optionId === 'inspect') {
      return {
        ...base,
        clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: '暴雨现场：水漫旧闸基石，培土之外须有人昼夜巡守；若只看回报，会以为抢护已成。', source: 'river' as const, refs: ['E-008'], day: base.day }],
        log: { ...base.log, done: '暴雨中亲赴东堤 水漫旧闸基石', stuck: '洪峰提前 抢护合式与否即见分晓' },
      }
    }
    return { ...base, log: { ...base.log, rumor: '你在县衙听回报 现场如何 全看写的人怎样落笔' } }
  }
  if (eventId === 'gate-gift') {
    if (optionId === 'forbid') {
      return { ...base, log: { ...base.log, done: '禁绝门包 明令门房不得私收', rumor: '门房被断了辛苦钱 怨望散值 门第清静却少了门下耳目' } }
    }
    return { ...base, log: { ...base.log, rumor: '门房照旧收门包 街面传县衙门第难进 求见先问门包' } }
  }
  return base
}

export interface ReckoningRow {
  tone: '进' | '改' | '缺'
  text: string
}

export interface GoalReckoning {
  goalId: string
  title: string
  seal: string
  rows: ReckoningRow[]
}

export function goalReckoningOf(state: GameState): GoalReckoning | null {
  if (!state.goalId) return null
  const rows: ReckoningRow[] = []
  const askedCount = state.asked.length
  const banquet = state.giftEntries[0] ?? ''

  if (state.goalId === 'achievement') {
    rows.push(state.plan
      ? { tone: '进', text: `抢护已签押发起 ${state.plan.leaderName}主办 料${state.plan.material}垛夫${state.plan.labor}人 可入考语的实事有了起笔` }
      : { tone: '缺', text: '东堤仍未有着落 案上只有两版呈文' })
    rows.push(state.probeKnown
      ? { tone: '进', text: '闸底淘空三尺已亲见 工法不再只听书办一面之词' }
      : { tone: '改', text: '闸底尚未亲勘 工法仍须托人之言' })
    if (state.officialActions.includes('commissioner')) rows.push({ tone: '进', text: '委员覆勘已至 闸底淘空复核在卷 考语里「河工」二字有着落' })
  }

  if (state.goalId === 'integrity') {
    rows.push(state.unlocked.includes('E-002')
      ? { tone: '进', text: '主簿借领状已在手 三百两有了第一个可追的名目' }
      : { tone: '缺', text: '三百两仍只记作运输损耗 未出名目' })
    rows.push(state.unlocked.includes('E-003')
      ? { tone: '进', text: '粮商旧欠票据已到 可与借领状并置 同一笔账渐清' }
      : { tone: '改', text: '旧欠只听传闻 尚未见到票据' })
    if (banquet.includes('亲赴')) rows.push({ tone: '改', text: '接风宴亲赴二十两 清名已沾应酬' })
    if (banquet.includes('闭门查旧册')) rows.push({ tone: '进', text: '桑宅之宴未赴 夜里查的是旧册' })
    if (state.officialActions.includes('impeach')) rows.push({ tone: '改', text: '揭参已上 清名与刻名并至 这句考语日后会被人翻出来' })
    if (state.officialActions.includes('suppress')) rows.push({ tone: '改', text: '上宪来文被压进匣底 清静一时 把柄却在人手里' })
  }

  if (state.goalId === 'network') {
    rows.push(askedCount > 0
      ? { tone: '进', text: `已正式接触 ${askedCount} 人 说法各自入台账 人情有了落点` }
      : { tone: '缺', text: '尚未正式问人 人情仍停在名帖上' })
    rows.push(state.asked.includes('xiancheng')
      ? { tone: '进', text: '县丞这条线已接上 会勘与移会有人可托' }
      : { tone: '改', text: '县丞尚未深谈 会勘仍缺一个肯签押的人' })
    if (banquet.includes('代往')) rows.push({ tone: '进', text: '县丞代赴桑宅 县衙礼数未失 他记下这份托付' })
    if (banquet.includes('闭门查旧册')) rows.push({ tone: '改', text: '桑宅面上无光 士绅这条线须另找补偿' })
    if (state.officialActions.includes('files')) rows.push({ tone: '改', text: '调卷传询之后 书办与主簿各自把你记成了一笔账' })
  }

  if (state.goalId === 'survival') {
    rows.push(state.completedActions.includes('doc-remembered')
      ? { tone: '进', text: '两版对勘已入卷 日后被问起来有据可引' }
      : { tone: '缺', text: '呈文改动尚未并置 口说无凭' })
    rows.push(state.plan
      ? { tone: '进', text: '抢护以会勘与保正具结留痕 责任不独在知县一人' }
      : { tone: '改', text: '尚未签押 也无会勘留痕 堤若出事无从分说' })
    if (state.completedActions.includes('ledger-remembered')) rows.push({ tone: '进', text: '三百两只并置不先定罪 账目这一层没有授人以柄' })
    if (state.officialActions.includes('commissioner')) rows.push({ tone: '进', text: '覆勘留痕已备 上宪之前亦有说辞 不是独自担着' })
  }

  const meta = {
    achievement: { title: '政绩', seal: '堤' },
    integrity: { title: '清名', seal: '清' },
    network: { title: '关系', seal: '和' },
    survival: { title: '自保', seal: '慎' },
  }[state.goalId] ?? { title: '志向', seal: '志' }

  return { goalId: state.goalId, ...meta, rows: rows.slice(0, 3) }
}

/* --- FE-160 胜负投影：只读既有事实，不新增数值 / 阈值 --- */

export const heldGrades: TaskOutcome['grade'][] = ['合龙', '合式', '苟延']

export interface Verdict {
  /** 堤：直接取既有 evaluateRiverTask 的分级；未发起 / 未到期为「未验」。 */
  dike: { grade: TaskOutcome['grade'] | '未验'; held: boolean; symptom: string }
  /** 账：借领状与旧欠票据是否都已入卷（并置成立），只读 unlocked。 */
  ledger: { paired: boolean; note: string }
  /** 留痕：对勘 / 并置 / 覆勘等既有 completedActions 与 officialActions 计数。 */
  trace: { compared: boolean; ledgerCompared: boolean; reviewed: boolean; count: number }
  /** 人情：正式接触人数，只读 asked。 */
  relations: number
  /** 志向照见：复用既有 goalReckoningOf，不另算一套。 */
  reckoning: GoalReckoning | null
  /** 是否已到可结算之日（第 10 日或已有 outcome）。 */
  settleable: boolean
}

export function verdictOf(state: GameState): Verdict {
  const grade = state.outcome?.grade ?? '未验'
  const paired = state.unlocked.includes('E-002') && state.unlocked.includes('E-003')
  const compared = state.completedActions.includes('doc-remembered')
  const ledgerCompared = state.completedActions.includes('ledger-remembered')
  const reviewed = state.officialActions.includes('commissioner')
  return {
    dike: { grade, held: heldGrades.includes(grade as TaskOutcome['grade']), symptom: state.outcome?.symptom ?? '抢护未发起或尚未到期，堤情仍悬' },
    ledger: { paired, note: paired ? '借领状与旧欠票据并置在卷 同一笔三百两有了名目' : '三百两尚未并置出名目 仍记作运输损耗' },
    trace: { compared, ledgerCompared, reviewed, count: state.completedActions.length + state.officialActions.length },
    relations: state.asked.length,
    reckoning: goalReckoningOf(state),
    settleable: state.day >= 10 || Boolean(state.outcome),
  }
}

export type { OfficialActionId }