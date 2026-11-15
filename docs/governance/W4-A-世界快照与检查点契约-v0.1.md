# W4-A 世界快照与检查点契约 v0.1

## 1. 定位与依赖

- 基线：W3-E `work/w3-e-event-replay-readonly-projection`，验收提交 `c439734bcfae5758fb2333fa2239c9adaa970ffa`。
- 本片只定义世界快照（WorldSnapshot）与 EventStream 检查点的可信结构。
- EventStream 仍是世界事实历史的唯一权威；Snapshot 是可丢弃、可重建的派生检查点，不得取代事件流。
- 本片不实现 SavePackage、checksum、全量/增量包链、存储适配器、旧存档迁移或 event upcaster。

## 2. 快照结构

WorldSnapshot 固定包含：

- `schemaVersion`：正安全整数，标识快照结构版本。
- `worldId`：非空世界标识。
- `streamHead`：genesis(seq=0) 或 event(seq,eventId) 游标。
- `checkpointAt`：合法 WorldTime，记录建立检查点时的世界时间。
- `materialized`：由事件流重建的 JSON 状态，不是新的事实来源。

不在本片擅自加入业务字段、玩家私有状态、存档槽位或数据库元数据。

## 3. 一致性与校验

1. event cursor 的 eventId 必须严格匹配 `evt:{worldId}:{seq}`；genesis 只允许 seq=0。
2. schemaVersion 必须为正安全整数；worldId 必须非空；checkpointAt 必须通过既有 WorldTime 校验。
3. materialized 必须是有限数值、普通对象、数组、字符串、布尔或 null 组成的 JSON 树；拒绝循环、非有限数字、函数、undefined 与非普通对象。
4. 结构校验成功后，深度克隆并冻结快照及其嵌套状态，不冻结或修改调用方输入。
5. 恢复调用方可额外提供期望 worldId、schemaVersion 和 streamHead；任一不一致均拒绝。不得仅按 seq 匹配游标。
6. 快照只证明自身 envelope 与指定期望值一致；它不证明事件流完整，也不替代 W3-E 的事件重放/Registry 校验。

## 4. 失败语义

- 校验返回明确的 rejected issue，不抛出可导致加载流程崩溃的解析异常。
- 失败结果不返回部分快照。
- 不允许对损坏快照静默修补、猜测缺省字段或回退到另一个世界。
- 快照丢失或不可信时，后续 W4 恢复流程应能回到 EventStream 重建；本片不实现该恢复编排。

## 5. 测试矩阵

- 合法 genesis 与 event checkpoint。
- worldId/schemaVersion/streamHead 期望值一致与不一致。
- eventId 与 worldId/seq 绑定。
- 非法 WorldTime、非法 schemaVersion。
- 循环对象、NaN/Infinity、非普通对象。
- 快照 envelope 与嵌套 materialized 深度冻结。
- 不修改/冻结输入对象。
- 失败不暴露部分快照。

## 6. 后续边界

- W4-B：SavePackage envelope、full 包和事件区间完整性。
- W4-C：incremental basePackage 链、checksum 与端到端恢复一致性。
- Schema migration/upcaster 不在 W4-A/W4-B/W4-C 中实现；若后续确有需求，另立版本迁移契约与审批。
- W5 才考虑与 useGame、React、localStorage 或持久化适配器接线。
