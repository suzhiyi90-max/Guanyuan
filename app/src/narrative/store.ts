/**
 * FE-157 叙事本机档（20 四 / 十一）。
 * 两个独立 key：配置与生成事件走 guanyuan.narrative.v1，钥匙单独走 guanyuan.narrative.secret.v1。
 * 两者都不入 guanyuan.save.v1；导出只取配置档，钥匙永不进导出、日志与摘要。
 * 这是用户明确授权的「玩家自填 · 本地保存」，与红线 27 的脱敏要求一并满足。
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { GeneratedEvent, NarratorProfile, ProfileTier, ProviderFamily, UsageEntry } from './types'
import { familyDefaults } from './providers'

export const NARRATIVE_KEY = 'guanyuan.narrative.v1'
export const NARRATIVE_SECRET_KEY = 'guanyuan.narrative.secret.v1'

export interface NarrativeCacheEntry {
  raw: string
  at: number
}

export interface NarrativeStore {
  installId: string
  enabled: boolean
  activeId: string | null
  profiles: NarratorProfile[]
  events: GeneratedEvent[]
  summary: string[]
  usage: UsageEntry[]
  cache: Record<string, NarrativeCacheEntry>
}

const families: ProviderFamily[] = ['openai-compat', 'anthropic', 'gemini']
const tiers: ProfileTier[] = ['daily', 'chapter']

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function defaultProfile(): NarratorProfile {
  return {
    id: newId('pf'),
    label: '日常小模型',
    family: 'openai-compat',
    baseURL: familyDefaults['openai-compat'].baseURL,
    model: familyDefaults['openai-compat'].model,
    tier: 'daily',
  }
}

function emptyStore(): NarrativeStore {
  const profile = defaultProfile()
  return {
    installId: newId('gy'),
    enabled: false,
    activeId: profile.id,
    profiles: [profile],
    events: [],
    summary: [],
    usage: [],
    cache: {},
  }
}

function normalizeProfile(raw: unknown): NarratorProfile | null {
  const value = (raw ?? {}) as Partial<NarratorProfile>
  if (typeof value.id !== 'string' || !value.id) return null
  const family = families.includes(value.family as ProviderFamily) ? (value.family as ProviderFamily) : 'openai-compat'
  return {
    id: value.id,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim().slice(0, 16) : '未名档案',
    family,
    baseURL: typeof value.baseURL === 'string' && value.baseURL.trim() ? value.baseURL.trim().slice(0, 200) : familyDefaults[family].baseURL,
    model: typeof value.model === 'string' && value.model.trim() ? value.model.trim().slice(0, 80) : familyDefaults[family].model,
    tier: tiers.includes(value.tier as ProfileTier) ? (value.tier as ProfileTier) : 'daily',
  }
}

export function normalizeStore(raw: unknown): NarrativeStore {
  const value = (raw ?? {}) as Partial<NarrativeStore>
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeProfile).filter((item): item is NarratorProfile => Boolean(item)).slice(0, 6)
    : []
  const base = profiles.length ? profiles : [defaultProfile()]
  const activeId = typeof value.activeId === 'string' && base.some(item => item.id === value.activeId) ? value.activeId : base[0].id
  const events = Array.isArray(value.events)
    ? value.events.filter(item => item && typeof item.id === 'string' && Array.isArray(item.options)).slice(-40)
    : []
  const cache: Record<string, NarrativeCacheEntry> = {}
  if (value.cache && typeof value.cache === 'object') {
    for (const [key, entry] of Object.entries(value.cache).slice(-24)) {
      if (entry && typeof entry.raw === 'string') cache[key] = { raw: entry.raw, at: Number(entry.at) || 0 }
    }
  }
  return {
    installId: typeof value.installId === 'string' && value.installId ? value.installId : newId('gy'),
    enabled: value.enabled === true,
    activeId,
    profiles: base,
    events,
    summary: Array.isArray(value.summary) ? value.summary.filter(item => typeof item === 'string').slice(-12) : [],
    usage: Array.isArray(value.usage) ? value.usage.filter(item => item && typeof item.prompt === 'number').slice(-60) : [],
    cache,
  }
}

function load(): NarrativeStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(NARRATIVE_KEY)
    return normalizeStore(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyStore()
  }
}

let current: NarrativeStore = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    window.localStorage.setItem(NARRATIVE_KEY, JSON.stringify(current))
  } catch {
    /* 本机存储不可用时只保留本次会话 */
  }
}

function commit(next: NarrativeStore) {
  current = next
  persist()
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getNarrative(): NarrativeStore {
  return current
}

/* --- 钥匙：单独一档，永不进配置导出 / 摘要 / 用量 --- */

function loadSecrets(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(NARRATIVE_SECRET_KEY)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' ? value as Record<string, string> : {}
  } catch {
    return {}
  }
}

