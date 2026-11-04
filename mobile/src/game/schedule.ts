import { people } from '../data'
import type { GameState } from './model'

export interface WorldEventOption {
  id: string
  label: string
  hint: string
}

export interface WorldEvent {
  id: string
  day: number
  title: string
  scene: string
  present: string
  known: string
  body: string
  options: WorldEventOption[]
}

export const worldEvents: WorldEvent[] = [
  {
    id: 'material-arrival',
    day: 2,
    title: '在途十垛到岸',
    scene: '东堤 · 料场',
    present: '工头赵九河 粮商船帮 料场夫役',
    known: '昨日账面仍是在途十 今晨船已靠岸 若不点收 粮商会把它记成「已交」',
    body: '船帮天未亮就到了。十垛秫秸堆在河湾，潮气很重。赵九河蹲在垛边，抽出一把，捏了捏，没说话，只看着你。',
    options: [
      { id: 'weigh', label: '着料场当场复秤', hint: '得真实料数 虚松之垛当场入账 · 不耗时段' },
      { id: 'shelve', label: '先收讫入册 改日再看', hint: '省事 但「在途」就此变成「到场」 · 不耗时段' },
    ],
  },
  {
    id: 'zhubu-visit',
    day: 3,
    title: '主簿来问旧册',
    scene: '县衙 · 签押房',
    present: '主簿王慎之 你 幕友在侧',
    known: '前夜你查过旧册 他已知道 今日他不是来回话 是来探你的底',
    body: '王慎之把一盏茶放在你案上，笑得很稳。「年久册乱，大人若要看，卑职重新誊一本便是。」他顿了顿，「借领那一笔，原是垫付夫役工食，与粮商旧欠，并不是一回事。」',
    options: [
      { id: 'confront', label: '把借领状与旧欠并置给他看', hint: '当面并置 口径入卷 他日后再难改口' },
      { id: 'defer', label: '暂且不点破 让他先誊册', hint: '留一手 但他会按自己的写法重誊' },
    ],
  },
  {
    id: 'commissioner-arrival',
    day: 5,
    title: '河厅委员到县',
    scene: '县衙 · 正堂',
    present: '河厅委员 县丞 主簿 你',
    known: '委员带的是河厅的册子 不是你的呈文 他要先听别人讲',
    body: '委员进门先看的是河厅旧册，不是你递的详文。他说得很客气：「堤上如何，本厅要亲眼看过才算数。县尊以为，该从哪一处看起？」',
    options: [
      { id: 'inspect', label: '请委员赴东堤覆勘', hint: '若尚未覆勘 得勘报 E-008 事务转验' },
      { id: 'report', label: '以县呈与账册应对', hint: '省一番周折 但定性仍停在你的一面之词' },
    ],
  },
  {
    id: 'storm',
    day: 8,
    title: '上游暴雨',
    scene: '东堤 · 旧闸险工',
    present: '工头 堡夫 巡堤河兵',
    known: '上游三日雨 水位暴涨 洪峰将提前 抢护若未合式 东堤先替你作答',
    body: '雨是从昨夜开始下的，到今晨没有停过。河水已经漫上旧闸的基石。赵九河从堤上回来，蓑衣滴着水：「再这么涨，靠培土是挡不住的。」',
    options: [
      { id: 'inspect', label: '亲赴东堤查看抢护', hint: '看真实现场 症状入卷 · 不耗时段' },
      { id: 'wait', label: '守在县衙听回报', hint: '省时 但你看到的是别人写的现场' },
    ],
  },
]

export interface OutcomeFactor {
  label: string
  detail: string
  tone: 'plus' | 'minus'
}

export interface TaskOutcome {
  grade: '合龙' | '合式' | '苟延' | '失事' | '溃口'
  day: number
  factors: OutcomeFactor[]
  symptom: string
}

export function evaluateRiverTask(state: GameState): TaskOutcome | null {
  if (!state.plan) return null
  const plan = state.plan
  const leader = people.find(p => p.id === plan.leader)
  const factors: OutcomeFactor[] = []
  let score = 0

  const capability = leader?.capability.工程 ?? 1
  const invest = capability / 2 + plan.labor / 25
  score += invest
  factors.push({ label: '投入', detail: `${plan.leaderName}工程${capability} · 夫役${plan.labor}人 → ${invest.toFixed(1)}`, tone: 'plus' })

  const resource = plan.material / 8 + (plan.supervisor.includes('会勘') ? 0.5 : 0)
  score += resource
  factors.push({ label: '资源', detail: `拨料${plan.material}垛${plan.supervisor.includes('会勘') ? ' · 会勘留痕 +0.5' : ' · 无会勘'} → ${resource.toFixed(1)}`, tone: 'plus' })

  let resistance = 0
  if (!state.unlocked.includes('E-003')) {
    resistance += 1
    factors.push({ label: '阻力', detail: '粮商旧欠未清 最后十垛仍扣作保 → −1', tone: 'minus' })
  }
  if (!state.officialActions.includes('files')) {
    resistance += 0.5
    factors.push({ label: '阻力', detail: '未调卷传询 书办口径仍在暗处 → −0.5', tone: 'minus' })
  }
  if (state.officialActions.includes('commissioner')) {
    resistance -= 0.5
    factors.push({ label: '阻力', detail: '委员覆勘印证工法 阻力减半 → +0.5', tone: 'plus' })
  }
  if (state.day >= 8) {
    resistance += 1
    factors.push({ label: '阻力', detail: '上游暴雨 洪峰提前 → −1', tone: 'minus' })
  }
  score -= resistance

  const grade = score >= 4.5 ? '合龙' : score >= 3 ? '合式' : score >= 1.5 ? '苟延' : score >= 0 ? '失事' : '溃口'
  const symptom = grade === '合龙'
    ? '堤身稳 闸底已固 堡夫开始传唱你的名字'
    : grade === '合式'
      ? '抢护大体合式 惟旧闸拆修仍须汛后另案'
      : grade === '苟延'
        ? '渗点暂压 入夜仍有湿痕 须昼夜巡守'
        : grade === '失事'
          ? '抢护不及 旧闸下游塌陷数丈 须先救人再议责任'
          : '东堤溃口 人命与赔补先于考语而至'

  return { grade, day: state.day, factors, symptom }
}

export function materialAfterArrival(state: GameState, weighed: boolean): GameState {
  const arrived = state.material.arrived + state.material.transit
  return {
    ...state,
    material: { arrived, transit: 0, unsent: state.material.unsent },
    clues: weighed
      ? [...state.clues, { id: `C-${state.clues.length + 1}`, text: '料场复秤：在途十垛到岸，其中两垛虚松，实收按八垛半计。书办若记「如数收讫」，与此不合。', source: 'river' as const, refs: ['F-005'], day: state.day }]
      : state.clues,
  }
}
