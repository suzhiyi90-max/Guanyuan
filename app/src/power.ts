import type { GameState } from './game/useGame'

/**
 * 权与名 · 只读投影
 *
 * 总纲 6.7 / 13.5 / 14.5 / 19.1 的界面投影层。
 * 这里不新增任何影响力、名望、信任、畏惧、合法性数值，也不写存档：
 * 所有条目都由既有 GameState 派生，没有来源的字段留白。
 */

export type Tier = '能' | '可' | '该'
export type RowState = 'ready' | 'pending' | 'risk'
export type PowerContext = 'seat' | 'river' | 'study' | 'commission' | 'review'
export type EchoFocus = 'clue' | 'gift' | 'plan' | 'outcome'
export type AudienceId = 'superior' | 'colleague' | 'gentry' | 'folk'

export type PowerHandler =
  | 'document' | 'plan' | 'ledger' | 'review' | 'evidence' | 'intel'
  | 'banquet' | 'epilogue' | 'atlas' | 'life'
  | 'scene:county' | 'scene:river' | 'scene:study'
  | 'person:expert' | 'person:xiancheng' | 'person:zhubu' | 'person:liangshang' | 'person:gentry' | 'person:foreman'

export type PowerHandlers = Partial<Record<PowerHandler, () => void>>

export interface EntitlementRow {
  tier: Tier
  label: string
  detail: string
  state: RowState
  source: string
}

export interface Prohibition {
  label: string
  alternative: string
  handler?: PowerHandler
}

export interface EntitlementBundle {
  context: PowerContext
  label: string
  identity: string
  seat: string
  place: string
  note: string
  rows: EntitlementRow[]
  prohibitions: Prohibition[]
}

export const powerContexts: Array<{ id: PowerContext; label: string; place: string }> = [
  { id: 'seat', label: '本县签押', place: '县衙 · 签押房' },
  { id: 'river', label: '东堤河工', place: '东堤 · 旧闸险工' },
  { id: 'study', label: '夜书房', place: '县衙 · 内宅书房' },
  { id: 'commission', label: '委牌在手', place: '东堤抢护 · 委牌' },
  { id: 'review', label: '府衙审查', place: '府衙 · 签押' },
]

export const stateLabel: Record<RowState, string> = {
  ready: '已备',
  pending: '待补',
  risk: '有险',
}

// 「仅工头监作 · 暂无会勘」字面含「会勘」二字，不能用 includes 直接判；
// 这里按委牌上有没有县丞/幕友会勘来判，只影响本页显示，不改原结算。
const hasSurvey = (state: GameState) => Boolean(state.plan && !state.plan.supervisor.includes('仅工头监作'))
const doneAction = (state: GameState, id: string) => state.officialActions.includes(id as never)

export interface CommissionDraft {
  material: number
  labor: number
  guarantee: boolean
  survey: boolean
}

