import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 观远 · 美术资产一键处理（FE-052）
 *
 *   npm run art                 处理新增 PNG（manifest 中未记录的）
 *   npm run art -- --all        强制全部重处理
 *   npm run art -- --check      只报告，不写文件
 *   npm run art -- --corners=4  四角都清（默认只清左上 / 右下两处角标）
 *   npm run art -- --frame      只处理 card-frame-*.png，走「卡框安全模式」
 *
 * 默认模式：只清理生成角标，用邻域同尺寸块覆盖 + 内侧 10px 羽化，不改动画面主体。
 * 卡框安全模式（--frame）：卡框类图有完整绫边 / 45° 斜接 / 内侧细墨线，整块重建会毁掉
 * 这些结构，故改为「只抹明显亮于局部背景的水印像素，逐行水平插值填充」——所有暗结构
 * 原样保留，不做任何补画。该模式只碰 card-frame-*.png，避免全量重跑误伤已接入资产。
 * 复用项目既有 playwright，不新增依赖；一次启动浏览器批量处理，幂等靠 SHA-256 清单。
 */
const APP = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ASSETS = join(APP, 'public/assets')
const MANIFEST = join(APP, 'scripts/art-manifest.json')
const args = process.argv.slice(2)
const all = args.includes('--all')
const check = args.includes('--check')
const fourCorners = args.includes('--corners=4')
const frameMode = args.includes('--frame')
const SKIP = new Set([
  'yongji-county-base.png',              // 清底舆图，无烘焙文字，不进角标清理
  'yongji-county-map-preview.png',       // 设计样张，不运行时使用
  'A_refined_antique_Chinese_coun_2026-11-01T14-52-38.png', // 早期底图样张
  'seam-half-seal.png',                  // 骑缝装帧纸：绫边与纸心整幅使用，不做角标清理
  'seam-half-seal-b.png',                // 同上的淡余印
  'folio-slip-paper.png',                // FE-102 窄条题签纸：已清角标，勿再邻域重建打断绫边
  'trail-slip-paper.png',                // FE-102 行迹驿签纸：同上
  'folio-band-paper.png',                // FE-105 卷末题签带：按附录 M/N 不跑 art，保留完整绫边
  'folio-head-paper.png',                // FE-108 卷首题签纸：同上，保留绫边
  'folio-grand-head-paper.png',          // FE-111 卷首大题签纸：同上，保留绫边
  'hotspot-slip-paper.png',              // FE-114 场景热点纸签纸：同上，保留四周包边
  'read-scroll-paper.png',               // FE-117 长卷栏纸：同上，保留左右墨竖线与折痕
  'read-colhead-paper.png',              // FE-120 栏首小签纸：同上，保留上下包边与朱砂压边
  // FE-130：PS-20 谱纸 / PS-21 布面 / PS-22 街市已由本脚本清角标（hash 已入 manifest），
  // 整幅底材无绫边被邻域重建打断之虞，故不在 SKIP 内；普通重跑按 hash 跳过，--all 才会重处理。
])
const hashOf = buffer => createHash('sha256').update(buffer).digest('hex')
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
const files = readdirSync(ASSETS)
  .filter(name => name.toLowerCase().endsWith('.png') && !SKIP.has(name))
  .filter(name => !frameMode || /^card-frame-.*\.png$/i.test(name))
  .sort()
