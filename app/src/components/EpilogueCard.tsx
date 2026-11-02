import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, BookOpen, Check, ChevronDown, FileWarning, Printer, ScrollText, Stamp, X } from 'lucide-react'
import { goalReckoningOf, type GameState } from '../game/useGame'

type RecordTab = 'citation' | 'deeds' | 'reckoning' | 'legacy'

interface Deed {
  id: string
  when: string
  title: string
  summary: string
  source: string
  detail: string
}

const tabs: Array<{ id: RecordTab; label: string; short: string }> = [
  { id: 'citation', label: '考语', short: '四格与风评' },
  { id: 'deeds', label: '行状', short: '实迹可回查' },
  { id: 'reckoning', label: '志向对账', short: '当初与后来' },
  { id: 'legacy', label: '留下的账', short: '长尾与退路' },
]

const officialDeeds: Record<string, { title: string; summary: string; detail: string }> = {
  endorse: { title: '批回上宪来文', summary: '以查字发回县里 批语入卷', detail: '只批示再核 没有替县里定下工法与责任' },
  commissioner: { title: '委员覆勘东堤', summary: '勘报 E-008 入卷 闸底情形有复核', detail: '委员所见与县呈分别留档 覆勘不预先写成合式' },
  files: { title: '调卷传询', summary: '旧修造册 E-004 入卷 书办口径已录', detail: '调河厅旧册并传询经手书办 料源与责任仍按证据对核' },
  citation: { title: '拟考语入册', summary: '只据本局实迹措辞 日后可被翻出', detail: '不预写卓异 不显示生成权重 也不把一句考语当成分数' },
  impeach: { title: '具揭参劾', summary: '揭参封发 清名与刻名并至', detail: '所参为书办失察 揭参之后县里人情与责任均已留痕' },
  suppress: { title: '压下来文', summary: '来文入匣 幕友已见 把柄留于人手', detail: '文书没有消失 只是暂不应答 日后再被提起时仍须分辩' },
}

function citationOf(state: GameState): string {
  if (state.outcome) {
    if (state.outcome.grade === '合龙') return '才具开展 河工尚能集事'
    if (state.outcome.grade === '合式') return '办事勤勉 调度未纯'
    return '抢护未固 担当与工法俱须再议'
  }
  if (state.plan && state.officialActions.includes('commissioner')) return '才具开展 河工尚能集事'
  if (state.plan) return '办事勤勉 调度未纯'
  return '河工未举 考语无实迹可附'
}

