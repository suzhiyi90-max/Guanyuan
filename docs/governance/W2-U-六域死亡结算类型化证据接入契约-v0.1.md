# W2-U 六域死亡结算类型化证据接入契约 v0.1

状态：首轮实现与验收中。Base：`work/w2-t-goal-death-inventory`。

## 1. 本切片目标

建立一个类型安全的统一证据索引，使死亡结算协调层可以定位各领域自己的完整范围清单，同时保留领域专属模型、处置类型和验证器。首轮只接入债务域作为试点，不实现六域协调器。

## 2. 核心架构裁决

`DeathSettlementDomainEvidence` 是领域 inventory 的类型化索引，不是第二份领域事实，也不是领域状态的替代品。

- 每个 domain 使用独立 discriminant。
- 每个 domain 的 inventory ID、entry ID、事项 ID 使用各自 branded type。
- 证据索引只复制稳定引用和 inventory 状态，不复制 disposition 结果。
- 原始领域 inventory 及其验证器是唯一权威来源。
- debt 适配器从 `DebtDeathInventory` 投影出 typed envelope；不改变 debt、successions 或 inventory。
- envelope 的结构验证只验证身份、事件时间、引用唯一性和一对一条目映射；不能单独证明领域完整性或处置合法性。

## 3. 六域类型映射

| Domain | Canonical inventory | Stable item references |
|---|---|---|
| office | DeathOfficeInventory | AppointmentId、AuthorizationId |
| debt | DebtDeathInventory | DebtId + creditor/debtor role |
| asset | EstateAssetInventory | AssetId |
| membership | MembershipDeathInventory | MembershipId |
| relation | RelationDeathInventory | RelationId |
| goal | GoalDeathInventory | GoalId |

每个域的 entry ID 保留自己的品牌类型。不同领域即使底层字符串相同，也不能在 TypeScript 类型层面互换。

## 4. 债务试点

`projectDebtDeathInventoryEvidence` 将债务域 canonical inventory 映射为统一证据索引。投影保留：
- deceased、deathEvent、inventoryEvent；
- 原 inventory ID 与状态；
- 每条 inventory entry ID；
- 每个债务角色位置（DebtId + creditor/debtor）。

投影不改变 pending、disputed、succession-recorded 或 settled disposition；不将承接等同于清偿；不生成或修改 DebtPartySuccession。

## 5. 校验边界

`validateDeathSettlementDomainEvidence` 只做 envelope 级结构校验：
- 身份与事件引用；
- inventory review 时间不早于死亡；
- canonical inventory 引用存在；
- entry ID 唯一；
- domain item references 唯一；
- domain references 与 entry 数量一致。

调用方仍必须调用对应领域 validator，并以领域自己的 readiness 函数判定该域是否完成。当前债务域仍由 `validateDebtDeathInventory` 和 `isDebtDeathInventoryReadyForSettlement` 裁决。

## 6. 明确不做

- 不新增统一 `settled: boolean`；
- 不汇总六域 ready 状态，不自动修改 DeathRecord.estateSettlements；
- 不把债务域 ready 等同于 Debt.status settled；
- 不复制或重写任何领域 disposition；
- 不把空条目数组自动解释为已证明空范围；
- 不声称 caller-supplied inventory 完整等于现实世界绝无漏项；
- 不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 7. 后续适配顺序

债务试点验收后，按 office → membership → relation → goal → asset 接入类型化索引。asset 复用 W2-J inventory；不得为统一层重新实现所有权推导。六域全部接入并通过领域独立 readiness 校验后，再单独设计协调器和 settled 语义。

## 8. 验收

- 类型映射覆盖六域，领域 ID/entry ID 不可混用；
- debt 投影不丢失身份、状态、entry 和 creditor/debtor 角色；
- 投影和 envelope validator 均只读；
- 缺失引用、时间倒置、重复 entry、重复 domain item 和数量不匹配均可检测；
- pending / disputed 状态不被提升为完成；
- W1—W2-T 全量回归、W2-U 专项、Review index、Patch whitespace、Production build、Playwright Smoke、截图归档全部通过。
