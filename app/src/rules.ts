import { periods, taskStageOf, type GameState } from './game/useGame'

/**
 * S-12 则例册 · 只读规则摘录
 *
 * 这里不定义规则、不算数值、不写存档：条文均为《设计总纲》既有条款的摘录，
 * 「本局对应」只从 GameState 取已发生的事实。界面各处的纸面查验是投影，不是规则。
 */

export type VolumeId = 'time' | 'power' | 'trace' | 'knowledge' | 'ledger' | 'echo'

export interface RuleVolume {
  id: VolumeId
  seal: string
  name: string
  subtitle: string
  basis: string
}

export interface ProjectionLine {
  label: string
  value: string
  tone?: 'ready' | 'pending' | 'risk'
}

export interface RuleClause {
  id: string
  volume: VolumeId
  index: string
  title: string
  text: string
  gloss: string
  basis: string
  project: (state: GameState) => ProjectionLine[]
}

export const ruleVolumes: RuleVolume[] = [
  { id: 'time', seal: '时', name: '时段与耗时', subtitle: '晨午暮夜 / 长动作 / 夜结算', basis: '9.1 / 9.3 / 9.4' },
  { id: 'power', seal: '权', name: '权限与身份', subtitle: '能可该 / 有效身份 / 禁为权', basis: '6.2 / 6.7.1–6.7.7' },
  { id: 'trace', seal: '痕', name: '动词与留痕', subtitle: '八动词 / 文书链 / 越权', basis: '4.5 / 6.6 / 6.7.3 / 6.7.6 / 8.4' },
  { id: 'knowledge', seal: '知', name: '知识四档', subtitle: '核实 / 听说 / 推测 / 存疑', basis: '3.5 / 14.3 / 14.5' },
  { id: 'ledger', seal: '账', name: '账与证据', subtitle: '三数 / 同一笔 / 因果账', basis: '10.5 / 11.6 / 14.2' },
  { id: 'echo', seal: '声', name: '回声与受众', subtitle: '谁知道了 / 四种印象', basis: '13.5.1–13.5.7' },
]

const line = (label: string, value: string, tone?: ProjectionLine['tone']): ProjectionLine => ({ label, value, tone })
const dayName = (day: number) => ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][day - 1] ?? String(day)