function deedsOf(state: GameState): Deed[] {
  const deeds: Deed[] = [
    {
      id: 'arrival',
      when: '第一日',
      title: '接印视事',
      summary: '收东堤渗水呈文一件 河工案由此起',
      source: '县衙到任簿 / 东堤呈文',
      detail: '到任即收险工呈文 后续问人 对勘 签押与验收均由此案展开',
    },
  ]

  if (state.completedActions.includes('doc-remembered')) {
    deeds.push({
      id: 'document',
      when: '任内',
      title: '并置两版呈文',
      summary: '改动与疑点入册 未凭版本差异直接定罪',
      source: state.comparisons.find(item => item.source === 'document')?.refs.join(' / ') ?? '东堤呈文两版',
      detail: state.comparisons.find(item => item.source === 'document')?.question ?? '两版呈文已并置 改动依据仍待经手人说明',
    })
  }
  if (state.unlocked.includes('E-002')) {
    deeds.push({
      id: 'ledger',
      when: '任内 夜',
      title: '查旧册得借领状',
      summary: '三百两有了借领名目 旧欠与损耗可以互核',
      source: 'E-002 主簿借领状',
      detail: '借领状只证明账上另有一个名目 是否与粮商旧欠同属一笔 仍须并置判断',
    })
  }
  if (state.asked.length > 0) {
    deeds.push({
      id: 'people',
      when: '任内',
      title: '问人留词',
      summary: `正式接触 ${state.asked.length} 人 各自说法分别入册`,
      source: '人情接触记录 / 情报台账',
      detail: '接触不等于相信 每份说法仍保留来源 未把传闻直接写成结论',
    })
  }
  state.giftEntries.forEach((entry, index) => {
    deeds.push({
      id: `gift-${index}`,
      when: '任内 夜',
      title: '接风宴取舍',
      summary: entry,
      source: '礼簿 / 私囊账',
      detail: '应酬与私囊同记 不因礼数完成便删去另一本账的代价',
    })
  })
  if (state.probeKnown) {
    deeds.push({
      id: 'probe',
      when: '任内',
      title: '亲勘闸底',
      summary: '探挖见淘空三尺 工法不再只凭书办一面之词',
      source: 'E-007 探挖记录',
      detail: '十日窗口只能抢护 拆修仍须汛后另案 现场所见没有扩大写成已根治',
    })
  }
  if (state.plan) {
    deeds.push({
      id: 'plan',
      when: `第${state.plan.day}日 ${state.plan.period}`,
      title: '签押发起抢护',
      summary: `${state.plan.leaderName}主办 拨料${state.plan.material}垛 夫役${state.plan.labor}人`,
      source: '东堤抢护签押底稿',
      detail: `${state.plan.supervisor} 保正具结 夫食二十五两 发起与完成分别记录`,
    })
  }
  state.officialActions.forEach(action => {
    const deed = officialDeeds[action]
    if (deed) deeds.push({ id: `official-${action}`, when: '上宪来文后', source: '知府审查卷', ...deed })
  })
  if (state.outcome) {
    deeds.push({
      id: 'outcome',
      when: `第${state.outcome.day}日`,
      title: `抢护验收 ${state.outcome.grade}`,
      summary: state.outcome.symptom,
      source: '东堤抢护题销册',
      detail: state.outcome.factors.map(factor => factor.detail).join('；'),
    })
  }
  return deeds
}

