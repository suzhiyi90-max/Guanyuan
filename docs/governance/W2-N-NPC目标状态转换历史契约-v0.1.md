# W2-N NPC Goal 状态转换历史契约 v0.1

状态：W2-N 施工契约；基线为 `work/w2-m-goal-death-continuity`。

## 1. 审计结论

W1-E 的 NPC Goal 只有当前 status 快照和 sourceEvent。W2-M 已定义人物死亡时未竟目标的显式处置，但普通目标从 active 转为 achieved、abandoned 或 failed，尚无独立的状态转换历史，因此无法从领域数据追溯终态形成的事件和时点。

PlayerGoal 是玩家志向单例，不属于本契约。

## 2. 状态模型

新增只读验证的数据记录 GoalStatusTransition：

- id：独立转换记录 ID；
- goal：被转换的 NPC Goal；
- fromStatus：固定为 active；
- toStatus：achieved / abandoned / failed；
- event：形成该状态变化的权威事件。

每个 NPC Goal 最多有一条普通终态转换。普通转换必须从 active 进入一个普通终态，不支持终态回滚、终态之间互转或自动重开。若未来需要重新追求同一事业方向，应创建新的 Goal，而不是改写旧 Goal 历史。

## 3. 时间与人物约束

1. Goal.sourceEvent 与转换 event 均必须存在且可解析时点。
2. 转换事件必须严格晚于 Goal.sourceEvent。
3. 转换事件发生时，Goal 所有人必须已经出生且仍然存活；转换不得发生于死亡时点或死亡之后。
4. 当前 Goal.status 必须与唯一转换记录的 toStatus 一致。
5. achieved / abandoned / failed 的普通终态必须有且仅有一条普通转换记录。
6. active Goal 不得有普通终态转换记录。
7. closed-by-death 不得由普通状态转换记录产生。
8. W2-M 的 abandoned / failed 死亡处置由 GoalDeathDisposition 表达，不得重复生成普通 GoalStatusTransition；historical / undertaken 继续由 W2-M 规则验证。

## 4. 责任边界

- 本切片只验证状态历史，不自动改写 Goal.status，不生成事件，不推进世界时间。
- 不把目标状态变化解释为债务、资产、职位、组织义务或法律责任变化。
- 不将目标完成/失败的叙事描述直接作为事实；必须引用已提交的事件。
- 不接 W3 Event Ledger，不接 AI 候选写入、存档迁移、G1 runtime 或 UI。
- 不改变 W2-M 的死亡处置语义，不处理 PlayerGoal。

## 5. 验收

- 普通终态缺少转换记录时拒绝；
- active 目标存在终态转换时拒绝；
- 转换记录 ID、Goal 引用、人物引用、事件引用唯一且完整；
- 转换只能 active -> achieved / abandoned / failed；
- 转换时点严格晚于目标创建时点且早于人物死亡时点；
- 当前状态快照与转换记录一致；
- W2-M 死亡处置不得与普通转换重复表达；
- 校验只读；
- W1-A 至 W2-M 全量回归、W2-N 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。
