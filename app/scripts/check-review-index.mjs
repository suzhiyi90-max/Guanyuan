import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../Guanyuan-review/frontend/', import.meta.url))
const indexPath = resolve(root, '00-索引.md')
const index = readFileSync(indexPath, 'utf8')
const failures = []

if (/\.m\d+/u.test(index)) failures.push('索引仍含 .m数字 伪路径')

const rows = [...index.matchAll(/^\| \[`([^`]+)`\]\(([^)]+)\) \|.*\| (\d+) \|$/gm)]
if (rows.length !== 21) failures.push(`文件地图应有 21 项，实际解析到 ${rows.length} 项`)

for (const [, label, target, declared] of rows) {
  const relative = target.split('#')[0]
  const file = resolve(root, relative)
  if (!existsSync(file)) {
    failures.push(`文件不存在：${label} -> ${target}`)
    continue
  }
  const content = readFileSync(file, 'utf8')
  const actual = (content.match(/\n/g) ?? []).length
  if (actual !== Number(declared)) failures.push(`行数不一致：${label} 声明 ${declared}，实际 ${actual}`)
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exitCode = 1
} else {
  console.log(`PASS 文档索引：${rows.length} 项路径有效、行数一致、无 .m数字 伪路径`)
}
