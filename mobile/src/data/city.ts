import { ledgerRows } from '../data'

export type StreetStationId = 'tea' | 'wine' | 'theatre' | 'firm' | 'pawn' | 'wharf'
export type CityLocationId = 'gate' | 'county' | 'street' | 'tea' | 'home' | 'study' | 'sang' | 'wharf'
const tea = ledgerRows.find(row => row.id === 'P-006')!
export const streetStations = [
  { id: 'tea' as const, cityLocationId: 'tea' as const, name: '茶楼', label: '吃茶与打听', status: '有来源', text: tea.text, source: tea.source, recordId: tea.id, accounts: ['私囊', '人情', '风评'] },
  { id: 'wine' as const, cityLocationId: 'street' as const, name: '酒肆', label: '应酬与酒话', status: '未接触', text: '尚无已接触记录，此处只保留地点索引。', source: '未接触不显示传闻与人物秘密', accounts: ['私囊', '身体', '风评'] },
  { id: 'theatre' as const, cityLocationId: 'street' as const, name: '戏园', label: '听戏与堂会', status: '未接触', text: '尚无已接触记录，此处只保留地点索引。', source: '享受须有钱、时间、身体或风评代价', accounts: ['私囊', '身体', '风评'] },
  { id: 'firm' as const, cityLocationId: 'street' as const, name: '商号', label: '买卖与旧欠', status: '未接触', text: '尚无已接触记录，此处只保留地点索引。', source: '不在地点卡中预写商号秘密或经营数值', accounts: ['私囊', '人情'] },
  { id: 'pawn' as const, cityLocationId: 'street' as const, name: '当铺', label: '典当与借债', status: '未接触', text: '尚无已接触记录，此处只保留地点索引。', source: '借债与典当结算尚未启用', accounts: ['私囊', '人情', '风评'] },
  { id: 'wharf' as const, cityLocationId: 'wharf' as const, name: '码头', label: '脚夫与船运', status: '未接触', text: '尚无已接触记录，此处只保留地点索引。', source: '船运消息必须另有来源才可入台账', accounts: ['私囊', '人情', '风评'] },
]
export const cityLocations = [
  { id: 'gate', name: '城门', label: '城郭边界', knowledge: '见图', summary: '只标城郭入口与回图边界；出城行程由一县舆图样纸承载。', source: '官图城郭入口 / M2 界面样值' },
  { id: 'county', name: '衙署', label: '签押与案卷', knowledge: '见图', summary: '签押房、呈文、旧账与印匣沿用当前场景。', source: 'S-01 既有县衙场景' },
  { id: 'street', name: '街市', label: '六处地点索引', knowledge: '见图', summary: '六处街市名目与街市共用同一份地点纸。', source: 'S-09 既有地点索引' },
  { id: 'tea', name: '茶楼', label: 'P-006 转述', knowledge: '听说', summary: tea.text, source: tea.source },
  { id: 'home', name: '内宅', label: '门簿与家用', knowledge: '见图', summary: '上房、门房、厨房只读既有门簿，不生成家人请求。', source: 'S-08 既有内宅门簿' },
  { id: 'study', name: '夜书房', label: '旧册与请帖', knowledge: '见图', summary: '灯下旧册、志向印与案角请帖仍在原夜书房。', source: 'S-01 既有夜书房场景' },
  { id: 'sang', name: '桑宅', label: '接风宴请帖', knowledge: '听说', summary: '接风宴只按原请帖与当前夜事件展开。', source: '桑鹤龄请帖 / 既有固定日程' },
  { id: 'wharf', name: '码头', label: '船运地点索引', knowledge: '见图', summary: '码头只保留船运索引；无来源不显示船家、渡票与脚夫消息。', source: 'S-09 既有码头索引' },
] as const
export const locationScenes = [
  { id: 'ferry' as const, name: '临河渡口', subtitle: '一苇所系，消息与人都须过渡', source: 'M2 行程样纸', facts: ['渡口只作空间预览', '船期须另有来源', '不提前生成渡资与随机事件'], action: '回县衙案头' },
  { id: 'station' as const, name: '城关驿铺', subtitle: '文书有来路，回文有去处', source: 'M2 驿程样纸', facts: ['公文交接须留回执', '驿程不等于瞬时送达', '未启用的行程不扣时段'], action: '看上宪来文' },
  { id: 'town' as const, name: '青石镇', subtitle: '街面热闹，账目各有去处', source: 'M2 镇庄样纸', facts: ['镇庄只作地点与账位预览', '商号旧欠仍以票据为准', '不生成未经接触的镇民秘密'], action: '回街市索引' },
  { id: 'manor' as const, name: '桑家庄', subtitle: '田土、宗族与坟图都在界内', source: 'M2 镇庄样纸', facts: ['坟图只按请帖线索留档', '让土与说合须真实事件', '不预写地方服从或捐输'], action: '展开桑宅请帖' },
]
