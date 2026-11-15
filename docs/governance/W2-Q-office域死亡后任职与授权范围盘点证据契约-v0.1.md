# W2-Q office 域死亡后任职与授权范围盘点证据契约 v0.1

状态：W2-Q 施工契约；基线为 W2-P `work/w2-p-debt-death-inventory`。
依据：W2-G《死亡后的任职区间终止契约》、W2-H《授权主体死亡后的行使门禁契约》、W2-O《死亡六域处理完成证据与结算状态语义审计》。

## 1. 目标与范围

为死者相关的 person-bound office records 建立完整范围声明，解决“逐条 Appointment / Authorization 验证通过，但调用方可能漏传记录”的缺口。

本切片覆盖两类记录：

1. 死者作为任职人的全部 `Appointment`；
2. 死者作为授权主体（`Authorization.principal`）的全部 `Authorization`。

`Appointment` 是人物任职履历；`Authorization` 是人物持有的权限授予。两者分别盘点，不将任职、官阶、职位名称或组织关系视为隐式授权。

## 2. 核心模型

新增 `DeathOfficeInventory`：

- `id`、`deceased`、`deathEvent`、`inventoryEvent`、`status`；
- `appointments[]`：逐条引用 Appointment ID 与处置状态；
- `authorizations[]`：逐条引用 Authorization ID 与处置状态。

范围状态：

- `open`：尚未声明完整；
- `challenged`：完整性声明受到质疑；
- `complete`：调用方声明已覆盖传入的完整 Appointment / principal Authorization 集合。

空的 complete inventory 是由 `inventoryEvent` 支撑的空范围审查，不是单凭空数组推断无任职或无授权。complete 仅证明传入集合覆盖，不证明外部世界不存在遗漏记录。

## 3. Appointment 逐项处置

每个 Appointment 必须为以下一种状态：

- `ended-before-death`：任职结束时点早于死亡时点，保留历史终止事件；
- `closed-by-death`：任职结束时点等于死亡时点，且 `endedBy` 必须等于 DeathRecord.causeEvent；
- `pending`：记录不满足上述可验证条件，不得计入完成。

继续复用 W2-G 的 `validateDeathOfficeAppointmentClosure`，验证死亡时点、任职起止、死亡事件和终止事件时间一致性。任何死亡时仍开放、死亡后结束或死亡时/之后才开始的任职都会阻止准备度通过。

## 4. Authorization 逐项处置

每条 `Authorization` 必须为以下一种状态：

- `inactive-before-death`：有效期终止或撤销时点早于死亡；
- `inactive-at-death`：有效期终止或撤销时点恰为死亡时点；
- `death-gated`：授权在死亡时点仍有效，但 W2-H 的 principal life gate 阻止死者在死亡时点及之后行使；
- `pending`：时间字段、授权校验或来源证据不完整。

规则：

1. 对每条授权继续调用既有 `validateAuthorizationSet`。
2. 授权授予事件必须存在且有可验证事件时点；授权授予事件或 `validFrom` 不得位于死亡时点或之后。
3. 已撤销授权的 `revokedBy` 事件必须存在，且事件时间必须与 `revokedAt` 一致。
4. 对每条授权在死亡时点构造同权限、同范围请求，调用既有 `hasAuthorization`；死者不得通过 principal life gate。
5. `death-gated` 不等于撤销授权。授权原记录保持不变，不自动写入 `revokedBy` / `revokedAt`。
6. 过期、撤销和死亡门禁是不同语义，不能将所有授权统一改写成“已撤销”。

## 5. 验证契约

`validateDeathOfficeInventory(inventory, appointments, authorizations, refs)` 只读验证：

- 死者唯一存在、已死亡且有 DeathRecord；
- 死亡事件与 DeathRecord.causeEvent 一致，事件时间与死亡时点一致；
- inventoryEvent 存在、具有有效时点且不早于死亡；
- 输入 Appointment ID、Authorization ID 唯一；
- inventory entry ID 及被引用的 Appointment / Authorization ID 不重复；
- 每个 Appointment 引用确实属于死者；
- 每个 Authorization 引用确实以死者为 principal；
- complete inventory 精确覆盖输入集合中死者全部 Appointment 与 principal Authorization；
- Appointment 的逐项处置与 W2-G 验证器一致；
- Authorization 的逐项处置与授权有效期、撤销记录和 W2-H principal life gate 一致；
- 缺失、重复、错误人物、错误 principal、未知时间、死亡后授予等问题均显式报告。

## 6. 结算准备度

`isDeathOfficeInventoryReadyForSettlement` 仅在 inventory.status 为 complete、验证问题为空，且：

- 所有 Appointment 均为 `ended-before-death` 或 `closed-by-death`；
- 所有 Authorization 均为 `inactive-before-death`、`inactive-at-death` 或 `death-gated`；

时返回 true。

该准备度不表示职位已补任、Office.holder 已改为 vacant、组织已经完成权力交接，也不表示任何授权被撤销。

## 7. 现有模型边界与不做事项

- 当前 `Authorization` 模型没有独立的授予人 PersonId；本切片只能盘点死者作为 principal 持有的授权，不能从 `grantedBy` 事件反推授权授予人。
- 不推断死者生前是否曾向他人授予授权，不因死者死亡撤销其他人的授权。
- 不修改 `Office.holder`、`Office.validTo`，不自动将职位置为空缺。
- 不自动任命继任者，不复制死者 Appointment、权限或职位。
- 不修改 Appointment / Authorization / Person / DeathRecord / EstateSettlementRef。
- 不创建六域协调器，不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 8. 验收

- Appointment 与 principal Authorization 两个集合分别完整覆盖；
- 空范围必须有 inventoryEvent；
- 死亡前结束、死亡事件关闭、死亡后开放等边界分别测试；
- 活跃授权由死亡门禁阻止行使，但不自动撤销；
- 已过期、已撤销、死亡时点终止和仍有效授权语义互不混淆；
- 错误 principal、缺失引用、重复引用、死亡后授权授予均拒绝；
- 原始 Appointment / Authorization / Office 记录保持不变；
- W1 至 W2-P 全量回归、W2-Q 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
