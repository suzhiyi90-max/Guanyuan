import type { Field } from '../shared/field'
import { compareWorldTime, isValidWorldTime } from '../shared/world-time'
import type { WorldTime } from '../shared/world-time'

/**
 * Calendar dates are supplied by an era/calendar adapter. yearIndex must be
 * monotonic within that adapter; month/day retain the calendar's own units.
 */
export interface CalendarDate {
  readonly yearIndex: number
  readonly month: number
  readonly day: number
}

export interface CalendarAdapter {
  readonly id: string
  toCalendarDate(time: WorldTime): CalendarDate | undefined
  isValidCalendarDate(date: CalendarDate): boolean
  /** Handles calendar-specific leap days, intercalary months and year boundaries. */
  hasReachedAnniversary(birth: CalendarDate, current: CalendarDate): boolean
}

export type DerivedAge =
  | { readonly kind: 'value'; readonly years: number; readonly calendar: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'not-generated' }
  | { readonly kind: 'n/a' }
  | { readonly kind: 'invalid'; readonly issue: AgeIssue }

export type AgeIssue =
  | 'age-invalid-world-time'
  | 'age-birth-in-future'
  | 'age-calendar-adapter-invalid'
  | 'age-calendar-date-invalid'
  | 'age-calendar-year-reversed'
  | 'age-negative-result'

/** Age is a projection, never persisted as an independently mutable Person field. */
export function deriveAge(
  birth: Field<WorldTime>,
  now: WorldTime,
  calendar: CalendarAdapter,
): DerivedAge {
  if (birth.kind !== 'value') return { kind: birth.kind }
  if (!isValidWorldTime(now) || !isValidWorldTime(birth.value)) {
    return { kind: 'invalid', issue: 'age-invalid-world-time' }
  }
  if (compareWorldTime(now, birth.value) < 0) {
    return { kind: 'invalid', issue: 'age-birth-in-future' }
  }
  if (!calendar.id.trim()
    || typeof calendar.toCalendarDate !== 'function'
    || typeof calendar.isValidCalendarDate !== 'function'
    || typeof calendar.hasReachedAnniversary !== 'function') {
    return { kind: 'invalid', issue: 'age-calendar-adapter-invalid' }
  }

  const birthDate = calendar.toCalendarDate(birth.value)
  const currentDate = calendar.toCalendarDate(now)
  if (!birthDate || !currentDate
    || !calendar.isValidCalendarDate(birthDate)
    || !calendar.isValidCalendarDate(currentDate)) {
    return { kind: 'invalid', issue: 'age-calendar-date-invalid' }
  }
  if (!Number.isInteger(birthDate.yearIndex) || !Number.isInteger(currentDate.yearIndex)
    || currentDate.yearIndex < birthDate.yearIndex) {
    return { kind: 'invalid', issue: 'age-calendar-year-reversed' }
  }

  const elapsedYears = currentDate.yearIndex - birthDate.yearIndex
  const years = elapsedYears === 0
    ? 0
    : elapsedYears - (calendar.hasReachedAnniversary(birthDate, currentDate) ? 0 : 1)
  if (!Number.isInteger(years) || years < 0) {
    return { kind: 'invalid', issue: 'age-negative-result' }
  }
  return { kind: 'value', years, calendar: calendar.id }
}
