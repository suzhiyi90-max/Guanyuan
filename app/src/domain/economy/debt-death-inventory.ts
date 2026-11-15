import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type {
  DebtDeathInventoryEntryId,
  DebtDeathInventoryId,
  DebtId,
  EventId,
  PersonId,
} from '../shared/ids'
import type { WorldTime } from '../shared/world-time'
import type { Person } from '../person/model'
import type { Debt, DebtPartySuccession, EconomyIssue } from './model'
import { validateDebtPartySuccessions } from './validation'

export type DebtDeathRole = 'creditor' | 'debtor'
export type DebtDeathDisposition =
  | 'pending'
  | 'disputed'
  | 'succession-recorded'
  | 'settled-before-death'
  | 'settled-after-death'

export interface DebtDeathInventoryEntry {
  readonly id: DebtDeathInventoryEntryId
  readonly debt: DebtId
  readonly role: DebtDeathRole
  readonly disposition: DebtDeathDisposition
  /** Exact succession records reviewed for this debt-party position. */
  readonly successions: readonly DebtPartySuccession['id'][]
}

export interface DebtDeathInventory {
  readonly id: DebtDeathInventoryId
  readonly deceased: PersonId
  readonly deathEvent: EventId
  readonly inventoryEvent: EventId
  /** complete is a scope attestation, not proof that undiscovered debts do not exist. */
  readonly status: 'open' | 'complete' | 'challenged'
  readonly entries: readonly DebtDeathInventoryEntry[]
}

export type DebtDeathInventoryIssue =
  | 'debt-death-inventory-deceased-missing'
  | 'debt-death-inventory-deceased-ambiguous'
  | 'debt-death-inventory-deceased-not-dead'
  | 'debt-death-inventory-death-record-missing'
  | 'debt-death-inventory-death-event-mismatch'
  | 'debt-death-inventory-death-event-missing'
  | 'debt-death-inventory-death-time-mismatch'
  | 'debt-death-inventory-death-time-invalid'
  | 'debt-death-inventory-invalid-status'
  | 'debt-death-inventory-event-missing'
  | 'debt-death-inventory-event-time-missing'
  | 'debt-death-inventory-before-death'
  | 'debt-death-inventory-duplicate-entry-id'
  | 'debt-death-inventory-duplicate-position'
  | 'debt-death-inventory-debt-duplicate-id'
  | 'debt-death-inventory-debt-missing'
  | 'debt-death-inventory-debt-ambiguous'
  | 'debt-death-inventory-party-role-mismatch'
  | 'debt-death-inventory-invalid-role'
  | 'debt-death-inventory-invalid-disposition'
  | 'debt-death-inventory-succession-reference-missing'
  | 'debt-death-inventory-succession-reference-duplicate'
  | 'debt-death-inventory-succession-not-matching'
  | 'debt-death-inventory-succession-unaccounted'
  | 'debt-death-inventory-succession-invalid'
  | 'debt-death-inventory-succession-share-incomplete'
  | 'debt-death-inventory-succession-share-overallocated'
  | 'debt-death-inventory-settlement-reference-missing'
  | 'debt-death-inventory-settlement-time-missing'
  | 'debt-death-inventory-settlement-after-inventory'
  | 'debt-death-inventory-settlement-disposition-mismatch'
  | 'debt-death-inventory-disputed-status-mismatch'
  | 'debt-death-inventory-pending-status-mismatch'
  | 'debt-death-inventory-complete-coverage-missing'

