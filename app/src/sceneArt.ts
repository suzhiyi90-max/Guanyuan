import { worldEvents } from './game/schedule'
import type { GameState } from './game/useGame'
import type { Period, SceneId } from './types'

/**
 * 场景美术接口（FE-033）
 *
 * 只登记仓库既有美术或 `src: null` 的留白位。需要新图时，把对应项的 src
 * 换成 `/assets/xxx.jpg` 并把 pending 去掉即可，组件无需改动。
 * 不再用代码绘制场景线稿；pending 项附生成描述词，由用户另行生成。
 */

export type ScenePlateId =
  | 'county-map' | 'city-map'
  | 'ferry' | 'station' | 'town' | 'manor'
  | 'event-material' | 'event-zhubu' | 'event-commissioner' | 'event-storm'
  | 'market' | 'arrival'
  | 'prologue-night' | 'chapter-close' | 'inner-court' | 'banquet'
  | 'summary-night'

export interface ScenePlateSpec {
  src: string | null
  fallbackSrc?: string
  fallbackCredit?: string
  alt: string
  credit: string
  position?: string
  scale?: number
  pending?: boolean
  prompt?: string
}

const countyBase = '/assets/yongji-county-base.png'

export const scenePlates: Record<ScenePlateId, ScenePlateSpec> = {
  'county-map': {
    src: countyBase,
    alt: '永济县境古画底图：山川、城郭、河道与田畴',
    credit: '永济县境清底图 · 既有美术',
    position: '50% 52%',
  },
  'city-map': {
    src: countyBase,
    alt: '同一抄样的县治城郭局部',
    credit: '同一抄样 · 城郭局部',
    position: '32% 64%',
    scale: 1.42,
  },
  ferry: {
    src: '/assets/ferry.png',
    alt: '河湾渡口：木埠头与空载料船，渡亭立在芦苇之后',
    credit: '河湾渡口 · FE-033 专图',
  },
  station: {
    src: '/assets/station.png',
    alt: '北驿铺：驿门半掩，号簿房、马厩与驿旗，官道向远处延伸',
    credit: '北驿铺 · FE-033 专图',
  },
  town: {
    src: '/assets/town.png',
    alt: '青石镇：粮行门面与牙行招幌，石街通向远处田畴',
    credit: '青石镇 · FE-033 专图',
  },
  manor: {
    src: '/assets/manor.png',
    alt: '桑家庄：宗祠屋脊、矮墙与坟地松柏，远处可见堤线',
    credit: '桑家庄 · FE-033 专图',
  },
  'prologue-night': {
    src: '/assets/prologue-night.png',
    fallbackSrc: '/assets/study-night.jpg',
    fallbackCredit: '书斋夜坐 · 暂借夜书房实景',
    alt: '书斋夜坐：一灯一案，卷宗未启',
    credit: '书斋夜坐 · FE-036 专图',
    position: '48% 62%',
  },
  // FE-135：夜结算画境（PS-24）待用户生成；图未到暂借立志夜实景并标待补。
  'summary-night': {
    src: '/assets/summary-night.png',
    fallbackSrc: '/assets/prologue-night.png',
    fallbackCredit: '夜结算画境 · 暂借立志夜实景',
    alt: '夜结算画境：签押房夜灯、案上合起的账册与结了的灯花',
    credit: '夜结算画境 · FE-136 已接入专图（已跑 art 清角标）',
    position: '50% 58%',
    prompt: '清代县衙签押房夜结算画境，横版（建议 1280×720）：深夜案头一盏油灯结着灯花，暖光只照亮案面，案上合起一册账簿、一支搁笔的朱笔与半叠批过的呈文，背景沉入青灰夜色、隐约可见窗棂与架上卷宗；绢本淡彩旧画质感、低饱和、柔和顶光与灯晕；完全无文字、无数字、无印章、无人物，不做现代物件与立体阴影暗角。',
  },
  'chapter-close': {
    src: '/assets/chapter-close.png',
    fallbackSrc: '/assets/county-office-dawn.jpg',
    fallbackCredit: '章末 · 暂借县衙晨光实景',
    alt: '章末：案上合卷，晨光初起',
    credit: '章末收卷 · FE-036 专图',
    position: '52% 66%',
  },
  'inner-court': {
    src: '/assets/inner-court-night.png',
    fallbackSrc: '/assets/study-night.jpg',
    fallbackCredit: '内宅门外 · 暂借夜书房实景',
    alt: '内宅院门外：半掩内门、廊下灯与阶前海棠',
    credit: '内宅门外 · FE-041 专图',
    position: '52% 54%',
  },
  banquet: {
    src: '/assets/banquet-night.png',
    fallbackSrc: '/assets/sang-residence-night.jpg',
    fallbackCredit: '桑宅夜宴 · 专图缺图 · 暂借既有夜宴实景',
    alt: '桑宅接风宴：灯下席面、屏风与未启的杯盏',
    credit: '桑宅夜宴 · FE-055 已接入专图',
    position: '50% 56%',
    prompt: '清代士绅宅院夜宴，工笔淡彩绢本：厅堂一盏主灯、屏風与圆桌席面、未启的杯盏与卷轴，廊外夜色；暖灯窄光、黛蓝暗部，不画可辨识人物特写、不加文字与印章，中部留白供题签叠加。',
  },
  // FE-128 / FE-130：街市专图（PS-22）已由用户生成、经 npm run art 清角标并接入。
  // 图未到时仍暂借青石镇街市图，并在 corner 署名里明确标「专图待补 · 暂借」；组件与六处索引不动。
  market: {
    src: '/assets/street-market.png',
    fallbackSrc: '/assets/town.png',
    fallbackCredit: '街市 · 专图待补 · 暂借青石镇街市图',
    alt: '永济街市：粮行与牙行招幌、沿街摊担与石阶',
    credit: '街市 · FE-130 已接入专图',
    position: '46% 54%',
    scale: 1.12,
    prompt: '清代县城街市，工笔淡彩绢本：粮行与牙行招幌、沿街摊担与石阶、远处城门与薄尘，晨光平光；土黄赭石与青灰为主，不画可辨识人物特写、不加文字与印章，中部留白供六处索引签叠加。',
  },
  arrival: {
    src: '/assets/east-dike-dawn.jpg',
    alt: '东堤堤口的第一眼：堤身、料垛与河面',
    credit: '抵达画境 · 既有东堤实景',
    position: '52% 46%',
  },
  'event-material': {
    src: '/assets/event-material.png',
    fallbackSrc: '/assets/east-dike-work.jpg',
    fallbackCredit: '料船到岸 · 专图待补 · 暂借既有东堤抢护场景',
    alt: '东堤河湾料场：料船靠岸、十垛秫秸与秤架',
    credit: '在途十垛到岸 · FE-049 已接入专图',
    position: '52% 48%',
    prompt: '清代县境东堤河湾料场清晨，工笔淡彩绢本：靠岸料船、十垛秫秸、木跳板与空秤架，河湾薄雾与远处堤线；土黄赭石与青灰，晨光平铺，不画可辨识人物、不加文字印章，左上方留白。',
  },
  'event-zhubu': {
    src: '/assets/event-zhubu.png',
    fallbackSrc: '/assets/county-office-dawn.jpg',
    fallbackCredit: '主簿来问旧册 · 专图待补 · 暂借既有县衙签押房',
    alt: '县衙签押房夜坐：一案一灯、摊开的旧账册与茶盏',
    credit: '主簿来问旧册 · FE-047 专图',
    position: '48% 46%',
    prompt: '清代县衙签押房夜坐，工笔淡彩绢本：一案一灯、摊开的旧账册与一只茶盏，卷宗摞与书架隐在暗处，窗外廊柱；暖灯窄光、黛蓝暗部，不画人物特写、不加文字印章，画面中部留白。',
  },
  'event-commissioner': {
    src: '/assets/event-commissioner.png',
    fallbackSrc: '/assets/county-office-dawn.jpg',
    fallbackCredit: '河厅委员到县 · 专图待补 · 暂借既有县衙签押房',
    alt: '县衙头门外：轿马止步、伞扇收拢与空石阶',
    credit: '河厅委员到县 · FE-047 专图',
    position: '52% 42%',
    prompt: '清代县衙头门外，工笔淡彩绢本：轿马止于门外、收拢的伞扇仪从、石阶与门额、阶前空地；午后平光微尘，赭石灰瓦为主，不画可辨识人物、不加文字印章，右侧留出题签空白。',
  },
  'event-storm': {
    src: '/assets/event-storm.png',
    fallbackSrc: '/assets/east-dike-work.jpg',
    fallbackCredit: '上游暴雨 · 专图待补 · 暂借既有东堤抢护场景',
    alt: '汛期东堤暴雨：涨水漫过旧闸基石、埽料与桩木',
    credit: '上游暴雨 · FE-047 专图',
    position: '58% 54%',
    prompt: '清代黄河汛期东堤暴雨，工笔淡彩绢本：斜落雨线、涨水漫过旧闸基石、埽料与桩木、模糊蓑衣背影不作特写；低饱和青灰与土黄，远处堤线隐没，不加文字印章与人物特写，左上留白。',
  },
}

