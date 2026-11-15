# W2-S 人物关系域死亡后完整范围盘点与逐项处置证据契约 v0.1

状态：施工契约；基线为 W2-R `work/w2-r-membership-death-inventory`。

## 1. 目标与范围

补齐 W2-L 对单条 Relation / 死者端点进行处置验证、但不能证明某一死者关联关系集合完整的缺口。

盘点对象是输入集合中所有以死者为 from 或 to 端点的 Relation，按 RelationId 区分，不按人物对去重。必须保留有向关系、多重关系和开放关系类型码。每条关系只对当前 inventory 的死者端点作一项记录；同一关系的另一端若也已死亡，其死亡处置仍须作为独立 RelationDeathDisposition 提供并通过 W2-L 验证。

## 2. 逐项结果

- `ended-before-death`：关系有效终点严格早于当前死者死亡时点，保留原始终止事件，不需要该端点的死亡处置。
- `preserved`：关系在死亡时仍有效，且 W2-L 存在匹配的 preserved 处置。
- `ended`：关系在死亡时仍有效，且 W2-L 存在匹配的 ended 处置；Relation 必须以该死亡事件结束并标记 severed。
- `pending`：关系起止事件、时间、端点、死亡处置或证据不足，不能计为完成。

死亡时仍有效的关系不得缺少处置。关系在死亡后仍延续时必须 preserved；在死亡事件终止时必须 ended。死亡前已结束的关系不应伪造死亡处置。关系起点等于或晚于死者死亡时点属于无效/待审记录，不得作为已完成关系事实。

## 3. 双端死亡与时间顺序

同一 Relation 的 from / to 两端可以在不同时间死亡。先死亡一端可以 preserved，后死亡一端再独立 ended；若先死亡时已 ended，则后续端点不得再获得新的有效关系处置。W2-S 只盘点当前 deceased 的端点；调用方必须为同一相关关系集合中的其他已死亡端点提供其独立处置，供 W2-L 验证完整时间链。

## 4. 完整性与验证

新增 RelationDeathInventory，绑定 deceased、deathEvent、inventoryEvent、status 和逐项关系条目。

新增：
- `validateRelationDeathInventory(inventory, relations, dispositions, persons, refs)`
- `isRelationDeathInventoryReadyForSettlement(inventory, validationIssues)`

complete 必须精确覆盖输入集合中所有以 deceased 为任一端点的 RelationId；同一对人物之间的多条不同 Relation 不得合并。空 complete inventory 必须有可验证且不早于死亡的 inventoryEvent，代表显式空范围审查。complete 仅证明调用方声明的输入集合，不证明现实中不存在未登记关系。

统一层负责身份、死亡事件、review event、输入集合覆盖、重复 ID、端点归属、逐项结果与 W2-L disposition 对位；关系生命周期和双端死亡规则继续由 W2-L 验证器裁决。对同一关系的其他死亡端点，必须提供独立处置证据。

ready 仅在 status=complete、全部验证无 issue、每项均为 ended-before-death / preserved / ended 时成立。open、challenged、pending 均不得作为 settled 依据。

## 5. 不做事项

- 不修改 Relation、RelationClaim、RelationEvidence 或 Person。
- 不将有向关系改成对称关系，不合并多重关系。
- 不从亲属、婚姻、师生、同年、同乡、仇怨、派系或组织关系推断继承、债务、婚姻终止、宽恕、恩怨消失或法律责任。
- 不因 preserved 推断死者仍能行动、回应或履行义务。
- 不自动创建继任关系，不转移财产、债务、职位、Membership 或私人义务。
- 不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 6. 验收门槛

- 精确覆盖死者作为任一端点的全部输入 Relation。
- 有向边、多重边、开放类型码保持不变。
- 区分死亡前结束、保留、死亡终止、待处理。
- 同一关系双端先后死亡的独立处置与终止顺序正确。
- 空范围必须有来源事件；缺失、重复、跨人物和遗漏显式报错。
- W2-L 逐项处置规则仍是权威裁决，不被 W2-S 覆盖。
- 只读验证，不修改关系源记录。
- W1 至 W2-R 全量回归、W2-S 专项、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