let secrets: Record<string, string> = loadSecrets()
const secretListeners = new Set<() => void>()

function commitSecrets(next: Record<string, string>) {
  secrets = next
  try {
    window.localStorage.setItem(NARRATIVE_SECRET_KEY, JSON.stringify(secrets))
  } catch {
    /* 同上 */
  }
  secretListeners.forEach(listener => listener())
}

export function getKey(profileId: string): string {
  return secrets[profileId] ?? ''
}

export function setKey(profileId: string, key: string) {
  const next = { ...secrets }
  if (key.trim()) next[profileId] = key.trim()
  else delete next[profileId]
  commitSecrets(next)
}

export function keyTail(key: string): string {
  return key ? `····${key.slice(-4)}` : '未填'
}

export function hasKey(profileId: string): boolean {
  return Boolean(secrets[profileId])
}

function subscribeSecrets(listener: () => void) {
  secretListeners.add(listener)
  return () => { secretListeners.delete(listener) }
}

function secretsSnapshot(): string {
  return Object.keys(secrets).sort().map(id => `${id}:${secrets[id].length}`).join('|')
}

export function useNarrativeSecrets(): string {
  return useSyncExternalStore(subscribeSecrets, secretsSnapshot, secretsSnapshot)
}

/* --- 动作 --- */

export function patchNarrative(patch: Partial<Pick<NarrativeStore, 'enabled' | 'activeId'>>) {
  commit({ ...current, ...patch })
}

export function upsertProfile(profile: NarratorProfile) {
  const exists = current.profiles.some(item => item.id === profile.id)
  const profiles = exists
    ? current.profiles.map(item => (item.id === profile.id ? profile : item))
    : [...current.profiles, profile].slice(0, 6)
  commit({ ...current, profiles, activeId: profile.id })
}

export function removeProfile(id: string) {
  const profiles = current.profiles.filter(item => item.id !== id)
  const next = profiles.length ? profiles : [defaultProfile()]
  const nextSecrets = { ...secrets }
  delete nextSecrets[id]
  commitSecrets(nextSecrets)
  commit({ ...current, profiles: next, activeId: current.activeId === id ? next[0].id : current.activeId })
}

export function activeProfile(): NarratorProfile | null {
  return current.profiles.find(item => item.id === current.activeId) ?? current.profiles[0] ?? null
}

export function registerEvent(event: GeneratedEvent) {
  commit({ ...current, events: [...current.events.filter(item => item.id !== event.id), event].slice(-40) })
}

export function findGeneratedEvent(id: string): GeneratedEvent | null {
  return current.events.find(item => item.id === id) ?? null
}

export function pushSummary(line: string) {
  commit({ ...current, summary: [...current.summary, line].slice(-12) })
}

export function addUsage(entry: UsageEntry) {
  commit({ ...current, usage: [...current.usage, entry].slice(-60) })
}

export function cacheGet(hash: string): NarrativeCacheEntry | null {
  return current.cache[hash] ?? null
}

export function cacheSet(hash: string, raw: string) {
  const entries = Object.entries({ ...current.cache, [hash]: { raw, at: Date.now() } }).slice(-24)
  commit({ ...current, cache: Object.fromEntries(entries) })
}

/** 一次落笔只写一次盘：事件、摘要、用量同批提交，避免流式收束时连触发三次订阅。 */
export function recordRun(event: GeneratedEvent, summaryLine: string, entry: UsageEntry) {
  const entries = Object.entries(current.cache).slice(-24)
  commit({
    ...current,
    events: [...current.events.filter(item => item.id !== event.id), event].slice(-40),
    summary: [...current.summary, summaryLine].slice(-12),
    usage: [...current.usage, entry].slice(-60),
    cache: Object.fromEntries(entries),
  })
}

export function usageTotal(): { prompt: number; completion: number; calls: number } {
  return current.usage.reduce(
    (acc, item) => ({ prompt: acc.prompt + item.prompt, completion: acc.completion + item.completion, calls: acc.calls + 1 }),
    { prompt: 0, completion: 0, calls: 0 },
  )
}

/** 导出只取配置档：钥匙、生成事件正文与摘要都不出去。 */
export function exportNarrativeConfig(): string {
  return JSON.stringify({
    schemaVersion: 1,
    enabled: current.enabled,
    activeId: current.activeId,
    profiles: current.profiles,
    note: '不含钥匙。钥匙只存本机另一档，不随导出离开。',
  }, null, 2)
}

export function clearNarrative() {
  commitSecrets({})
  commit(emptyStore())
}

export function useNarrative(): NarrativeStore {
  return useSyncExternalStore(subscribe, getNarrative, getNarrative)
}

export function useNarrativeActions() {
  return useCallback((patch: Partial<Pick<NarrativeStore, 'enabled' | 'activeId'>>) => patchNarrative(patch), [])
}