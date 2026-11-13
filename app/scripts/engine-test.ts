/**
 * FE-159 引擎单测：保行为断言。跑法见 scripts/run-engine-test.mjs（esbuild  bundle 后 node 执行）。
 * 只断言既有语义，不引入新数值；任何一条红即代表抽取改变了行为。
 */
import { advanceDay, advancePeriod, goalReckoningOf, resolveWorldOptionPure, spendAction, verdictOf } from '../src/game/engine'
import { executeCommand } from '../src/game/commands'
import { routeCommandFeedback } from '../src/game/commandFeedback'
import type { GameState } from '../src/game/useGame'
import type { GeneratedEvent } from '../src/narrative/types'
import { personEvidenceIdsOf, personPresenceOf, personScheduleOf, revealDepthOf } from '../src/game/people'

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

/* --- FE-161 统一命令层：入口成本一致性（改前红：AI 入口不耗时段 vs UI 入口 +1） --- */

/** 生成事件夹具：与 schema.ts 产出同形（id 以 ai- 开头、两选项、origin:'ai'）。 */
function genEvent(effect: string, over: Partial<GeneratedEvent> = {}): GeneratedEvent {
  return {
    id: `ai-1-${effect}`, day: 1, title: '夹具事件', scene: '县衙 · 签押房', present: '你 书办', known: '夹具已知',
    body: '夹具正文，只为结算路径而设，不入任何存档与文案。',
    options: [
      { id: 'jia', label: '甲案', hint: '本地口径', effect, result: '模型落笔句·甲', refs: [] },
      { id: 'yi', label: '乙案', hint: '本地口径', effect: 'log-rumor', result: '模型落笔句·乙', refs: [] },
    ],
    origin: 'ai', seed: 1, createdAt: 0, profileId: 'pf-test', mood: '平',
    ...over,
  }
}
const gen = (effect: string) => ({ kind: 'generated' as const, event: genEvent(effect), optionId: 'jia' })