export function entitlementsOf(state: GameState, context: PowerContext, draft?: CommissionDraft): EntitlementBundle {
  const plan = state.plan
  const done = state.officialActions
  const row = (tier: Tier, label: string, detail: string, status: RowState, source: string): EntitlementRow => ({ tier, label, detail, state: status, source })

  if (context === 'river') {
    return {
      context, label: '东堤河工', identity: '河工主持人 · 本县正印官', seat: '堤上身位', place: '东堤 · 旧闸险工',
      note: '同一个人换了场合：在堤上是河工主持人，在府衙只是属官。',
      rows: [
        row('能', '亲勘与探挖', state.probeKnown ? '闸底淘空三尺已在勘报，工法不再只听书办' : '可带工头下坑，勘报须入卷', state.probeKnown ? 'ready' : 'pending', 'E-007 / 探挖记录'),
        row('能', '调堡夫二十', '名册在册；河兵五名须移会河厅，不能径调', 'ready', '汛地名册 / 6.7.4'),
        row('可', '先抢后报', plan ? `已于第${plan.day}日${plan.period}签押，须三日内补详` : '汛前急务可先办后报，但须先有委牌', plan ? 'ready' : 'pending', 'S-04 委牌'),
        row('可', '料场复秤', state.material.transit > 0 ? '在途十垛未到岸，复秤须等船靠埠' : '在途已归零，复秤记录按原世界事件保留', state.material.transit > 0 ? 'pending' : 'ready', 'F-005 / 料场'),
        row('该', '委员覆勘', done.includes('commissioner') ? '勘报 E-008 已入卷，闸底定性有据' : '未经覆勘，合式与否仍是你的一面之词', done.includes('commissioner') ? 'ready' : 'pending', 'S-13 批答'),
        row('该', '洪峰前巡守', state.day >= 8 ? '暴雨已至，巡守与抢护同责，不能只看回报' : `距洪峰 ${Math.max(0, 9 - state.day)} 日，巡守尚未开始`, state.day >= 8 ? 'risk' : 'pending', '一汛日程 / 第 9 日'),
      ],
      prohibitions: [
        { label: '十日内拆修闸底', alternative: '先抢护，汛后另案详请' },
        { label: '私调河兵', alternative: '移会县丞，由河厅差遣', handler: 'review' },
      ],
    }
  }

  if (context === 'study') {
    return {
      context, label: '夜书房', identity: '官 · 私第（非公堂）', seat: '私第身位', place: '县衙 · 内宅书房',
      note: '私第所查不是公堂供词；夜里知道的，白天仍要回到县署入卷。',
      rows: [
        row('能', '调阅旧册', state.completedActions.includes('audit') ? '借领状已在手，E-002 可回账房并置' : '可向主簿调阅，但须留借阅痕迹', state.completedActions.includes('audit') ? 'ready' : 'pending', 'E-002 / 借领状'),
        row('能', '私下记疑', state.clues.length ? `台账已有 ${state.clues.length} 条疑点` : '尚无疑点，灯下所见还没落纸', state.clues.length ? 'ready' : 'pending', 'S-05 情报台账'),
        row('可', '私记不入公卷', state.comparisons.length ? '已并置过的疑点可回案卷引用' : '只记不并置，公事上等于没有', state.comparisons.length ? 'ready' : 'pending', 'S-02 卷宗'),
        row('可', '夜不入库', state.completedActions.includes('audit') ? '你动过旧册，主簿已经知道' : '库房钥匙在主簿身上，夜间不得私开', state.completedActions.includes('audit') ? 'risk' : 'ready', '主簿口供 / P-003'),
        row('该', '书办与主簿各记一笔', state.completedActions.includes('audit') ? '主簿连夜打听谁动过旧册' : '今夜尚无人替你记账', state.completedActions.includes('audit') ? 'risk' : 'pending', state.log.rumor),
        row('该', '明日须有公开动作', done.length ? '批答已行，私记可以写成详文' : '若只在私下知道，写不进考语', done.length ? 'ready' : 'pending', 'S-13 / 8.4 文书'),
      ],
      prohibitions: [
        { label: '以私第讯问取供', alternative: '回县署正堂，书办录供', handler: 'review' },
        { label: '夜间私开库房', alternative: '白日照会主簿，同启同封', handler: 'person:zhubu' },
      ],
    }
  }

  if (context === 'commission') {
    return {
      context, label: '委牌在手', identity: '签押人 · 河工委牌', seat: '委牌身位', place: '东堤抢护 · 委牌',
      note: '签押不是办成：委牌只把责任分给具体的人，结果仍按原结算。',
      rows: [
        row('能', '拨料八至十垛', draft ? `本次拨 ${draft.material} 垛，从到场 ${state.material.arrived} 垛内实拨，不动未发 ${state.material.unsent} 垛` : `到场 ${state.material.arrived} 垛内实拨，不动未发 ${state.material.unsent} 垛`, draft && draft.material > state.material.arrived ? 'risk' : 'ready', 'F-005 / 料场'),
        row('能', '雇募夫役', draft ? `${draft.labor} 人，夫食二十五两，须保正具结` : plan ? `${plan.labor} 人已入委牌，夫食二十五两` : '可雇募，须保正具结，不超过五十人', draft ? 'ready' : plan ? 'ready' : 'pending', 'S-04 委牌'),
        row('可', '三百两以内先行', '领办与垫支可先行，仍须具结存案', 'ready', '6.2 权限四元组'),
        row('可', '保正具结', draft ? (draft.guarantee ? '具结已附本次发起文书' : '尚缺保正具结，雇募不能发起') : plan ? '具结已附发起文书' : '未具结则雇募不能发起', draft ? (draft.guarantee ? 'ready' : 'pending') : plan ? 'ready' : 'pending', 'S-04 程序栏'),
        row('该', '会勘共担', draft ? (draft.survey ? '县丞会勘会在委牌上留名，责任共担' : '选「仅工头监作」则无会勘签押，保固与赔补独担') : hasSurvey(state) ? '县丞会勘在委牌上留名，责任共担' : '无会勘签押，保固与赔补由签押人独担', draft ? (draft.survey ? 'ready' : 'risk') : hasSurvey(state) ? 'ready' : 'risk', '6.6 责任共担'),
        row('该', '三日内补详', plan ? '发起在本时段，补详仍按原日程' : draft ? '签押后须三日内补详，按原日程推进' : '未签押则无补详之责', plan ? 'ready' : 'pending', '9.1 / 8.4'),
      ],
      prohibitions: [
        { label: '动未发十垛', alternative: '先清旧欠，或请士绅作中', handler: 'person:liangshang' },
        { label: '雇募逾五十人', alternative: '分批点卯，保正具结' },
      ],
    }
  }

  if (context === 'review') {
    return {
      context, label: '府衙审查', identity: '知府 · 府衙（审查座位）', seat: '上宪座位', place: '府衙 · 签押',
      note: '此处演示的是上宪座位；县尊若站在府衙，只是属官：能具详候批，不能批银、不能径改委。',
      rows: [
        row('能', '批驳与饬令', '以「查」字发回，饬令再核，不耗时段', 'ready', 'S-13 批答'),
        row('能', '覆勘与调卷', done.includes('commissioner') || done.includes('files') ? `已行 ${done.filter(id => id === 'commissioner' || id === 'files').length} 项，勘报与旧册在卷` : '可委员覆勘、调河厅旧册，各占一时段', done.includes('commissioner') || done.includes('files') ? 'ready' : 'pending', 'E-008 / E-004'),
        row('可', '只转详加结', '知府不批银：银数只转藩司，不由府衙定', 'ready', '6.2 / 17.4'),
        row('可', '不径改河厅之委', '河厅差委不属府衙，须移会商办', 'ready', '6.7.4 注'),
        row('该', '考语入册', done.includes('citation') ? '考语已拟，措辞日后会被人翻出' : '考语未拟，章末仍可补', done.includes('citation') ? 'ready' : 'pending', 'S-10 考语'),
        row('该', '揭参与压案', done.includes('impeach') || done.includes('suppress') ? '两项俱留痕：清名与把柄各自入卷' : '两者都可发，但都不干净', done.includes('impeach') || done.includes('suppress') ? 'risk' : 'pending', 'S-13 高风险'),
      ],
      prohibitions: [
        { label: '代藩司批银', alternative: '只转详加结，银数另详' },
        { label: '径改河厅委', alternative: '移会河厅商办' },
        { label: '以揭参代审', alternative: '先调卷传询，再定参劾', handler: 'review' },
      ],
    }
  }

  return {
    context: 'seat', label: '本县签押', identity: '正印官 · 永济县知县', seat: '本县座位', place: '县衙 · 签押房',
    note: '在本县是正印官，到府衙就是属官。身份随职位与场合切换，不是一条官威值。',
    rows: [
      row('能', '签押与用印', plan ? '本轮已签押一件抢护，续办须另立' : '印匣在手，签押须本人亲笔', 'ready', '知县 · 可为权'),
      row('能', '传唤与亲勘', state.probeKnown ? '闸底已亲勘，勘报 E-007 在卷' : '可传堡夫头带路下坑，也可传书办问话', 'ready', '知县 · 可为权'),
      row('可', '三百两以内领办', '领办与垫支可先行，仍须具结存案', 'ready', '6.2 限额 / S-04'),
      row('可', '报灾与保固', plan ? '抢护已报，三日内须补详' : '汛前急务可先办后报，未报者不得先动', plan ? 'ready' : 'pending', '须为权 / 程序'),
      row('该', '保固与考成', '堤在你在；验收、参劾与赔补同落一纸', 'ready', '责任权'),
      row('该', '上宪只看得见文书', done.length ? `批答已行 ${done.length} 项，能进府衙的只有这些` : '未回文者，府衙只知县呈一件', done.length ? 'ready' : 'risk', 'S-13 / 呈文'),
    ],
    prohibitions: [
      { label: '越级直详', alternative: '由府转详，或请委员覆勘', handler: 'review' },
      { label: '私调河兵', alternative: '移会县丞，由河厅差遣', handler: 'person:xiancheng' },
      { label: '擅动跨汛大工', alternative: '汛后另案详请拆修', handler: 'document' },
    ],
  }
}

