import type {
  EventId, PersonId, RelationDeathInventoryEntryId, RelationDeathInventoryId, RelationId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Relation } from './model'
import {
  validateRelationDeathContinuity,
  type RelationDeathDisposition,
  type RelationDeathReferences,
} from './death-continuity'

export type RelationDeathInventoryStatus = 'open' | 'challenged' | 'complete'
export type RelationDeathInventoryOutcome = 'ended-before-death' | 'preserved' | 'ended' | 'pending'

export interface RelationDeathInventoryEntry {
  readonly id: RelationDeathInventoryEntryId
  readonly relation: RelationId
  readonly outcome: RelationDeathInventoryOutcome
}

export interface RelationDeathInventory {
  readonly id: RelationDeathInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  readonly status: RelationDeathInventoryStatus
  readonly relations: readonly RelationDeathInventoryEntry[]
}

export type RelationDeathInventoryIssue = string

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && unique(left)
    && unique(right)
    && left.every(id => right.includes(id))
}

function relationAtDeath(
  relation: Relation,
  deathAt: WorldTime,
  refs: RelationDeathReferences,
): RelationDeathInventoryOutcome {
  const startAt = refs.eventTimes.get(relation.lifecycle.validFrom)
  if (!startAt || !isValidWorldTime(startAt) || compareWorldTime(startAt, deathAt) >= 0) {
    return 'pending'
  }
  if (relation.lifecycle.validTo === 'open') return 'pending'
  const endAt = refs.eventTimes.get(relation.lifecycle.validTo)
  if (!endAt || !isValidWorldTime(endAt) || compareWorldTime(endAt, startAt) <= 0) {
    return 'pending'
  }
  if (compareWorldTime(endAt, deathAt) < 0) return 'ended-before-death'
  return 'pending'
}

/**
 * Proves coverage of all supplied relation records touching the deceased.
 * A complete inventory is a caller assertion over that supplied collection,
 * not proof that no unregistered relation exists elsewhere in the world.
 */
export function validateRelationDeathInventory(
  inventory: RelationDeathInventory,
  relations: readonly Relation[],
  dispositions: readonly RelationDeathDisposition[],
  persons: readonly Person[],
  refs: RelationDeathReferences,
): RelationDeathInventoryIssue[] {
  const issues: string[] = []
  const deceasedMatches = persons.filter(person => person.id === inventory.deceased)
  if (deceasedMatches.length !== 1) {
    issues.push(deceasedMatches.length === 0
      ? 'relation-death-inventory-person-missing'
      : 'relation-death-inventory-person-ambiguous')
    return [...new Set(issues)]
  }
  const deceased = deceasedMatches[0]
  if (deceased.lifeState !== 'dead') {
    issues.push('relation-death-inventory-person-alive')
    return [...new Set(issues)]
  }
  if (deceased.death.kind !== 'value') {
    issues.push('relation-death-inventory-death-record-missing')
    return [...new Set(issues)]
  }
  const death = deceased.death.value
  if (!isValidWorldTime(death.at)) {
    issues.push('relation-death-inventory-death-time-invalid')
    return [...new Set(issues)]
  }
  if (death.causeEvent !== inventory.deathEvent) {
    issues.push('relation-death-inventory-death-event-mismatch')
  }
  if (!refs.events.includes(inventory.deathEvent)) {
    issues.push('relation-death-inventory-death-event-missing')
  }
  const deathEventAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathEventAt || !isValidWorldTime(deathEventAt)) {
    issues.push('relation-death-inventory-death-event-time-missing')
  } else if (compareWorldTime(deathEventAt, death.at) !== 0) {
    issues.push('relation-death-inventory-death-event-time-mismatch')
  }
  if (!refs.events.includes(inventory.inventoryEvent)) {
    issues.push('relation-death-inventory-review-event-missing')
  }
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !isValidWorldTime(inventoryAt)) {
    issues.push('relation-death-inventory-review-event-time-missing')
  } else if (compareWorldTime(inventoryAt, death.at) < 0) {
    issues.push('relation-death-inventory-before-death')
  }
  if (!['open', 'challenged', 'complete'].includes(inventory.status)) {
    issues.push('relation-death-inventory-status-invalid')
  }

  const personRelations = relations.filter(item =>
    item.from === inventory.deceased || item.to === inventory.deceased)
  if (!unique(relations.map(item => item.id))) {
    issues.push('relation-death-inventory-input-relation-duplicate-id')
  }
  if (!unique(inventory.relations.map(item => item.id))) {
    issues.push('relation-death-inventory-entry-duplicate-id')
  }
  if (!unique(inventory.relations.map(item => item.relation))) {
    issues.push('relation-death-inventory-relation-reference-duplicate')
  }

  const relationById = new Map<string, Relation[]>()
  for (const relation of relations) {
    relationById.set(relation.id, [...(relationById.get(relation.id) ?? []), relation])
  }
  const scopeIds = new Set(personRelations.map(item => item.id))
  const dispositionsForScope = dispositions.filter(item => scopeIds.has(item.relation))
  issues.push(...validateRelationDeathContinuity(personRelations, dispositionsForScope, persons, refs))

  for (const entry of inventory.relations) {
    const matches = relationById.get(entry.relation) ?? []
    if (matches.length !== 1) {
      issues.push('relation-death-inventory-relation-reference-missing')
      continue
    }
    const relation = matches[0]
    if (relation.from !== inventory.deceased && relation.to !== inventory.deceased) {
      issues.push('relation-death-inventory-relation-endpoint-mismatch')
      continue
    }
    const expected = relationAtDeath(relation, death.at, refs)
    if (entry.outcome === 'ended-before-death') {
      if (expected !== 'ended-before-death') {
        issues.push('relation-death-inventory-outcome-mismatch')
      }
    } else if (entry.outcome === 'preserved' || entry.outcome === 'ended') {
      const matching = dispositionsForScope.filter(item =>
        item.relation === relation.id && item.deceased === inventory.deceased)
      if (matching.length !== 1 || matching[0].deathEvent !== inventory.deathEvent
        || matching[0].outcome !== entry.outcome || expected !== 'pending') {
        issues.push('relation-death-inventory-disposition-mismatch')
      }
    } else if (entry.outcome === 'pending') {
      issues.push('relation-death-inventory-item-pending')
    } else {
      issues.push('relation-death-inventory-outcome-invalid')
    }
  }

  const expectedRelationIds = personRelations.map(item => item.id)
  if (inventory.status === 'complete'
    && !sameIdSet(inventory.relations.map(item => item.relation), expectedRelationIds)) {
    issues.push('relation-death-inventory-coverage-mismatch')
  }
  return [...new Set(issues)]
}

/** Ready only when the complete declared scope is issue-free and every item has a final outcome. */
export function isRelationDeathInventoryReadyForSettlement(
  inventory: RelationDeathInventory,
  validationIssues: readonly RelationDeathInventoryIssue[],
): boolean {
  return inventory.status === 'complete'
    && validationIssues.length === 0
    && inventory.relations.every(entry =>
      entry.outcome === 'ended-before-death'
      || entry.outcome === 'preserved'
      || entry.outcome === 'ended')
}