export const ruleClauses: RuleClause[] = [
  // 卷一 · 时段与耗时
  {
    id: 'time-one-action', volume: 'time', index: '壹', title: '四时段各一动作',
    text: '晨、午、暮、夜为四时段，每段只有一个实质动作。',
    gloss: '读取、寒暄与回看不耗时段；界面不出现行动点计数，也不把「看见」写成「做过」。',
    basis: '总纲 9.1 B+ / 备案 5.4',
    project: state => [
      line('此刻', `第${dayName(state.day)}日 · ${periods[state.periodIndex]}`, 'ready'),
      line('本时段', state.completedActions.length ? `本局已留 ${state.completedActions.length} 条动作留痕` : '尚无实质动作', state.completedActions.length ? 'ready' : 'pending'),
      line('当前阶段', `${taskStageOf(state)} · 只据既有阶段判定`, 'ready'),
    ],
  },
  {
    id: 'time-long', volume: 'time', index: '贰', title: '发起不等于办成',
    text: '长动作占声明时段；发起与执行、验收分开记录。',
    gloss: '签押只把责任交给执行人，三至四日窗口由日程推进；第十六格是可视化时段，不是行动点。',
    basis: '总纲 9.1 / 9.4 / 10.6；FE-021',
    project: state => state.plan
      ? [
        line('发起', `第${dayName(state.plan.day)}日 · ${state.plan.period}`, 'ready'),
        line('主办', `${state.plan.leaderName} · 料 ${state.plan.material} 垛 · 夫 ${state.plan.labor} 人`, 'ready'),
        line('结果', state.outcome ? `第${dayName(state.outcome.day)}日 ${state.outcome.grade}` : '验收未届，题销册不预写', state.outcome ? 'ready' : 'pending'),
      ]
      : [line('委牌', '尚未签押，长动作未起', 'pending'), line('结果', '无计划不预告结果', 'pending')],
  },
  {
    id: 'time-settle', volume: 'time', index: '叁', title: '夜结算与次日晨',
    text: '夜间结算债务、家庭与风评；次日晨重置时段。',
    gloss: '世界不等玩家：委托、旧欠与人情按各自日程继续变化；夜卷合上才翻到次日。',
    basis: '总纲 9.3 / 9.4 / 10.6',
    project: state => [
      line('今日办成', state.log.done),
      line('卡在', state.log.stuck, 'pending'),
      line('有人在传', state.log.rumor, 'risk'),
    ],
  },

  // 卷二 · 权限与身份
  {
    id: 'power-tier', volume: 'power', index: '壹', title: '能、可、该三分',
    text: '有无人力物力去执行为能；身份程序是否授予为可；名分责任如何反应为该。',
    gloss: '能而不可、可而不能、可而该不该都要看得见；界面只投影既有状态，不替玩家作判定。',
    basis: '总纲 6.7.1 / 6.7.7；FE-031',
    project: state => [
      line('有效身份', '按当前场合切换：签押房正印官 / 东堤河工主持人 / 夜书房私第', 'ready'),
      line('上宪回文', state.officialActions.length ? `已行 ${state.officialActions.length} 项，批语与动作在卷` : '府札候答，尚无县署回文', state.officialActions.length ? 'ready' : 'pending'),
      line('界面', 'S-21 权界纸与案头侧纸均为「界面 · 投影」', 'ready'),
    ],
  },
  {
    id: 'power-seat', volume: 'power', index: '贰', title: '身份随场合切换',
    text: '有效身份 = 人物 × 当前职位 × 场合。',
    gloss: '知县在本县大堂是正印官，在知府衙门是属官；在士绅宴席是宾客，不能带衙役入席当场拿人。',
    basis: '总纲 6.7.2 / 6.7.5',
    project: state => [
      line('本县', '签押房 · 正印官，可签押、传唤、亲勘'),
      line('东堤', state.probeKnown ? '河工主持人 · 闸底已亲勘，勘报在卷' : '河工主持人 · 闸底尚未亲勘', state.probeKnown ? 'ready' : 'pending'),
      line('府衙', '上宪审查座位为知府；县尊在此只是属官', 'risk'),
    ],
  },
  {
    id: 'power-why-not', volume: 'power', index: '叁', title: '不可要给替代路径',
    text: '界面必须显示不能、不可的原因与至少一条替代路径；越权动作不得静默隐藏。',
    gloss: '不写「系统不允许」这类空提示；禁为权每条同屏给出找谁、换什么程序。',
    basis: '总纲 6.7.1 / 6.7.4 / 6.7.7',
    project: state => [
      line('委牌会勘', state.plan ? (state.plan.supervisor.includes('仅工头监作') ? '无县丞会勘签押，责任独担' : '县丞会勘在卷，责任共担') : '尚未签押', state.plan && state.plan.supervisor.includes('仅工头监作') ? 'risk' : 'ready'),
      line('保正具结', state.plan ? '具结已附发起文书' : '未具结则雇募不能发起', state.plan ? 'ready' : 'pending'),
      line('夜宴', state.giftEntries.length ? '取舍已入礼簿' : '入夜前不可作决定，只可先看选项', state.giftEntries.length ? 'ready' : 'pending'),
    ],
  },

  // 卷三 · 动词与留痕
  {
    id: 'trace-verbs', volume: 'trace', index: '壹', title: '八动词仍是主干',
    text: '问、查、托、请、压、保、赏、荐为冻结的社交动词；不另造一套平行动词。',
    gloss: '身份权能（传、召、签、印、征等）只作具体动作标签，界面默认只露当前可用的三至六件。',
    basis: '总纲 4.5 / 6.7.3 / 19.1',
    project: state => [
      line('主干', '问 / 查 / 托 / 请 / 压 / 保 / 赏 / 荐'),
      line('正式问话', state.asked.length ? `已接触 ${state.asked.length} 人，说法各自入台账` : '尚未正式问人', state.asked.length ? 'ready' : 'pending'),
      line('礼簿', state.giftEntries.length ? `${state.giftEntries.length} 笔已入礼簿` : '接风帖仍在案角', state.giftEntries.length ? 'ready' : 'pending'),
    ],
  },
  {
    id: 'trace-record', volume: 'trace', index: '贰', title: '动作要留下痕迹',
    text: '动作 = 动词 × 对象 × 依据 × 场合 × 反应 × 留痕；制度记忆由记录、模仿与传播推动。',
    gloss: '牌票、门簿、账册、考语是留痕的载体；没有来源的字段留白，不补写。',
    basis: '总纲 6.7.3 / 6.7.5 / 10.5',
    project: state => [
      line('疑点', `${state.clues.length} 条在台账 · ${state.comparisons.length} 条已并置`, state.comparisons.length ? 'ready' : 'pending'),
      line('批答', state.officialActions.length ? `${state.officialActions.length} 项已入卷` : '尚无县署回文', state.officialActions.length ? 'ready' : 'pending'),
      line('事实', state.outcome ? `验收 ${state.outcome.grade} 已入题销` : '验收未届，末端不预写', state.outcome ? 'ready' : 'pending'),
    ],
  },
  {
    id: 'trace-overreach', volume: 'trace', index: '叁', title: '越权不静默通过',
    text: '能不等于可，可不等于无后果；越权必须进入事件流，有见证、有追责、有长尾。',
    gloss: 'M1 只呈现既有 authored 边界，不开放通用越权系统；完整长尾属 M2。',
    basis: '总纲 6.7.6 / 18.2 / 18.3',
    project: state => [
      line('压案', state.officialActions.includes('suppress') ? '来文入匣，幕友已见，把柄在人手' : '本局未压案', state.officialActions.includes('suppress') ? 'risk' : 'pending'),
      line('揭参', state.officialActions.includes('impeach') ? '清名与刻名并至' : '本局未揭参', state.officialActions.includes('impeach') ? 'risk' : 'pending'),
      line('边界', '只列本局已发生的边界；未发生不伪造示例', 'ready'),
    ],
  },

  // 卷四 · 知识四档
  {
    id: 'knowledge-tier', volume: 'knowledge', index: '壹', title: '四档分开记',
    text: '已核实 / 听说 / 推测 / 存疑四档独立；来源可信度与内容真假分开。',
    gloss: '「已核实」只表示事实有依据，不代表相关人的解释可信；推测档不替玩家推断。',
    basis: '总纲 14.3 / 14.5；备案 6.5',
    project: state => [
      line('存疑', `${state.clues.length} 条亲手记下的疑点 · ${state.asked.length} 份人物说法`, state.clues.length ? 'ready' : 'pending'),
      line('听说', state.unlocked.includes('P-006') ? 'P-006 茶楼传闻 · 无凭据，只列转述' : '尚未接触转述', 'risk'),
      line('已核实', 'F-001 渗水四十步 / F-005 料五十垛 · 已有依据', 'ready'),
    ],
  },
  {
    id: 'knowledge-contact', volume: 'knowledge', index: '贰', title: '接触不等于相信',
    text: '接触记录只说明谁在何时接触到什么，不等于已读、已懂、已信。',
    gloss: '未知人物只显示公开身份或「生面孔」；不泄露姓名、秘密与关键线索。',
    basis: '总纲 3.5 / 14.5；备案 13.11',
    project: state => [
      line('接触', state.asked.length ? `已正式接触 ${state.asked.length} 人` : '尚无正式接触', state.asked.length ? 'ready' : 'pending'),
      line('证据解锁', `${state.unlocked.length} 件在册`, 'ready'),
      line('边界', '闻名者只显示公开身份；未接触事实留白', 'ready'),
    ],
  },

  // 卷五 · 账与证据
  {
    id: 'ledger-three', volume: 'ledger', index: '壹', title: '三数不是一笔新账',
    text: '账面四千五百、实收四千二百、报部待定；三百两差额在几本账里各有一个名目。',
    gloss: '同一笔不得重复记成六百两；报部未定就留「待定」，不预写结论。',
    basis: '总纲 11.6 / 11.7；备案 6.6',
    project: state => [
      line('账面', '4,500 两 · 河工银领出', 'ready'),
      line('实收', '4,200 两 · 入河工专账', 'ready'),
      line('差额', state.unlocked.includes('E-002') ? 'E-002 借领状已在手，名目可追' : '300 两仍只记作运输损耗', state.unlocked.includes('E-002') ? 'ready' : 'pending'),
    ],
  },
  {
    id: 'ledger-cause', volume: 'ledger', index: '贰', title: '因果要能复述',
    text: '统一因果记录：命令幂等、事件 append-only、结果由执行人与日程共同决定。',
    gloss: '失败不预设腐败；五档结果附症状与得失，不以投入代替结果。',
    basis: '总纲 10.1–10.6 / 19.3；备案 14.2',
    project: state => state.outcome
      ? [
        line('验收', `第${dayName(state.outcome.day)}日 · ${state.outcome.grade}`, 'ready'),
        line('症状', state.outcome.symptom),
        line('得失', `${state.outcome.factors.length} 条因素在题销册`, 'ready'),
      ]
      : [line('验收', '未届题销，结果不预写', 'pending'), line('因果', '抢护按自身日程推进', 'pending')],
  },

  // 卷六 · 回声与受众
  {
    id: 'echo-four', volume: 'echo', index: '壹', title: '四种印象不折算',
    text: '名望、信任、畏惧、合法性回答四个不同问题；禁止用一条世界影响力数值替代。',
    gloss: '同一官员可以很有名望却无人敢共事，也可以令人畏惧却无人真正服从；界面只有离散文字标签与来源小签。',
    basis: '总纲 13.5.1 / 13.5.6 / 14.5',
    project: state => [
      line('名望', state.officialActions.includes('impeach') ? '揭参之后有人说刻、有人说清' : state.outcome?.grade === '合龙' ? '堤上开始传唱你的名字' : '尚无可回到的评价来源', 'ready'),
      line('信任', state.asked.includes('xiancheng') ? '县丞线已接上，会勘有人可托' : '尚无托付来源', state.asked.includes('xiancheng') ? 'ready' : 'pending'),
      line('合法性', state.officialActions.includes('suppress') ? '压案在先，名分有亏' : state.officialActions.includes('commissioner') ? '覆勘已认，程序有据' : '正印官本职', 'ready'),
    ],
  },
  {
    id: 'echo-visibility', volume: 'echo', index: '贰', title: '先问谁知道了',
    text: '行为只有被观察、解释、传播并进入他人行动或记录，才形成世界影响。',
    gloss: '私密行为不会无缘无故传遍全城；谣言传播的是受众相信的版本，不是客观事实。',
    basis: '总纲 13.5.2 / 13.5.3',
    project: state => [
      line('文书曝光', state.officialActions.length ? `${state.officialActions.length} 项批答已进府衙视野` : '府衙只接到县呈', state.officialActions.length ? 'ready' : 'pending'),
      line('传闻', state.unlocked.includes('P-006') ? '茶楼「修衙署」之说仍无凭据' : '未见转述', 'risk'),
      line('礼簿', state.giftEntries.length ? `${state.giftEntries.length} 笔取舍可被各自记住` : '宴未成事', state.giftEntries.length ? 'ready' : 'pending'),
    ],
  },
  {
    id: 'echo-unknown', volume: 'echo', index: '叁', title: '未详就不推断',
    text: '受众不是一块铁板；没有依据的受众保持未详，不推断群体态度。',
    gloss: '中央、省、府通过详文、禀帖、账册与勘报认识地方；他们看到的是报告，不是全部事实。',
    basis: '总纲 13.5.3 / 13.5.5 / 13.5.7',
    project: state => [
      line('百姓', state.outcome ? `验收 ${state.outcome.grade} 已有可依据的症状` : '茶楼转述无凭据，态度未详', state.outcome ? 'ready' : 'pending'),
      line('士绅', state.giftEntries.length ? '礼簿已有取舍，回话可依' : '宴未成事，态度未详', state.giftEntries.length ? 'ready' : 'pending'),
      line('上司', state.officialActions.includes('commissioner') ? '勘报已入卷，不再只听县呈' : '只见县呈与账册', state.officialActions.includes('commissioner') ? 'ready' : 'pending'),
    ],
  },
]

export function clausesOf(volume: VolumeId): RuleClause[] {
  return ruleClauses.filter(item => item.volume === volume)
}

export function clauseById(id: string): RuleClause | undefined {
  return ruleClauses.find(item => item.id === id)
}

export const ruleBasisSummary = '规则 · 摘录 / 界面各处为投影，不是规则本身'
