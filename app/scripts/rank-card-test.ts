import { rankCardFrameOf, rankCardFrames, rankCardSlotMap } from '../src/paperArt'

const cases = [
  { role: '县丞', rank: '正八品 · 管河佐贰', expected: 'official-7-9' },
  { role: '官员', rank: '正五品', expected: 'official-4-6' },
  { role: '官员', rank: '正一品', expected: 'official-1-3' },
  { role: '地方士绅', rank: '绅衿 · 东堤董事', expected: 'gentry' },
  { role: '粮商', rank: '铺户 · 裕丰号掌柜', expected: 'merchant' },
  { role: '河工幕友', rank: '无品 · 河厅差委', expected: 'advisor' },
  { role: '堡夫头', rank: '无品 · 东堤工头', expected: 'runner' },
] as const

for (const item of cases) {
  const actual = rankCardFrameOf(item.role, item.rank)?.id ?? null
  if (actual !== item.expected) {
    throw new Error(`rank-card mapping mismatch for ${item.role} / ${item.rank}: expected ${item.expected}, got ${actual}`)
  }
}

if (rankCardFrameOf('未知身份', '无品') !== null) {
  throw new Error('unknown identity must not be forced into a rank-card family')
}
if (Object.keys(rankCardFrames).length !== 7) {
  throw new Error(`expected 7 rank-card frame families, got ${Object.keys(rankCardFrames).length}`)
}

for (const slot of ['portrait', 'identity', 'rank', 'nobility', 'honor', 'marks'] as const) {
  const value = rankCardSlotMap[slot]
  if (value.top < 0 || value.height <= 0 || value.top + value.height > 100) {
    throw new Error(`rank-card slot out of paper-center bounds: ${slot}`)
  }
}

console.log(`rank-card mapping ${cases.length + 8}/${cases.length + 8} passed`)
