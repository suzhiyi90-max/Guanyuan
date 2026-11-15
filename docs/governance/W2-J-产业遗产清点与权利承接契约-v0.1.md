# W2-J 产业遗产清点与权利承接契约 v0.1

状态：W2-J 施工契约；基线为 W2-I \`work/w2-i-debt-death-continuity\`。

## 1. 目标与边界

W2-J 建立死者资产遗产清单、逐项权属分类、处置引用与结清准备度校验。它解决的是“单项继承已发生”与“全部已知遗产已清点并逐项处理”之间的差异。

本契约不推定现实世界不存在未登记资产。inventory.status=complete 是有来源事件支撑的清点完成声明；校验器只能验证调用方提供的资产全集是否被覆盖，不能证明外部未知资产不存在。

## 2. 核心对象

- EstateAssetInventory：deceased、deathEvent、inventoryEvent、status、entries。
- EstateAssetInventoryEntry：资产、死亡时权属分类、死者持有的有效 ownership grant 快照、处置状态、处置事件、单项继承记录引用。
- status：open / complete / challenged。
- ownershipAtDeath：deceased / other / undetermined，由死亡时有效 ownership grants 重算核验。
- disposition：pending / transferred / excluded / disputed。

## 3. 权属判断

1. 只消费 ownership grants；control、handling、disposal 不等于所有权。
2. 权属以死亡时点为准，使用 grant 生效、撤销和 expiry 时间计算；死亡后的变更不能倒灌到死亡时点。
3. 唯一可派生为死者的资产分类为 deceased；明确派生为其他人的为 other。
4. 多权利人、组织持有、权属缺失或其他无法唯一证明的情形均为 undetermined；不得把共有或模糊权属擅自视为死者全有。
5. 每条清单记录必须保存死者在死亡时点有效的 ownership grant ID 快照；快照必须与权利账一致。

## 4. 清单完整性与逐项处置

1. complete 清单必须覆盖调用方提供资产全集中所有 deceased 与 undetermined 资产；undetermined 必须留在清单中等待争议/补证，不可漏掉。
2. other 资产可记录为 excluded，但必须有死亡后处置/核定事件；不得把它列作死者遗产转移。
3. deceased 资产只能通过既有、可验证的 AssetInheritanceTransfer 记录标记 transferred。
4. pending / disputed 不构成结清；undetermined 不构成可结清。
5. 每笔与本死者、该死亡事件相关的单项继承记录必须被清单引用；不得存在孤立转移。
6. 不支持共有份额拆分、估值分配或部分权利转让；当前 RightGrant 没有份额模型，模糊权属必须保持 undetermined。

## 5. 结清准备度

isEstateAssetInventoryReadyForSettlement 仅在清单 status=complete、校验无错误、所有 deceased 项均 transferred、所有 other 项均 excluded、没有 undetermined 项时返回 true。

该函数只返回准备度，不修改 Person.death.estateSettlements，不生成结清事件，也不把 asset 域状态改为 settled。最终结清仍需由后续领域协调器在完整事件账本与其他责任域证据就绪后执行。

## 6. 明确不做

- 不自动选择继承人，不推断亲属、遗嘱、法定顺位或代位继承；
- 不把资产继承与债务抵销，不改写 Debt；
- 不计算资产估值总额、税费、变卖收入、遗产责任上限；
- 不处理共有份额、抵押/担保物优先权、争产裁决、无人继承或放弃继承；
- 不将 custody、control、handling、disposal 转化为 ownership；
- 不自动将死亡记录的 asset settlement 标为 settled；
- 不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 7. 验收

- 死亡人物、死亡记录、死亡事件与时点一致；
- 清点事件存在且不早于死亡；
- 权属分类由死亡时有效 ownership grants 重算；
- 死者权利 grant 快照精确匹配；
- complete 清单覆盖所有已知 deceased / undetermined 资产；
- transferred 必须引用匹配的既有单项继承，excluded 必须有核定事件；
- 重复条目、缺失资产、孤立转移、时间倒置均拒绝；
- 验证失败不产生部分写入，不修改资产或死亡结算状态；
- W1-A 至 W2-I 回归、W2-J 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档全部通过。
