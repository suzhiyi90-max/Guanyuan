import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId } from '../shared/ids'
import type { Person } from '../person/model'
import type { Visibility } from '../shared/visibility'
import type { LifeStageFact, LifeStageIssue } from './stage'

export interface LifeStageReferences {
  readonly persons: readonly Person[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime>
}

const visibilityLevels = ['public', 'contact', 'private', 'secret'] as const

function validVisibility(value: Visibility, persons: readonly Person[]): boolean {
  return (value.observer === 'player' || persons.some(person => person.id === value.observer))
    && visibilityLevels.includes(value.level)
}

function trackKey(fact: LifeStageFact): string {
  return JSON.stringify([fact.person, fact.track])
}

export function validateLifeStageFacts(
  facts: readonly LifeStageFact[],
  refs: LifeStageReferences,
): LifeStageIssue[] {
  const issues: LifeStageIssue[] = []
  const byId = new Map(facts.map(fact => [fact.id, fact]))
  const ids = new Set<string>()
  const replaced = new Set<string>()
  const roots = new Set<string>()

  for (const fact of facts) {
    if (ids.has(fact.id)) issues.push('life-stage-duplicate-id')
    ids.add(fact.id)

    if (!fact.track.trim()) issues.push('life-stage-empty-track')
    if (!fact.code.trim()) issues.push('life-stage-empty-code')
    if (fact.detail.kind === 'value' && !fact.detail.value.trim()) {
      issues.push('life-stage-empty-detail')
    }

    if (fact.supersedes.kind === 'n/a') {
      const key = trackKey(fact)
      if (roots.has(key)) issues.push('life-stage-track-root-duplicate')
      roots.add(key)
    } else if (fact.supersedes.kind !== 'value') {
      issues.push('life-stage-root-must-be-not-applicable')
    }

    const person = refs.persons.find(item => item.id === fact.person)
    if (!person) {
      issues.push('life-stage-person-missing')
    } else {
      if (person.birth.kind === 'value'
        && isValidWorldTime(fact.at)
        && isValidWorldTime(person.birth.value)
        && compareWorldTime(fact.at, person.birth.value) < 0) {
        issues.push('life-stage-before-birth')
      }
      if (person.death.kind === 'value'
        && isValidWorldTime(fact.at)
        && isValidWorldTime(person.death.value.at)
        && compareWorldTime(fact.at, person.death.value.at) > 0) {
        issues.push('life-stage-after-death')
      }
    }

    if (!refs.events.includes(fact.sourceEvent)) issues.push('life-stage-event-missing')
    const eventAt = refs.eventTimes.get(fact.sourceEvent)
    if (!eventAt || !isValidWorldTime(eventAt)) {
      issues.push('life-stage-event-time-missing')
    } else if (!isValidWorldTime(fact.at) || compareWorldTime(fact.at, eventAt) !== 0) {
      issues.push('life-stage-event-time-mismatch')
    }

    if (!isValidWorldTime(fact.at)) issues.push('life-stage-invalid-time')
    if (!validVisibility(fact.visibility, refs.persons)) {
      issues.push('life-stage-invalid-visibility')
    }

    if (fact.supersedes.kind !== 'value') continue
    const previous = byId.get(fact.supersedes.value)
    if (!previous) {
      issues.push('life-stage-supersedes-missing')
      continue
    }
    if (previous.id === fact.id) issues.push('life-stage-supersedes-self')
    if (previous.person !== fact.person) issues.push('life-stage-supersedes-person-mismatch')
    if (previous.track !== fact.track) issues.push('life-stage-supersedes-track-mismatch')
    if (isValidWorldTime(previous.at) && isValidWorldTime(fact.at)
      && compareWorldTime(fact.at, previous.at) <= 0) {
      issues.push('life-stage-supersedes-time-not-later')
    }
    if (replaced.has(previous.id)) issues.push('life-stage-supersedes-already-replaced')
    replaced.add(previous.id)
  }

  return issues
}

/** Append-only stage history. A failed append returns the original collection. */
export function appendLifeStageFact(
  facts: readonly LifeStageFact[],
  fact: LifeStageFact,
  refs: LifeStageReferences,
): { readonly facts: readonly LifeStageFact[]; readonly issues: readonly LifeStageIssue[] } {
  const issues = [...new Set([
    ...validateLifeStageFacts(facts, refs),
    ...validateLifeStageFacts([...facts, fact], refs),
  ])]
  return issues.length > 0
    ? { facts, issues }
    : { facts: [...facts, fact], issues: [] }
}

/** Projects one unsuperseded stage per validated person/track. */
export function currentLifeStageFacts(facts: readonly LifeStageFact[]): readonly LifeStageFact[] {
  const superseded = new Set(
    facts.flatMap(fact => fact.supersedes.kind === 'value' ? [fact.supersedes.value] : []),
  )
  return facts.filter(fact => !superseded.has(fact.id))
}
