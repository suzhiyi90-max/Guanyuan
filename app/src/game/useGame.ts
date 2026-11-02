import { useCallback, useEffect, useRef, useState } from 'react'
import { people } from '../data'
import { evaluateRiverTask, materialAfterArrival, worldEvents, type TaskOutcome } from './schedule'
import type { Clue, Comparison, GameLog, OfficialActionId, Period, RiverPlan, TaskStage, ToastMessage } from '../types'

export const periods: Period[] = ['晨', '午', '暮', '夜']
const SAVE_KEY = 'guanyuan.save.v1'

export interface GameState {
  goalId: string | null
  day: number
  periodIndex: number
  clues: Clue[]
  comparisons: Comparison[]
  unlocked: string[]
  asked: string[]
  completedActions: string[]
  plan: RiverPlan | null
  officialActions: OfficialActionId[]
  officialRead: boolean
  material: { arrived: number; transit: number; unsent: number }
  outcome: TaskOutcome | null
  handledEvents: string[]
  pendingEvent: string | null
  probeKnown: boolean
  privateFunds: number
  giftEntries: string[]
  log: GameLog
}

const initialState: GameState = {
  goalId: null,
  day: 1,
  periodIndex: 0,
  clues: [],
  comparisons: [],
  unlocked: ['E-001', 'P-006'],
  asked: [],
  completedActions: [],
  plan: null,
  officialActions: [],
  officialRead: false,
  material: { arrived: 30, transit: 10, unsent: 10 },
  outcome: null,
  handledEvents: [],
  pendingEvent: null,
  probeKnown: false,
  privateFunds: 60,
  giftEntries: [],
  log: {
    done: '接印，收东堤渗水呈文一件',
    stuck: '渗水因由未明，三人口供尚待接触',
    rumor: '茶楼有人说“修衙署”，暂无凭据',
  },
}

function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (!parsed || typeof parsed.day !== 'number' || !Array.isArray(parsed.clues)) return null
    return { ...initialState, ...parsed }
  } catch {
    return null
  }
}

export function officialAvailableOf(state: GameState): boolean {
  return state.day >= 2 || state.periodIndex >= 2
}

export function taskStageOf(state: GameState): TaskStage {
  if (state.plan) {
    if (state.day >= 10) return '结'
    if (state.officialActions.includes('commissioner')) return '验'
    if (state.day >= state.plan.day + 2) return '验'
    return '办'
  }
  if (state.completedActions.includes('plan-preview')) return '谋'
  if (state.clues.length > 0 || state.asked.length > 0 || state.probeKnown) return '查'
  return '起'
}

export function taskProgressOf(state: GameState): number {
  if (!state.plan) return 0
  const elapsed = (state.day - state.plan.day) * 4 + state.periodIndex - periods.indexOf(state.plan.period)
  return Math.max(6, Math.min(96, Math.round((elapsed / 12) * 100)))
}

