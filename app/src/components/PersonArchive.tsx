/**
 * FE-164 / FE-165 人物全貌档案（C-162 · 界面 · 投影 / 只读）。
 * 依《人物详情档案面板设计-v0.1》与 08 6.3.3：综合主页 + 深入子页；肖像 / 身份 / 关键数据均衡；
 * 三问保留为核心判断模块（继续读 person.questions 的 answer / basis，不折算好感或服从）。
 * 只读边界：查看 / 分析 / 关系浏览 / 证据回查 / 关联跳转；交谈请托委托等互动仍从当前场景发起，本面板不放行动按钮。
 * 认知边界：只投影玩家当前可认知者；未接触人物的能力 / 动机 / 三问 / 筹码不穿透；未知秘密不列清单。
 * 数据单源：people / presence / people.ts 谓词 / debtRows 同源 tokens / state；不新增总分、好感、平行资产或档案专属状态。
 * 打开 / 翻页 / 筛选 / 返回均零费，不推进时段。
 */
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Archive, ArrowLeft, ArrowRight, CalendarClock, Coins, Compass, Eye, Feather, FolderClosed,
  HandCoins, KeyRound, Landmark, Link2, LockKeyhole, Network, ScrollText, Store, UsersRound,
} from 'lucide-react'
import { Portrait } from './Portrait'
import { RadarChart } from './RadarChart'
import {
  capabilityKeys, capabilityTitleOf, needKeys, personEvidenceIdsOf, personPresenceOf,
  personScheduleOf, revealDepthOf, sharedHistoryOf, specialtyOf, topNeedsOf,
} from '../game/people'
import { people } from '../data'
import type { GameState } from '../game/useGame'
import type { Person } from '../types'

export type ArchivePage =
  | 'home' | 'identity' | 'traits' | 'relations' | 'politics'
  | 'goals' | 'player' | 'secrets' | 'resources' | 'history'

export const archivePageLabels: Record<ArchivePage, string> = {
  home: '综合主页',
  identity: '身份与履历',
  traits: '能力 · 性格 · 身体',
  relations: '人际关系网络',
  politics: '派系与政治',
  goals: '目标与行动',
  player: '玩家关系',
  secrets: '信息与秘密',
  resources: '财政与资源',
  history: '历史与公文',
}

const pageIcons: Record<Exclude<ArchivePage, 'home'>, typeof Landmark> = {
  identity: Landmark,
  traits: Feather,
  relations: Network,
  politics: Compass,
  goals: CalendarClock,
  player: HandCoins,
  secrets: Eye,
  resources: Store,
  history: FolderClosed,
}

const sceneNames = { county: '县衙', river: '东堤', study: '夜书房' } as const

function Empty({ text }: { text: string }) {
  return <p className="archive-empty"><LockKeyhole size={15} />{text}</p>
}

function ModuleCard({ icon: Icon, title, preview, gated, onOpen }: {
  icon: typeof Landmark; title: string; preview: string; gated?: boolean; onOpen: () => void
}) {
  return (
    <button type="button" className="archive-module" onClick={onOpen}>
      <header><span><Icon size={14} />{title}</span><ArrowRight size={14} /></header>
      <p className={gated ? 'is-gated' : ''}>{gated ? '须正式接触后可见 · 不穿透未知' : preview}</p>
    </button>
  )
}

