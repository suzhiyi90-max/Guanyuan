import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId } from '../shared/ids'
import type { Person } from '../person/model'
import type { Visibility } from '../shared/visibility'
import type { LifeDomainHook, LifeHistory, LifeHistoryEntry, LifeIssue } from './model'

export interface LifeReferences {
  readonly persons: readonly Person[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime>
}

const visibilityLevels = ['public', 'contact', 'private', 'secret'] as const

function validVisibility(value: Visibility, persons: readonly Person[]): boolean {
  return (value.observer === 'player' || persons.some(person => person.id === value.observer))
    && visibilityLevels.includes(value.level)
}

function sameWorldTime(left: import('../shared/world-time').WorldTime, right: import('../shared/world-time').WorldTime): boolean {
  return isValidWorldTime(left) && isValidWorldTime(right) && compareWorldTime(left, right) === 0
}

export function validateLifeHistory(history: LifeHistory, refs: LifeReferences): LifeIssue[] {
  const issues: LifeIssue[] = []
  const person = refs.persons.find(item => item.id === history.person)
  if (!person) issues.push('life-history-person-missing')
  else if (person.history !== history.id) issues.push('life-history-reference-mismatch')

  const entryIds = new Set<string>()
  const eventIds = new Set<string>()
  let previousAt: LifeHistoryEntry['at'] | undefined
  for (const entry of history.entries) {
    if (entryIds.has(entry.id)) issues.push('life-history-entry-duplicate-id')
    entryIds.add(entry.id)
    if (eventIds.has(entry.event)) issues.push('life-history-event-duplicate')
    eventIds.add(entry.event)

    if (!refs.events.includes(entry.event)) issues.push('life-history-event-missing')
    const eventAt = refs.eventTimes.get(entry.event)
    if (!eventAt || !isValidWorldTime(eventAt)) issues.push('life-history-event-time-missing')
    else if (!sameWorldTime(entry.at, eventAt)) issues.push('life-history-event-time-mismatch')

    if (!isValidWorldTime(entry.at)) issues.push('life-history-invalid-time')
    if (previousAt && isValidWorldTime(previousAt) && isValidWorldTime(entry.at)
      && compareWorldTime(entry.at, previousAt) < 0) {
      issues.push('life-history-order-reversed')
    }
    previousAt = entry.at
    if (!validVisibility(entry.visibility, refs.persons)) issues.push('life-history-visibility-invalid')
  }
  return issues
}

/** Return a new history with one appended entry; failed appends leave the input unchanged. */
export function appendLifeHistoryEntry(
  history: LifeHistory,
  entry: LifeHistoryEntry,
  refs: LifeReferences,
): { readonly history: LifeHistory; readonly issues: LifeIssue[] } {
  const issues: LifeIssue[] = validateLifeHistory(history, refs)
  const last = history.entries[history.entries.length - 1]
  if (history.entries.some(item => item.id === entry.id)) issues.push('life-history-entry-duplicate-id')
  if (history.entries.some(item => item.event === entry.event)) issues.push('life-history-event-duplicate')
  if (!refs.events.includes(entry.event)) issues.push('life-history-event-missing')
  const eventAt = refs.eventTimes.get(entry.event)
  if (!eventAt || !isValidWorldTime(eventAt)) issues.push('life-history-event-time-missing')
  else if (!sameWorldTime(entry.at, eventAt)) issues.push('life-history-event-time-mismatch')
  if (!isValidWorldTime(entry.at)) issues.push('life-history-invalid-time')
  if (last && isValidWorldTime(last.at) && isValidWorldTime(entry.at)
    && compareWorldTime(entry.at, last.at) < 0) {
    issues.push('life-history-order-reversed')
  }
  if (!validVisibility(entry.visibility, refs.persons)) issues.push('life-history-visibility-invalid')
  if (issues.length > 0) return { history, issues }
  return { history: { ...history, entries: [...history.entries, entry] }, issues: [] }
}

export function validateLifeDomainHook(hook: LifeDomainHook, refs: LifeReferences): LifeIssue[] {
  const issues: LifeIssue[] = []
  const person = refs.persons.find(item => item.id === hook.person)
  if (!person) issues.push('life-hook-person-missing')
  else {
    const expectedScope = hook.domain === 'body' ? person.stateDomains.body : person.stateDomains.mind
    if (hook.scope !== expectedScope) issues.push('life-hook-scope-mismatch')
  }
  if (!refs.events.includes(hook.sourceEvent)) issues.push('life-hook-event-missing')
  const eventAt = refs.eventTimes.get(hook.sourceEvent)
  if (!eventAt || !isValidWorldTime(eventAt)) issues.push('life-hook-event-time-missing')
  else if (!sameWorldTime(hook.at, eventAt)) issues.push('life-hook-event-time-mismatch')
  if (!isValidWorldTime(hook.at)) issues.push('life-hook-invalid-time')
  if (!hook.code.trim()) issues.push('life-hook-empty-code')
  if (!validVisibility(hook.visibility, refs.persons)) issues.push('life-hook-visibility-invalid')
  return issues
}

export function validateLifeDomainHookSet(hooks: readonly LifeDomainHook[], refs: LifeReferences): LifeIssue[] {
  const issues: LifeIssue[] = []
  const ids = new Set<string>()
  for (const hook of hooks) {
    if (ids.has(hook.id)) issues.push('life-hook-duplicate-id')
    ids.add(hook.id)
    issues.push(...validateLifeDomainHook(hook, refs))
  }
  return issues
}
