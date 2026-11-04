import { Platform } from 'react-native'

export const colors = {
  paper: '#eee5d5', paperBright: '#faf5e9', paperDeep: '#dfd1bb',
  ink: '#292720', inkSoft: '#514b40', muted: '#7c7263', faint: '#a89b87',
  line: '#c9baa1', lineStrong: '#aa987c', cinnabar: '#963f32', cinnabarDark: '#713028',
  river: '#506a6d', riverDark: '#2f464b', night: '#202b30', gold: '#a57b43',
  white: '#fffdf7', success: '#53624c', shadow: '#241d14',
} as const

export const fonts = {
  serif: Platform.select({ ios: 'Songti SC', android: 'serif', default: 'serif' }),
  sans: Platform.select({ ios: 'PingFang SC', android: 'sans-serif', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 3, md: 7, lg: 12, pill: 999 } as const
export const paperShadow = {
  shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 }, elevation: 3,
} as const
