import { Coffee, DoorClosed, Home, Landmark, MapPin, MoonStar, Music, Ship, Store, Wine, type LucideIcon } from 'lucide-react'
import { ledgerRows } from './data'

export type MapKnowledge = '亲至' | '见图' | '听说' | '未详'
export type StreetStationId = 'tea' | 'wine' | 'theatre' | 'firm' | 'pawn' | 'wharf'
export type CityLocationId = 'gate' | 'county' | 'street' | 'tea' | 'home' | 'study' | 'sang' | 'wharf'

export interface StreetStation {
  id: StreetStationId
  recordId: string
  cityLocationId: CityLocationId
  name: string
  label: string
  status: '有来源' | '未接触'
  icon: LucideIcon
  text: string
  source: string
  accounts: string[]
}

export interface CityLocation {
  id: CityLocationId
  name: string
  label: string
  x: number
  y: number
  knowledge: Exclude<MapKnowledge, '亲至'>
  source: string
  summary: string
  accounts: string[]
  icon: LucideIcon
}

const teaRecord = ledgerRows.find(row => row.id === 'P-006')!

export const streetStations: StreetStation[] = [
  { id: 'tea', recordId: 'P-006', cityLocationId: 'tea', name: '茶楼', label: '吃茶与打听', status: '有来源', icon: Coffee, text: teaRecord.text, source: teaRecord.source, accounts: ['私囊', '人情', '风评'] },
  { id: 'wine', recordId: '', cityLocationId: 'street', name: '酒肆', label: '应酬与酒话', status: '未接触', icon: Wine, text: '尚无已接触记录 此处只保留地点索引', source: '未接触不显示传闻与人物秘密', accounts: ['私囊', '身体', '风评'] },
  { id: 'theatre', recordId: '', cityLocationId: 'street', name: '戏园', label: '听戏与堂会', status: '未接触', icon: Music, text: '尚无已接触记录 此处只保留地点索引', source: '享受须有钱 时间 身体或风评代价', accounts: ['私囊', '身体', '风评'] },
  { id: 'firm', recordId: '', cityLocationId: 'street', name: '商号', label: '买卖与旧欠', status: '未接触', icon: Store, text: '尚无已接触记录 此处只保留地点索引', source: '不在地点卡中预写商号秘密或经营数值', accounts: ['私囊', '人情'] },
  { id: 'pawn', recordId: '', cityLocationId: 'street', name: '当铺', label: '典当与借债', status: '未接触', icon: Landmark, text: '尚无已接触记录 此处只保留地点索引', source: '借债与典当结算尚未启用', accounts: ['私囊', '人情', '风评'] },
  { id: 'wharf', recordId: '', cityLocationId: 'wharf', name: '码头', label: '脚夫与船运', status: '未接触', icon: Ship, text: '尚无已接触记录 此处只保留地点索引', source: '船运消息必须另有来源才可入台账', accounts: ['私囊', '人情', '风评'] },
]

export const cityLocations: CityLocation[] = [
  { id: 'gate', name: '城门', label: '城郭边界', x: 50, y: 12, knowledge: '见图', source: '官图城郭入口 / M2 界面样值', summary: '只标城郭入口与回图边界；出城行程仍由一县舆图样纸承载，此处不提供出城动作。', accounts: [], icon: DoorClosed },
  { id: 'county', name: '衙署', label: '签押与案卷', x: 48, y: 36, knowledge: '见图', source: 'S-01 既有县衙场景', summary: '签押房、呈文、旧账与印匣都沿用当前场景；城郭图只提供回返，不另建正堂。', accounts: ['公帑', '人情'], icon: Landmark },
  { id: 'street', name: '街市', label: '六处地点索引', x: 39, y: 61, knowledge: '见图', source: 'S-09 既有地点索引', summary: '六处街市名目与 S-09 共用同一份地点纸；未接触处只留空态。', accounts: ['私囊', '人情', '风评'], icon: Store },
  { id: 'tea', name: '茶楼', label: 'P-006 转述', x: 66, y: 55, knowledge: '听说', source: teaRecord.source, summary: 'P-006 只证明一则茶楼转述，不证明传话者身份，也不证明修衙署支出。', accounts: ['私囊', '人情', '风评'], icon: Coffee },
  { id: 'home', name: '内宅', label: '门簿与家用', x: 24, y: 32, knowledge: '见图', source: 'S-08 既有内宅门簿', summary: '上房、门房、厨房仍只读既有门簿；镜头停在门外，不生成家人请求。', accounts: ['私囊', '身体', '人情'], icon: Home },
  { id: 'study', name: '夜书房', label: '旧册与请帖', x: 76, y: 28, knowledge: '见图', source: 'S-01 既有夜书房场景', summary: '灯下旧册、志向印与案角请帖仍在原夜书房；回图不替代细查动作。', accounts: ['公帑', '身体'], icon: MoonStar },
  { id: 'sang', name: '桑宅', label: '接风宴请帖', x: 76, y: 80, knowledge: '听说', source: '桑鹤龄请帖 / 既有固定日程', summary: '接风宴只按原请帖与当前夜事件展开；赴宴、代往或查册仍在原纸张选择。', accounts: ['私囊', '人情', '身体', '风评'], icon: MapPin },
  { id: 'wharf', name: '码头', label: '船运地点索引', x: 24, y: 82, knowledge: '见图', source: 'S-09 既有码头索引', summary: '码头只保留 S-09 船运索引；船家、渡票与脚夫消息无来源不显示。', accounts: ['私囊', '人情', '风评'], icon: Ship },
]

export function streetStationOf(id: StreetStationId | null | undefined) {
  return streetStations.find(station => station.id === id)
}

export function cityLocationOf(id: CityLocationId) {
  return cityLocations.find(location => location.id === id) ?? cityLocations[0]
}