export function EpilogueCard({ state, onClose }: { state: GameState, onClose: () => void }) {
  const [tab, setTab] = useState<RecordTab>('citation')
  const [openDeed, setOpenDeed] = useState<string | null>('arrival')
  const outcome = state.outcome
  const reckoning = goalReckoningOf(state)
  const deeds = deedsOf(state)
  const failed = outcome && (outcome.grade === '失事' || outcome.grade === '溃口')
  const tabIndex = tabs.findIndex(item => item.id === tab)
  const citation = citationOf(state)

  const shou = state.officialActions.includes('suppress')
    ? { text: '压文留隙 守字难称', note: '来文被压 把柄已留' }
    : state.giftEntries.some(item => item.includes('亲赴'))
      ? { text: '勤勉于公 酬酢未检', note: '接风宴亲赴二十两' }
      : state.officialActions.includes('impeach')
        ? { text: '持守过峻 清刻并见', note: '揭参已发 风评两端' }
        : { text: '簿册自警 未敢遽断', note: '只据已见账目措辞' }
  const cai = state.plan && state.officialActions.includes('commissioner')
    ? { text: '才具开展 调度有征', note: '签押与覆勘可以互证' }
    : state.plan
      ? { text: '才具尚可 调度未纯', note: '抢护已举 工法与料源仍有牵制' }
      : { text: '临事未定 抢护未举', note: '本任无签押实迹可附' }
  const zheng = outcome
    ? ['合龙', '合式'].includes(outcome.grade)
      ? { text: '河工集事 堤防有绩', note: `验收 ${outcome.grade} ${outcome.symptom}` }
      : outcome.grade === '苟延'
        ? { text: '抢护苟延 善后未竟', note: outcome.symptom }
        : { text: '抢险失宜 民瘼先急', note: outcome.symptom }
    : state.plan
      ? { text: '抢护已举 成效待验', note: '未把发起写成完成' }
      : { text: '河工未举 政声无附', note: '题销册无工可题' }

  const grades = [
    { id: '守', ...shou },
    { id: '才', ...cai },
    { id: '政', ...zheng },
    { id: '年', text: '年力未载 无据不填', note: '本册不造年龄 不预拟驱策' },
  ]

  const facts = [
    state.plan ? `第${state.plan.day}日签押 ${state.plan.leaderName}主办` : '本任未签押抢护',
    state.probeKnown ? 'E-007 闸底淘空三尺已亲见' : '闸底尚未亲勘',
    state.officialActions.includes('commissioner') ? 'E-008 委员覆勘已入卷' : '委员覆勘未入卷',
    outcome ? `第${outcome.day}日验收 ${outcome.grade}` : '验收结果尚未入册',
  ]
  const reputation = Array.from(new Set([
    outcome && ['合龙', '合式'].includes(outcome.grade) ? '河工可靠' : null,
    outcome?.grade === '苟延' ? '须再巡守' : null,
    failed ? '抢险失宜' : null,
    state.giftEntries.some(item => item.includes('闭门查旧册')) ? '不事酬酢' : null,
    state.giftEntries.some(item => item.includes('亲赴')) ? '通达人情' : null,
    state.giftEntries.some(item => item.includes('代往')) ? '礼数未失' : null,
    state.officialActions.includes('impeach') ? '清刻并议' : null,
    state.officialActions.includes('suppress') ? '来文受压' : null,
    state.officialActions.includes('commissioner') ? '肯经覆勘' : null,
  ].filter((item): item is string => Boolean(item)))).slice(0, 5)
  if (reputation.length === 0) reputation.push('到任日浅 风评未立')

  const handleTabKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const next = (tabIndex + direction + tabs.length) % tabs.length
    setTab(tabs[next].id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  const goNext = () => {
    if (tabIndex === tabs.length - 1) onClose()
    else setTab(tabs[tabIndex + 1].id)
  }

  return (
    <motion.section className="overlay-backdrop epilogue-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="第一章考语与行状" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <motion.article className="epilogue-paper career-record" initial={{ y: 30, opacity: 0, rotateX: -3 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} exit={{ y: 20, opacity: 0, rotateX: 2 }} transition={{ type: 'spring', stiffness: 220, damping: 27 }}>
        <header className="career-head">
          <div className="career-heading">
            <span className="eyebrow">永济县知县 · 第一章行状 / 第十日</span>
            <h2>一任如何，要看做过什么。</h2>
            <p>考语不评分 行状不补写 每一句都能回到案卷</p>
          </div>
          <div className="career-head-actions">
            <button className="outline-button record-print" onClick={() => window.print()}><Printer size={15} />印此页</button>
            <button className="icon-button" onClick={onClose} aria-label="收起考语与行状"><X size={20} /></button>
          </div>
        </header>

        <nav className="career-tabs" role="tablist" aria-label="章末文书分页" onKeyDown={handleTabKeys}>
          {tabs.map((item, index) => (
            <button key={item.id} role="tab" id={`career-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`career-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              <span>0{index + 1}</span><b>{item.label}</b><small>{item.short}</small>
              {tab === item.id && <motion.i className="career-tab-ink" layoutId="career-tab-ink" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            </button>
          ))}
        </nav>

        <div className="career-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} className="career-page" id={`career-panel-${tab}`} role="tabpanel" aria-labelledby={`career-tab-${tab}`} initial={{ opacity: 0, x: 22, clipPath: 'inset(0 0 0 10%)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }} exit={{ opacity: 0, x: -14, clipPath: 'inset(0 10% 0 0)' }} transition={{ duration: .26, ease: [0.22, 1, 0.36, 1] }}>
              {tab === 'citation' && (
                <section className="citation-sheet">
                  <div className="citation-kicker"><span>C-16 考语纸</span><i>{state.officialActions.includes('citation') ? '已拟入册' : '章末拟稿'}</i></div>
                  <div className="four-grades">
                    {grades.map((grade, index) => (
                      <motion.article key={grade.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 + index * .07 }}>
                        <motion.span initial={{ scale: 1.35, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: index % 2 ? 2 : -3 }} transition={{ delay: .16 + index * .07, type: 'spring', stiffness: 260, damping: 17 }}>{grade.id}</motion.span>
                        <div><h3>{grade.text}</h3><p>{grade.note}</p></div>
                      </motion.article>
                    ))}
                  </div>

                  <div className="citation-verdict">
                    <div><span>一句考语</span><blockquote>“{citation}”</blockquote><small>措辞只据这一任已经发生的事 不预写大计与卓异</small></div>
                    <motion.div className="citation-seal" initial={{ scale: 1.5, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -7 }} transition={{ delay: .38, type: 'spring', stiffness: 230, damping: 16 }}><Stamp size={22} /><b>永济<br />县印</b></motion.div>
                  </div>

                  <div className="citation-evidence-grid">
                    <section className="citation-facts">
                      <h3><BookOpen size={16} />实迹所据</h3>
                      {facts.map((fact, index) => <motion.p key={fact} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .25 + index * .05 }}><span>{String(index + 1).padStart(2, '0')}</span>{fact}</motion.p>)}
                    </section>
                    <aside className="reputation-block">
                      <h3>风评入册</h3>
                      <div>{reputation.map((item, index) => <motion.span key={item} initial={{ opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .3 + index * .05 }}>{item}</motion.span>)}</div>
                      <p>风评是标签 不是数值 同一人的清与刻可以同时存在</p>
                    </aside>
                  </div>
                </section>
              )}

              {tab === 'deeds' && (
                <section className="deeds-layout">
                  <aside className="deeds-summary">
                    <span className="eyebrow">行状 / 实迹编年</span>
                    <h3>不以总结代替经过</h3>
                    <p>这里只收已经发生并能回到来源的事 点开一条 可看它所据的案卷</p>
                    <div className="deeds-count"><b>{deeds.length}</b><span>件实迹<br />有源可查</span></div>
                    {outcome && <div className={`deeds-outcome grade-${outcome.grade}`}><span>东堤验收</span><b>{outcome.grade}</b><p>{outcome.symptom}</p></div>}
                  </aside>
                  <div className="deeds-timeline">
                    {deeds.map((deed, index) => {
                      const expanded = openDeed === deed.id
                      return (
                        <motion.article key={deed.id} className={expanded ? 'is-open' : ''} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .045 }}>
                          <i className="deed-node" />
                          <button aria-expanded={expanded} aria-controls={`deed-${deed.id}`} onClick={() => setOpenDeed(expanded ? null : deed.id)}>
                            <span>{deed.when}</span>
                            <div><h3>{deed.title}</h3><p>{deed.summary}</p></div>
                            <motion.span className="deed-chevron" animate={{ rotate: expanded ? 180 : 0 }}><ChevronDown size={17} /></motion.span>
                          </button>
                          <AnimatePresence initial={false}>
                            {expanded && <motion.div id={`deed-${deed.id}`} className="deed-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: .25 }, opacity: { duration: .18 } }}><div><span>据 · {deed.source}</span><p>{deed.detail}</p></div></motion.div>}
                          </AnimatePresence>
                        </motion.article>
                      )
                    })}
                  </div>
                </section>
              )}

              {tab === 'reckoning' && (
                <section className="reckoning-page">
                  <header className="page-inscription"><span>章首立志 / 章末对账</span><h3>当初想要的，后来剩下什么</h3><p>只对账 不评分 志向会被公事 人情与时间改写</p></header>
                  <div className="reckoning-columns">
                    {reckoning ? <section className="reckoning">
                      <header><span className="eyebrow">志向对账 · {reckoning.title}</span><i>{reckoning.seal}</i></header>
                      {reckoning.rows.map((row, index) => <motion.div className={`reckoning-row tone-${row.tone}`} key={row.text} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .1 + index * .08 }}><span>{row.tone}</span><p>{row.text}</p></motion.div>)}
                      <small>进是留下 改是转向 缺是尚未做到</small>
                    </section> : <p className="chain-empty">章首未立志 此处不留空泛评语</p>}
                    <section className="closing-book">
                      <h3><ScrollText size={16} />东堤抢护题销册</h3>
                      {state.plan ? <>
                        <div className="closing-facts"><span>主办 {state.plan.leaderName}</span><span>拨料 {state.plan.material} 垛</span><span>夫役 {state.plan.labor} 人</span><span>夫食 25 两</span></div>
                        {outcome && <div className={`closing-grade grade-${outcome.grade}`}><span>验收</span><b>{outcome.grade}</b><p>{outcome.symptom}</p></div>}
                        <div className="closing-factors">{outcome?.factors.map(factor => <p key={factor.label + factor.detail} className={`tone-${factor.tone}`}><i>{factor.tone === 'plus' ? '得' : '失'}</i>{factor.detail}</p>)}</div>
                      </> : <p className="chain-empty">未发起抢护 题销册上无工可题 只有渗水与十日的记录</p>}
                      <p className="closing-citation">考语 · {citation}</p>
                    </section>
                  </div>
                </section>
              )}

              {tab === 'legacy' && (
                <section className="legacy-page">
                  <header className="page-inscription"><span>第一章终 / 世界不终</span><h3>册子合上以后，账还在走</h3><p>考语入册之日 县衙照旧开门 人也各自记得你做过什么</p></header>
                  <div className="legacy-ledger">
                    <article><span>风评仍在</span><p>{state.log.rumor}</p></article>
                    <article><span>私囊余数</span><b>{state.privateFunds}<small>两</small></b><p>礼簿另有 {state.giftEntries.length} 笔 不因章末而清零</p></article>
                    <article><span>未结疑点</span><b>{state.clues.length}<small>条</small></b><p>来源与接触记录仍留台账 可在日后翻出</p></article>
                  </div>
                  {failed ? (
                    <section className="closing-retreat">
                      <h3><FileWarning size={16} />失败不是终局 三条退路</h3>
                      <div className="retreat-grid">{[
                        { name: '改任幕友', keep: '留住工法与案卷判断', lose: '失去签押之权与这一任的考语' },
                        { name: '回乡为绅', keep: '留住私囊与地方人情', lose: '失去仕途与未结的三百两' },
                        { name: '书院教读', keep: '留住清名与后续援引', lose: '失去河工与县衙所有日程' },
                      ].map((item, index) => <motion.article key={item.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 + index * .07 }}><b>{item.name}</b><p>留 · {item.keep}</p><p>失 · {item.lose}</p></motion.article>)}</div>
                    </section>
                  ) : (
                    <section className="closing-retreat is-quiet"><h3><Check size={16} />往后如何</h3><p>你留下的不只是一段埽工 还有各自记着账的人 下一章不替这一章洗净代价</p></section>
                  )}
                  <div className="legacy-colophon"><ScrollText size={18} /><p>第一章 · 河工案卷终<br /><span>只记已经发生事 不预写身后名</span></p></div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="career-foot">
          <span>第一章 · {tabs[tabIndex].label} / 共 {tabs.length} 页</span>
          <div className="career-page-dots" aria-hidden="true">{tabs.map(item => <i key={item.id} className={item.id === tab ? 'active' : ''} />)}</div>
          <button className="primary-button" onClick={goNext}>{tabIndex === tabs.length - 1 ? '合上册子 回到案头' : `续读 ${tabs[tabIndex + 1].label}`}<ArrowRight size={16} /></button>
        </footer>
      </motion.article>
    </motion.section>
  )
}