/* 入口一致性对照：同一 base，AI 入口与 UI 入口执行同一业务，periodIndex 必须一致 */
{
  const s = base({ day: 2, plan })
  const ui = executeCommand(s, { kind: 'official', key: 'commissioner' })
  const ai = executeCommand(s, gen('official-commissioner'))
  ok('AI commissioner 无拒绝', !ai.rejected, ai.rejected ?? '')
  eq('AI/UI commissioner 时段一致', ai.state.periodIndex, ui.state.periodIndex)
  eq('AI/UI commissioner 业务字段一致', {
    officialActions: ai.state.officialActions, unlocked: ai.state.unlocked, officialRead: ai.state.officialRead,
    completedActions: ai.state.completedActions, day: ai.state.day,
  }, {
    officialActions: ui.state.officialActions, unlocked: ui.state.unlocked, officialRead: ui.state.officialRead,
    completedActions: ui.state.completedActions, day: ui.state.day,
  })
}
{
  const s = base({ day: 2, plan })
  const ai = executeCommand(s, gen('unlock-e008'))
  const ui = executeCommand(s, { kind: 'official', key: 'commissioner' })
  ok('AI unlock 无拒绝', !ai.rejected, ai.rejected ?? '')
  eq('AI unlock-e008 耗一段', ai.state.periodIndex, s.periodIndex + 1)
  eq('AI unlock 时段与 UI 一致', ai.state.periodIndex, ui.state.periodIndex)
  ok('AI unlock 凭据入卷', ai.state.unlocked.includes('E-008'))
  eq('AI unlock 落笔句入done', ai.state.log.done, '模型落笔句·甲')
}
/* 重复执行同一 official 命令：第二次 rejected 且 state 不变（引用原样） */
{
  const s = base({ day: 2 })
  const first = executeCommand(s, { kind: 'official', key: 'commissioner' })
  const second = executeCommand(first.state, { kind: 'official', key: 'commissioner' })
  ok('official 重复 rejected', second.rejected === 'repeated', second.rejected ?? '')
  ok('official 重复 state 原样', second.state === first.state)
}
/* AI 入口幂等与跨入口共享 */
{
  const s = base({ day: 2, plan })
  const first = executeCommand(s, gen('unlock-e008'))
  const second = executeCommand(first.state, gen('unlock-e008'))
  ok('AI unlock 重复 rejected', Boolean(second.rejected), second.rejected ?? '')
  ok('AI unlock 重复 state 原样', second.state === first.state)
}
{
  const s = base({ day: 2, plan })
  const ui = executeCommand(s, { kind: 'official', key: 'commissioner' })
  const ai = executeCommand(ui.state, gen('official-commissioner'))
  ok('UI 已行后 AI 同令 rejected', Boolean(ai.rejected), ai.rejected ?? '')
  ok('跨入口拒绝 state 原样', ai.state === ui.state)
  const aiFirst = executeCommand(s, gen('official-commissioner'))
  const uiAfter = executeCommand(aiFirst.state, { kind: 'official', key: 'commissioner' })
  ok('AI 已行后 UI 同令 rejected', uiAfter.rejected === 'repeated', uiAfter.rejected ?? '')
}
/* 前置不满足：无 plan 时 unlock-e008 → rejected */
{
  const s = base({ day: 2 })
  const r = executeCommand(s, gen('unlock-e008'))
  ok('无 plan unlock rejected', Boolean(r.rejected), r.rejected ?? '')
  ok('无 plan state 原样', r.state === s)
}
/* 越权 effect id → rejected，不静默降级为风闻 */
{
  const s = base({ day: 2 })
  const r = executeCommand(s, gen('give-gold'))
  ok('越权效果 rejected', r.rejected === 'unknown-effect', r.rejected ?? '')
  ok('越权 state 原样', r.state === s)
  eq('越权不静默落风闻', r.state.log.rumor, s.log.rumor)
}
/* 不可用效果（officialAvailable 未满足）→ rejected */
{
  const s = base({ day: 1, periodIndex: 0 })
  const r = executeCommand(s, gen('official-commissioner'))
  ok('未开上宪 AI 批答 rejected', Boolean(r.rejected), r.rejected ?? '')
  ok('未开上宪 state 原样', r.state === s)
}
/* 纯叙述类 cost:none —— 不耗时段，只记 log / clue */
{
  const s = base({ day: 2 })
  for (const effect of ['log-done', 'log-rumor', 'log-stuck', 'clue-document', 'clue-ledger', 'clue-river']) {
    const r = executeCommand(s, gen(effect))
    ok(`${effect} 无拒绝`, !r.rejected, r.rejected ?? '')
    eq(`${effect} 不耗时段`, r.state.periodIndex, s.periodIndex)
    eq(`${effect} 记已决`, r.state.handledEvents, [`ai-1-${effect}`])
  }
  const clue = executeCommand(s, gen('clue-document'))
  eq('clue 立疑点', clue.state.clues.length, 1)
  eq('clue 来源', clue.state.clues[0].source, 'document')
  eq('clue 文本为落笔句', clue.state.clues[0].text, '模型落笔句·甲')
}
/* 保行为：批/压/考三法既有即不耗段；调卷/揭参耗段 */
{
  const s = base({ day: 2 })
  for (const key of ['endorse', 'suppress', 'citation'] as const) {
    const r = executeCommand(s, { kind: 'official', key })
    eq(`${key} 不耗时段（既有）`, r.state.periodIndex, s.periodIndex)
  }
  for (const key of ['files', 'impeach'] as const) {
    const r = executeCommand(s, { kind: 'official', key })
    eq(`${key} 耗一段（既有）`, r.state.periodIndex, s.periodIndex + 1)
  }
}

/* --- FE-162 事件结算幂等与合法性（改前红：重复结算重复立疑点、无前置校验） --- */

