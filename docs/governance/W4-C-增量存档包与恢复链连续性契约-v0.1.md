# W4-C 增量存档包与恢复链连续性契约 v0.1

## 1. 定位与依赖

- 基线：W4-B `work/w4-b-full-save-package`。
- 本片在 full SavePackage 之上增加 incremental SavePackage 与递归 basePackage 链。
- EventStream 仍是唯一事实历史；Snapshot 仍是派生检查点；SavePackage 只负责携带可验证的恢复链。
- 不接入 UI、localStorage、文件系统或数据库，不做 schema migration / event upcaster。

## 2. Incremental 包结构

- `packageKind: 'incremental'`。
- `worldId`、`schemaVersion`。
- `streamRange: { fromExclusive, toInclusive }`。
- `events`：必须完整覆盖 `(fromExclusive, toInclusive]` 的有序事件载荷。
- `snapshot`：streamHead 必须等于 toInclusive。
- `basePackage`：已通过完整校验的 Full 或 Incremental SavePackage。
- `checksum`：沿用 W4-B 的 `sha-256/canonical-json-v1`，覆盖 basePackage 与本包其余所有封套字段。

## 3. 连续性门禁

1. 递归验证 basePackage；只接受合法 full 根包与合法 incremental 后继链；设置最大链深，拒绝循环/超深输入。
2. package、basePackage、snapshot 的 worldId 与 schemaVersion 必须一致。
3. basePackage.snapshot.streamHead 必须与本包 fromExclusive 完全一致；event cursor 比较同时核对 seq 与 eventId。
4. toInclusive.seq 不得小于 fromExclusive.seq；events.length 必须精确等于两游标 seq 差值；相同游标只允许空 events。
5. 若 fromExclusive 是 event cursor，必须从 basePackage 链提取并验证该游标对应的 anchorEvent；不能仅相信 seq。
6. 从 basePackage 链收集此前的 candidate.validated 系统回执，并只向重放提供 seq 早于 fromExclusive 的回执；anchorEvent 若自身是 receipt，由重放内核按锚点规则纳入。
7. 使用 basePackage.snapshot.materialized 作为增量重放初态，复用 W3-E frozen Registry、schema、AI receipt、事件顺序与 reducer 原子失败校验。
8. 增量重放结果必须与本包 snapshot.materialized 的规范 JSON 完全相等。
9. checksum 覆盖规范化后的 basePackage、事件区间与 snapshot；成功结果递归深度克隆并冻结。

## 4. 失败语义

- basePackage 不存在、无效、跨世界、schema 不一致、游标断链、eventId 不匹配、事件段缺失/多带/错序、checksum 不匹配或重放状态不一致，一律拒绝。
- 不允许从错误 base 自动寻找“最接近”的检查点，也不允许跳过断裂区间。
- 旧包迁移、schema migration/upcaster、压缩与外部存储寻址均不在本片。

## 5. 测试矩阵

- full→incremental 成功，base head 与 fromExclusive 精确相等。
- 多层链递归校验、嵌套包冻结与 checksum tamper 拒绝。
- base cursor 不匹配、跨世界、事件数不符、错序/重复事件拒绝。
- 空增量区间保留 base state 与 cursor。
- 通过 basePackage 继承此前 candidate.validated receipt，验证跨检查点 AI 事实事件可重放。
- 深度限制拒绝超长链。
- basePackage 本身 checksum/事件/快照损坏时，后继包整体拒绝。

## 6. W4 完成边界

W4-A/B/C 完成后，正式具备快照 envelope、full package、incremental chain 与 checksum/replay 一致性基础。与实际游戏运行时的存档读写接线另行规划；本阶段不改写原型 localStorage 行为。
