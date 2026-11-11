/**
 * FE-157 叙事笔墨配置（20 四）：多档案 + 钥匙 + 测试连通 + 用量。
 * 钥匙单独一档存本机，界面只显后四位；导出只取非密配置。
 * 模型只写叙述层，判定与存档仍由本地引擎结算——这条写在面板里，玩家看得见。
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Download, FlaskConical, KeyRound, Plus, Trash2, X } from 'lucide-react'
import { familyDefaults, familyLabels, probeProvider } from '../narrative/providers'
import {
  clearNarrative, defaultProfile, exportNarrativeConfig, getKey, hasKey, keyTail,
  patchNarrative, removeProfile, setKey, upsertProfile, usageTotal, useNarrative, useNarrativeSecrets,
} from '../narrative/store'
import type { NarratorProfile, ProfileTier, ProviderFamily } from '../narrative/types'

const familyIds: ProviderFamily[] = ['openai-compat', 'anthropic', 'gemini']
const tierLabels: Record<ProfileTier, string> = { daily: '日常小模型', chapter: '章节大模型' }

export function NarratorConfig({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const store = useNarrative()
  useNarrativeSecrets()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const [draftKey, setDraftKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; note: string } | null>(null)
  const [armed, setArmed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const armTimer = useRef(0)

  const profile = store.profiles.find(item => item.id === store.activeId) ?? store.profiles[0] ?? null
  const total = usageTotal()

  useEffect(() => () => {
    abortRef.current?.abort()
    window.clearTimeout(armTimer.current)
  }, [])

  useEffect(() => {
    setDraftKey('')
    setResult(null)
  }, [store.activeId])

  const patch = (next: Partial<NarratorProfile>) => {
    if (!profile) return
    upsertProfile({ ...profile, ...next })
  }

  const changeFamily = (family: ProviderFamily) => {
    if (!profile) return
    const defaults = familyDefaults[family]
    upsertProfile({ ...profile, family, baseURL: defaults.baseURL, model: defaults.model })
    setResult(null)
  }

  const saveKey = () => {
    if (!profile || !draftKey.trim()) return
    setKey(profile.id, draftKey)
    setDraftKey('')
    setResult({ ok: true, note: '钥匙已收进本机另一档 · 不入存档与导出' })
  }

  const runProbe = async () => {
    if (!profile || testing) return
    const key = getKey(profile.id)
    if (!key) { setResult({ ok: false, note: '先填钥匙再试' }); return }
    setTesting(true)
    setResult(null)
    const controller = new AbortController()
    abortRef.current = controller
    const outcome = await probeProvider(profile, key, controller.signal)
    abortRef.current = null
    setTesting(false)
    setResult({ ok: outcome.ok, note: outcome.note })
  }

  const exportConfig = () => {
    const blob = new Blob([exportNarrativeConfig()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'guanyuan-narrative-config.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    if (!armed) {
      setArmed(true)
      window.clearTimeout(armTimer.current)
      armTimer.current = window.setTimeout(() => setArmed(false), 8000)
      return
    }
    setArmed(false)
    clearNarrative()
    setResult({ ok: true, note: '叙事档已清 · 钥匙一并抹去' })
  }

  return (
    <section className="narrator-config" data-open={open ? 'true' : 'false'} data-enabled={store.enabled ? 'true' : 'false'}>
      <button type="button" className="narrator-config-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="narrator-config-seal" aria-hidden="true">笔</span>
        <span className="narrator-config-title">
          <b>叙事笔墨</b>
          <small>{store.enabled ? (profile && hasKey(profile.id) ? `已备 · ${profile.label}` : '已开 · 尚未备笔') : '未开 · 本日照旧'}</small>
        </span>
        <span className={`narrator-config-state ${store.enabled ? 'is-on' : ''}`}>{store.enabled ? '开' : '关'}</span>
        <ChevronDown size={14} className="narrator-config-chevron" aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="narrator-config-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}>
            <div className="narrator-config-inner">
              <p className="narrator-boundary">
                模型只写叙述：剧情、对白、氛围、选项措辞。<b>判定、数值、时段、存档一律本地结算</b>；
                事件效果只能从本地目录里选，模型无权自造。断网或超时即回落，本日照旧可玩。
              </p>

              <label className="narrator-switch">
                <input type="checkbox" checked={store.enabled} onChange={event => patchNarrative({ enabled: event.target.checked })} />
                <span className="narrator-switch-track" aria-hidden="true"><i /></span>
                <span>开启 AI 叙事<small>关闭时游戏完全照旧，不联网</small></span>
              </label>

              <div className="narrator-profiles" role="tablist" aria-label="笔墨档案">
                {store.profiles.map(item => (
                  <button key={item.id} type="button" role="tab" aria-selected={item.id === store.activeId}
                    className={`narrator-profile ${item.id === store.activeId ? 'is-active' : ''}`}
                    onClick={() => patchNarrative({ activeId: item.id })}>
                    <b>{item.label}</b>
                    <small>{familyLabels[item.family]} · {hasKey(item.id) ? keyTail(getKey(item.id)) : '未填钥匙'}</small>
                  </button>
                ))}
                {store.profiles.length < 6 && (
                  <button type="button" className="narrator-profile is-add" onClick={() => upsertProfile({ ...defaultProfile(), label: `档案${store.profiles.length + 1}` })} aria-label="新增笔墨档案">
                    <Plus size={14} aria-hidden="true" /><span>新增</span>
                  </button>
                )}
              </div>

              {profile && (
                <div className="narrator-fields">
                  <label><span>档案名</span>
                    <input value={profile.label} maxLength={16} onChange={event => patch({ label: event.target.value })} />
                  </label>
                  <label><span>厂家族</span>
                    <select value={profile.family} onChange={event => changeFamily(event.target.value as ProviderFamily)}>
                      {familyIds.map(id => <option key={id} value={id}>{familyLabels[id]}</option>)}
                    </select>
                  </label>
                  <label className="is-wide"><span>baseURL</span>
                    <input value={profile.baseURL} spellCheck={false} onChange={event => patch({ baseURL: event.target.value })} placeholder={familyDefaults[profile.family].baseURL} />
                  </label>
                  <label><span>模型名</span>
                    <input value={profile.model} spellCheck={false} onChange={event => patch({ model: event.target.value })} />
                  </label>
                  <label><span>档位</span>
                    <select value={profile.tier} onChange={event => patch({ tier: event.target.value as ProfileTier })}>
                      {(['daily', 'chapter'] as ProfileTier[]).map(tier => <option key={tier} value={tier}>{tierLabels[tier]}</option>)}
                    </select>
                  </label>

                  <div className="narrator-key is-wide">
                    <span className="narrator-key-label"><KeyRound size={13} aria-hidden="true" />钥匙</span>
                    <span className="narrator-key-tail">{hasKey(profile.id) ? keyTail(getKey(profile.id)) : '未填'}</span>
                    <input type="password" value={draftKey} autoComplete="off" spellCheck={false}
                      placeholder={hasKey(profile.id) ? '填新钥匙可覆盖' : '玩家自填 · 只存本机'}
                      onChange={event => setDraftKey(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveKey() } }}
                      aria-label="模型钥匙" />
                    <button type="button" className="narrator-mini" onClick={saveKey} disabled={!draftKey.trim()}>收好</button>
                    {hasKey(profile.id) && (
                      <button type="button" className="narrator-mini is-danger" onClick={() => { setKey(profile.id, ''); setResult({ ok: true, note: '钥匙已抹去' }) }} aria-label="抹去钥匙">
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="narrator-acts is-wide">
                    <button type="button" className="narrator-act" onClick={runProbe} disabled={testing}>
                      <FlaskConical size={13} aria-hidden="true" /><span>{testing ? '试笔中……' : '测试连通'}</span>
                    </button>
                    <button type="button" className="narrator-act" onClick={exportConfig}>
                      <Download size={13} aria-hidden="true" /><span>导出配置 · 不含钥匙</span>
                    </button>
                    {store.profiles.length > 1 && (
                      <button type="button" className="narrator-act is-danger" onClick={() => removeProfile(profile.id)}>
                        <Trash2 size={13} aria-hidden="true" /><span>删此档案</span>
                      </button>
                    )}
                  </div>

                  {result && (
                    <p className={`narrator-result ${result.ok ? 'is-ok' : 'is-bad'}`} role="status">
                      {result.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
                      <span>{result.note}</span>
                    </p>
                  )}
                </div>
              )}

              <dl className="narrator-usage">
                <div><dt>本局落笔</dt><dd>{total.calls} 笔</dd></div>
                <div><dt>入墨 token</dt><dd>{total.prompt}</dd></div>
                <div><dt>出墨 token</dt><dd>{total.completion}</dd></div>
                <div><dt>存卷事件</dt><dd>{store.events.length} 件</dd></div>
              </dl>
              <p className="narrator-usage-note">用量只作提示，不参与判定；相同上下文重放命中旧稿，不重复计费。</p>

              <button type="button" className={`narrator-clear ${armed ? 'is-armed' : ''}`} onClick={handleClear}>
                {armed ? '再按一次 · 抹去叙事档与钥匙' : '清空叙事档（不动游戏存档）'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}