export interface DebtDeathInventoryReferences {
  readonly persons: readonly Person[]
  readonly events: readonly EventId[]
  readonly eventTimes: ReadonlyMap<EventId, WorldTime>
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function exactShareIsOne(successions: readonly DebtPartySuccession[]): boolean {
  let numerator = 0n
  let denominator = 1n
  for (const succession of successions) {
    if (!Number.isSafeInteger(succession.shareNumerator)
      || !Number.isSafeInteger(succession.shareDenominator)
      || succession.shareNumerator <= 0 || succession.shareDenominator <= 0) return false
    const nextNumerator = numerator * BigInt(succession.shareDenominator)
      + BigInt(succession.shareNumerator) * denominator
    const nextDenominator = denominator * BigInt(succession.shareDenominator)
    numerator = nextNumerator
    denominator = nextDenominator
    if (numerator > denominator) return false
  }
  return numerator === denominator
}

function matchingParty(debt: Debt, deceased: PersonId, role: DebtDeathRole): boolean {
  return (role === 'creditor' ? debt.creditor : debt.debtor) === deceased
}

function positionKey(debt: DebtId, role: DebtDeathRole): string {
  return `${debt}:${role}`
}

/**
 * Audits a deceased person's creditor/debtor positions against the supplied debt universe.
 * A complete inventory proves coverage only for that supplied universe; it cannot prove that
 * no unrecorded debt exists elsewhere. The function is read-only and never rewrites Debt.
 */
export function validateDebtDeathInventory(
  inventory: DebtDeathInventory,
  debts: readonly Debt[],
  successions: readonly DebtPartySuccession[],
  refs: DebtDeathInventoryReferences,
): DebtDeathInventoryIssue[] {
  const issues: DebtDeathInventoryIssue[] = []
  const deceasedRecords = refs.persons.filter(person => person.id === inventory.deceased)
  const deceased = deceasedRecords.length === 1 ? deceasedRecords[0] : undefined
  if (deceasedRecords.length === 0) issues.push('debt-death-inventory-deceased-missing')
  if (deceasedRecords.length > 1) issues.push('debt-death-inventory-deceased-ambiguous')
  if (deceased && deceased.lifeState !== 'dead') issues.push('debt-death-inventory-deceased-not-dead')
  if (!deceased || deceased.death.kind !== 'value') {
    issues.push('debt-death-inventory-death-record-missing')
    return [...new Set(issues)]
  }
  const death = deceased.death.value
  if (death.causeEvent !== inventory.deathEvent) issues.push('debt-death-inventory-death-event-mismatch')
  if (!isValidWorldTime(death.at)) issues.push('debt-death-inventory-death-time-invalid')
  if (!refs.events.includes(inventory.deathEvent)) issues.push('debt-death-inventory-death-event-missing')
  const deathAt = refs.eventTimes.get(inventory.deathEvent)
  if (!deathAt || !isValidWorldTime(deathAt)) issues.push('debt-death-inventory-death-time-mismatch')
  else if (isValidWorldTime(death.at) && compareWorldTime(deathAt, death.at) !== 0) {
    issues.push('debt-death-inventory-death-time-mismatch')
  }

  if (!['open', 'complete', 'challenged'].includes(inventory.status)) {
    issues.push('debt-death-inventory-invalid-status')
  }
  if (!refs.events.includes(inventory.inventoryEvent)) issues.push('debt-death-inventory-event-missing')
  const inventoryAt = refs.eventTimes.get(inventory.inventoryEvent)
  if (!inventoryAt || !isValidWorldTime(inventoryAt)) {
    issues.push('debt-death-inventory-event-time-missing')
  } else if (isValidWorldTime(death.at) && compareWorldTime(inventoryAt, death.at) < 0) {
    issues.push('debt-death-inventory-before-death')
  }

  if (!unique(inventory.entries.map(entry => entry.id))) {
    issues.push('debt-death-inventory-duplicate-entry-id')
  }
  const keys = inventory.entries.map(entry => positionKey(entry.debt, entry.role))
  if (!unique(keys)) issues.push('debt-death-inventory-duplicate-position')
  if (!unique(debts.map(debt => debt.id))) issues.push('debt-death-inventory-debt-duplicate-id')

  const debtsById = new Map<DebtId, Debt[]>()
  for (const debt of debts) debtsById.set(debt.id, [...(debtsById.get(debt.id) ?? []), debt])
  const successionById = new Map<string, DebtPartySuccession[]>()
  for (const succession of successions) {
    successionById.set(succession.id, [...(successionById.get(succession.id) ?? []), succession])
  }
  const referencedSuccessionIds = new Set<string>()

  for (const entry of inventory.entries) {
    if (entry.role !== 'creditor' && entry.role !== 'debtor') {
      issues.push('debt-death-inventory-invalid-role')
      continue
    }
    if (!['pending', 'disputed', 'succession-recorded', 'settled-before-death', 'settled-after-death']
      .includes(entry.disposition)) {
      issues.push('debt-death-inventory-invalid-disposition')
      continue
    }
    const matchingDebts = debtsById.get(entry.debt) ?? []
    if (matchingDebts.length === 0) {
      issues.push('debt-death-inventory-debt-missing')
      continue
    }
    if (matchingDebts.length !== 1) {
      issues.push('debt-death-inventory-debt-ambiguous')
      continue
    }
    const debt = matchingDebts[0]
    if (!matchingParty(debt, inventory.deceased, entry.role)) {
      issues.push('debt-death-inventory-party-role-mismatch')
      continue
    }

    if (!unique(entry.successions)) issues.push('debt-death-inventory-succession-reference-duplicate')
    const expectedSuccessions = successions.filter(item =>
      item.debt === entry.debt && item.role === entry.role
      && item.deceased === inventory.deceased && item.deathEvent === inventory.deathEvent)
    const expectedIds = expectedSuccessions.map(item => item.id).sort()
    const actualIds = [...entry.successions].sort()
    if (expectedIds.join('|') !== actualIds.join('|')) {
      issues.push('debt-death-inventory-succession-not-matching')
    }
    for (const id of entry.successions) {
      if (referencedSuccessionIds.has(id)) issues.push('debt-death-inventory-succession-reference-duplicate')
      referencedSuccessionIds.add(id)
      const matches = successionById.get(id) ?? []
      if (matches.length !== 1) {
        issues.push('debt-death-inventory-succession-reference-missing')
      } else {
        const succession = matches[0]
        if (succession.debt !== entry.debt || succession.role !== entry.role
          || succession.deceased !== inventory.deceased || succession.deathEvent !== inventory.deathEvent) {
          issues.push('debt-death-inventory-succession-not-matching')
        }
      }
    }

    const partySuccessions = expectedSuccessions
    if (entry.disposition === 'succession-recorded') {
      if (debt.status === 'settled') issues.push('debt-death-inventory-pending-status-mismatch')
      if (!exactShareIsOne(partySuccessions)) {
        const allocated = partySuccessions.reduce((sum, item) =>
          sum + item.shareNumerator / item.shareDenominator, 0)
        issues.push(allocated > 1 ? 'debt-death-inventory-succession-share-overallocated'
          : 'debt-death-inventory-succession-share-incomplete')
      }
    } else if (entry.disposition === 'pending') {
      if (debt.status === 'settled' || debt.status === 'disputed') {
        issues.push('debt-death-inventory-pending-status-mismatch')
      }
    } else if (entry.disposition === 'disputed') {
      if (debt.status !== 'disputed') issues.push('debt-death-inventory-disputed-status-mismatch')
    } else {
      if (debt.status !== 'settled' || partySuccessions.length > 0) {
        issues.push('debt-death-inventory-settlement-disposition-mismatch')
      }
      if (debt.settlements.length === 0) {
        issues.push('debt-death-inventory-settlement-reference-missing')
      }
      let sawAfterDeath = false
      for (const eventId of debt.settlements) {
        if (!refs.events.includes(eventId)) {
          issues.push('debt-death-inventory-settlement-reference-missing')
          continue
        }
        const settledAt = refs.eventTimes.get(eventId)
        if (!settledAt || !isValidWorldTime(settledAt)) {
          issues.push('debt-death-inventory-settlement-time-missing')
          continue
        }
        if (inventoryAt && isValidWorldTime(inventoryAt) && compareWorldTime(settledAt, inventoryAt) > 0) {
          issues.push('debt-death-inventory-settlement-after-inventory')
        }
        if (isValidWorldTime(death.at) && compareWorldTime(settledAt, death.at) > 0) sawAfterDeath = true
      }
      if (entry.disposition === 'settled-before-death' && sawAfterDeath) {
        issues.push('debt-death-inventory-settlement-disposition-mismatch')
      }
      if (entry.disposition === 'settled-after-death' && !sawAfterDeath) {
        issues.push('debt-death-inventory-settlement-disposition-mismatch')
      }
    }
  }

  for (const succession of successions) {
    if (succession.deceased === inventory.deceased && succession.deathEvent === inventory.deathEvent
      && !referencedSuccessionIds.has(succession.id)) {
      issues.push('debt-death-inventory-succession-unaccounted')
    }
  }

  if (inventory.status === 'complete') {
    for (const debt of debts) {
      for (const role of ['creditor', 'debtor'] as const) {
        if (matchingParty(debt, inventory.deceased, role)
          && !keys.includes(positionKey(debt.id, role))) {
          issues.push('debt-death-inventory-complete-coverage-missing')
        }
      }
    }
  }

  const successionIssues: EconomyIssue[] = validateDebtPartySuccessions(
    debts, successions.filter(item => item.deceased === inventory.deceased
      && item.deathEvent === inventory.deathEvent),
    { ...refs, persons: refs.persons },
  )
  if (successionIssues.length > 0) issues.push('debt-death-inventory-succession-invalid')

  return [...new Set(issues)]
}

/**
 * Readiness means the supplied debt universe is completely inventoried and every
 * creditor/debtor position has explicit full succession or evidenced settlement.
 * It does not mean a debt was paid, nor that undiscovered debts do not exist.
 */
export function isDebtDeathInventoryReadyForSettlement(
  inventory: DebtDeathInventory,
  validationIssues: readonly DebtDeathInventoryIssue[],
): boolean {
  return inventory.status === 'complete'
    && validationIssues.length === 0
    && inventory.entries.every(entry =>
      entry.disposition === 'succession-recorded'
      || entry.disposition === 'settled-before-death'
      || entry.disposition === 'settled-after-death')
}