export const verbTrunk = ['问', '查', '托', '请', '压', '保', '赏', '荐'] as const
// 「召」「详」「征」是身份权能，不是第九个社交动词：只作具体动作的标签，
// 不计入八动词主干（6.7.3）。
export const identityVerbs = ['召', '详', '征'] as const
export type Verb = typeof verbTrunk[number] | typeof identityVerbs[number]

export interface DockAction {
  key: string
  verb: Verb
  object: string
  identity: string
  trace: string | null
  entry: string
  handler: PowerHandler
  risk?: boolean
  blocked?: { reason: string; alternative: string; handler: PowerHandler }
}

const dockActions: Record<PowerContext, DockAction[]> = {
  seat: [
    { key: 'seat-doc', verb: '查', object: '东堤呈文两版', identity: '正印官 · 可阅', trace: '批阅与对勘入卷', entry: '案卷 · 呈文', handler: 'document' },
    { key: 'seat-expert', verb: '问', object: '河工幕友顾逢源', identity: '正印官 · 私下问话', trace: '口供入情报台账', entry: '人情 · 人物卷', handler: 'person:expert' },
    { key: 'seat-plan', verb: '托', object: '东堤抢护', identity: '正印官 · 签押', trace: '委牌 + 保正具结', entry: '委牌预览', handler: 'plan' },
    { key: 'seat-ledger', verb: '查', object: '库房旧账', identity: '正印官 · 调阅', trace: '库房调阅留痕', entry: '账房 · 四本账', handler: 'ledger' },
    { key: 'seat-press', verb: '压', object: '上宪来文', identity: '属官 · 可暂压', trace: '匣底 + 幕友见证', entry: '上宪来文', handler: 'review', risk: true },
    { key: 'seat-summon', verb: '请', object: '河厅委员', identity: '需河厅差委', trace: null, entry: '上宪 · 请覆勘', handler: 'review', blocked: { reason: '委员是河厅差委，不是县衙可召的人', alternative: '请委员覆勘：由府批转，程序上才站得住', handler: 'review' } },
  ],
  river: [
    { key: 'river-probe', verb: '查', object: '旧闸闸底', identity: '河工主持人', trace: '勘报 E-007 入卷', entry: '东堤 · 渗水点', handler: 'scene:river' },
    { key: 'river-material', verb: '查', object: '料场五十垛', identity: '正印官 · 复秤', trace: '复秤记录与收料印串', entry: '账房 · 河工料账', handler: 'ledger' },
    { key: 'river-foreman', verb: '问', object: '堡夫头赵九河', identity: '正印官 · 现场问话', trace: '口供入情报台账', entry: '人情 · 赵九河', handler: 'person:foreman' },
    { key: 'river-plan', verb: '托', object: '抢护主办', identity: '正印官 · 签押', trace: '委牌与会勘栏', entry: '险工牌 · 预演', handler: 'plan' },
    { key: 'river-guarantee', verb: '保', object: '保正具结', identity: '正印官 · 具结存案', trace: '具结附发起文书', entry: '委牌 · 程序栏', handler: 'plan' },
    { key: 'river-dismiss', verb: '请', object: '闲杂人等退堤', identity: '河工主持人', trace: null, entry: '堤规 · 未立纸面', handler: 'scene:river', blocked: { reason: '堤上驱人没有牌票与门簿可依，本局不设此程序', alternative: '由堡夫头按堤规劝离，不写成官命', handler: 'person:foreman' } },
  ],
  study: [
    { key: 'study-audit', verb: '查', object: '灯下旧册', identity: '官 · 私第', trace: '库房借阅痕迹', entry: '夜书房 · 旧册', handler: 'scene:study' },
    { key: 'study-zhubu', verb: '问', object: '主簿王慎之', identity: '正印官 · 私下问话', trace: '口供 + 他知你在查', entry: '人情 · 主簿', handler: 'person:zhubu' },
    { key: 'study-evidence', verb: '查', object: '三百两证据链', identity: '正印官 · 并置', trace: '附纸与疑点', entry: '证据板', handler: 'evidence' },
    { key: 'study-banquet', verb: '请', object: '桑宅接风帖作答', identity: '官 · 宾客', trace: '礼簿一笔', entry: '桑宅请帖', handler: 'banquet' },
    { key: 'study-summons', verb: '召', object: '书办夜入内堂', identity: '内堂非公堂', trace: null, entry: '上宪 · 调卷传询', handler: 'review', blocked: { reason: '夜间传唤无案由，内堂也不是录供之处', alternative: '明日正堂传询，书办录供入卷', handler: 'review' } },
  ],
  commission: [
    { key: 'commission-material', verb: '查', object: '秫秸八至十垛', identity: '签押人', trace: '领状与复秤', entry: '账房 · 料账', handler: 'ledger' },
    { key: 'commission-labor', verb: '托', object: '夫役三十至五十', identity: '签押人 · 雇募', trace: '保正具结', entry: '委牌 · 程序栏', handler: 'plan' },
    { key: 'commission-survey', verb: '请', object: '县丞会勘', identity: '正印官 · 移会', trace: '会勘签押', entry: '人情 · 县丞', handler: 'person:xiancheng' },
    { key: 'commission-probe', verb: '查', object: '闸底勘报', identity: '河工主持人', trace: '勘报 E-007', entry: '东堤 · 渗水点', handler: 'scene:river' },
    { key: 'commission-report', verb: '详', object: '三日内补报', identity: '正印官 · 具详', trace: '详文入卷', entry: '上宪来文', handler: 'review' },
    { key: 'commission-land', verb: '征', object: '桑氏坟地取土', identity: '宗族未允', trace: null, entry: '舆图 · 桑家庄', handler: 'atlas', blocked: { reason: '坟地不属官地，宗族未允即强取，会留下上控', alternative: '议替代土源，请士绅作中', handler: 'person:gentry' } },
  ],
  review: [
    { key: 'review-commissioner', verb: '请', object: '委员覆勘', identity: '知府 · 差委', trace: '勘报 E-008', entry: '批答六法', handler: 'review' },
    { key: 'review-files', verb: '查', object: '河厅旧修造册', identity: '知府 · 调卷', trace: '旧册与书办口径', entry: '批答六法', handler: 'review' },
    { key: 'review-citation', verb: '荐', object: '一句考语', identity: '知府 · 拟考语', trace: '考语入册', entry: '批答六法', handler: 'review' },
    { key: 'review-press', verb: '压', object: '县呈与疑点', identity: '知府 · 可暂存', trace: '存字入卷', entry: '批答 · 压案', handler: 'review', risk: true },
  ],
}

