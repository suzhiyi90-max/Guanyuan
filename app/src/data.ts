import type { Goal, Person } from './types'

export const goals: Goal[] = [
  { id: 'achievement', title: '政绩', seal: '堤', statement: '保住东堤，留下一件能写进考语的实事。', hint: '工程优先 · 程序与账目可能承压' },
  { id: 'integrity', title: '清名', seal: '清', statement: '不沾陋规，把三百两的去向查个明白。', hint: '证据优先 · 关系与工期可能承压' },
  { id: 'network', title: '关系', seal: '和', statement: '让县丞、粮商与士绅愿意替这县出一次力。', hint: '协济优先 · 私囊与承诺可能承压' },
  { id: 'survival', title: '自保', seal: '慎', statement: '凡事留痕，堤若守不住，也不独自背下这口锅。', hint: '程序优先 · 担当与考语可能承压' },
]

export const people: Person[] = [
  {
    id: 'xiancheng', name: '林绍棠', role: '县丞', rank: '正八品 · 管河佐贰', monogram: '丞',
    style: '字绍棠', seal: '正途', origin: '举人出身 佐贰知县 管河',
    capability: { 行政: 3, 财政: 2, 工程: 2, 司法: 2, 交涉: 3 },
    needs: { 仕途: 2, 家族: 1, 财富: 0, 名声: 1, 安全: 3, 安逸: 1 },
    reputation: ['慎', '能'],
    tokens: { owesYou: 0, hook: 0, youOwe: 1 },
    hookNote: '你欠他一次正式的会勘礼数 若再越过分管 他会先写自己的说法',
    milestones: ['到任即催写详文 不肯只凭口说', '去岁河厅问责 他因会勘留痕而免'],
    desire: '保住与河厅的关系，不愿独自担责。', fear: '最怕一纸没有会勘签押的问责。',
    quote: '“大人，先报河厅。堤可以抢，章程不能乱。”',
    claim: '先报河厅，不可自行拆修；若要调动堡夫，须由我移会。', claimId: 'P-002', status: '可会勘',
    questions: [
      { label: '能不能做', answer: '能协调兵夫与会勘，不能独定工法。', basis: '汛地名册载堡夫二十、河兵五；河厅专管河务。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿，只要报险与会勘留痕齐全。', basis: '到任首日即催写详文，反复询问谁先签押。', tone: 'maybe' },
      { label: '敢不敢做', answer: '不敢单独担责，也不肯越过河厅。', basis: '昨暮拒绝口头调夫，坚持“移会后再办”。', tone: 'no' },
    ],
  },
  {
    id: 'expert', name: '顾逢源', role: '河工幕友', rank: '无品 · 河厅差委', monogram: '工',
    style: '号逢源', seal: '异途', origin: '幕学出身 河厅差委 专司埽工',
    capability: { 行政: 1, 财政: 2, 工程: 5, 司法: 1, 交涉: 2 },
    needs: { 仕途: 1, 家族: 0, 财富: 0, 名声: 2, 安全: 1, 安逸: 0 },
    reputation: ['能', '清'],
    tokens: { owesYou: 1, hook: 0, youOwe: 0 },
    hookNote: '他欠你一次采纳 若你把他的勘报压下 这份欠就立刻翻成怨',
    milestones: ['手订旧闸修造册的逐年附记', '曾因坚持探挖 与书办当堂争执'],
    desire: '让专业判断被采纳，也保住自己在河厅的名声。', fear: '最怕知县只培表面土，洪水后把工法之错推给幕友。',
    quote: '“湿痕在堤上，病根未必在堤上。请大人亲看闸底。”',
    claim: '堤面渗水只是症候；旧闸下游四十步，须探挖闸底再定工法。', claimId: 'P-007', status: '待亲勘',
    questions: [
      { label: '能不能做', answer: '能探挖、估工、定抢护法，无调夫拨银之权。', basis: '熟悉旧闸修造册与埽工则例，身份仍为幕友。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿，但要求亲勘记录写入案卷。', basis: '两次请求带工头同往，拒绝只凭呈文估算。', tone: 'yes' },
      { label: '敢不敢做', answer: '敢写工法，不敢替河厅承诺另案。', basis: '差委身份受河厅节制，须留一份勘报副本。', tone: 'maybe' },
    ],
  },
  {
    id: 'zhubu', name: '王慎之', role: '主簿', rank: '正九品 · 掌账库', monogram: '簿',
    style: '字慎之', seal: '异途', origin: '吏员出身 掌库房钥匙与四柱清册',
    capability: { 行政: 2, 财政: 4, 工程: 1, 司法: 2, 交涉: 2 },
    needs: { 仕途: 1, 家族: 2, 财富: 3, 名声: 0, 安全: 3, 安逸: 1 },
    reputation: ['能', '贪'],
    tokens: { owesYou: 0, hook: 2, youOwe: 0 },
    hookNote: '借领状在你手里 他最怕它与粮商旧欠被放在同一页看',
    milestones: ['历年以「运输损耗」做平账面', '库房钥匙从不离身 旧册夜间另锁'],
    desire: '把三百两按“运输损耗”做平，保住职位与家人。', fear: '最怕那张借领状离开库房，被与粮商旧欠放在一起看。',
    quote: '“账面是平的。三百两，不过是历年运输损耗。”',
    claim: '河工银四千五百两俱已领出，三百两差额是运输损耗，账实无误。', claimId: 'P-003', status: '回避查账',
    questions: [
      { label: '能不能做', answer: '能具领、管库、造册，不能决定工程定性。', basis: '库房钥匙与四柱清册皆由其掌管。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿办寻常收支，不愿交出旧借领状。', basis: '问及旧欠时改称“年久册乱”，并先问谁要查。', tone: 'no' },
      { label: '敢不敢做', answer: '敢照旧例做账，不敢亲笔承认挪移。', basis: ' “运输损耗”一栏无经手人签押，亦无运输凭证。', tone: 'no' },
    ],
  },
  {
    id: 'liangshang', name: '阮裕丰', role: '粮商', rank: '铺户 · 裕丰号掌柜', monogram: '商',
    style: '号裕丰', seal: '寒门', origin: '铺户出身 裕丰号掌柜 常年供河工料',
    capability: { 行政: 1, 财政: 3, 工程: 1, 司法: 2, 交涉: 3 },
    needs: { 仕途: 0, 家族: 1, 财富: 3, 名声: 1, 安全: 1, 安逸: 0 },
    reputation: ['能', '奢'],
    tokens: { owesYou: 0, hook: 0, youOwe: 1 },
    hookNote: '县衙欠他上年尾欠三百两 他手里握着料源与船期',
    milestones: ['上年二十垛料价尾欠至今未清', '已让在途十垛先行 仍扣最后十垛作保'],
    desire: '收回上年三百两尾欠，再把这一季的料卖出去。', fear: '最怕旧账又变新账，最后十垛料发出去仍收不到银。',
    quote: '“小民不是不发料。衙门先把旧年那张票认下。”',
    claim: '上年二十垛料价尾欠三百两未还；旧欠不清，最后十垛暂不能发。', claimId: 'P-004', status: '手握料源',
    questions: [
      { label: '能不能做', answer: '能发料、垫银、筹船，不能决定县库支出。', basis: '仓单显示尚有十垛未发，在途船票十垛。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿，只要旧欠有明确承认与偿还安排。', basis: '已让在途十垛先行，仍扣最后十垛作保。', tone: 'maybe' },
      { label: '敢不敢做', answer: '敢停料讨债，不敢公开与县衙撕破脸。', basis: '请士绅作中说合，未直接上控。', tone: 'maybe' },
    ],
  },
  {
    id: 'gentry', name: '桑鹤龄', role: '地方士绅', rank: '绅衿 · 东堤董事', monogram: '绅',
    style: '字鹤龄', seal: '正途', origin: '绅衿出身 东堤董事 桑家族长',
    capability: { 行政: 1, 财政: 2, 工程: 1, 司法: 2, 交涉: 4 },
    needs: { 仕途: 0, 家族: 3, 财富: 1, 名声: 3, 安全: 1, 安逸: 0 },
    reputation: ['能', '刻'],
    tokens: { owesYou: 0, hook: 1, youOwe: 1 },
    hookNote: '坟图已附在请帖里 让一寸土与保一族体面 他要你先选',
    milestones: ['东堤附近宗族商户多以其为首', '曾以联名上控逼退上一任的取土令'],
    desire: '保住桑家坟地与地方话语权。', fear: '最怕今日让一寸土，明日人人都能来动桑家的地。',
    quote: '“堤要修，桑某不拦。只是那几亩坟地，动不得。”',
    claim: '最近土源在桑氏坟地边缘；若强取，必联名上控。', claimId: 'P-005', status: '待说合',
    questions: [
      { label: '能不能做', answer: '能让土、捐输、作中，也能发动上控。', basis: '东堤附近宗族与商户多以其为首。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿谈替代土源，不愿无偿让坟地。', basis: '接风帖中特意附上一张坟图。', tone: 'maybe' },
      { label: '敢不敢做', answer: '敢上控，也会先看知县给不给体面。', basis: '已命人将“官堤占坟”的说法传入茶楼。', tone: 'no' },
    ],
  },
  {
    id: 'foreman', name: '赵九河', role: '堡夫头', rank: '无品 · 东堤工头', monogram: '夫',
    style: '乳名九河', seal: '寒门', origin: '堡夫出身 世代守东堤 熟识旧险工',
    capability: { 行政: 1, 财政: 0, 工程: 4, 司法: 1, 交涉: 1 },
    needs: { 仕途: 0, 家族: 2, 财富: 1, 名声: 0, 安全: 3, 安逸: 0 },
    reputation: ['能'],
    tokens: { owesYou: 0, hook: 0, youOwe: 0 },
    hookNote: '夫役上年工食未清 他肯下坑 但不肯替任何人签「料数无误」',
    milestones: ['常年守东堤 每一处旧险工都下过坑', '曾拒绝在收料印串上代签 坚持复秤'],
    desire: '让夫役拿到工钱，也让岸上的人听见一线的话。', fear: '最怕溃堤之后，死人无名，活人还要赔命。',
    quote: '“那三十垛，有些虚松。大人若不嫌脏，跟我下坑看。”',
    claim: '旧闸底有掏空迹象，到场三十垛中亦有虚松；须探挖复秤。', claimId: 'P-009', status: '愿带亲勘',
    questions: [
      { label: '能不能做', answer: '能带人抢护、探挖、复秤，无名册调拨权。', basis: '常年守东堤，熟识每一处旧险工。', tone: 'yes' },
      { label: '愿不愿做', answer: '愿，只要工食与保正具结有着落。', basis: '夫役已被拖欠上年工食，点卯时议论不断。', tone: 'maybe' },
      { label: '敢不敢做', answer: '敢下险工，不敢替书办签“料数无误”。', basis: '拒绝在收料印串上代签，坚持复秤。', tone: 'yes' },
    ],
  },
]