export function PersonArchive({ person, state, page, onPage, onExit, onOpenPerson, onOpenEvidence, onOpenIntel }: {
  person: Person
  state: GameState
  page: ArchivePage
  onPage: (page: ArchivePage) => void
  onExit: () => void
  onOpenPerson?: (id: string) => void
  onOpenEvidence?: (ref: string) => void
  onOpenIntel?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const headRef = useRef<HTMLHeadingElement>(null)
  const depth = revealDepthOf(person.id, state)
  const known = depth !== '闻名'
  const asked = state.asked.includes(person.id)
  const specialty = specialtyOf(person)
  const history = sharedHistoryOf(person.id, state)
  const presence = personPresenceOf(state, person.id)
  const schedule = personScheduleOf(state, person.id)
  const evidence = personEvidenceIdsOf(person.id).filter(ref => state.unlocked.includes(ref))
  const needs = topNeedsOf(person)

  useEffect(() => { headRef.current?.focus() }, [page, person.id])

  const chip = (label: string, on = false) => <span className={`archive-chip${on ? ' is-on' : ''}`}>{label}</span>

  const questions = (compact: boolean) => (
    <section className={`archive-questions${compact ? ' is-compact' : ''}`} aria-label="看人三问 · 核心判断">
      <h3>看人三问 <small>不是好感 是判断依据</small></h3>
      {person.questions.map((q, i) => (
        <article key={q.label}>
          <div className={`question-symbol ${q.tone}`}>{i === 0 ? '能' : i === 1 ? '愿' : '敢'}</div>
          <div>
            <h4>{q.label}<span>{q.answer}</span></h4>
            <p><b>依据</b>{q.basis}</p>
          </div>
        </article>
      ))}
      {history.length > 0 && (
        <footer>最近依据 · {history.slice(0, 3).join(' ／ ')}</footer>
      )}
    </section>
  )

  const tokenChips = (
    <div className="archive-tokens">
      {chip(`他欠你 ${person.tokens.owesYou}`, person.tokens.owesYou > 0)}
      {chip(`你欠他 ${person.tokens.youOwe}`, person.tokens.youOwe > 0)}
      {chip(`你把柄 ${person.tokens.hook}`, person.tokens.hook > 0)}
    </div>
  )

  return (
    <div className={`person-archive depth-${depth}`} data-person-id={person.id}>
      <header className="archive-head">
        <button type="button" className="archive-back" onClick={page === 'home' ? onExit : () => onPage('home')}>
          <ArrowLeft size={14} />{page === 'home' ? '返回人物卷' : '回主页'}
        </button>
        <div className="archive-crumb" aria-label="档案位置">
          <span><Archive size={13} />全貌档案</span>
          <i>/</i>
          <b>{person.name}</b>
          <i>/</i>
          <span>{archivePageLabels[page]}</span>
        </div>
        <small className="archive-readonly">界面 · 投影 / 只读 · 不耗时段</small>
      </header>

      <motion.div
        key={`${person.id}-${page}`}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : .2, ease: 'easeOut' }}
      >
        <h2 className="archive-title" tabIndex={-1} ref={headRef}>
          {page === 'home' ? `${person.name} · 全貌` : archivePageLabels[page]}
          <small>{person.role} · {person.rank}</small>
        </h2>

        {page === 'home' && (
          <>
            <section className="archive-identity">
              <Portrait person={person} silhouette={!known} size={120} />
              <div className="archive-identity-text">
                <div className="archive-name">{person.name}<small>{person.style}</small></div>
                <div className="archive-tags">
                  <span className="origin-seal">{person.seal}</span>
                  <span className={`depth-tag depth-${depth}`}>{depth}</span>
                  {chip(person.status, true)}
                  {presence ? chip(`在场 · ${sceneNames[presence.scene]}`, true) : chip('此刻不在场')}
                </div>
                <p className="archive-origin">{person.origin}</p>
                <p className="archive-brief">{person.milestones[0]}</p>
                {presence && <p className="archive-presence">{presence.reason}</p>}
              </div>
            </section>

            {known ? questions(true) : (
              <section className="archive-veiled">
                <blockquote className="person-quote">{person.quote}<cite>到任以来 · 公开言谈 未经证实</cite></blockquote>
                <Empty text="只闻其名 · 能力、动机与三问须正式接触后才可见" />
              </section>
            )}

            <div className="archive-grid">
              <ModuleCard icon={Landmark} title="身份与履历" preview={`${person.role} · ${person.rank} · ${person.seal}`} onOpen={() => onPage('identity')} />
              <ModuleCard icon={Feather} title="能力与称号" gated={!known} preview={`${specialty.label} · ${needs.map(n => n.key).join(' / ')}`} onOpen={() => onPage('traits')} />
              <ModuleCard icon={Network} title="关系网络" gated={!known} preview={`${depth} · 共同经历 ${history.length} 条`} onOpen={() => onPage('relations')} />
              <ModuleCard icon={Compass} title="派系与政治" gated={!known} preview={person.reputation.join(' · ')} onOpen={() => onPage('politics')} />
              <ModuleCard icon={CalendarClock} title="目标与动向" gated={!known} preview={person.desire} onOpen={() => onPage('goals')} />
              <ModuleCard icon={HandCoins} title="玩家关系" gated={!known} preview={`他欠你 ${person.tokens.owesYou} · 你欠他 ${person.tokens.youOwe} · 把柄 ${person.tokens.hook}`} onOpen={() => onPage('player')} />
              <ModuleCard icon={Eye} title="信息与秘密" gated={!known} preview={asked ? `已取得说法 ${person.claimId} · 仍存疑` : '尚未正式问话'} onOpen={() => onPage('secrets')} />
              <ModuleCard icon={Store} title="财政与资源" preview="M1 尚无可查记录 · 留白" onOpen={() => onPage('resources')} />
              <ModuleCard icon={FolderClosed} title="历史与公文" preview={`行状 ${person.milestones.length} 条 · 在卷凭据 ${evidence.length} 件`} onOpen={() => onPage('history')} />
            </div>
          </>
        )}

        {page === 'identity' && (
          <section className="archive-page">
            <dl className="archive-facts">
              <div><dt>姓名 / 字号</dt><dd>{person.name} · {person.style}</dd></div>
              <div><dt>出身 / 籍贯</dt><dd>{person.origin}</dd></div>
              <div><dt>当前身份</dt><dd>{person.role}</dd></div>
              <div><dt>官职品级</dt><dd>{person.rank}</dd></div>
              <div><dt>出身印</dt><dd>{person.seal}</dd></div>
              <div><dt>当前状态</dt><dd>{person.status}{presence ? ` · 在场 ${sceneNames[presence.scene]}` : ' · 此刻不在场'}</dd></div>
            </dl>
            <h3>履历时间轴 <small>公开行状 · 任免迁转 M1 留白</small></h3>
            <ol className="archive-timeline">
              {person.milestones.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>)}
            </ol>
            <Empty text="科举 / 师承 / 亲属背景与任免迁转 · 尚无可查记录" />
          </section>
        )}

        {page === 'traits' && (
          <section className="archive-page">
            {known ? (
              <>
                <div className="panel-radars">
                  <RadarChart title="能力" caption={specialty.label} max={5} values={capabilityKeys.map(key => ({ label: key, value: person.capability[key], hint: capabilityTitleOf(person.capability[key]) }))} />
                  <RadarChart title="动机" caption={needs.map(n => n.key).join(' · ')} max={3} values={needKeys.map(key => ({ label: key, value: person.needs[key] }))} />
                </div>
                <div className="archive-chips">
                  {capabilityKeys.map(key => chip(`${key} · ${capabilityTitleOf(person.capability[key])}`, person.capability[key] >= 4))}
                </div>
                {questions(false)}
                <article className="fear-note"><span>忌讳</span><p>{person.fear}</p></article>
              </>
            ) : <Empty text="能力 / 动机 / 三问 / 忌讳 · 须正式接触后可见" />}
            <h3>身体状态</h3>
            <Empty text="疲劳 / 健康 / 负荷 · M1 尚无可查记录，不伪造" />
          </section>
        )}

        {page === 'relations' && (
          <section className="archive-page">
            {known ? (
              <>
                <h3>你 ↔ {person.name} <small>方向与类型分开记 · 不合并好感</small></h3>
                {tokenChips}
                <p className="archive-note">{person.hookNote}</p>
                <ol className="archive-timeline">
                  {history.length ? history.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>) : <li><span>—</span><p>尚未正式接触 · 只保留公开名录</p></li>}
                </ol>
              </>
            ) : <Empty text="接触路径与筹码 · 须正式接触后可见" />}
            <h3>关系节点 <small>点节点跳该人物主页</small></h3>
            <div className="archive-nodes">
              <span className="archive-node is-self">你 · 知县</span>
              <span className="archive-node is-current">{person.name}</span>
              {people.filter(other => other.id !== person.id && revealDepthOf(other.id, state) !== '闻名').map(other => (
                <button type="button" key={other.id} className="archive-node" onClick={() => onOpenPerson?.(other.id)}>
                  <UsersRound size={12} />{other.name} · {revealDepthOf(other.id, state)}
                </button>
              ))}
            </div>
            <Empty text="人物之间的亲属 / 师生 / 同年 / 政敌关联 · 尚无可查记录，不全知补齐" />
          </section>
        )}

        {page === 'politics' && (
          <section className="archive-page">
            <h3>社会位置与风评</h3>
            <div className="archive-chips">
              <span className={`depth-tag depth-${depth}`}>{depth}</span>
              {person.reputation.map(tag => chip(tag, true))}
            </div>
            <p className="archive-note">风评是街面说法，不是忠诚数值；不同概念分开呈现，不合并总影响力条。</p>
            <h3>派系与利益</h3>
            <Empty text="所属派系 / 利益集团 / 政治立场 · M1 尚无可查记录；不把关系推定为成员身份" />
          </section>
        )}

        {page === 'goals' && (
          <section className="archive-page">
            {known ? (
              <>
                <h3>当前目标</h3>
                <p className="archive-desire">{person.desire}</p>
                <div className="archive-chips">{needs.map(n => chip(`诉求 · ${n.key}`, n.value >= 2))}</div>
                <h3>公开日程与动向</h3>
                {schedule.length ? (
                  <ol className="archive-timeline">
                    {schedule.map(row => <li key={`${row.day}-${row.title}`}><span>{row.when}</span><p>第{row.day}日 · {row.title}</p></li>)}
                  </ol>
                ) : <Empty text="公开日程里暂无此人的安排 · 私下行踪不推断" />}
                <h3>近期行动</h3>
                {history.length ? <ol className="archive-timeline">{history.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>)}</ol> : <Empty text="尚无可查的近期共同行动" />}
              </>
            ) : <Empty text="目标与动向 · 须正式接触后可见；公开日程除外" />}
            {schedule.length > 0 && !known && (
              <ol className="archive-timeline">{schedule.map(row => <li key={`${row.day}-${row.title}`}><span>{row.when}</span><p>第{row.day}日 · {row.title}</p></li>)}</ol>
            )}
          </section>
        )}

        {page === 'player' && (
          <section className="archive-page">
            {known ? (
              <>
                <h3>恩怨与筹码 <small>双向分别记 · 不因查看而改变</small></h3>
                {tokenChips}
                <p className="archive-note">{person.hookNote}</p>
                <h3>共同经历</h3>
                {history.length ? <ol className="archive-timeline">{history.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>)}</ol> : <Empty text="尚未共同经历 · 不凭空生成筹码" />}
                {asked && (
                  <article className="obtained-claim"><span>已取得说法 · {person.claimId}</span><p>{person.claim}</p><small>口供已入情报台账，仍为「存疑」，不自动视为事实。</small></article>
                )}
              </>
            ) : <Empty text="玩家关系与筹码 · 须正式接触后可见" />}
          </section>
        )}

        {page === 'secrets' && (
          <section className="archive-page">
            <h3>已掌握的说法</h3>
            {asked ? <article className="obtained-claim"><span>口供 · {person.claimId} · 存疑</span><p>{person.claim}</p><small>仍为「存疑」，不自动视为事实。</small></article> : <Empty text="尚未正式问话 · 无已掌握说法" />}
            <h3>公开言谈</h3>
            <blockquote className="person-quote">{person.quote}<cite>到任以来 · 公开言谈 未经证实</cite></blockquote>
            <h3>把柄</h3>
            {known && person.tokens.hook > 0 ? <p className="archive-note"><KeyRound size={13} />{person.hookNote}</p> : <Empty text="尚未发现把柄 · 知道不等于能用" />}
            <p className="archive-note">尚未知晓的秘密不显示内容，也不以清单提示存在多少未知。</p>
          </section>
        )}

        {page === 'resources' && (
          <section className="archive-page">
            <Empty text="俸禄 / 田产 / 商号 / 借贷 / 可调动人手 · M1 尚无可查记录" />
            <p className="archive-note">人物所有、控制、经手与可支配不是同一概念；名下资产不等于玩家可支配资源，调用仍走既有协商与委托流程。</p>
          </section>
        )}

        {page === 'history' && (
          <section className="archive-page">
            <h3>行状与功过 <small>公开记录 · 追加不覆盖</small></h3>
            <ol className="archive-timeline">
              {person.milestones.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>)}
            </ol>
            {history.length > 0 && (
              <>
                <h3>你与共同经历</h3>
                <ol className="archive-timeline">{history.map((row, i) => <li key={row}><span>{String(i + 1).padStart(2, '0')}</span><p>{row}</p></li>)}</ol>
              </>
            )}
            <h3>在卷公文与凭据 <small>只聚合引用 · 打开既有阅览面</small></h3>
            {evidence.length ? (
              <div className="archive-chips">
                {evidence.map(ref => (
                  <button type="button" key={ref} className="archive-chip is-link" onClick={() => onOpenEvidence?.(ref)}>
                    <ScrollText size={12} />{ref} · 回证据链
                  </button>
                ))}
              </div>
            ) : <Empty text="与此人相关的凭据尚未入卷 · 入卷后才可回查" />}
            <div className="archive-jumps">
              <button type="button" className="text-link" onClick={() => onOpenIntel?.()}><Link2 size={12} />回情报台账</button>
              <button type="button" className="text-link" onClick={() => onPage('player')}><Coins size={12} />看玩家关系</button>
            </div>
          </section>
        )}
      </motion.div>
    </div>
  )
}