// 「详」「召」「征」超出八动词主干，仅作为具体文书/身份动作的动词标签；
// 主干计数只统计八动词，避免把身份权能混成一套新社交动词（6.7.3）。
export function dockOf(context: PowerContext): DockAction[] {
  return dockActions[context]
}

export function verbCounts(actions: DockAction[]): Record<string, number> {
  const base: Record<string, number> = { 问: 0, 查: 0, 托: 0, 请: 0, 压: 0, 保: 0, 赏: 0, 荐: 0 }
  actions.forEach(action => {
    if (action.verb in base) base[action.verb] += 1
  })
  return base
}

export interface EchoRow {
  id: AudienceId
  name: string
  scope: string
  known: string
  stance: string
  action: string
  basis: string | null
}

export interface EchoSet {
  focus: EchoFocus
  title: string
  event: string
  note: string
  rows: EchoRow[]
}

const audienceNames: Record<AudienceId, { name: string; scope: string }> = {
  superior: { name: '上司', scope: '知府 · 河厅' },
  colleague: { name: '同僚', scope: '县丞 · 主簿 · 书办' },
  gentry: { name: '士绅', scope: '桑鹤龄 · 东堤董事' },
  folk: { name: '百姓', scope: '堤上堡夫 · 茶楼街面' },
}

