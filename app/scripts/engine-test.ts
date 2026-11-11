/**
 * FE-159 引擎单测：保行为断言。跑法见 scripts/run-engine-test.mjs（esbuild  bundle 后 node 执行）。
 * 只断言既有语义，不引入新数值；任何一条红即代表抽取改变了行为。
 */
import { advanceDay, advancePeriod, goalReckoningOf, resolveWorldOptionPure, spendAction, verdictOf } from '../src/game/engine'
import type { GameState } from '../src/game/useGame'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass += 1 } else { fail += 1; console.log(`FAIL ${name}${detail ? ' · ' + detail : ''}`) }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`)
}

function base(over: Partial<GameState> = {}): GameState {
  return {
    goalId: null, day: 1, periodIndex: 0, clues: [], comparisons: [], unlocked: ['E-001', 'P-006'],
    asked: [], completedActions: [], plan: null, officialActions: [], officialRead: false,
    material: { arrived: 30, transit: 10, unsent: 10 }, outcome: null, handledEvents: [], pendingEvent: null,
    probeKnown: false, privateFunds: 60, giftEntries: [],
    log: { done: '', stuck: '', rumor: '' },
    ...over,
  }
}
const plan = { leader: 'foreman', leaderName: '赵九河', material: 30, labor: 20, supervisor: '县丞会勘', detail: '', day: 1, period: '晨' as const }

/* 时段 */
eq('晨→午', advancePeriod(base()).periodIndex, 1)
eq('暮→夜', advancePeriod(base({ periodIndex: 2 })).periodIndex, 3)
{ const s = advancePeriod(base({ periodIndex: 3, day: 4 })); eq('夜→次日晨', [s.day, s.periodIndex], [5, 0]) }
eq('日封顶10', advancePeriod(base({ periodIndex: 3, day: 10 })).day, 10)

/* 耗段 */
{ const s = spendAction(base(), 'probe'); ok('耗段记key', s!.completedActions.includes('probe')); eq('耗段推进', s!.periodIndex, 1) }
eq('重复耗段null', spendAction(base({ completedActions: ['probe'] }), 'probe'), null)

/* 跨日 */
{ const s = advanceDay(base()); eq('跨日day+1晨', [s.day, s.periodIndex], [2, 0]) }
{ const s = advanceDay(base()); eq('第2日在途转已到', s.material, { arrived: 40, transit: 0, unsent: 10 }) }
eq('第2日风闻', advanceDay(base()).log.rumor, '在途十垛到岸 粮商等着县衙一句「如数」')
eq('第2日挂事件', advanceDay(base()).pendingEvent, 'material-arrival')
eq('已决不重挂', advanceDay(base({ handledEvents: ['material-arrival'] })).pendingEvent, null)
eq('第6日家人事件', advanceDay(base({ day: 5 })).pendingEvent, 'gate-gift')
eq('第8日暴雨', advanceDay(base({ day: 7 })).pendingEvent, 'storm')
eq('跨日封顶10', advanceDay(base({ day: 10 })).day, 10)
{ const s = advanceDay(base({ day: 3, plan })); ok('plan+3日出outcome', Boolean(s.outcome), JSON.stringify(s.outcome)) }
eq('未到期不出outcome', advanceDay(base({ day: 2, plan })).outcome, null)

/* 世界事件结算 */
{ const s = resolveWorldOptionPure(base({ day: 2 }), 'material-arrival', 'weigh'); eq('复秤立疑点', s.clues.length, 1); eq('复秤疑点refs', s.clues[0].refs, ['F-005']); ok('复秤入done', s.log.done.includes('复秤')); ok('记handled', s.handledEvents.includes('material-arrival')); eq('清pending', s.pendingEvent, null) }
eq('收讫不立疑点', resolveWorldOptionPure(base(), 'material-arrival', 'shelve').clues.length, 0)
eq('收讫只落风闻', resolveWorldOptionPure(base(), 'material-arrival', 'shelve').log.rumor, '十垛记作如数收讫 无人再提虚松')
{ const s = resolveWorldOptionPure(base({ day: 3 }), 'zhubu-visit', 'confront'); eq('并置立疑点', s.clues.length, 1); eq('疑点refs', s.clues[0].refs, ['E-002', 'E-003']); eq('疑点来源', s.clues[0].source, 'ledger') }
eq('不点破落风闻', resolveWorldOptionPure(base(), 'zhubu-visit', 'defer').log.rumor, '主簿重誊旧册 借领状那一页不见了')
{ const s = resolveWorldOptionPure(base({ day: 5 }), 'commissioner-arrival', 'inspect'); ok('覆勘解锁E-008', s.unlocked.includes('E-008')); ok('覆勘记official', s.officialActions.includes('commissioner')); ok('覆勘officialRead', s.officialRead) }
{ const s = resolveWorldOptionPure(base({ officialActions: ['commissioner'] }), 'commissioner-arrival', 'inspect'); ok('二次覆勘不重复', s.officialActions.length === 1) }
{ const s = resolveWorldOptionPure(base({ day: 8 }), 'storm', 'inspect'); eq('暴雨立疑点', s.clues.length, 1); eq('暴雨疑点来源', s.clues[0].source, 'river') }
eq('门包禁绝代价', resolveWorldOptionPure(base({ day: 6 }), 'gate-gift', 'forbid').log.rumor, '门房被断了辛苦钱 怨望散值 门第清静却少了门下耳目')
eq('门包放任风评', resolveWorldOptionPure(base({ day: 6 }), 'gate-gift', 'allow').log.rumor, '门房照旧收门包 街面传县衙门第难进 求见先问门包')
eq('未知事件只记handled', resolveWorldOptionPure(base(), 'nope', 'x').handledEvents, ['nope'])

/* 考语投影 */
eq('无志向null', goalReckoningOf(base()), null)
{ const r = goalReckoningOf(base({ goalId: 'achievement', plan })); ok('政绩有进', r!.rows.some(x => x.tone === '进')); ok('rows≤3', r!.rows.length <= 3); eq('印', r!.seal, '堤') }
{ const r = goalReckoningOf(base({ goalId: 'integrity', unlocked: ['E-001', 'E-002', 'E-003'] })); ok('清名双票进', r!.rows.filter(x => x.tone === '进').length >= 2) }

/* 胜负投影 */
{ const v = verdictOf(base()); eq('未验', v.dike.grade, '未验'); ok('未验不算守', !v.dike.held); ok('未并置', !v.ledger.paired); ok('未可结算', !v.settleable) }
{ const v = verdictOf(base({ outcome: { grade: '合式', day: 5, factors: [], symptom: 'x' } })); ok('合式算守', v.dike.held); ok('有outcome可结算', v.settleable) }
{ const v = verdictOf(base({ outcome: { grade: '溃口', day: 9, factors: [], symptom: 'x' } })); ok('溃口不算守', !v.dike.held) }
{ const v = verdictOf(base({ unlocked: ['E-002', 'E-003'] })); ok('双票并置', v.ledger.paired) }
{ const v = verdictOf(base({ day: 10 })); ok('第10日可结算', v.settleable) }
{ const s = base({ goalId: 'network', asked: ['xiancheng'] }); eq('人情计数', verdictOf(s).relations, 1); eq('照见同源', verdictOf(s).reckoning, goalReckoningOf(s)) }

/* 纯函数性 */
{ const s = base({ day: 2 }); const a = advanceDay(s); const b = advanceDay(s); eq('同入同出', a, b); eq('不改入参', s.day, 2) }
{ const s = base(); const a = resolveWorldOptionPure(s, 'gate-gift', 'forbid'); resolveWorldOptionPure(s, 'gate-gift', 'forbid'); eq('结算不改入参', s.handledEvents, []); ok('返回新对象', a !== s) }

console.log(`\nengine ${pass}/${pass + fail} PASS`)
process.exit(fail ? 1 : 0)