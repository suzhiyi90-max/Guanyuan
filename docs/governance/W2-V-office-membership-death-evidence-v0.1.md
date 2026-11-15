# W2-V Office 与 Membership 死亡结算证据适配契约 v0.1

状态：首轮实现与验收中。Base：`work/w2-u-death-evidence-envelope`。

## 1. 本切片目标

在 W2-U 已验收的六域 typed evidence envelope 上，接入 office 与 membership 两个已有 canonical inventory。只做只读投影与精确映射验证，不改写领域记录，不增加新的死亡处置规则。

## 2. 适配器

- `projectDeathOfficeInventoryEvidence`：从 `DeathOfficeInventory` 投影 appointment 与 authorization 两类引用。entries 顺序固定为 appointments 后 authorizations；itemRef 分别使用 `appointment:<id>`、`authorization:<id>`。
- `projectMembershipDeathInventoryEvidence`：从 `MembershipDeathInventory` 投影 membership 引用；itemRef 使用 `membership:<id>`。
- 两个适配器保留 deceased、deathEvent、inventoryEvent、inventory ID、status 和原 entry ID。
- disposition 只留在 canonical inventory 中，不复制到 envelope。

## 3. 验证边界

统一 validator 负责 envelope/canonical 对齐：身份、状态、事件时间、entry ID 和按序 itemRef 一一对应。领域合法性仍由既有验证器负责：
- office：`validateDeathOfficeInventory` 与 `isDeathOfficeInventoryReadyForSettlement`；
- membership：`validateMembershipDeathInventory` 与 `isMembershipDeathInventoryReadyForSettlement`。

统一层不得把 death-gated 授权解释为撤销，不得把组织成员角色或义务自动转移给继任者。

## 4. 明确不做

- 不实现六域协调器或统一 settled 状态；
- 不修改 Appointment、Authorization、Membership、Office 或 Organization；
- 不推断未提供的 inventory 范围；
- 不将空数组自动解释为已审查的空范围；
- 不接入 W3、AI、存档迁移、G1 runtime 或 UI。

## 5. 验收

- office 两类条目按固定顺序投影，canonical itemRef 错配可检出；
- membership 条目精确投影，错误 membership 引用可检出；
- inventory 身份、状态、entry ID、时间链均由统一 validator 核对；
- open/challenged 状态不得提升为 complete；
- W1—W2-U 全量回归、W2-V 专项、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。

下一切片 W2-W 处理 relation 与 goal；必须等待 W2-V 验收通过后启动。