const emptyRow = (id: AudienceId, known: string): EchoRow => ({
  id, ...audienceNames[id], known, stance: '未详', action: '未详', basis: null,
})

function superiorRow(state: GameState, focus: EchoFocus): EchoRow {
  const done = state.officialActions
  if (focus === 'gift') {
    return emptyRow('superior', '不在场，也未收到礼簿；此事不进府衙')
  }
  if (focus === 'outcome') {
    if (!state.outcome) return emptyRow('superior', '验收未届，府衙尚未收到题销')
    return {
      id: 'superior', ...audienceNames.superior,
      known: done.includes('commissioner') ? '勘报与题销同到，闸底有复核' : '只收到题销，未见第三方复核',
      stance: done.includes('commissioner') ? '认可' : '未详',
      action: done.includes('commissioner') ? '以勘报为据，定合式与否' : '批查，候补详',
      basis: done.includes('commissioner') ? 'E-008 勘报 / 题销册' : 'S-10 题销',
    }
  }
  if (focus === 'plan') {
    return {
      id: 'superior', ...audienceNames.superior,
      known: done.includes('commissioner') ? '委员已赴堤，勘报与你探挖相合' : '只知县呈与委牌，未得会勘',
      stance: done.includes('commissioner') ? '认可' : '未详',
      action: done.includes('commissioner') ? '催补详，不再另委' : '候三日内补详',
      basis: done.includes('commissioner') ? 'E-008 / S-13' : 'S-04 委牌',
    }
  }
  return {
    id: 'superior', ...audienceNames.superior,
    known: done.length ? `只见县呈与已入卷批答 ${done.length} 项` : '只接到县呈与河厅册；你私下所记尚未写成详文',
    stance: done.includes('commissioner') ? '认可' : '未详',
    action: done.includes('commissioner') ? '据勘报再定合式' : '候详文，不闻私记',
    basis: done.length ? 'S-13 批答 / 已入卷动作' : '府札 · 只读县呈',
  }
}