export function nextCheckpointOf(state: GameState): { when: string; label: string } {
  if (!state.plan) {
    return state.periodIndex === 3
      ? { when: '即刻', label: '接风宴须作取舍' }
      : { when: '今夜', label: '桑宅接风帖，人情与旧欠同到' }
  }
  if (state.officialActions.includes('commissioner')) return { when: '第十日', label: '委员勘报已入卷 候汛后验收题销' }
  if (state.day === state.plan.day) return { when: '明日午', label: '料场复秤，工头回报夫役点卯' }
  if (state.day === state.plan.day + 1) return { when: '明日', label: '县丞会勘回报，抢护是否合式' }
  return { when: '第十日', label: '汛后验收题销，抢护始末入考语' }
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

export function useGuanyuanGame() {
  const [state, setState] = useState<GameState>(() => loadSave() ?? initialState)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const restored = useRef(Boolean(loadSave()))

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {
      /* 存储不可用时静默降级为单次会话 */
    }
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = useCallback((title: string, detail: string) => {
    setToast({ id: Date.now(), title, detail })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const setGoal = useCallback((goalId: string) => {
    setState(current => ({ ...current, goalId }))
  }, [])

  const advancePeriod = (current: GameState): GameState => {
    if (current.periodIndex < 3) return { ...current, periodIndex: current.periodIndex + 1 }
    return { ...current, periodIndex: 0, day: Math.min(10, current.day + 1) }
  }

  const spendAction = (current: GameState, key: string): GameState | null => {
    if (current.completedActions.includes(key)) return null
    return advancePeriod({ ...current, completedActions: [...current.completedActions, key] })
  }

  const rememberDocument = useCallback((selected: string[]) => {
    let result: 'ok' | 'need-more' | 'done' = 'ok'
    setState(current => {
      if (current.completedActions.includes('doc-remembered')) {
        result = 'done'
        return current
      }
      if (selected.length < 2) {
        result = 'need-more'
        return current
      }
      const hasCause = selected.some(id => id.startsWith('cause'))
      const text = hasCause
        ? '初稿断言“堤土未实”，定稿改称“闸底未明”：渗水因由并无勘查依据，书办为何先下结论？'
        : '东堤呈文两版在范围、料数或工法上有改动：改动依据未附，须找经手人问明。'
      const question = hasCause
        ? '未经探挖，初稿凭什么先定“堤土未实”？谁让书办这样写？'
        : '两版之间改了什么、谁来改、依据附在哪一页？'
      return {
        ...current,
        completedActions: [...current.completedActions, 'doc-remembered'],
        clues: [...current.clues, { id: `C-${current.clues.length + 1}`, text, source: 'document' as const, refs: selected, day: current.day }],
        comparisons: [...current.comparisons, { id: `B-${current.comparisons.length + 1}`, source: 'document' as const, refs: selected, question, day: current.day }],
        log: { ...current.log, stuck: '呈文因由有改，书办与闸底工法须再核' },
      }
    })
    return result
  }, [])

  const rememberLedger = useCallback((selected: string[]) => {
    let result: 'ok' | 'need-more' | 'done' = 'ok'
    setState(current => {
      if (current.completedActions.includes('ledger-remembered')) {
        result = 'done'
        return current
      }
      if (selected.length < 2) {
        result = 'need-more'
        return current
      }
      const ids = selected.join(' / ')
      return {
        ...current,
        completedActions: [...current.completedActions, 'ledger-remembered'],
        clues: [...current.clues, { id: `C-${current.clues.length + 1}`, text: `并置 ${ids}：三百两在库账、借领与旧欠中的名义不同，须核是否同一笔，不得重复计成六百两。`, source: 'ledger' as const, refs: selected, day: current.day }],
        comparisons: [...current.comparisons, { id: `B-${current.comparisons.length + 1}`, source: 'ledger' as const, refs: selected, question: '同一笔三百两，在几本账里各叫什么名字？经手人分别是谁？', day: current.day }],
        log: { ...current.log, stuck: '三百两名义不一，须核同一笔账的流转与责任' },
      }
    })
    return result
  }, [])

  const askPerson = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return 'missing' as const
    let repeated = false
    setState(current => {
      if (current.asked.includes(personId)) {
        repeated = true
        return current
      }
      const spent = spendAction(current, `ask-${personId}`)
      if (!spent) return current
      return {
        ...spent,
        asked: [...spent.asked, personId],
        unlocked: personId === 'liangshang' ? [...new Set([...spent.unlocked, 'E-003'])] : spent.unlocked,
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const audit = useCallback(() => {
    let repeated = false
    setState(current => {
      if (current.completedActions.includes('audit')) {
        repeated = true
        return current
      }
      const spent = spendAction(current, 'audit')
      if (!spent) return current
      return {
        ...spent,
        unlocked: [...new Set([...spent.unlocked, 'E-002'])],
        log: { ...spent.log, done: '细查旧册，找出主簿三百两借领状', stuck: '借领状与粮商旧欠是否同一笔，尚待互证' },
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const probe = useCallback(() => {
    let repeated = false
    setState(current => {
      if (current.probeKnown) {
        repeated = true
        return current
      }
      const spent = spendAction(current, 'probe')
      if (!spent) return current
      return {
        ...spent,
        probeKnown: true,
        unlocked: [...new Set([...spent.unlocked, 'E-007'])],
        clues: [...spent.clues, { id: `C-${spent.clues.length + 1}`, text: 'E-007 探挖记录：旧闸底淘空三尺。书办“毋庸拆验”与现场记录不符，但其动机尚不能据此断定。', source: 'river' as const, refs: ['E-007'], day: spent.day }],
        log: { ...spent.log, done: '亲勘东堤，探挖见闸底淘空三尺', stuck: '抢护可先行，拆修须汛后另案；料与夫仍有缺口' },
      }
    })
    return repeated ? ('repeated' as const) : ('ok' as const)
  }, [])

  const markPlanPreview = useCallback(() => {
    setState(current => current.completedActions.includes('plan-preview')
      ? current
      : { ...current, completedActions: [...current.completedActions, 'plan-preview'] })
  }, [])

  const confirmPlan = useCallback((plan: Omit<RiverPlan, 'day' | 'period'>) => {
    let accepted = false
    setState(current => {
      if (current.plan) return current
      const spent = spendAction(current, 'plan-river')
      if (!spent) return current
      accepted = true
      return {
        ...spent,
        plan: { ...plan, day: current.day, period: periods[current.periodIndex] },
        log: { ...spent.log, done: '东堤抢护已签押发起，县丞会勘、工头监作', stuck: '抢护需三至四日；在途十垛与旧欠仍可能生变' },
      }
    })
    return accepted
  }, [])

  const chooseBanquet = useCallback((choice: 'attend' | 'delegate' | 'audit') => {
    let accepted = false
    setState(current => {
      if (current.periodIndex !== 3) return current
      accepted = true
      if (choice === 'attend') {
        return {
          ...current,
          privateFunds: current.privateFunds - 20,
          giftEntries: [...current.giftEntries, '桑宅接风宴 · 亲赴，花费二十两'],
          unlocked: [...new Set([...current.unlocked, 'E-003'])],
          asked: [...new Set([...current.asked, 'liangshang', 'gentry'])],
          log: { done: '赴桑宅接风宴，取得旧欠票据与坟图线索', stuck: '三百两旧欠已有票据，偿还安排与坟地土源未定', rumor: '桑宅赞你通达；主簿整夜未发一言' },
        }
      }
      if (choice === 'delegate') {
        return {
          ...current,
          privateFunds: current.privateFunds - 6,
          giftEntries: [...current.giftEntries, '桑宅接风宴 · 县丞代往，备礼六两'],
          asked: [...new Set([...current.asked, 'xiancheng'])],
          log: { done: '请县丞代赴桑宅宴，县衙礼数未失', stuck: '旧欠只听转述，坟地仍须亲自说合', rumor: '桑士绅嫌你生分；县丞却记下这份托付' },
        }
      }
      return {
        ...current,
        unlocked: [...new Set([...current.unlocked, 'E-002'])],
        giftEntries: [...current.giftEntries, '桑宅接风宴 · 未赴，闭门查旧册'],
        log: { done: '闭门查旧册，取得主簿三百两借领状', stuck: '借领用途已见，粮商旧欠与现场抢护仍待核', rumor: '桑宅面上无光；主簿连夜打听谁动过旧册' },
      }
    })
    return accepted
  }, [])

  const runOfficialAction = useCallback((key: OfficialActionId) => {
    let repeated = false
    setState(current => {
      if (current.officialActions.includes(key)) {
        repeated = true
        return current
      }
      const base = { ...current, officialRead: true, officialActions: [...current.officialActions, key] }
      if (key === 'endorse') {
        return { ...base, log: { ...current.log, rumor: '知府批「查」字已到县 书办忙着把初稿抽出去' } }
      }
      if (key === 'suppress') {
        return { ...base, log: { ...current.log, rumor: '你把上宪来文压在匣底 幕友看见了 却没说话' } }
      }
      if (key === 'citation') {
        return { ...base, log: { ...current.log, rumor: '幕友把实迹拟成考语 一句话会在册子里留很多年' } }
      }
      const spent = spendAction(base, `official-${key}`)
      if (!spent) {
        repeated = true
        return current
      }
      if (key === 'commissioner') {
        return {
          ...spent,
          unlocked: [...new Set([...spent.unlocked, 'E-008'])],
          log: { ...spent.log, done: '请委员覆勘东堤 勘报与你探挖相合', stuck: '闸底淘空已复核 抢护合式与否候委员定论', rumor: '委员到县 主簿先把旧册锁进了库房' },
        }
      }
      if (key === 'files') {
        return {
          ...spent,
          unlocked: [...new Set([...spent.unlocked, 'E-004'])],
          log: { ...spent.log, done: '调河厅旧修造册并传询书办 旧工料数在册', stuck: '修造册与今次拨料须逐垛对核 书办口径已录', rumor: '书办被传询一次 见人便说「年久册乱」' },
        }
      }
      return {
        ...spent,
        log: { ...spent.log, done: '具揭参劾书办失察 稿已封发', stuck: '揭参已上 县衙上下各寻退路', rumor: '有人说你刻 有人说你清 委员尚未表态' },
      }
    })
    return repeated ? 'repeated' : 'ok'
  }, [])

  const continueNextDay = useCallback(() => {
    setState(current => {
      const day = Math.min(10, current.day + 1)
      let next: GameState = { ...current, day, periodIndex: 0 }

      if (day === 2 && next.material.transit > 0) {
        next = { ...next, material: { arrived: next.material.arrived + next.material.transit, transit: 0, unsent: next.material.unsent } }
      }
      if (next.plan && !next.outcome && day >= next.plan.day + 3) {
        next = { ...next, outcome: evaluateRiverTask(next) }
      }

      const rumors: Record<number, string> = {
        2: '在途十垛到岸 粮商等着县衙一句「如数」',
        3: '主簿开始重新誊册 他要先定一个说法',
        5: '委员到县 先听的是主簿与书办',
        8: '上游暴雨 东堤昼夜巡守 街上开始搬沙袋',
        9: '洪峰过境 县里人人自危',
        10: '验收题销 这一任的第一笔考语将落',
      }
      if (rumors[day]) next = { ...next, log: { ...next.log, rumor: rumors[day] } }

      const event = worldEvents.find(e => e.day === day && !current.handledEvents.includes(e.id))
      if (event) next = { ...next, pendingEvent: event.id }
      return next
    })
  }, [])

  const resolveWorldOption = useCallback((eventId: string, optionId: string) => {
    setState(current => {
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
      return base
    })
  }, [])

  const resetGame = useCallback(() => {
    localStorage.removeItem(SAVE_KEY)
    setState({ ...initialState })
  }, [])

  return {
    state,
    toast,
    notify,
    dismissToast,
    restored: restored.current,
    setGoal,
    rememberDocument,
    rememberLedger,
    askPerson,
    audit,
    probe,
    markPlanPreview,
    confirmPlan,
    runOfficialAction,
    chooseBanquet,
    continueNextDay,
    resolveWorldOption,
    resetGame,
  }
}
