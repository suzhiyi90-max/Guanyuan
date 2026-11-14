import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { EventId } from '../shared/ids'
import type { Person } from '../person/model'
import { personLifeTimeBoundaryViolations } from '../person/lifecycle'
import type { Visibility } from '../shared/visibility'
import type { LifeStateFact, LifeStateIssue, LifeStateValue } from './state'

export interface LifeStateReferences {
  readonly persons: readonly Person[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, import('../shared/world-time').WorldTime>
}

const visibilityLevels = ['public', 'contact', 'private', 'secret'] as const

function validVisibility(value: Visibility, persons: readonly Person[]): boolean {
  return (value.observer === 'player' || persons.some(person => person.id === value.observer))
    && visibilityLevels.includes(value.level)
}

function validateValue(value: LifeStateValue): LifeStateIssue[] {
  const issues: LifeStateIssue[] = []

  if (value.kind === 'qualitative' && !value.code.trim()) {
    issues.push('life-state-empty-value-code')
  } else if (value.kind === 'classified') {
    if (!value.code.trim()) issues.push('life-state-empty-value-code')
    if (value.detail.kind === 'value' && !value.detail.value.trim()) {
      issues.push('life-state-empty-detail')
    }
  } else if (value.kind === 'quantitative') {
    if (!Number.isFinite(value.value)) issues.push('life-state-invalid-quantitative-value')
    if (!value.scale.trim()) issues.push('life-state-empty-scale')
    if (value.unit.kind === 'value' && !value.unit.value.trim()) {
      issues.push('life-state-empty-unit')
    }
  }

  return issues
}

function dimensionKey(fact: LifeStateFact): string {
  return JSON.stringify([fact.person, fact.domain, fact.scope, fact.dimension])
}

export function validateLifeStateFacts(
  facts: readonly LifeStateFact[],
  refs: LifeStateReferences,
): LifeStateIssue[] {
  const issues: LifeStateIssue[] = []
  const byId = new Map(facts.map(fact => [fact.id, fact]))
  const ids = new Set<string>()
  const replaced = new Set<string>()
  const roots = new Set<string>()

  for (const fact of facts) {
    if (ids.has(fact.id)) issues.push('life-state-duplicate-id')
    ids.add(fact.id)

    if (fact.supersedes.kind === 'n/a') {
      const key = dimensionKey(fact)
      if (roots.has(key)) issues.push('life-state-dimension-root-duplicate')
      roots.add(key)
    } else if (fact.supersedes.kind !== 'value') {
      issues.push('life-state-root-must-be-not-applicable')
    }

    const person = refs.persons.find(item => item.id === fact.person)
    if (!person) {
      issues.push('life-state-person-missing')
    } else {
      const expectedScope = fact.domain === 'body'
        ? person.stateDomains.body
        : person.stateDomains.mind
      if (fact.scope !== expectedScope) issues.push('life-state-scope-mismatch')

      for (const violation of personLifeTimeBoundaryViolations(person, fact.at)) {
        issues.push(violation === 'before-birth' ? 'life-state-before-birth' : 'life-state-after-death')
      }
    }

    if (!refs.events.includes(fact.sourceEvent)) issues.push('life-state-event-missing')
    const eventAt = refs.eventTimes.get(fact.sourceEvent)
    if (!eventAt || !isValidWorldTime(eventAt)) {
      issues.push('life-state-event-time-missing')
    } else if (!isValidWorldTime(fact.at) || compareWorldTime(fact.at, eventAt) !== 0) {
      issues.push('life-state-event-time-mismatch')
    }

    if (!isValidWorldTime(fact.at)) issues.push('life-state-invalid-time')
    if (!fact.dimension.trim()) issues.push('life-state-empty-dimension')
    if (fact.value.kind === 'value') issues.push(...validateValue(fact.value.value))
    if (!validVisibility(fact.visibility, refs.persons)) {
      issues.push('life-state-invalid-visibility')
    }

    if (fact.supersedes.kind !== 'value') continue
    const previous = byId.get(fact.supersedes.value)
    if (!previous) {
      issues.push('life-state-supersedes-missing')
      continue
    }

    if (previous.id === fact.id) issues.push('life-state-supersedes-self')
    if (previous.person !== fact.person) issues.push('life-state-supersedes-person-mismatch')
    if (previous.domain !== fact.domain) issues.push('life-state-supersedes-domain-mismatch')
    if (previous.dimension !== fact.dimension) issues.push('life-state-supersedes-dimension-mismatch')
    if (previous.scope !== fact.scope) issues.push('life-state-supersedes-scope-mismatch')
    if (isValidWorldTime(previous.at) && isValidWorldTime(fact.at)
      && compareWorldTime(fact.at, previous.at) <= 0) {
      issues.push('life-state-supersedes-time-not-later')
    }
    if (replaced.has(previous.id)) issues.push('life-state-supersedes-already-replaced')
    replaced.add(previous.id)
  }

  return issues
}

/** Appends one immutable state fact; failed appends return the original collection. */
export function appendLifeStateFact(
  facts: readonly LifeStateFact[],
  fact: LifeStateFact,
  refs: LifeStateReferences,
): { readonly facts: readonly LifeStateFact[]; readonly issues: readonly LifeStateIssue[] } {
  const issues = [...new Set([
    ...validateLifeStateFacts(facts, refs),
    ...validateLifeStateFacts([...facts, fact], refs),
  ])]

  return issues.length > 0
    ? { facts, issues }
    : { facts: [...facts, fact], issues: [] }
}

/** Projects the unsuperseded fact for each validated person/domain/dimension/scope chain. */
export function currentLifeStateFacts(facts: readonly LifeStateFact[]): readonly LifeStateFact[] {
  const superseded = new Set(
    facts.flatMap(fact => fact.supersedes.kind === 'value' ? [fact.supersedes.value] : []),
  )
  return facts.filter(fact => !superseded.has(fact.id))
}