function colleagueRow(state: GameState, focus: EchoFocus): EchoRow {
  const rumor = state.log.rumor
  if (focus === 'gift') {
    const entry = state.giftEntries[0] ?? ''
    if (!entry) return emptyRow('colleague', '宴未成事，同僚尚无话可说')
    if (entry.includes('亲赴')) return { id: 'colleague', ...audienceNames.colleague, known: '主簿整夜未发一言', stance: '未详', action: '观望', basis: rumor }
    if (entry.includes('代往')) return { id: 'colleague', ...audienceNames.colleague, known: '县丞替你赴宴，记下这份托付', stance: '欠', action: '合作', basis: '礼簿 · 代往记录' }
    return { id: 'colleague', ...audienceNames.colleague, known: '主簿连夜打听谁动过旧册', stance: '畏惧', action: '自保 · 先誊一册', basis: rumor }
  }
  if (focus === 'plan') {
    return hasSurvey(state)
      ? { id: 'colleague', ...audienceNames.colleague, known: '县丞在委牌上签了会勘，责任共担', stance: '认可', action: '合作', basis: state.plan?.supervisor ?? '' }
      : { id: 'colleague', ...audienceNames.colleague, known: '县丞未在委牌上签会勘，责任未共担', stance: '未详', action: '未详', basis: null }
  }
  if (focus === 'outcome') {
    if (state.outcome && !hasSurvey(state) && (state.outcome.grade === '失事' || state.outcome.grade === '溃口')) {
      return { id: 'colleague', ...audienceNames.colleague, known: '无会勘签押，责任只落签押人一纸', stance: '未详', action: '未详', basis: '委牌会勘栏' }
    }
    return emptyRow('colleague', state.outcome ? '验收已下，同僚尚无公开反应' : '验收未届')
  }
  if (state.completedActions.includes('audit')) return { id: 'colleague', ...audienceNames.colleague, known: '主簿连夜打听谁动过旧册', stance: '畏惧', action: '阳奉阴违 · 先誊一册', basis: rumor }
  if (state.officialActions.includes('files')) return { id: 'colleague', ...audienceNames.colleague, known: '书办被传询，见人便说「年久册乱」', stance: '畏惧', action: '泄露 · 自保', basis: rumor }
  if (state.asked.length) return { id: 'colleague', ...audienceNames.colleague, known: `已有 ${state.asked.length} 人与你正式对答，各自留了口供`, stance: '未详', action: '未详', basis: 'S-05 人物说法' }
  return emptyRow('colleague', '尚未正式接触，同僚只知你到任')
}

function gentryRow(state: GameState, focus: EchoFocus): EchoRow {
  const entry = state.giftEntries[0] ?? ''
  if (focus === 'gift') {
    if (!entry) return emptyRow('gentry', '接风帖仍在案角，事未成')
    if (entry.includes('亲赴')) return { id: 'gentry', ...audienceNames.gentry, known: '桑宅赞你通达，坟图仍压在帖底', stance: '认可', action: '再请一次', basis: '礼簿 / 桑宅回话' }
    if (entry.includes('代往')) return { id: 'gentry', ...audienceNames.gentry, known: '桑士绅嫌你生分', stance: '怨', action: '另找人说合', basis: '礼簿 / 桑宅回话' }
    return { id: 'gentry', ...audienceNames.gentry, known: '桑宅面上无光', stance: '怨', action: '把话传进茶楼', basis: '礼簿 / 桑宅回话' }
  }
  if (focus === 'plan') return emptyRow('gentry', '委牌未涉土源，士绅尚不知此事')
  if (focus === 'outcome') return emptyRow('gentry', '验收未涉坟地，士绅未表态')
  return emptyRow('gentry', '未闻此疑点；只知堤上与坟地之争')
}

