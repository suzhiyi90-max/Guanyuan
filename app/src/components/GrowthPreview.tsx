import { Archive, BookOpen, Coins, Landmark, UsersRound } from 'lucide-react'
import { goals, people } from '../data'
import { revealDepthOf, specialtyOf, topNeedsOf } from '../game/people'
import type { GameState } from '../game/useGame'
import type { Person } from '../types'

export interface GrowthAxis {
  id: 'capability' | 'career' | 'relation' | 'worldly' | 'legacy'
  index: string
  label: string
  note: string
  lines: string[]
  source: string
  empty?: boolean
}

/** C-60 成长五轴：只用既有字段与 GameState 派生文字，不新增成长数值。 */
export function growthAxesOf(state: GameState): GrowthAxis[] {
  const known = people.filter(person => revealDepthOf(person.id, state) !== '闻名')
  const working = people.filter(person => revealDepthOf(person.id, state) === '共事').length
  const tokens = people.reduce((sum, person) => ({
    owesYou: sum.owesYou + person.tokens.owesYou,
    youOwe: sum.youOwe + person.tokens.youOwe,
    hook: sum.hook + person.tokens.hook,
  }), { owesYou: 0, youOwe: 0, hook: 0 })
  const goal = goals.find(item => item.id === state.goalId)
  const needs = known.length ? topNeedsOf(known[0]).map(item => item.key).join(' · ') : ''
  return [
    {
      id: 'capability', index: '壹', label: '能力 · 才干', note: '能力极难改变，既有静态值不在这里变化',
      lines: known.length
        ? [
          ...known.slice(0, 3).map(person => `${person.name} · ${specialtyOf(person).label} / ${person.reputation.join(' · ')}`),
          `动机只取既有 needs：${needs}${known.length > 3 ? ' 等' : ''}`,
        ]
        : ['只闻其名，尚无可见的称号与动机'],
      source: '既有 capability / needs / reputation · 人物卷同源',
      empty: known.length === 0,
    },
    {
      id: 'career', index: '贰', label: '仕途 · 位与望', note: '不设名望刻度，不折算分数',
      lines: [
        goal ? `章首所立：${goal.title} · ${goal.statement}` : '尚未立志，不预写章末对账',
        state.outcome ? `第${state.outcome.day}日验收 · ${state.outcome.grade}` : '题销未届，不预写考语',
        `上宪回文已入卷 ${state.officialActions.length} 项`,
      ],
      source: 'S-14 志向 / S-10 考语与行状 / S-13 上宪回文',
    },
    {
      id: 'relation', index: '叁', label: '关系 · 人与债', note: '债不是好感条，不折算人情值',
      lines: [
        `已正式问话 ${state.asked.length} 人 · 共事 ${working} 人`,
        `人欠我 ${tokens.owesYou} 笔 / 我欠人 ${tokens.youOwe} 笔 / 把柄 ${tokens.hook} 笔`,
        '把柄知道不等于能用，本页不提供讨、还、用',
      ],
      source: '既有 tokens 与接触路径 · S-23 人情簿同源',
    },
    {
      id: 'worldly', index: '肆', label: '世俗 · 家与身', note: '与 S-07 体面线同源，亦为预览',
      lines: [
        `私囊余 ${state.privateFunds} 两`,
        `礼簿已出 ${state.giftEntries.length} 笔`,
        '家用入私囊 · 大额另记，不预设金额',
      ],
      source: 'S-07 礼簿 / S-08 内宅门簿 / 顶栏私囊',
    },
    {
      id: 'legacy', index: '伍', label: '继承 · 身后与来世', note: 'M3 未启用，无来源就不补写',
      lines: ['尚无身后口碑、门生、著作或旧案留痕', '此轴留白，不预写继承内容'],
      source: '总纲 7.8 / 12.5 · 阶段未启用', empty: true,
    },
  ]
}

const axisIcons = { capability: BookOpen, career: Landmark, relation: UsersRound, worldly: Coins, legacy: Archive }

/** page = 人情页「成长 · 预览」工作面；slip = 人物卷 / 人情簿的同源小签。 */
export function GrowthPreview({ state, variant = 'page', person }: { state: GameState; variant?: 'page' | 'slip'; person?: Person }) {
  if (variant === 'slip') {
    const known = people.filter(item => revealDepthOf(item.id, state) !== '闻名').length
    return (
      <aside className="growth-slip" data-growth-slip="true" data-name-card="slip" aria-label="成长预览 · 规则未启用">
        <span className="preview-seal">规则未启用 · 仅预览</span>
        <b>攒下了什么</b>
        <p>{person
          ? `${person.name} · ${specialtyOf(person).label} · ${person.reputation.join(' · ')} · 债与把柄见人情簿`
          : `已相识 ${known} 人 · 礼簿 ${state.giftEntries.length} 笔 · 私囊 ${state.privateFunds} 两`}</p>
        <small>不显示等级、经验条与名望刻度 · 不写存档</small>
      </aside>
    )
  }
  const axes = growthAxesOf(state)
  return (
    <section className="growth-preview" data-growth-preview="page" data-growth-axes={axes.length} aria-label="S-03 成长页 · 规则未启用 · 仅预览">
      <header className="growth-head">
        <div>
          <span className="eyebrow">S-03 / FE-004 · 依 3.6 / 3.7 / 7.8</span>
          <h2>攒下了什么，能调动什么，留下了什么。</h2>
          <p>五轴只把既有能力、实迹、债、家用并置供回看；师承、历练、名望刻度、政令牌与继承规则都未启用，本页不产生成长，也不写存档。</p>
        </div>
        <div className="growth-seal"><span>规则未启用</span><b>仅预览</b><small>非 S-12 规则层</small></div>
      </header>
      <div className="growth-axis-grid">
        {axes.map(axis => {
          const Icon = axisIcons[axis.id]
          return (
            <article key={axis.id} className={`growth-axis is-${axis.id} ${axis.empty ? 'is-empty' : ''}`} data-growth-axis={axis.id}>
              <header><span>{axis.index}</span><Icon size={16} /><div><b>{axis.label}</b><small>{axis.note}</small></div></header>
              <div className="growth-axis-lines">{axis.lines.map(line => <p key={line}>{line}</p>)}</div>
              <footer><span>所据</span><b>{axis.source}</b></footer>
            </article>
          )
        })}
      </div>
      <footer className="growth-foot">
        <span>五轴均只读既有字段与已发生事实 · 无来源处留白 · 不折算单一成长值</span>
        <span>这是「预览」，不是「规则」；则例册 S-12 仍是唯一标规则的表面。</span>
      </footer>
    </section>
  )
}
