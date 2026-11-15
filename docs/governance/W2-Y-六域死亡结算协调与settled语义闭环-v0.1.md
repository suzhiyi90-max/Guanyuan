# W2-Y 六域死亡结算协调与 settled 语义闭环 v0.1

状态：首轮实现与验收中。Base：`work/w2-x-asset-evidence`。

## 1. 本切片目标

在 W2-U 至 W2-X 六域 typed evidence adapter 全部接入后，增加只读协调层，回答一个严格限定的问题：

> 对本次明确声明的死亡结算领域范围，是否每个领域都完成了领域自身规定的死亡后审查与合法处置，并且具有可验证的 canonical inventory 与证据来源？

协调层不重新实现领域规则，不将领域专属业务状态压缩成一个无来源的布尔值。

## 2. settled 的精确定义

协调结果为 `settled`，当且仅当：

1. scope 明确声明了至少一个领域，且不存在重复领域；
2. 每个声明领域恰有一份 typed domain assessment；
3. assessment 的 deceased、deathEvent 与 scope 一致；
4. 其 canonical inventory 存在，身份、状态、事件和条目引用与 evidence 一一对应；
5. inventory review event 有效，且不早于死亡事件；
6. 领域自己的 validator 没有问题，领域自己的 readiness function 返回 ready；
7. canonical inventory 明确标记为 complete。

该结论只对 `declaredDomains` 生效。若只声明 debt，结果不能被描述为六域全部结算；若要得到六域结论，调用方必须明确声明 office、debt、asset、membership、relation、goal 六域并逐域提供 assessment。

## 3. empty-but-reviewed 与 missing/unknown

协调结果为每个声明领域保留 coverage：

- `missing`：声明了领域，但没有对应 assessment。它不是空清单。
- `unknown`：assessment 存在，但 canonical inventory 缺失、证据结构无效或完整性无法确认。
- `empty-reviewed`：canonical inventory 与 evidence 均为零条目、inventory status 为 complete、结构校验通过，且领域 validator/readiness 均通过。这表示“该领域本次清单明确审查为空”，不表示现实世界绝无未发现事项。
- `reviewed-with-items`：存在已逐项映射的 canonical inventory 条目，且结构及领域审查通过。

`open` 或 `challenged` inventory 不能产生 `empty-reviewed`，即使条目数组为空也只能是 incomplete/unknown。不能以空数组本身推断无事项。

## 4. 领域验证委托

协调层接收每个领域的 typed assessment，其中必须携带：

- 对应领域的 `DeathSettlementDomainEvidence` discriminant；
- canonical inventory reference；
- 领域 validator 产生的 `domainIssues`；
- 领域 readiness function 产生的 `ready` / `blocked` 结果。

调用方必须先执行对应的领域函数：

| Domain | Validator | Readiness |
|---|---|---|
| office | `validateDeathOfficeInventory` | `isDeathOfficeInventoryReadyForSettlement` |
| debt | `validateDebtDeathInventory` | `isDebtDeathInventoryReadyForSettlement` |
| asset | `validateEstateAssetInventory` | `isEstateAssetInventoryReadyForSettlement` |
| membership | `validateMembershipDeathInventory` | `isMembershipDeathInventoryReadyForSettlement` |
| relation | `validateRelationDeathInventory` | `isRelationDeathInventoryReadyForSettlement` |
| goal | `validateGoalDeathInventory` | `isGoalDeathInventoryReadyForSettlement` |

协调层只验证共享身份、时间、scope coverage、canonical evidence 引用、重复与缺失，以及领域结果是否自洽。它不重新判断债务、产权、任职、授权、成员资格、关系或目标处置是否合法。

领域 readiness 为 blocked 时，整体结果为 incomplete；证据结构错误、身份错配、时间倒置、重复声明或 ready 与领域 validator issues 相矛盾时，整体结果为 invalid。

## 5. 结果语义

`DeathSettlementCoordinationResult.status` 使用有语义的联合状态：

- `settled`：所有声明领域均 ready；
- `incomplete`：存在缺失 assessment、open/challenged inventory 或领域 validator/readiness 阻塞；
- `invalid`：scope、身份、时间、canonical 映射或输入一致性错误。

每个领域另有独立 review status 和 coverage，不能只读取顶层 status 丢弃原因。

## 6. 明确不做

- 不修改 `Person`、`DeathRecord`、`EstateSettlementRef` 或其历史状态；
- 不自动把 `EstateSettlementRef.status` 从 pending 改为 settled；
- 不将 `Debt.status === settled`、债务承接、资产权属转移、关系结束、目标完成等领域状态直接等同于死亡结算 settled；
- 不创建无类型 string/bool 六域汇总；
- 不推断未声明领域已完成；
- 不把 complete inventory 解释为世界上绝无遗漏事项；
- 不创建新的领域 inventory，不复制领域 disposition；
- 不接入 AI 写事实、存档迁移、G1 runtime 或 UI。

## 7. 验收门槛

- 六域 discriminated assessment 可被类型安全表达；
- scope 缺失、重复、超范围 assessment 均可检出；
- deceased/deathEvent 错配、canonical inventory 缺失/错配、事件时间倒置均可检出；
- empty-but-reviewed 与 missing/unknown 明确区分；
- 每个领域的 validator issues/readiness 结果均作为协调输入，不由协调层猜测；
- 任一领域 blocked 时不得返回 settled；
- 单一领域 scope 不得被描述为全六域 settled；
- 不修改 Person/DeathRecord/EstateSettlementRef，不自动写入 settled；
- W1—W2-X 全量回归、W2-Y 专项、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