function folkRow(state: GameState, focus: EchoFocus): EchoRow {
  if (focus === 'gift') return emptyRow('folk', '街面只看见县衙赴宴与否，未成态度')
  if (focus === 'plan') {
    return state.plan
      ? { id: 'folk', ...audienceNames.folk, known: '点卯时议论上年工食未清', stance: '怨', action: '应役但拖延', basis: 'P-009 堡夫口供' }
      : emptyRow('folk', '未签押，堤上未点卯')
  }
  if (focus === 'outcome') {
    if (!state.outcome) return emptyRow('folk', '验收未届')
    const grade = state.outcome.grade
    if (grade === '合龙') return { id: 'folk', ...audienceNames.folk, known: '堡夫开始传唱你的名字', stance: '认可', action: '合作', basis: '验收症状 / 题销册' }
    if (grade === '苟延') return { id: 'folk', ...audienceNames.folk, known: '渗点暂压，入夜仍有湿痕', stance: '未详', action: '昼夜巡守', basis: '验收症状 / 题销册' }
    if (grade === '失事') return { id: 'folk', ...audienceNames.folk, known: '旧闸下游塌陷数丈，先救人再议责任', stance: '怨', action: '先救人，后议责任', basis: '验收症状 / 题销册' }
    if (grade === '溃口') return { id: 'folk', ...audienceNames.folk, known: '人命与赔补先于考语而至', stance: '怨', action: '赔补先于考语', basis: '验收症状 / 题销册' }
    return { id: 'folk', ...audienceNames.folk, known: '抢护大体合式，旧闸拆修另案', stance: '未详', action: '照旧应役', basis: '验收症状 / 题销册' }
  }
  return { id: 'folk', ...audienceNames.folk, known: '茶楼在传「修堤银挪去修衙署」', stance: '未详', action: '未详', basis: 'P-006 · 无凭据的转述' }
}

export function echoesOf(state: GameState, focus: EchoFocus): EchoSet {
  const rows = [superiorRow(state, focus), colleagueRow(state, focus), gentryRow(state, focus), folkRow(state, focus)]
  const meta: Record<EchoFocus, { title: string; event: string; note: string }> = {
    clue: {
      title: '同一批疑点，四种人各自听见什么',
      event: state.clues.length ? `${state.clues.length} 条疑点在台账，尚未写成详文` : '台账尚无疑点',
      note: '没有见证、没有文书的疑点，不会自动变成风声。',
    },
    gift: {
      title: '同一场宴，四种人各自记住什么',
      event: state.giftEntries[0] ?? '接风帖仍在案角，事未成',
      note: '礼簿记的是花费，回声记的是各自的理解。',
    },
    plan: {
      title: '同一道委牌，四种人各自看见什么',
      event: state.plan ? `${state.plan.leaderName}主办 · 料${state.plan.material}垛 · 夫${state.plan.labor}人` : '尚未签押，委牌未成',
      note: '签押只把责任分给具体的人；别人怎么看，另有来源。',
    },
    outcome: {
      title: '同一次验收，四种人各自留下什么',
      event: state.outcome ? `${state.outcome.grade} · ${state.outcome.symptom}` : '验收未届，题销册仍是空页',
      note: '百姓记得堤，士绅记得地，上司只记得文书。',
    },
  }
  return { focus, ...meta[focus], rows }
}

export interface ImpressionTag {
  label: string
  basis: string
}

export interface Impression {
  id: 'fame' | 'trust' | 'fear' | 'legitimacy'
  name: string
  question: string
  tags: ImpressionTag[]
}

