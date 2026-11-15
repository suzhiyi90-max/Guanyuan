# W2-X Asset 死亡结算证据适配契约 v0.1

状态：首轮实现与验收中。Base：`work/w2-w-relation-goal-evidence`。

## 1. 本切片目标

将既有 `EstateAssetInventory` 接入 W2-U 六域类型化证据 envelope。统一证据层只建立资产条目稳定引用与 canonical inventory 的一一映射，不复制产权判断、处置决定或继承结果。

## 2. 适配器契约

- `projectEstateAssetDeathInventoryEvidence` 接收既有 `EstateAssetInventory`，输出 domain=`asset` 的类型化证据。
- evidence 保留 inventory ID、deceased、deathEvent、inventoryEvent、status。
- entries 严格按 canonical `inventory.entries` 原顺序投影原始 `EstateAssetInventoryEntryId`。
- assets 严格按同一顺序投影 `AssetId`；canonical itemRef 为 `asset:<AssetId>`。
- 不排序、不去重、不补造条目；重复、错序和错误引用必须由统一 evidence validator 检出。

## 3. 领域边界

产权与处置语义仍由 `validateEstateAssetInventory` 和 `isEstateAssetInventoryReadyForSettlement` 决定。下列字段只保留在 canonical estate inventory，不复制到统一 evidence：

- `ownershipAtDeath` 与 `sourceOwnershipGrants`；
- `disposition`、`resolutionEvent` 与 `transfer`；
- 继承转移、权利撤销、排除或争议的领域证据。

`complete` 仍只是明确的 inventory attestation，不证明不存在未发现资产。统一 envelope 不将资产清点完成解释为资产全部变现、债务清偿或遗产所有权已转移；也不自动修改 `DeathRecord.estateSettlements`。

## 4. 明确不做

- 不改 Asset、RightGrant、AssetInheritanceTransfer 或 EstateAssetInventory 的领域模型；
- 不改变继承转移验证规则，不绕过 source grant、successor grant、revocation 与事件时间校验；
- 不将 pending/disputed 自动提升为 resolved；
- 不实现六域 coordinator 或统一 settled 状态；
- 不接入 AI、存档迁移、G1 runtime 或 UI。

## 5. 验收

- asset projector 按 canonical 顺序保留稳定 entry ID 与 AssetId；
- exact itemRef mapping 通过，错误引用与错序可检出；
- open/challenged 状态原样保留；
- disposition、ownership 与 transfer 决策不复制、不改写；
- W1—W2-W 全量回归、W2-X 专项、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。

W2-X 完整验收后，才允许启动 W2-Y 六域协调与 settled 语义最终闭环。
