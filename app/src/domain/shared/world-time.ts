export type Period = '晨' | '午' | '暮' | '夜'
export type WorldDay = number

export interface WorldTime {
  readonly day: number
  readonly period: Period
}

const periodOrder: Record<Period, number> = {
  晨: 0,
  午: 1,
  暮: 2,
  夜: 3,
}

export function compareWorldTime(left: WorldTime, right: WorldTime): number {
  if (!isValidWorldTime(left) || !isValidWorldTime(right)) {
    throw new Error('Cannot compare invalid world times')
  }
  if (left.day !== right.day) return left.day < right.day ? -1 : 1
  const leftPeriod = periodOrder[left.period]
  const rightPeriod = periodOrder[right.period]
  return leftPeriod === rightPeriod ? 0 : leftPeriod < rightPeriod ? -1 : 1
}

export function isValidWorldTime(value: WorldTime): boolean {
  return Number.isInteger(value.day)
    && value.day >= 1
    && typeof value.period === 'string'
    && Object.hasOwn(periodOrder, value.period)
}