export function impressionsOf(state: GameState): Impression[] {
  const entry = state.giftEntries[0] ?? ''
  const done = state.officialActions
  const outcome = state.outcome

  const fame: ImpressionTag[] = []
  if (done.includes('impeach')) fame.push({ label: '刻', basis: '揭参封发 · 有人说你刻，有人说你清' })
  if (done.includes('citation')) fame.push({ label: '能', basis: '考语已拟，只据本局实迹' })
  if (outcome?.grade === '合龙') fame.push({ label: '堤上传名', basis: '验收：堡夫开始传唱你的名字' })
  if (outcome && (outcome.grade === '失事' || outcome.grade === '溃口')) fame.push({ label: '工法受疑', basis: `验收：${outcome.symptom}` })
  if (entry.includes('亲赴')) fame.push({ label: '通达', basis: '礼簿 · 桑宅赞你通达' })
  if (entry.includes('未赴')) fame.push({ label: '生分', basis: '礼簿 · 桑宅面上无光' })

  const trust: ImpressionTag[] = []
  if (entry.includes('代往')) trust.push({ label: '县丞受托', basis: '代往记录 · 他记下这份托付' })
  if (state.asked.includes('xiancheng')) trust.push({ label: '会勘可托', basis: 'P-002 · 只要报险与会勘留痕齐全' })
  if (state.asked.includes('liangshang')) trust.push({ label: '旧欠可谈', basis: 'P-004 · 只要旧欠有承认与偿还安排' })
  if (state.plan && hasSurvey(state)) trust.push({ label: '责任共担', basis: '委牌 · 县丞会勘留名' })

  const fear: ImpressionTag[] = []
  if (done.includes('impeach')) fear.push({ label: '不敢再辩', basis: '揭参后县衙上下各寻退路' })
  if (done.includes('files')) fear.push({ label: '表面顺从', basis: '书办见人便说「年久册乱」' })
  if (state.completedActions.includes('audit')) fear.push({ label: '主簿警觉', basis: '主簿连夜打听谁动过旧册' })

  const legitimacy: ImpressionTag[] = []
  if (done.includes('suppress')) legitimacy.push({ label: '名分有亏', basis: '压案 · 把柄留在幕友手里' })
  if (state.plan && !hasSurvey(state)) legitimacy.push({ label: '程序待补', basis: '委牌会勘栏为空' })
  if (done.includes('commissioner')) legitimacy.push({ label: '覆勘已认', basis: 'E-008 勘报入卷' })
  if (outcome) legitimacy.push({ label: '题销在册', basis: `验收题销 · 第${outcome.day}日` })
  if (!legitimacy.length) legitimacy.push({ label: '正印官本职', basis: '接印 · 知县身份' })

  return [
    { id: 'fame', name: '名望', question: '别人怎么评价你', tags: fame },
    { id: 'trust', name: '信任', question: '愿不愿把事托给你', tags: trust },
    { id: 'fear', name: '畏惧', question: '拒绝你要付什么代价', tags: fear },
    { id: 'legitimacy', name: '合法性', question: '承不承认你有资格', tags: legitimacy },
  ]
}

export interface OverreachCase {
  id: string
  title: string
  object: string
  verdict: string
  marks: string[]
  trace: string[]
  basis: string
  handler: PowerHandler
}

export function overreachOf(state: GameState): OverreachCase[] {
  const cases: OverreachCase[] = []
  const done = state.officialActions
  if (done.includes('suppress')) {
    cases.push({
      id: 'suppress', title: '压上宪来文', object: '府札 · 委员覆勘',
      verdict: '可而该不该', marks: ['匣底', '幕友见证'],
      trace: ['来文没有消失，只是暂不应答', '日后再被提起时仍须分辩'],
      basis: 'S-13 批答 · 压案留痕', handler: 'review',
    })
  }
  if (done.includes('impeach')) {
    cases.push({
      id: 'impeach', title: '具揭参劾书办', object: '书办 · 失察',
      verdict: '合法但代价高', marks: ['朱印封发', '骑缝'],
      trace: ['清名与刻名并至', '县里再无回旋'],
      basis: 'S-13 批答 · 揭参', handler: 'review',
    })
  }
  if (state.plan && !hasSurvey(state)) {
    cases.push({
      id: 'plan-no-survey', title: '无会勘签押的抢护', object: '委牌 · 会勘栏空白',
      verdict: '可而该不该', marks: ['会勘栏空白', '验收只落一纸'],
      trace: ['保固与赔补由签押人独担', '县丞未在委牌上留名'],
      basis: 'S-04 委牌 / 6.6 责任共担', handler: 'plan',
    })
  }
  if (state.clues.length > 0 && state.comparisons.length === 0) {
    cases.push({
      id: 'unfiled-clue', title: '只记在私册的疑点', object: `${state.clues.length} 条疑点`,
      verdict: '留痕未成文书', marks: ['私记', '未并置'],
      trace: ['夜查所得若不入卷，公事上等于没有', '考语里写不进一句'],
      basis: 'S-05 情报台账', handler: 'intel',
    })
  }
  return cases
}

export function powerDigestOf(state: GameState) {
  const bundle = entitlementsOf(state, 'seat')
  const pick = (tier: Tier) => bundle.rows.find(item => item.tier === tier)!
  return {
    identity: bundle.identity,
    seat: bundle.seat,
    place: bundle.place,
    note: bundle.note,
    lines: [pick('能'), pick('可'), pick('该')],
    dock: dockOf('seat').slice(0, 3),
  }
}
