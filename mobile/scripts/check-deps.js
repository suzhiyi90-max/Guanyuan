// ⚠️ 系统文件 - 禁止修改、删除或重写。此脚本由平台维护，用于校验原生依赖版本。
const fs = require('fs');
const path = require('path');

const ALLOWED = JSON.parse(fs.readFileSync(path.join(__dirname, 'allowed-deps.json'), 'utf8'));
const BLOCKED = JSON.parse(fs.readFileSync(path.join(__dirname, 'blocked-native-deps.json'), 'utf8'));

// preinstall 也会在 node_modules 尚不存在时执行，因此不依赖外部 semver 包。
// 白名单只使用完整的稳定版 exact / ~ / ^ 声明；其他语法保守拒绝。
function parseStableRange(version) {
  if (typeof version !== 'string') return null;
  const match = /^(\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match || match[0] !== version) return null;
  const min = match.slice(2).map(Number);
  if (min.some(part => !Number.isSafeInteger(part) || part >= Number.MAX_SAFE_INTEGER)) return null;

  let upperIndex = 2;
  if (match[1] === '~') upperIndex = 1;
  if (match[1] === '^') upperIndex = min[0] > 0 ? 0 : min[1] > 0 ? 1 : 2;
  const max = min.map((part, index) => index < upperIndex ? part : index === upperIndex ? part + 1 : 0);
  return { min, max, exact: !match[1] };
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function isAllowedRange(version, allowedVersion) {
  const requested = parseStableRange(version);
  const allowed = parseStableRange(allowedVersion);
  return requested !== null && allowed !== null
    && (!allowed.exact || requested.exact)
    && compareVersions(requested.min, allowed.min) >= 0
    && compareVersions(requested.max, allowed.max) <= 0;
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const deps = pkg.dependencies || {};
const errors = [];

for (const [name, version] of Object.entries(deps)) {
  if (name in BLOCKED) {
    errors.push(`  • ${name} — 沙箱未预装，APK 运行时会 crash（${BLOCKED[name]}）`);
  } else if (name in ALLOWED && !isAllowedRange(version, ALLOWED[name])) {
    errors.push(`  • ${name} 版本不匹配：${version}（允许范围 ${ALLOWED[name]}）`);
  }
}

if (errors.length > 0) {
  console.error('\n❌ 依赖检查未通过：\n');
  errors.forEach(e => console.error(e));
  console.error('\n原生模块必须使用模板 APK 预装的版本，黑名单中的原生包禁止引入。纯 JS 库不受限制。\n');
  process.exit(1);
}
