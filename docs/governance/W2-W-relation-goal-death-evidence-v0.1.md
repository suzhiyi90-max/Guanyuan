# W2-W Relation 与 Goal 死亡结算证据适配契约 v0.1

状态：首轮实现与验收中。Base：`work/w2-v-office-membership-evidence`。

## 1. 本切片目标

在 W2-U typed evidence envelope 与 W2-V office/membership adapters 基础上，接入 relation 与 goal 两个既有 canonical inventory。只投影稳定领域引用，不复制处置结果，不改变领域事实。

## 2. 适配器

- `projectRelationDeathInventoryEvidence`：从 `RelationDeathInventory` 投影 `relations`，保留 inventory identity、status 与原 entry ID。
- `projectGoalDeathInventoryEvidence`：从 `GoalDeathInventory` 投影 NPC `goals`，保留 inventory identity、status 与原 entry ID。
- canonical itemRef 分别为 `relation:<RelationId>` 与 `goal:<GoalId>`，严格按 inventory 原有顺序对齐。
- relation 的 preserved/ended/ended-before-death outcome 与 goal 的 undertaken/historical/abandoned/failed/terminal-before-death outcome 均留在领域 inventory，不复制进统一 envelope。

## 3. 验证边界

统一 validator 仅负责 evidence 与 canonical inventory 的身份、事件时间、状态、entry ID、数量和按序 itemRef 精确映射。领域完整性与处置合法性仍由原领域 validator 决定：

- relation：`validateRelationDeathInventory` 与 `isRelationDeathInventoryReadyForSettlement`；
- goal：`validateGoalDeathInventory` 与 `isGoalDeathInventoryReadyForSettlement`。

Goal 投影仅包含 deceased NPC 的 GoalDeathInventory，不引入 PlayerGoal。Relation 投影只引用 inventory 已声明的关系，不推断关系是否真实、是否应保留或结束。

## 4. 明确不做

- 不实现六域 coordinator 或统一 settled 状态；
- 不修改 Relation、Goal、RelationDeathDisposition、GoalDeathDisposition；
- 不把 preserved/ended 等处置结果复制到 envelope；
- 不把目标承接视为原目标事实转移，不把关系延续视为双方关系自动同意；
- 不推断未提供的 inventory 范围；
- 不接入 AI、存档迁移、G1 runtime 或 UI。

## 5. 验收

- relation 与 goal 的 typed projector 可编译，且按原 inventory 顺序保留稳定 entry IDs；
- canonical itemRef 正确映射通过，错误引用与错误顺序可检出；
- open/challenged 状态不得提升为 complete；
- 领域 outcome 不被复制或重写；
- W1—W2-V 全量回归、W2-W 专项、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。

下一切片 W2-X 接入 asset evidence；必须等待 W2-W 完整验收后启动。
