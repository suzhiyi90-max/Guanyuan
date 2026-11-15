# W4-B 全量存档包与事件区间完整性契约 v0.1

## 1. 定位与依赖

- 基线：W4-A `work/w4-a-world-snapshot-checkpoint`。
- 本片只实现 full SavePackage；增量包与 basePackage 链由 W4-C 实现。
- EventStream 仍是唯一事实历史；SavePackage 是携带完整事件段、快照与校验摘要的恢复封套。
- 不接入 UI、localStorage、文件系统或数据库，不做 schema migration / event upcaster。

## 2. Full SavePackage 结构

- `packageKind: 'full'`。
- `worldId`、`schemaVersion`。
- `streamRange: { fromExclusive, toInclusive }`。
- `events`：区间内完整、原序、不可省略的 LedgerEvent 载荷数组。
- `snapshot`：与 package world/schema/toInclusive 一致的 WorldSnapshot。
- `checksum`：固定算法 `sha-256/canonical-json-v1` 的 `sha256:{64位小写hex}`。
- full 包不得携带 `basePackage`；不接受未登记的顶层字段。

Checksum 覆盖 packageKind、worldId、schemaVersion、streamRange、events 与 snapshot，不包含 checksum 自身。对象键按 Unicode code point 顺序排序（JavaScript 默认字符串排序），数组保持原顺序；只接受严格 JSON 值，拒绝循环、稀疏数组、非有限数字、undefined、函数与非普通对象。

## 3. Full 包完整性门禁

1. fromExclusive 必须为 genesis(seq=0)；toInclusive 必须是同一 worldId 的合法 cursor。
2. events 数量必须等于 toInclusive.seq；genesis→genesis 允许空 events。
3. snapshot 必须通过 W4-A 校验，且 worldId、schemaVersion、streamHead 必须与包封套一致。
4. checksum 必须存在、格式正确且与规范化封套重新计算结果完全一致。
5. 使用调用方提供的 frozen EventRegistry、initialState 和纯 reducer，从 genesis 重放完整 events；复用 W3-E 对 worldId、seq、eventId、schema、AI validation receipt 和 reducer 原子失败的校验。
6. 重放结果必须与 snapshot.materialized 的规范 JSON 完全相等；不一致即拒绝。
7. 校验成功后，返回深度克隆、深度冻结的规范化包；不得冻结或修改调用方输入。

## 4. 失败语义

- checksum 不匹配、事件重放拒绝、snapshot 锚点不匹配、状态不一致均拒绝。
- 不允许截断事件段、跳过坏事件、静默回退到 snapshot 或猜测缺失字段。
- Snapshot 不能代替 EventStream；full 包必须包含从 genesis 到 toInclusive 的完整事件载荷。
- checksum 是完整性校验，不是来源认证或防伪签名。

## 5. 测试矩阵

- 多事件 full 包成功、checksum 格式、输出深度冻结。
- tamper event payload 后 checksum 失败。
- 重复/错序/缺失事件拒绝。
- snapshot materialized 与事件重放结果不一致拒绝。
- full 包非 genesis 起点拒绝；snapshot head 与 package toInclusive 不一致拒绝。
- basePackage 与未知 envelope 字段拒绝。
- 空世界 genesis→genesis 空事件包成功。
- 跨世界封套与快照拒绝。

## 6. 后续边界

- W4-C 实现 incremental 包：basePackage 必须存在，base snapshot head 等于 fromExclusive，事件段恰好覆盖后续连续区间；跨世界、断链、漏事件、多带事件均拒绝。
- W4-C 完成 checksum 链与端到端恢复一致性测试。
- migration/upcaster 另行裁决，不纳入 W4-B/W4-C。
