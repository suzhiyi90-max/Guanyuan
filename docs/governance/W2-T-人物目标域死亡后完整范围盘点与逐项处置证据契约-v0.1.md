# W2-T 人物目标域死亡后完整范围盘点与逐项处置证据契约 v0.1

状态：施工契约；基线为 `work/w2-s-relation-death-inventory`。

## 1. 目标与范围

W2-M 已定义单条 NPC Goal 的死亡后处置；W2-N 已定义普通 NPC Goal 终态转换历史。本切片补齐指定死者的 NPC Goal 完整范围盘点，证明输入 Goal 集合中该人物的全部目标均已逐项分类并具备对应证据。

仅处理 `Goal`。独立的 `PlayerGoal` 是玩家志向单例，不属于 NPC Goal 集合，不得混入盘点、继承、转让或死亡处置。

## 2. 逐项结果

- `terminal-before-death`：目标在死亡前已进入 achieved / abandoned / failed 普通终态；必须有且仅有一条 W2-N GoalStatusTransition，转换事件严格晚于目标 sourceEvent 且严格早于死亡时点，当前 Goal.status 与转换记录一致。
- `historical`：未竟目标作为历史记录保留；由 W2-M historical 处置支持，原 Goal.status 为 closed-by-death，处置事件即死亡事件。
- `abandoned`：死亡后经明确事件放弃；由 W2-M abandoned 处置支持，原 Goal.status 为 abandoned，处置事件严格晚于死亡。
- `failed`：死亡后经明确事件判定失败；由 W2-M failed 处置支持，原 Goal.status 为 failed，处置事件严格晚于死亡。
- `undertaken`：生者明确承接目标方向；由 W2-M undertaken 处置支持，原 Goal.status 为 closed-by-death，并引用承接者独立创建的新 active Goal。新目标归属不同人物，sourceEvent 等于承接事件，承接者在该时点存活。
- `pending`：缺少范围、转换、处置、事件或时间证据；不得视为完成。

普通终态转换与死亡处置互斥。同一 Goal 不得既有 W2-N 普通状态转换，又有 W2-M 死亡处置。不得将死亡后的 abandoned / failed 伪装成死亡前普通终态，也不得将死亡处置写成普通状态转换。

## 3. 完整范围与证据

新增 `GoalDeathInventory`，绑定 deceased、deathEvent、inventoryEvent、status 与逐项 Goal 条目。

新增：
- `validateGoalDeathInventory(inventory, goals, dispositions, transitions, persons, refs)`
- `isGoalDeathInventoryReadyForSettlement(inventory, validationIssues)`

complete 必须精确覆盖输入 `goals` 集合中所有 person 等于 deceased 的 GoalId；重复 GoalId、重复条目 ID、重复 Goal 引用、跨人物条目、遗漏或多列条目均报错。空 complete inventory 必须有可验证且不早于死亡的 inventoryEvent，表示显式空范围审查。

complete 只证明调用方声明的输入集合，不证明世界中不存在未登记目标。调用方必须向验证器提供完整的 NPC Goal 集合及其相关处置/转换记录。验证器分别复用 W2-M 与 W2-N 规则；不以库存条目替代领域证据。

ready 仅在 status=complete、所有验证无 issue 且没有 pending 条目时成立。open、challenged、pending 均不得作为死亡领域处理完成的依据。

## 4. 时间、承接与事实边界

- 每个 Goal.sourceEvent 必须存在，且严格早于死者死亡时点。
- 死亡事件必须与 Person.death.causeEvent 和死亡时点一致。
- inventoryEvent 必须存在且不早于死亡。
- 普通终态事件严格早于死亡；W2-M historical 使用死亡事件；其余死亡后处置事件严格晚于死亡。
- undertaken 只证明另一个人物明确创建了自己的目标，不代表旧 Goal 转移、复制或继承。
- 不从亲属、师生、同年、同僚、组织、派系、婚姻、债务或资产关系推断承接者。
- 不从目标内容推断法律义务、债务、资产权利、官职、组织成员资格或遗产责任。

## 5. 明确不做事项

- 不修改 Goal、GoalStatusTransition、GoalDeathDisposition、Person 或 PlayerGoal。
- 不自动创建事件、目标、继任者或承接关系。
- 不自动改写目标状态，不推进时间，不将目标承接等同于债务/职位/财产/法律义务继承。
- 不将目标达成、失败或放弃叙事直接写为事实；必须引用现有事件证据。
- 不接 W3 Event Ledger、AI 候选写入、存档迁移、G1 runtime 或 UI。
- 不创建六域死亡结算协调器；本切片只提供目标域 inventory 与 readiness 证据。

## 6. 验收门槛

- 精确覆盖指定死者输入集合中的全部 NPC Goal。
- PlayerGoal 完全隔离。
- 区分死亡前普通终态、死亡时历史关闭、死亡后放弃、死亡后失败、独立承接与待处理。
- 普通终态必须由 W2-N 转换记录支持；死亡处置必须由 W2-M 记录支持。
- 普通转换与死亡处置不得重复表达。
- 承接必须创建独立新 Goal，承接者在承接时点存活。
- 空范围必须有有效 review event；缺失、重复、跨人物、遗漏和时间不一致显式报错。
- 验证只读，不修改源记录。
- W1 至 W2-S 全量回归、W2-T 专项、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
