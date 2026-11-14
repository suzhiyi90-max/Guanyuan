import { field } from './index'
import { deriveAge } from './life/age'
import type { CalendarAdapter } from './life/age'

let passed = 0
let failed = 0
function check(name: string, condition: boolean): void {
  if (condition) passed += 1
  else { failed += 1; console.error(`FAIL ${name}`) }
}

const calendar: CalendarAdapter = {
  id: 'test-calendar-30-day-month',
  toCalendarDate: time => ({
    yearIndex: Math.floor((time.day - 1) / 360) + 1,
    month: Math.floor(((time.day - 1) % 360) / 30) + 1,
    day: ((time.day - 1) % 30) + 1,
  }),
  isValidCalendarDate: date => Number.isInteger(date.yearIndex)
    && Number.isInteger(date.month) && date.month >= 1 && date.month <= 12
    && Number.isInteger(date.day) && date.day >= 1 && date.day <= 30,
  hasReachedAnniversary: (birth, current) =>
    current.month > birth.month || (current.month === birth.month && current.day >= birth.day),
}

const beforeBirthday = deriveAge(
  field.value({ day: 31, period: '晨' }), { day: 390, period: '夜' }, calendar,
)
const onBirthday = deriveAge(
  field.value({ day: 31, period: '晨' }), { day: 391, period: '晨' }, calendar,
)
const afterBirthday = deriveAge(
  field.value({ day: 31, period: '晨' }), { day: 420, period: '晨' }, calendar,
)
check('age before anniversary remains at prior completed year',
  beforeBirthday.kind === 'value' && beforeBirthday.years === 0)
check('age increments on calendar anniversary',
  onBirthday.kind === 'value' && onBirthday.years === 1)
check('age remains stable after anniversary',
  afterBirthday.kind === 'value' && afterBirthday.years === 1)
check('unknown birth remains unknown age',
  deriveAge(field.unknown, { day: 10, period: '晨' }, calendar).kind === 'unknown')
check('not-generated birth remains not-generated age',
  deriveAge(field.notGenerated, { day: 10, period: '晨' }, calendar).kind === 'not-generated')
check('not-applicable birth remains n/a age',
  deriveAge(field.notApplicable, { day: 10, period: '晨' }, calendar).kind === 'n/a')
check('future birth is rejected',
  deriveAge(field.value({ day: 11, period: '晨' }), { day: 10, period: '夜' }, calendar).kind === 'invalid')
check('invalid adapter date is rejected',
  deriveAge(field.value({ day: 1, period: '晨' }), { day: 2, period: '晨' }, {
    ...calendar, isValidCalendarDate: () => false,
  }).kind === 'invalid')
check('adapter identity is required',
  deriveAge(field.value({ day: 1, period: '晨' }), { day: 2, period: '晨' }, {
    ...calendar, id: '  ',
  }).kind === 'invalid')
check('invalid world time is rejected',
  deriveAge(field.value({ day: 1, period: '晨' }), { day: 0, period: '晨' }, calendar).kind === 'invalid')

if (failed > 0) throw new Error(`Age contract tests failed: ${failed}/${passed + failed}`)
console.log(`Age contract tests: ${passed}/${passed + failed} passed`)
