# W2-M 未竟目标与死亡后承接契约 v0.1

状态：W2-M 施工契约；基线为 work/w2-l-relation-death-continuity。

## 1. 审计结论

W1-E 的 Goal 是人物私有目标记录，具有 person、statement、priority、status、sourceEvent、visibility；PlayerGoal 是独立的玩家志向单例。当前模型没有目标终止事件、死亡处置或目标承接链。W2-F 已将 goal 纳入六域死亡结算引用，但不定义领域结果。

目标不等同于债务、法律义务、资产权利或组织职位。人物死亡不能自动证明目标失败、放弃、完成，也不能自动把目标转给亲属、同僚、组织或继任者。

## 2. 核心裁决

1. 本切片仅处理 NPC Goal，不处理 PlayerGoal。
2. 人物死亡不删除其目标记录；原目标仍归属于原人物。
3. 死亡时仍处于 active 的目标必须有显式处置，不能在死者名下继续作为可执行目标。
4. 处置结果：
   - historical：目标未竟，作为历史记录保留；原 Goal.status 为 closed-by-death，处置事件即死亡事件。
   - abandoned：明确放弃；原 Goal.status 为 abandoned，处置事件必须晚于死亡。
   - failed：明确判定失败；原 Goal.status 为 failed，处置事件必须晚于死亡。
   - undertaken：生者明确接手其事业方向；原 Goal.status 为 closed-by-death，并创建一条独立的新 Goal。新目标有自己的人物、文本、优先级、可见性和来源事件，不复制或转移原 Goal。
5. undertaking 必须由明确事件记录，承接者在该事件时点必须存活；承接者可以是任何明确指定的生者，不从亲属或组织关系推断。
6. historical / abandoned / failed 不得附带 successorGoal；undertaken 必须引用唯一、独立且由承接者拥有的新 Goal。
7. 不要求新目标与旧目标文字相同；承接者必须独立表达其意图。
8. 目标处置只校验，不自动生成事件、不改写人物、不自动更新六域结算状态。

## 3. 数据契约

GoalStatus 增加 closed-by-death，表示原人物目标已因死亡而关闭，但其历史记录保留。

GoalDeathDisposition：
- id、goal、deceased、deathEvent、dispositionEvent
- outcome：historical / abandoned / failed / undertaken
- successorGoal：仅 undertaken 使用

目标来源事件必须早于死亡事件。死亡记录、死亡事件及事件时点必须一致。historical 使用死亡事件作为处置事件；其他处置事件必须严格晚于死亡。undertaken 的 successor Goal 必须唯一、属于不同人物、处于 active，sourceEvent 必须等于 dispositionEvent；承接者在该时点存活。

## 4. 明确不做事项

- 不把 PlayerGoal 自动分配给任何 NPC。
- 不从亲属、师生、同年、组织、派系、婚姻、债务或资产关系推断承接者。
- 不自动复制目标文本、优先级、权限或可见性。
- 不将目标承接解释为法律义务、债务、遗产或职位继承。
- 不自动完成目标，不自动更新 DeathRecord.goal settlement status。
- 不实现一般 Goal 状态变更账本；已终态目标的终态形成时点仍需后续事件化补足。
- 不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 5. 验收门槛

- 死者 active / closed-by-death 目标必须有唯一处置；生者不得持有 closed-by-death 目标。
- 目标归属、死者、DeathRecord、事件 ID 和时间链一致。
- historical / abandoned / failed / undertaken 状态及 successorGoal 规则严格匹配。
- undertaken 必须创建独立新目标，承接者在事件时点存活，且新目标来源事件等于承接事件。
- 不修改旧目标归属、原文、优先级、可见性或 Person.stateDomains.goals。
- W1-A 至 W2-L 回归、W2-M 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
