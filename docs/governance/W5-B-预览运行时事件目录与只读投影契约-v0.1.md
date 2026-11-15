# W5-B 预览运行时事件目录与只读投影契约 v0.1

## 1. 范围

- 基线：W5-A `work/w5-a-runtime-connection-audit`。
- 本片只为当前可玩预览建立有限事件目录、GameState 模型边界、初始状态工厂与纯重放投影。
- 不接入 useGame 的写入入口，不改 localStorage、不迁移旧档、不创建 SaveRepository。
- 本目录是 preview runtime v0.1，不是正式 Q17 EventKind 全目录冻结。

## 2. 当前预览事件目录

业务 schema 均为 version 1，Registry 为 `guanyuan.preview-runtime@0.1.0`：

| EventKind | Payload | Projection effect |
|---|---|---|
| `goal.selected` | goalId | 设置当前志向 |
| `document.remembered` | selectedIds | 写入呈文对勘、疑点与完成标记 |
| `ledger.remembered` | selectedIds | 写入账册并置、疑点与完成标记 |
| `person.asked` | personId | 消耗行动时段、记录接触并解锁既有证据 |
| `records.audited` | 空对象 | 消耗时段并解锁借领状 |
| `river.probed` | 空对象 | 消耗时段、记录探挖事实并解锁现场证据 |
| `plan.previewed` | 空对象 | 记录计划预览动作 |
| `river.plan.confirmed` | plan | 消耗时段并形成抢护计划 |
| `banquet.choice` | choice | 形成亲赴/代往/闭门查册的后果 |
| `official.action` | key | 复用既有 executeCommand 规则 |
| `world.event.resolved` | eventId、optionId | 复用既有世界事件结算规则 |
| `day.advanced` | 空对象 | 复用既有 advanceDay 规则 |

`candidate.validated` 不注册为业务 schema：它仍由 W3-D/W3-E 固定内置账本协议校验，并在 preview projection 中作为 no-op 控制事件处理。

## 3. 模型与投影边界

- `GameState` 从 React hook 抽离到 `game/model.ts`，避免领域/引擎模块反向依赖 React hook。
- 初始状态集中于 `createInitialGameState()`；旧 hook 继续暂时使用同一工厂，行为保持不变。
- `runtime-registry.ts` 创建并冻结 preview runtime registry；严格拒绝未知 payload key、缺字段、非法选择值与负数计划量。
- `runtime-projection.ts` 提供纯 reducer；非法已提交动作抛出，使 replay 内核整体拒绝，不返回部分状态。
- `rebuildPreviewRuntimeProjection` 从 genesis 重建 GameState；结果由 W3-E replay 内核深度克隆、冻结，作为只读投影。
- 该 reducer 复用既有 `executeCommand`、`advanceDay`、`spendAction`、`worldEvents` 和人物数据，不复制另一套数值/结算口径。

## 4. 重要限制

- 本片没有把 useGame 的所有 handler 改为 ledger append；旧 UI 仍是旧状态入口。W5-C 才负责统一命令入口，不能因本片存在 reducer 就宣称已完成事件溯源接线。
- 当前 AI generated-event 的候选生成、receipt、pending/settlement 映射暂不在本 preview registry 中；W5-C 需在不绕过 W3-D receipt 的前提下单独设计并接入。
- 旧 `pendingEvent/handledEvents` 目前仍作为 GameState 投影字段供既有命令引擎复用；不得再将其作为独立事实来源。
- narrative store 的设置、secret 与缓存继续独立于世界事实。

## 5. 测试矩阵

- registry 冻结、版本、业务 schema 数量与内置 receipt 边界。
- 每类 payload 的正/负验证，包括严格字段集与数量约束。
- 从 genesis 重放覆盖志向、文书/账册对勘、人物接触、查册、探挖、宴席、跨日、世界事件、计划与官员动作。
- 重放结果与状态字段、行动时段成本、证据解锁、pending/handled 状态一致。
- 同一事件流重复重放得到相同投影；输出深度冻结。
- 重复人物接触等语义非法事件导致整段 replay rejected，不产生部分投影。

## 6. 下一步

W5-C 将把 useGame 中直接 setState 的世界事实入口迁移为 Command Intent → Orchestrator → append → replay/projection，并引入幂等请求键。AI candidate receipt、generated event candidate 与结算也在该阶段纳入同一事实流。W5-D 再定义持久化端口与浏览器 adapter。
