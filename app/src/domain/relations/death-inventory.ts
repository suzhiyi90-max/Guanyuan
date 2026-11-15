import type {
  EventId, MembershipDeathInventoryEntryId, MembershipDeathInventoryId,
  MembershipId, PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Membership } from './model'
import {
  validateMembershipDeathContinuity,
  validateMembershipDeathHandoffs,
  type MembershipDeathHandoff,
  type MembershipDeathReferences,
} from './death-handoff'

export type MembershipDeathInventoryStatus = 'open' | 'challenged' | 'complete'
export type MembershipDeathMembershipDisposition =
  | 'ended-before-death'
  | 'closed-by-death'
  | 'pending'

export interface MembershipDeathInventoryEntry {
  readonly id: MembershipDeathInventoryEntryId
  readonly membership: MembershipId
  readonly disposition: MembershipDeathMembershipDisposition
}

export interface MembershipDeathInventory {
  readonly id: MembershipDeathInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  readonly status: MembershipDeathInventoryStatus
  readonly memberships: readonly MembershipDeathInventoryEntry[]
}

export type MembershipDeathInventoryIssue = string

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every(id => right.includes(id))
}

function membershipDisposition(
  membership: Membership,
  deathAt: WorldTime,
  refs: MembershipDeathReferences,
): MembershipDeathMembershipDisposition {
  const startAt = refs.eventTimes.get(membership.validFrom)
  if (!startAt || !isValidWorldTime(startAt)
    || compareWorldTime(startAt, deathAt) >= 0
    || membership.validTo === 'open') return 'pending'
  const endAt = refs.eventTimes.get(membership.validTo)
  if (!endAt || !isValidWorldTime(endAt)
    || compareWorldTime(endAt, startAt) <= 0
    || compareWorldTime(endAt, deathAt) > 0) return 'pending'
  if (compareWorldTime(endAt, deathAt) < 0) return 'ended-before-death'
  return membership.validTo === deathEventFor(deathAt, membership, refs)
    ? 'closed-by-death'
    : 'pending'
}

function deathEventFor(
  deathAt: WorldTime,
  membership: Membership,
  refs: MembershipDeathReferences,
): EventId | undefined {
  const endAt = membership.validTo === 'open' ? undefined : refs.eventTimes.get(membership.validTo)
  if (!endAt || compareWorldTime(endAt, deathAt) !== 0) return undefined
  return membership.validTo
}

/**
 * Proves coverage of the supplied person-bound Membership collection. A complete
 * inventory is a caller assertion over that supplied collection, not proof that
 * no unregistered membership exists elsewhere in the world.
 */
export function validateMembershipDeathInventory(
  inventory: MembershipDeathInventory,
  memberships: readonly Membership[],
  handoffs: readonly MembershipDeathHandoff[],
  persons: readonly Person[],
  refs: MembershipDeathReferences,
): MembershipDeathInventoryIssue[] {
  const issues: MembershipDeathInventoryIssue[] = []
  const deceasedMatches = persons.filter(person => person.id === inventory.deceased)
  if (deceasedMatches.length !== 1) {
    issues.push(deceasedMatches.length === 0
      ? 'membership-death-inventory-person-missing'
      : 'membership-death-inventory-person-ambiguous')
    return [...new Set(issues)]
  }
  const deceased = deceasedMatches[0]
  if (deceased.lifeState !== 'dead') {
    issues.push('membership-death-inventory-person-alive')
    return [...new Set(issues)]
  }
  if (deceased.death.kind !== 'value') {
    issues.push('membership-death-inventory-death-record-missing')
    return [...new Set(issues)]
  }
  const death = deceased.death.value
  if (!isValidWorldTime(death.at)) {
    issues.push('membership-death-inventory-death-time-invalid')
    return [...new Set(issues)]
  }
  if (death.causeEvent !== inventory.deathEvent) {
    issues.push('membership-death-inventory-death-event-mismatch')
  }
  if (!refs.events.includes(inventory.deathEvent)) {
    issues.push('membership-death-inventory-death-event-missing')
  }
  const deathEventAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathEventAt || !isValidWorldTime(deathEventAt)) {
    issues.push('membership-death-inventory-death-event-time-missing')
  } else if (compareWorldTime(deathEventAt, death.at) !== 0) {
    issues.push('membership-death-inventory-death-event-time-mismatch')
  }
  if (!refs.events.includes(inventory.inventoryEvent)) {
    issues.push('membership-death-inventory-review-event-missing')
  }
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !isValidWorldTime(inventoryAt)) {
    issues.push('membership-death-inventory-review-event-time-missing')
  } else if (compareWorldTime(inventoryAt, death.at) < 0) {
    issues.push('membership-death-inventory-before-death')
  }
  if (!['open', 'challenged', 'complete'].includes(inventory.status)) {
    issues.push('membership-death-inventory-status-invalid')
  }

  const personMemberships = memberships.filter(item => item.person === inventory.deceased)
  const personHandoffs = handoffs.filter(item => item.deceased === inventory.deceased)
  if (!unique(memberships.map(item => item.id))) {
    issues.push('membership-death-inventory-input-membership-duplicate-id')
  }
  if (!unique(inventory.memberships.map(item => item.id))) {
    issues.push('membership-death-inventory-entry-duplicate-id')
  }
  if (!unique(inventory.memberships.map(item => item.membership))) {
    issues.push('membership-death-inventory-membership-reference-duplicate')
  }

  issues.push(...validateMembershipDeathContinuity(personMemberships, persons, refs))
  issues.push(...validateMembershipDeathHandoffs(memberships, personHandoffs, persons, refs))

  const byId = new Map<string, Membership[]>()
  for (const membership of memberships) {
    byId.set(membership.id, [...(byId.get(membership.id) ?? []), membership])
  }
  for (const entry of inventory.memberships) {
    const matches = byId.get(entry.membership) ?? []
    if (matches.length !== 1) {
      issues.push('membership-death-inventory-membership-reference-missing')
      continue
    }
    const membership = matches[0]
    if (membership.person !== inventory.deceased) {
      issues.push('membership-death-inventory-membership-person-mismatch')
      continue
    }
    const expected = membershipDisposition(membership, death.at, refs)
    if (entry.disposition !== expected) {
      issues.push('membership-death-inventory-disposition-mismatch')
    }
  }

  const handoffSourceIds = personHandoffs.map(item => item.sourceMembership)
  for (const sourceId of handoffSourceIds) {
    const entry = inventory.memberships.find(item => item.membership === sourceId)
    if (!entry) issues.push('membership-death-inventory-handoff-source-not-in-inventory')
    else if (entry.disposition !== 'closed-by-death') {
      issues.push('membership-death-inventory-handoff-source-not-death-closed')
    }
  }

  const entryIds = inventory.memberships.map(item => item.membership)
  if (!sameIdSet(entryIds, personMemberships.map(item => item.id))
    && inventory.status === 'complete') {
    issues.push('membership-death-inventory-coverage-missing')
  }
  return [...new Set(issues)]
}

/**
 * Readiness requires a complete, issue-free inventory and an explicit disposition
 * for every supplied membership. Handoffs are separately validated evidence;
 * they never imply transfer of the deceased member's role or obligations.
 */
export function isMembershipDeathInventoryReadyForSettlement(
  inventory: MembershipDeathInventory,
  validationIssues: readonly MembershipDeathInventoryIssue[],
): boolean {
  return inventory.status === 'complete'
    && validationIssues.length === 0
    && inventory.memberships.every(entry =>
      entry.disposition === 'ended-before-death' || entry.disposition === 'closed-by-death')
}
