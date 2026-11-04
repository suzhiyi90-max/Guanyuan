import { useEffect, useRef, useState } from 'react'
import { people } from '../data'
import type { OfficialActionId, RiverPlan, ToastMessage } from '../types'
import { advancePeriod, initialState, periods, spendAction, type GameState } from './model'
import { evaluateRiverTask, materialAfterArrival, worldEvents } from './schedule'
import { clearGame, loadGame, persistGame } from '../services/save'

export function useGuanyuanGame() {
  const [state, setState] = useState<GameState>(initialState)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [ready, setReady] = useState(false)
  const [restored, setRestored] = useState(false)
  const stateRef = useRef(state)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadGame().then(result => {
      if (!mounted.current) return
      if (result.state) {
        stateRef.current = result.state
        setState(result.state)
      }
      setRestored(result.restored)
      setReady(true)
    }).catch(error => {
      console.warn('[观远] 存档初始化未完成', error)
      if (mounted.current) setReady(true)
    })
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (ready) void persistGame(state)
  }, [ready, state])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  const update = (recipe: (current: GameState) => GameState) => {
    const next = recipe(stateRef.current)
    stateRef.current = next
    setState(next)
    return next
  }
  const notify = (title: string, detail: string) => setToast({ id: Date.now(), title, detail })
  const dismissToast = () => setToast(null)
  const setGoal = (goalId: string) => update(current => ({ ...current, goalId }))

  const rememberDocument = (selected: string[]) => {
    const current = stateRef.current
    if (current.completedActions.includes('doc-remembered')) return 'done' as const
    if (selected.length < 2) return 'need-more' as const
    update(base => {
      const hasCause = selected.some(id => id.startsWith('cause'))
      const text = hasCause ? '初稿断言“堤土未实”，定稿改称“闸底未明”：渗水因由并无勘查依据，书办为何先下结论？' : '东堤呈文两版在范围、料数或工法上有改动：改动依据未附，须找经手人问明。'
      const question = hasCause ? '未经探挖，初稿凭什么先定“堤土未实”？谁让书办这样写？' : '两版之间改了什么、谁来改、依据附在哪一页？'
      return { ...base, completedActions: [...base.completedActions, 'doc-remembered'], clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text, source: 'document', refs: selected, day: base.day }], comparisons: [...base.comparisons, { id: `B-${base.comparisons.length + 1}`, source: 'document', refs: selected, question, day: base.day }], log: { ...base.log, stuck: '呈文因由有改，书办与闸底工法须再核' } }
    })
    return 'ok' as const
  }

  const rememberLedger = (selected: string[]) => {
    const current = stateRef.current
    if (current.completedActions.includes('ledger-remembered')) return 'done' as const
    if (selected.length < 2) return 'need-more' as const
    update(base => ({ ...base, completedActions: [...base.completedActions, 'ledger-remembered'], clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: `并置 ${selected.join(' / ')}：三百两在库账、借领与旧欠中的名义不同，须核是否同一笔，不得重复计成六百两。`, source: 'ledger', refs: selected, day: base.day }], comparisons: [...base.comparisons, { id: `B-${base.comparisons.length + 1}`, source: 'ledger', refs: selected, question: '同一笔三百两，在几本账里各叫什么名字？经手人分别是谁？', day: base.day }], log: { ...base.log, stuck: '三百两名义不一，须核同一笔账的流转与责任' } }))
    return 'ok' as const
  }

  const askPerson = (personId: string) => {
    if (!people.some(person => person.id === personId)) return 'missing' as const
    if (stateRef.current.asked.includes(personId)) return 'repeated' as const
    update(current => {
      const spent = spendAction(current, `ask-${personId}`)
      if (!spent) return current
      return { ...spent, asked: [...spent.asked, personId], unlocked: personId === 'liangshang' ? [...new Set([...spent.unlocked, 'E-003'])] : spent.unlocked }
    })
    return 'ok' as const
  }

  const audit = () => {
    if (stateRef.current.completedActions.includes('audit')) return 'repeated' as const
    update(current => {
      const spent = spendAction(current, 'audit')
      return spent ? { ...spent, unlocked: [...new Set([...spent.unlocked, 'E-002'])], log: { ...spent.log, done: '细查旧册，找出主簿三百两借领状', stuck: '借领状与粮商旧欠是否同一笔，尚待互证' } } : current
    })
    return 'ok' as const
  }

  const probe = () => {
    if (stateRef.current.probeKnown) return 'repeated' as const
    update(current => {
      const spent = spendAction(current, 'probe')
      return spent ? { ...spent, probeKnown: true, unlocked: [...new Set([...spent.unlocked, 'E-007'])], clues: [...spent.clues, { id: `C-${spent.clues.length + 1}`, text: 'E-007 探挖记录：旧闸底淘空三尺。书办“毋庸拆验”与现场记录不符，但其动机尚不能据此断定。', source: 'river', refs: ['E-007'], day: spent.day }], log: { ...spent.log, done: '亲勘东堤，探挖见闸底淘空三尺', stuck: '抢护可先行，拆修须汛后另案；料与夫仍有缺口' } } : current
    })
    return 'ok' as const
  }

  const markPlanPreview = () => update(current => current.completedActions.includes('plan-preview') ? current : { ...current, completedActions: [...current.completedActions, 'plan-preview'] })

  const confirmPlan = (plan: Omit<RiverPlan, 'day' | 'period'>) => {
    if (stateRef.current.plan) return false
    const before = stateRef.current
    update(current => {
      const spent = spendAction(current, 'plan-river')
      return spent ? { ...spent, plan: { ...plan, day: current.day, period: periods[current.periodIndex] }, log: { ...spent.log, done: '东堤抢护已签押发起，县丞会勘、工头监作', stuck: '抢护需三至四日；在途十垛与旧欠仍可能生变' } } : current
    })
    return stateRef.current !== before
  }

  const chooseBanquet = (choice: 'attend' | 'delegate' | 'audit') => {
    if (stateRef.current.periodIndex !== 3) return false
    update(current => {
      if (choice === 'attend') return { ...current, privateFunds: current.privateFunds - 20, giftEntries: [...current.giftEntries, '桑宅接风宴 · 亲赴，花费二十两'], unlocked: [...new Set([...current.unlocked, 'E-003'])], asked: [...new Set([...current.asked, 'liangshang', 'gentry'])], log: { done: '赴桑宅接风宴，取得旧欠票据与坟图线索', stuck: '三百两旧欠已有票据，偿还安排与坟地土源未定', rumor: '桑宅赞你通达；主簿整夜未发一言' } }
      if (choice === 'delegate') return { ...current, privateFunds: current.privateFunds - 6, giftEntries: [...current.giftEntries, '桑宅接风宴 · 县丞代往，备礼六两'], asked: [...new Set([...current.asked, 'xiancheng'])], log: { done: '请县丞代赴桑宅宴，县衙礼数未失', stuck: '旧欠只听转述，坟地仍须亲自说合', rumor: '桑士绅嫌你生分；县丞却记下这份托付' } }
      return { ...current, unlocked: [...new Set([...current.unlocked, 'E-002'])], giftEntries: [...current.giftEntries, '桑宅接风宴 · 未赴，闭门查旧册'], log: { done: '闭门查旧册，取得主簿三百两借领状', stuck: '借领用途已见，粮商旧欠与现场抢护仍待核', rumor: '桑宅面上无光；主簿连夜打听谁动过旧册' } }
    })
    return true
  }

  const runOfficialAction = (key: OfficialActionId) => {
    if (stateRef.current.officialActions.includes(key)) return 'repeated' as const
    update(current => {
      const base = { ...current, officialRead: true, officialActions: [...current.officialActions, key] }
      if (key === 'endorse') return { ...base, log: { ...current.log, rumor: '知府批「查」字已到县 书办忙着把初稿抽出去' } }
      if (key === 'suppress') return { ...base, log: { ...current.log, rumor: '你把上宪来文压在匣底 幕友看见了 却没说话' } }
      if (key === 'citation') return { ...base, log: { ...current.log, rumor: '幕友把实迹拟成考语 一句话会在册子里留很多年' } }
      const spent = spendAction(base, `official-${key}`)
      if (!spent) return current
      if (key === 'commissioner') return { ...spent, unlocked: [...new Set([...spent.unlocked, 'E-008'])], log: { ...spent.log, done: '请委员覆勘东堤 勘报与你探挖相合', stuck: '闸底淘空已复核 抢护合式与否候委员定论', rumor: '委员到县 主簿先把旧册锁进了库房' } }
      if (key === 'files') return { ...spent, unlocked: [...new Set([...spent.unlocked, 'E-004'])], log: { ...spent.log, done: '调河厅旧修造册并传询书办 旧工料数在册', stuck: '修造册与今次拨料须逐垛对核 书办口径已录', rumor: '书办被传询一次 见人便说「年久册乱」' } }
      return { ...spent, log: { ...spent.log, done: '具揭参劾书办失察 稿已封发', stuck: '揭参已上 县衙上下各寻退路', rumor: '有人说你刻 有人说你清 委员尚未表态' } }
    })
    return 'ok' as const
  }

  const continueNextDay = () => update(current => {
    const day = Math.min(10, current.day + 1)
    let next = { ...current, day, periodIndex: 0 }
    if (day === 2 && next.material.transit > 0) next = { ...next, material: { ...next.material, arrived: next.material.arrived + next.material.transit, transit: 0 } }
    if (next.plan && !next.outcome && day >= next.plan.day + 3) next = { ...next, outcome: evaluateRiverTask(next) }
    const rumors: Record<number, string> = { 2: '在途十垛到岸 粮商等着县衙一句「如数」', 3: '主簿开始重新誊册 他要先定一个说法', 5: '委员到县 先听的是主簿与书办', 8: '上游暴雨 东堤昼夜巡守 街上开始搬沙袋', 9: '洪峰过境 县里人人自危', 10: '验收题销 这一任的第一笔考语将落' }
    if (rumors[day]) next = { ...next, log: { ...next.log, rumor: rumors[day] } }
    const event = worldEvents.find(item => item.day === day && !current.handledEvents.includes(item.id))
    return event ? { ...next, pendingEvent: event.id } : next
  })

  const resolveWorldOption = (eventId: string, optionId: string) => update(current => {
    const base = { ...current, handledEvents: [...current.handledEvents, eventId], pendingEvent: null }
    if (eventId === 'material-arrival') return optionId === 'weigh' ? (() => { const weighed = materialAfterArrival(base, true); return { ...weighed, log: { ...weighed.log, done: '料场复秤 在途十垛实收八垛半 虚松两垛入账', stuck: '虚松之垛与书办「如数收讫」须对质' } } })() : { ...base, log: { ...base.log, rumor: '十垛记作如数收讫 无人再提虚松' } }
    if (eventId === 'zhubu-visit') return optionId === 'confront' ? { ...base, clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: '主簿当堂改口：先称「借领与旧欠并非一事」，并置后无言。口径已录，日后再难翻供。', source: 'ledger', refs: ['E-002', 'E-003'], day: base.day }], log: { ...base.log, done: '以借领状与旧欠并置 主簿当堂无言', stuck: '三百两名义已定 谁划去「损耗」一栏仍待上宪' } } : { ...base, log: { ...base.log, rumor: '主簿重誊旧册 借领状那一页不见了' } }
    if (eventId === 'commissioner-arrival' && optionId === 'inspect') return base.officialActions.includes('commissioner') ? { ...base, log: { ...base.log, done: '委员二次赴堤 仍认定闸底淘空 抢护合式与否有公论' } } : { ...base, officialRead: true, officialActions: [...base.officialActions, 'commissioner'], unlocked: [...new Set([...base.unlocked, 'E-008'])], log: { ...base.log, done: '委员赴东堤覆勘 勘报与你探挖相合', stuck: '闸底淘空已复核 抢护合式与否候委员定论', rumor: '委员到县 主簿先把旧册锁进了库房' } }
    if (eventId === 'storm' && optionId === 'inspect') return { ...base, clues: [...base.clues, { id: `C-${base.clues.length + 1}`, text: '暴雨现场：水漫旧闸基石，培土之外须有人昼夜巡守；若只看回报，会以为抢护已成。', source: 'river', refs: ['E-008'], day: base.day }], log: { ...base.log, done: '暴雨中亲赴东堤 水漫旧闸基石', stuck: '洪峰提前 抢护合式与否即见分晓' } }
    return { ...base, log: { ...base.log, rumor: eventId === 'storm' ? '你在县衙听回报 现场如何 全看写的人怎样落笔' : base.log.rumor } }
  })

  const resetGame = () => {
    stateRef.current = { ...initialState }
    setState(stateRef.current)
    setRestored(false)
    void clearGame()
  }

  return { state, toast, ready, restored, notify, dismissToast, setGoal, rememberDocument, rememberLedger, askPerson, audit, probe, markPlanPreview, confirmPlan, runOfficialAction, chooseBanquet, continueNextDay, resolveWorldOption, resetGame }
}
