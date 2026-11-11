/**
 * FE-157 实体白名单（20 五）：模型输出只允许引用已登记的人名、地名、官职与凭据号。
 * 出现未登记实体即整段丢弃重试一次；不做模糊匹配、不放行近似名。
 * 词表全部来自既有 data.ts 与游戏内已用词，不新增世界观实体。
 */
import { ledgerRows, people } from '../data'

const places = [
  '县衙', '签押房', '正堂', '内宅', '东堤', '料场', '河湾', '旧闸', '险工', '闸底',
  '夜书房', '书房', '河厅', '库房', '茶楼', '街市', '桑宅', '堡夫棚', '堤上', '工次',
]

const offices = [
  '知县', '县尊', '大人', '卑职', '县丞', '主簿', '幕友', '河工幕友', '粮商', '士绅',
  '绅衿', '堡夫', '堡夫头', '河兵', '工头', '夫役', '门房', '书办', '委员', '河厅委员',
  '知府', '上宪', '掌柜', '董事', '船帮', '料场夫役', '巡堤河兵', '你',
]

const terms = [
  '呈文', '详文', '旧册', '账册', '借领状', '票据', '勘报', '题销', '考语', '会勘',
  '抢护', '汛期', '洪峰', '门包', '陋规', '私囊', '公账', '疑点', '风闻', '人情',
  '秫秸', '垛', '料', '工食', '尾欠', '损耗', '印匣', '委牌', '签押', '移会', '批答',
]

/** 凭据号白名单：既有台账四行 + 游戏内已引用的勘报号。 */
export const evidenceIds: string[] = [...new Set([...ledgerRows.map(row => row.id), 'E-004', 'E-007', 'E-008'])]

export const personNames: string[] = people.map(person => person.name)
export const personRoles: string[] = people.map(person => person.role)

export const entityWhitelist: string[] = [...new Set([...personNames, ...personRoles, ...places, ...offices, ...terms])]

const byLength = [...entityWhitelist].sort((a, b) => b.length - a.length)

function stripKnown(text: string): string {
  let out = text
  for (const word of byLength) out = out.split(word).join(' ')
  return out
}

/** 场景名允许「县衙 · 签押房」这类组合，逐段校验。 */
export function sceneRegistered(scene: string): boolean {
  const parts = scene.split(/[·・\s]+/).filter(Boolean)
  return parts.length > 0 && parts.every(part => places.includes(part) || offices.includes(part))
}

/** 在场者逐个校验：只接受人名、官职或已登记称谓。 */
export function presentRegistered(present: string): boolean {
  const parts = present.split(/[、,，\s]+/).filter(Boolean)
  return parts.length > 0 && parts.every(part => entityWhitelist.includes(part))
}

const speechVerbs = '说道曰称笑问答喊嚷禀回'
const nameLike = new RegExp(`([\\u4e00-\\u9fa5]{2,3})(?=[${speechVerbs}])`, 'g')
const quoted = /[「『《"']([^」』》"']{2,4})[」』》"']/g

/**
 * 找出未登记实体。先剥掉全部白名单词，再只在两类硬信号上判定：
 * 引号内的短专名、以及紧贴言语动词的二三字专名。长对白不参与，避免误杀。
 */
export function unregisteredEntities(text: string): string[] {
  const residue = stripKnown(text)
  const found = new Set<string>()
  for (const match of residue.matchAll(nameLike)) {
    const token = match[1]
    if (!/[\u4e00-\u9fa5]{2,3}/.test(token)) continue
    if (offices.includes(token) || terms.includes(token) || places.includes(token)) continue
    found.add(token)
  }
  for (const match of residue.matchAll(quoted)) {
    const token = match[1].trim()
    if (!/^[\u4e00-\u9fa5]{2,4}$/.test(token)) continue
    if (entityWhitelist.includes(token)) continue
    found.add(token)
  }
  return [...found]
}

/** 事实表：只把白名单与凭据号交给模型，不塞全文。 */
export function factsSheet(): string {
  const lines = people.map(person => `${person.name}（${person.role} · ${person.rank}）：${person.claim}`)
  const evid = ledgerRows.map(row => `${row.id} ${row.title}`)
  return [
    '【人物 · 只可用下列人名与官职】',
    ...lines,
    '【地名】' + places.join('、'),
    '【称谓】' + offices.join('、'),
    '【凭据号 · refs 只可从中选】' + [...evid, 'E-004 河厅旧册', 'E-007 探挖记录', 'E-008 委员勘报'].join('、'),
  ].join('\n')
}