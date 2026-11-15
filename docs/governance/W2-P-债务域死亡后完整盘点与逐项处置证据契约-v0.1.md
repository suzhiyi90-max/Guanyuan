# W2-P 债务域死亡后完整盘点与逐项处置证据契约 v0.1

状态：W2-P 施工契约；基线为 W2-O `work/w2-o-death-settlement-readiness-audit`。
依据：W2-I《债权债务身后责任连续性契约》、W2-O《死亡六域处理完成证据与结算状态语义审计》。

## 1. 目标与边界

为死者作为债权人或债务人的每一个债务当事人位置建立可追溯盘点。债权人位置与债务人位置分别计数；同一人物若同时出现在一笔债务的两个角色中，必须分别盘点。

本切片证明的是：调用方声明的债务集合中，死者相关债务角色位置是否完整覆盖、每项处置是否有明确证据。它不能证明现实中不存在未登记、未发现或未输入的债务。

## 2. 核心模型

新增 `DebtDeathInventory` 与 `DebtDeathInventoryEntry`：

- Inventory：`id`、`deceased`、`deathEvent`、`inventoryEvent`、`status`、`entries`。
- Entry：`id`、`debt`、`role`（creditor/debtor）、`disposition`、`successions`。
- `status=open`：尚未声明完整；`challenged`：范围完整性受到质疑；`complete`：调用方对所提交债务全集作出明确完整性声明。
- 每个 Entry 代表一笔债务中的一个角色位置，而不是整笔债务。相同 DebtId 的 creditor 与 debtor 位置不得合并。
- 空的 complete inventory 是“有盘点事件支撑的空范围声明”；空数组本身不代表无债务。
- `complete` 仅针对输入债务集合，不证明外部世界没有遗漏债务。

## 3. 逐项处置语义

每个债务角色位置必须明确属于以下一种状态：

| disposition | 含义 | 准入要求 |
|---|---|---|
| `pending` | 尚未完成承接或清偿审查 | 可无承接记录，也可记录部分份额；不得因此视为完成 |
| `disputed` | 原始 Debt.status 为 disputed | 保留争议，不得计入完成 |
| `succession-recorded` | 该角色位置已由明确承接记录完整覆盖 | 对应 DebtPartySuccession 必须全部引用且份额精确合计为 1 |
| `settled-before-death` | 债务在死亡时点前已清偿 | Debt.status 为 settled；清偿事件存在且均不晚于死亡时点 |
| `settled-after-death` | 债务在死亡后才清偿 | Debt.status 为 settled；至少一个清偿事件晚于死亡，全部清偿事件不晚于盘点事件 |

规则：

1. creditor 承接表示债权请求权的明确承接；debtor 承接表示债务责任的明确承担。两者不得混淆。
2. 没有承接记录不代表没有债务，也不代表责任自动消失；该位置必须保持 pending 或 disputed。
3. 多承接人份额采用 W2-I 的整数有理数，精确合计不得超过 1。低于 1 的未分配份额必须继续未决。
4. `succession-recorded` 必须完整覆盖该角色的 100% 份额；部分承接不能标记为完整承接。
5. 原始 `Debt.creditor`、`Debt.debtor`、`principal`、`status`、`settlements` 均保持不变。
6. 承接不等于清偿；`settled-before-death` / `settled-after-death` 只描述已有 Debt.status 与清偿事件的时间关系，不推断由谁承担清偿责任。
7. disputed 仅依据现有 `Debt.status='disputed'` 表达，不在本切片创造争议裁判或举证机制。

## 4. 验证契约

`validateDebtDeathInventory(inventory, debts, successions, refs)` 只读校验：

- 死者唯一存在、已死亡且有 DeathRecord；
- inventory.deathEvent 与 DeathRecord.causeEvent 一致，死亡事件时间与 DeathRecord.at 一致；
- inventoryEvent 存在、具有有效时点且不早于死亡；
- Inventory / Entry / Debt / succession 引用唯一且可解析；
- 每个 Entry 的 debt 与 role 确实对应死者的 creditor 或 debtor 位置；
- 同一 DebtId + role 只能有一条 Entry；
- complete inventory 覆盖输入 debts 中所有死者相关的 creditor/debtor 位置；
- 每条与该死者及死亡事件相关的 succession 都必须且只能归入一个对应 Entry；
- succession 仍由 W2-I 的既有验证器检查人物、死亡记录、角色、承接事件、承接者存活及份额约束；
- 每项清偿处置必须引用 Debt.settlements 中的事件，事件存在、时点有效且不晚于盘点事件；
- before/after death 的处置分类必须与清偿事件时间一致。

统一层只负责债务范围、引用和处置证据的完整性；不计算余额、不判断继承法、不推断担保责任。

## 5. 结算准备度

`isDebtDeathInventoryReadyForSettlement` 仅在以下条件同时满足时返回 true：

- Inventory.status 为 complete；
- 验证问题为空；
- 每个输入债务角色位置均为 succession-recorded、settled-before-death 或 settled-after-death。

准备度不表示债务一定已经清偿：succession-recorded 仍可能保留未清本金；也不表示输入集合之外不存在遗漏债务。任何 pending 或 disputed 项均阻止准备度通过。

## 6. 本切片不做

- 不修改 Debt / DebtPartySuccession / Person / DeathRecord / EstateSettlementRef；
- 不自动创建承接记录、清偿事件或修改债务状态；
- 不推断继承人、亲属义务、法定继承顺位、遗产责任上限或限定继承；
- 不计算本金余额、利息、担保物或债务优先顺位；
- 不创建六域结算协调器，不接其他五域；
- 不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 7. 验收

- 债权人与债务人位置分别盘点；
- 完整输入债务集合的逐项覆盖与显式空范围声明；
- 缺项、重复、错误角色、孤立承接记录均拒绝；
- 无承接记录和部分承接均保持未决；
- 争议债务保持争议；
- 死亡前/死亡后清偿分类严格依事件时点；
- 原始 Debt 不变，承接与清偿严格区分；
- W1 至 W2-O 全量回归、W2-P 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。
