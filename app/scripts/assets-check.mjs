import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.GUANYUAN_URL ?? 'http://127.0.0.1:5199'
const OUT = `${process.env.TEMP}/guanyuan-assets`
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const settle = (ms = 500) => page.waitForTimeout(ms)
const nav = async label => page.locator(`.main-nav button:has-text("${label}")`).first().click()

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(500)
await page.locator('.goal-card').first().click()
await page.locator('button:has-text("以此立志，进入第一日")').click()
await settle(800)

await page.locator('.scene-switcher button:has-text("夜书房")').click()
await settle(700)
await page.screenshot({ path: `${OUT}/study.png` })

await page.locator('.scene-switcher button:has-text("县衙")').click()
await settle(400)
await page.locator('.hotspot-invitation').click()
await settle(700)
await page.screenshot({ path: `${OUT}/banquet.png` })
await page.locator('.banquet-close').click()
await settle(300)

await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('guanyuan.save.v1'))
  raw.day = 3
  raw.periodIndex = 1
  raw.pendingEvent = null
  raw.plan = { leader: 'foreman', leaderName: '赵九河', material: 8, labor: 30, supervisor: '县丞会勘 · 工头监作', detail: '赵九河主办', day: 1, period: '晨' }
  localStorage.setItem('guanyuan.save.v1', JSON.stringify(raw))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(700)
await nav('今日')
await settle(400)
await page.locator('.scene-switcher button:has-text("东堤")').click()
await settle(800)
await page.screenshot({ path: `${OUT}/river-work.png` })

const ok = await page.evaluate(() => Array.from(document.images).map(i => `${i.currentSrc.split('/').pop()}:${i.naturalWidth}`))
console.log(ok.join(' '))
await browser.close()