const eventPlateMap: Record<string, ScenePlateId> = {
  'material-arrival': 'event-material',
  'zhubu-visit': 'event-zhubu',
  'commissioner-arrival': 'event-commissioner',
  storm: 'event-storm',
  'gate-gift': 'inner-court',
}

export function worldEventPlateOf(eventId: string): ScenePlateId {
  return eventPlateMap[eventId] ?? 'event-material'
}

// FE-157：生成事件按场景关键词复用既有画境板，不新增图位、不代码补画。
export function narrationPlateOf(scene: string): ScenePlateId {
  if (scene.includes('内宅')) return 'inner-court'
  if (scene.includes('东堤') || scene.includes('料场') || scene.includes('旧闸')) return 'event-storm'
  if (scene.includes('正堂')) return 'event-commissioner'
  if (scene.includes('夜书房') || scene.includes('书房')) return 'summary-night'
  if (scene.includes('街市') || scene.includes('茶楼')) return 'market'
  if (scene.includes('桑宅')) return 'banquet'
  return 'event-zhubu'
}

const scenePlaces: Record<SceneId, string> = {
  county: '县衙 · 签押房',
  river: '东堤 · 旧闸险工',
  study: '县衙 · 夜书房',
}

// 可做之事直接对应 App 里已经存在的场景热点，不生成新动作。
const sceneThings: Record<SceneId, string[]> = {
  county: ['东堤呈文', '旧账册', '印匣 · 预演签押', '桑宅请帖'],
  river: ['渗水点 · 探挖', '料场', '堡夫棚', '险工牌'],
  study: ['灯下旧册', '志向印', '案角请帖'],
}

export interface PresenceSpec {
  place: string
  present: string
  presentSource: string
  things: string[]
}

export function scenePresenceOf(state: GameState, scene: SceneId, period: Period): PresenceSpec {
  // 在场人物只取当日既有公开日程；没有日程就留白，不补写门子、书办或过路人。
  const event = worldEvents.find(item => item.day === state.day)
  return {
    place: `${scenePlaces[scene]} · ${period}`,
    present: event ? event.present : '未详 · 不补写',
    presentSource: event ? `第${state.day}日公开日程 · ${event.scene}` : '本日无公开在场记录',
    things: sceneThings[scene],
  }
}