export const documentVersions = {
  initial: {
    id: 'V-001', label: '呈文初稿', author: '河工书办',
    paragraphs: [
      '据东堤堡夫报称，旧闸下游堤身渗水，约四十步。查系连日水涨，堤土未实所致。',
      '拟即培土帮戗，拨料八垛，先行抢修。闸底旧工，历经多年，似可毋庸拆验。',
      '理合具文呈报，伏乞鉴核施行。',
    ],
  },
  final: {
    id: 'V-002', label: '呈文定稿', author: '知县／幕友改定',
    paragraphs: [
      '据东堤堡夫报称，旧闸下游堤身渗水四十步，湿痕三处，最大约二尺。',
      '闸底情形未明，拟请委员覆勘；先拨料八至十垛，雇夫抢护，三日内补报。',
      '至旧闸应否汛后另案拆修，俟探挖勘明，再行详请。',
    ],
  },
}

/** M1 三数：只作既有账面的同源投影，不在这里做任何折算或判定。 */
export const ledgerThree = { book: 4500, actual: 4200, gap: 300 } as const

export const ledgerRows = [
  { id: 'E-001', title: '库房账册', type: '已接触', amount: '300 两', text: '河工银四千五百两领出；实收入河工专账四千二百两。三百两记“运输损耗”，未附运输凭证。', source: '主簿掌管 · 库房调阅', unlocked: true },
  { id: 'E-002', title: '主簿借领状', type: '未接触', amount: '300 两', text: '主簿借领三百两，垫付上年夫役工食。用途有记录，程序有瑕，是否挪移仍须上级定性。', source: '夜书房细查旧册可得', unlocked: false },
  { id: 'E-003', title: '粮商旧欠票据', type: '未接触', amount: '300 两', text: '上年料二十垛，每垛十五两，尾欠三百两未付。与借领状所指为同一笔额度，不可重复记成六百两。', source: '问粮商或赴接风宴可得', unlocked: false },
  { id: 'P-006', title: '茶楼传闻', type: '听说', amount: '无凭据', text: '“县太爷把修堤的银钱挪去修衙署。”目前未见对应支出与文书，只能列为传闻。', source: '茶楼转述 · 来源待查', unlocked: true },
]

export const fixedEvents = [
  { day: 1, label: '接风宴', detail: '今夜 · 桑宅', active: true },
  { day: 5, label: '委员到县', detail: '第五日夜 · 程仪', active: false },
  { day: 8, label: '上游暴雨', detail: '第八至九日', active: false },
  { day: 9, label: '洪峰至', detail: '第九日 · 东堤', active: false },
  { day: 10, label: '验收题销', detail: '抢护验收 · 考语', active: false },
]