/* 同一世界事件提交两次：第二次 rejected，clues 与 handledEvents 不增 */
{
  const s = base({ day: 2, pendingEvent: 'material-arrival' })
  const first = executeCommand(s, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  ok('世界事件首结无拒绝', !first.rejected, first.rejected ?? '')
  eq('首结立疑点', first.state.clues.length, 1)
  eq('首结清pending', first.state.pendingEvent, null)
  eq('首结记handled', first.state.handledEvents, ['material-arrival'])
  const second = executeCommand(first.state, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  ok('重复结算 rejected', Boolean(second.rejected), second.rejected ?? '')
  eq('重复结算疑点不增', second.state.clues.length, 1)
  eq('重复结算handled不增', second.state.handledEvents, ['material-arrival'])
  ok('重复结算 state 原样（原子）', second.state === first.state)
}
/* 错误 optionId → rejected，不得落入默认分支 */
{
  const s = base({ day: 2, pendingEvent: 'material-arrival' })
  const r = executeCommand(s, { kind: 'event', eventId: 'material-arrival', optionId: 'nope' })
  ok('错误option rejected', Boolean(r.rejected), r.rejected ?? '')
  ok('错误option state 原样', r.state === s)
}
/* pendingEvent 不匹配 → rejected */
{
  const s = base({ day: 2 })
  const r = executeCommand(s, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  ok('无pending rejected', Boolean(r.rejected), r.rejected ?? '')
  ok('无pending state 原样', r.state === s)
  const other = base({ day: 3, pendingEvent: 'zhubu-visit' })
  const r2 = executeCommand(other, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  ok('pending不匹配 rejected', Boolean(r2.rejected), r2.rejected ?? '')
  ok('pending不匹配 state 原样', r2.state === other)
}
/* 未知 eventId → rejected，不得只记 handled */
{
  const s = base({ pendingEvent: 'nope' })
  const r = executeCommand(s, { kind: 'event', eventId: 'nope', optionId: 'x' })
  ok('未知事件 rejected', Boolean(r.rejected), r.rejected ?? '')
  ok('未知事件 state 原样', r.state === s)
}
/* 世界事件结算不耗时段（既有口径保持） */
{
  const s = base({ day: 2, pendingEvent: 'material-arrival' })
  const r = executeCommand(s, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  eq('世界事件不耗时段', r.state.periodIndex, s.periodIndex)
}
/* 委员到县事件走命令层：既有语义（得 E-008、不耗段）保持 */
{
  const s = base({ day: 5, pendingEvent: 'commissioner-arrival' })
  const r = executeCommand(s, { kind: 'event', eventId: 'commissioner-arrival', optionId: 'inspect' })
  ok('委员事件无拒绝', !r.rejected, r.rejected ?? '')
  ok('委员事件解锁E-008', r.state.unlocked.includes('E-008'))
  ok('委员事件记official', r.state.officialActions.includes('commissioner'))
  eq('委员事件不耗时段（既有）', r.state.periodIndex, s.periodIndex)
}
/* 生成事件同口径幂等：同事件提交两次，第二次 rejected、clues 与 handledEvents 不增 */
{
  const s = base({ day: 2 })
  const first = executeCommand(s, gen('clue-document'))
  ok('生成首结无拒绝', !first.rejected, first.rejected ?? '')
  eq('生成首结立疑点', first.state.clues.length, 1)
  const second = executeCommand(first.state, gen('clue-document'))
  ok('生成重复 rejected', Boolean(second.rejected), second.rejected ?? '')
  eq('生成重复疑点不增', second.state.clues.length, 1)
  eq('生成重复handled不增', second.state.handledEvents.length, 1)
  ok('生成重复 state 原样（原子）', second.state === first.state)
}
/* 生成事件错误 optionId → rejected */
{
  const s = base({ day: 2 })
  const r = executeCommand(s, { kind: 'generated', event: genEvent('log-done'), optionId: 'nope' })
  ok('生成错误option rejected', r.rejected === 'unknown-option', r.rejected ?? '')
  ok('生成错误option state 原样', r.state === s)
}
/* 生成事件不得借非 ai- id 绕过 pendingEvent 校验 */
{
  const s = base({ day: 2 })
  const r = executeCommand(s, { kind: 'generated', event: genEvent('log-done', { id: 'material-arrival' }), optionId: 'jia' })
  ok('非ai前缀 rejected', r.rejected === 'not-generated', r.rejected ?? '')
  ok('非ai前缀 state 原样', r.state === s)
}
/* 生成事件放行「无 pendingEvent」形态 */
{
  const s = base({ day: 2, pendingEvent: null })
  const r = executeCommand(s, gen('log-done'))
  ok('生成无pending放行', !r.rejected, r.rejected ?? '')
  eq('生成结算清pending保持', r.state.pendingEvent, null)
}

/* G1.7-B：正式委员覆勘命令的解锁效果由命令层原子返回。 */
{
  const result = executeCommand(base({ day: 2 }), { kind: 'official', key: 'commissioner' })
  ok('委员覆勘命令可结算', !result.rejected, result.rejected ?? '')
  ok('委员覆勘命令解锁E-008', result.state.unlocked.includes('E-008'))
}

/* G1.7-B：拒绝结果只触发失败反馈；调用方必须停止成功分支与关闭事件卡。 */
{
  const first = executeCommand(base({ day: 2 }), { kind: 'official', key: 'commissioner' })
  const rejected = executeCommand(first.state, { kind: 'official', key: 'commissioner' })
  let rejectedFeedback = 0
  let acceptedFeedback = 0
  let reason = ''
  const continueSuccessUi = routeCommandFeedback(
    rejected,
    value => { rejectedFeedback += 1; reason = value },
    () => { acceptedFeedback += 1 },
  )
  ok('拒绝结果中止成功UI分支', continueSuccessUi === false)
  eq('拒绝结果只触发一次失败反馈', rejectedFeedback, 1)
  eq('拒绝原因准确回传', reason, 'repeated')
  eq('拒绝结果不触发成功提示', acceptedFeedback, 0)
  ok('拒绝结果保留原状态引用', rejected.state === first.state)
  let accepted = 0
  const continueAcceptedUi = routeCommandFeedback(first, () => {}, () => { accepted += 1 })
  ok('成功结果允许继续UI分支', continueAcceptedUi)
  eq('成功结果只触发成功反馈', accepted, 1)
}

/* G1.7-A：AI 生成事件不得抢占正式 pendingEvent，也不得清空无关待决事件。 */
{
  const s = base({ day: 2, pendingEvent: 'material-arrival' })
  const ai = executeCommand(s, gen('log-done'))
  ok('正式事件待决时拒绝AI', ai.rejected === 'world-event-pending', ai.rejected ?? '')
  ok('拒绝AI保留原state引用', ai.state === s)
  eq('拒绝AI保留正式pendingEvent', ai.state.pendingEvent, 'material-arrival')
  const world = executeCommand(s, { kind: 'event', eventId: 'material-arrival', optionId: 'weigh' })
  ok('AI被拒后正式事件仍可结算', !world.rejected, world.rejected ?? '')
  eq('正式事件结算后清pending', world.state.pendingEvent, null)
  ok('正式事件结算记handled', world.state.handledEvents.includes('material-arrival'))
}
{
  const s = base({ day: 2, pendingEvent: null })
  const ai = executeCommand(s, gen('log-done'))
  ok('无正式待决时AI正常结算', !ai.rejected, ai.rejected ?? '')
  eq('AI结算不改pendingEvent', ai.state.pendingEvent, null)
}
{
  const event = genEvent('log-done')
  const s = base({ day: 2, pendingEvent: event.id })
  const ai = executeCommand(s, { kind: 'generated', event, optionId: 'jia' })
  ok('兼容同id旧式AI待决事件', !ai.rejected, ai.rejected ?? '')
  eq('同id AI结算清理自身旧pending', ai.state.pendingEvent, null)
}

/* G1.7-D：人物档案只读投影、认知闸与公开日程边界。 */
{
  const s = base()
  const before = JSON.stringify(s)
  eq('档案证据映射只返回既有凭据', personEvidenceIdsOf('expert'), ['E-008'])
  eq('未知人物无凭据', personEvidenceIdsOf('unknown-person'), [])
  eq('未接触人物保持闻名', revealDepthOf('expert', s), '闻名')
  eq('正式问话只提升为相识', revealDepthOf('expert', base({ asked: ['expert'] })), '相识')
  const schedule = personScheduleOf(s, 'expert')
  ok('公开日程不泄露过去安排', schedule.every(row => row.day >= s.day))
  ok('公开日程只含公开投影字段', schedule.every(row => Object.keys(row).sort().join(',') === 'day,title,when'))
  eq('未知人物没有公开日程', personScheduleOf(s, 'unknown-person'), [])
  const presence = personPresenceOf(s, 'expert')
  ok('在场投影只返回允许场景或空', presence === null || ['county', 'river', 'study'].includes(presence.scene))
  eq('档案读取不修改游戏状态', JSON.stringify(s), before)
}

console.log(`\nengine ${pass}/${pass + fail} PASS`)
process.exit(fail ? 1 : 0)