const started = Date.now()
const todo = []
const skipped = []
for (const name of files) {
  const buffer = readFileSync(join(ASSETS, name))
  const hash = hashOf(buffer)
  if (!all && !check && manifest[name] === hash) { skipped.push(name); continue }
  todo.push({ name, buffer })
}
console.log(`[art] 扫描 ${files.length} 张 PNG · 待处理 ${todo.length} · 已处理跳过 ${skipped.length}${check ? ' · 仅报告' : ''}${fourCorners ? ' · 四角模式' : ''}${frameMode ? ' · 卡框安全模式' : ''}`)
if (!todo.length) {
  console.log('[art] 没有新图。放入 app/public/assets/ 后重跑本命令即可。')
  process.exit(0)
}
if (check) {
  for (const item of todo) console.log(`  · ${item.name} (${(item.buffer.length / 1024 / 1024).toFixed(2)} MB)`)
  process.exit(0)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const page = await browser.newPage()
try {
  for (const item of todo) {
    const t0 = Date.now()
    const dataUrl = `data:image/png;base64,${item.buffer.toString('base64')}`
    const out = await page.evaluate(async ({ src, four, frame }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const W = canvas.width, H = canvas.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const image = ctx.getImageData(0, 0, W, H)
      const d = image.data

      if (frame) {
        // 卡框安全模式：按材质分区，用同图平移的干净纹理覆盖两处角标矩形。
        // 绫带取同向绫带、纸心取同向纸心、45° 斜接沿同一条斜线取源，
        // 细墨线因水平/竖直平移自动保直；全程只用图内像素，不补画。
        const lum = i => d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114
        const mid = Math.floor(H / 2)
        let bw = 0
        for (let x = 0; x < W * .2; x++) {
          let ok = true
          for (let k = 0; k < 5; k++) {
            if (lum((mid * W + Math.min(W - 1, x + k)) * 4) < 185) { ok = false; break }
          }
          if (ok) { bw = x; break }
        }
        if (!bw) bw = Math.round(W * .045)
        // 整块同材质平移覆盖（绫带取同向绫带、纸心取同向纸心），再做「源高光压制」：
        // 平移源若明显亮于该段底材中位，改用中位色，避免把源里的亮斑带到水印处；
        // 45° 斜接带原样保留，带内只把亮点换成邻域最暗（墨线本色）。全程只用图内像素，不补画。
        const isMitre = (x, y) =>
          Math.abs(x + y - bw) <= 3 ||
          Math.abs((W - 1 - x) + y - bw) <= 3 ||
          Math.abs(x + (H - 1 - y) - bw) <= 3 ||
          Math.abs((W - 1 - x) + (H - 1 - y) - bw) <= 3
        // 内线带只保线本身 ±3px：水印压在纸心/绫边交界时，整块平移会把线错位成多条白条
        const isInkBand = (x, y) =>
          Math.abs(y - bw) <= 3 || Math.abs(y - (H - 1 - bw)) <= 3 ||
          Math.abs(x - bw) <= 3 || Math.abs(x - (W - 1 - bw)) <= 3
        const rects = [
          { x1: Math.round(W * .02), y1: Math.round(H * .015), x2: Math.round(W * .165), y2: Math.round(H * .07), dx: 170, dy: 170 },
          { x1: Math.round(W * .875), y1: Math.round(H * .948), x2: Math.round(W * .998), y2: Math.round(H * .999), dx: -170, dy: -170 },
        ]
        if (four) {
          rects.push({ x1: Math.round(W * .835), y1: Math.round(H * .015), x2: Math.round(W * .98), y2: Math.round(H * .07), dx: -170, dy: 170 })
          rects.push({ x1: Math.round(W * .02), y1: Math.round(H * .93), x2: Math.round(W * .165), y2: Math.round(H * .985), dx: 170, dy: -170 })
        }
        const src = new Uint8ClampedArray(d)
        const pick = a => {
          if (!a.length) return null
          const out = []
          for (let k = 0; k < 3; k++) {
            const s = a.map(c => c[k]).sort((p, q) => p - q)
            out.push(s[Math.floor(s.length / 2)])
          }
          return out
        }
        const lumOf = c => c[0] * .299 + c[1] * .587 + c[2] * .114
        let cleared = 0
        for (const r of rects) {
          const med = {}
          for (let y = r.y1; y < r.y2; y++) {
            const band = [], paper = []
            for (let x = r.x1; x < r.x2; x++) {
              const i = (y * W + x) * 4
              ;(y < bw || y > H - 1 - bw || x < bw || x > W - 1 - bw ? band : paper).push([src[i], src[i + 1], src[i + 2]])
            }
            med[y] = { band: pick(band) || pick(paper), paper: pick(paper) || pick(band) }
          }
          for (let y = r.y1; y < r.y2; y++) {
            for (let x = r.x1; x < r.x2; x++) {
              const i = (y * W + x) * 4
              if (isMitre(x, y) || isInkBand(x, y)) {
                const self = [src[i], src[i + 1], src[i + 2]]
                const near = []
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                  const nx = Math.max(0, Math.min(W - 1, x + dx))
                  const ny = Math.max(0, Math.min(H - 1, y + dy))
                  const ni = (ny * W + nx) * 4
                  near.push(lumOf([src[ni], src[ni + 1], src[ni + 2]]))
                }
                near.sort((p, q) => p - q)
                const target = near[Math.floor(near.length / 2)]
                if (lumOf(self) > target + 15) {
                  // 取「最接近邻域中位亮度」的像素颜色 = 底色，既清掉白点又不留暗斑
                  let bi = i, best = Infinity
                  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    const nx = Math.max(0, Math.min(W - 1, x + dx))
                    const ny = Math.max(0, Math.min(H - 1, y + dy))
                    const ni = (ny * W + nx) * 4
                    const nl = lumOf([src[ni], src[ni + 1], src[ni + 2]])
                    const delta = Math.abs(nl - target)
                    if (delta < best) { best = delta; bi = ni }
                  }
                  for (let k = 0; k < 3; k++) d[i + k] = src[bi + k]
                  cleared++
                }
                continue
              }
              const band = y < bw || y > H - 1 - bw || x < bw || x > W - 1 - bw
              let sx, sy
              if (y < bw || y > H - 1 - bw) { sx = x + r.dx; sy = y }
              else if (x < bw || x > W - 1 - bw) { sx = x; sy = y + r.dy }
              else { sx = x + r.dx; sy = y }
              sx = Math.max(0, Math.min(W - 1, sx))
              sy = Math.max(0, Math.min(H - 1, sy))
              const si = (sy * W + sx) * 4
              const c = band ? med[y].band : med[y].paper
              const srcColor = [src[si], src[si + 1], src[si + 2]]
              // 源过亮（高光）或过暗（暗花/阴影）都改用中位色，避免把源的结构带到水印处
              const medLum = c ? lumOf(c) : 0
              const useMed = c && (lumOf(srcColor) > medLum + 18 || lumOf(srcColor) < medLum - 25)
              for (let k = 0; k < 3; k++) d[i + k] = useMed ? c[k] : srcColor[k]
              d[i + 3] = 255
              cleared++
            }
          }
        }
        ctx.putImageData(image, 0, 0)
        return { png: canvas.toDataURL('image/png').split(',')[1], w: W, h: H, cleared, bw }
      }

      const rw = Math.round(W * .15), rh = Math.round(H * .11)
      const regions = [
        { x1: 0, y1: 0, x2: rw, y2: rh },
        { x1: W - rw, y1: H - rh, x2: W, y2: H },
      ]
      if (four) {
        regions.push({ x1: W - rw, y1: 0, x2: W, y2: rh })
        regions.push({ x1: 0, y1: H - rh, x2: rw, y2: H })
      }
      for (const r of regions) {
        const height = r.y2 - r.y1
        const sy = r.y1 === 0 ? r.y2 : r.y1 - height
        for (let y = r.y1; y < r.y2; y++) {
          const srcY = Math.max(0, Math.min(H - 1, sy + (y - r.y1)))
          for (let x = r.x1; x < r.x2; x++) {
            const si = (srcY * W + x) * 4
            const di = (y * W + x) * 4
            const dx = r.x1 === 0 ? r.x2 - 1 - x : x - r.x1
            const dy = r.y1 === 0 ? r.y2 - 1 - y : y - r.y1
            const dist = Math.min(dx, dy)
            if (dist < 10) {
              const a = (dist + 1) / 11
              for (let k = 0; k < 3; k++) d[di + k] = Math.round(d[si + k] * a + d[di + k] * (1 - a))
            } else {
              for (let k = 0; k < 3; k++) d[di + k] = d[si + k]
            }
            d[di + 3] = 255
          }
        }
      }
      ctx.putImageData(image, 0, 0)
      return { png: canvas.toDataURL('image/png').split(',')[1], w: W, h: H }
    }, { src: dataUrl, four: fourCorners, frame: frameMode })
    const buffer = Buffer.from(out.png, 'base64')
    writeFileSync(join(ASSETS, item.name), buffer)
    manifest[item.name] = hashOf(buffer)
    console.log(`  ✓ ${item.name} ${out.w}x${out.h}${frameMode ? ` · 卡框安全模式 · 抹除 ${out.cleared}px · 边宽 ${out.bw}px` : ''} · ${Date.now() - t0}ms`)
  }
} finally {
  await browser.close()
}
if (!check) writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`[art] 完成 ${todo.length} 张 · 总耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log('[art] 新图请在 src/sceneArt.ts / src/paperArt.ts 登记图位；重跑本命令不会重复处理。')
