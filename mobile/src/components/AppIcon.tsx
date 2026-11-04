import Svg, { Circle, Path } from 'react-native-svg'
import { colors } from '../ui/theme'

const paths = {
  today: 'M3 21h18v-2H3v2Zm2-4h14V9l-7-5-7 5v8Zm4 0V9h6v8H9Z',
  cases: 'M6 2h9l5 5v15H6V2Zm8 2v4h4l-4-4ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z',
  affairs: 'M4 3h16v18H4V3Zm3 4v2h10V7H7Zm0 4v2h10v-2H7Zm0 4v2h7v-2H7Z',
  people: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2c0-3 4-5 6-5s6 2 6 5v2H2Zm13 0v-2c0-1.7-.8-3.1-2-4.1 1-.5 2.1-.9 3-.9 2 0 6 2 6 5v2h-6Z',
  ledger: 'M5 2h14v20H5V2Zm3 4v2h8V6H8Zm0 4v2h3v-3H8Zm5 0v3h3v-3h-3Zm-5 5v3h3v-3H8Zm5 0v3h3v-3h-3Z',
  life: 'M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a3 3 0 0 1 0 6h-2v-2h2a1 1 0 0 0 0-2h-2V9ZM3 21h15v2H3v-2Z',
  search: 'M9.5 3a6.5 6.5 0 1 0 4.03 11.63L19 20.08 20.5 18.5l-5.46-4.93A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  back: 'm12 4-8 8 8 8 1.4-1.4L7.8 13H20v-2H7.8l5.6-5.6L12 4Z',
  next: 'm10 5 7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6L10 5Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6 .2L5 6.3v11.5l4-1.3V5.2Zm2 0v11.3l4 1.3V6.5l-4-1.3Z',
  waves: 'M2 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2v2c-2.5 0-2.5 2-5 2s-2.5-2-5-2-2.5 2-5 2-2.5-2-5-2v-2Zm0-6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2v2c-2.5 0-2.5 2-5 2s-2.5-2-5-2-2.5 2-5 2-2.5-2-5-2V9Z',
  stamp: 'M8 3h8v7l3 4v3H5v-3l3-4V3Zm-3 16h14v2H5v-2Z',
  gift: 'M3 9h18v12H3V9Zm2-7h5v5H7a2.5 2.5 0 0 1-2-5Zm9 0h5a2.5 2.5 0 0 1-2 5h-3V2ZM2 5h3v2H2V5Z',
  check: 'm9 16.2-4.2-4.2L3.4 13.4 9 19 21 7l-1.4-1.4L9 16.2Z',
  book: 'M4 3h7v18H6a2 2 0 0 1-2-2V3Zm9 0h7v16a2 2 0 0 1-2 2h-5V3Z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4.6l3.8 2.2-1 1.7-4.8-2.8V7h2Z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6Z',
  warning: 'M12 2 1 21h22L12 2Zm-1 6h2v6h-2V8Zm0 8h2v2h-2v-2Z',
  door: 'M4 2h12v20H4V2Zm3 10h2v2H7v-2Zm9-4h5v14h-2V10h-3V8Z',
  home: 'm12 3 10 9h-3v9h-5v-6h-4v6H5v-9H2l10-9Z',
  refresh: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.3L13 11h7V4l-2.3 2.3Z',
} as const

export type AppIconName = keyof typeof paths

export function AppIcon({ name, size = 20, color = colors.inkSoft }: { name: AppIconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} accessibilityElementsHidden importantForAccessibility="no"><Path d={paths[name]} /></Svg>
}

export function BrandMark({ size = 40, color = colors.cinnabar }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no">
    <Path d="M4 4h32v32H4z" fill="none" stroke={color} strokeWidth={2} />
    <Path d="M9 27c5-9 9-13 13-16 3 4 6 8 9 13M8 30c6-3 11-3 16 0s7 2 9 0" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={27} cy={12} r={3} fill={color} />
  </Svg>
}
