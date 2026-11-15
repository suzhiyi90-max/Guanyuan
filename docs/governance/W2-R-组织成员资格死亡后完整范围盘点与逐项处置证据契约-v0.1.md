# W2-R 组织成员资格死亡后完整范围盘点与逐项处置证据契约 v0.1

状态：施工契约；基线为 W2-Q `work/w2-q-office-death-inventory`。
目标：补齐 W2-K 对传入 Membership 逐条验证、但无法证明人物成员资格集合完整的缺口。

## 1. 范围

本切片覆盖死者作为成员主体的全部 `Membership` 记录，跨组织、跨角色、跨历史区间盘点。组织成员资格是人物与组织之间的独立事实，不从人物身份、官职、亲属、派系或关系推断成员资格。

范围声明绑定：
- deceased PersonId；
- deathEvent；
- inventoryEvent 及事件时点；
- 稳定 MembershipId 集合；
- 每项成员资格的处置状态；
- 完整性状态。

`complete` 只表示调用方声明已覆盖传入的完整 Membership 集合，不证明外部世界不存在未登记或未传入的成员资格。空的 complete inventory 必须有可验证的 inventoryEvent，代表有依据的空范围审查。

## 2. 逐项处置

每条成员资格使用以下处置之一：

- `ended-before-death`：成员资格有效终点严格早于死亡时点，保留原始终止事件；
- `closed-by-death`：成员资格在死亡前有效，并由 DeathRecord.causeEvent 在死亡时点关闭；
- `pending`：起止事件、时间、死亡关闭或引用证据不足，不能视为完成。

不得把死亡后才结束的成员资格、死亡时仍开放的成员资格或死亡时点新开始的成员资格计入已完成处置。

## 3. 显式组织侧交接

复用 W2-K `MembershipDeathHandoff`：
- sourceMembership 必须属于死者，且由死亡事件关闭；
- successorMembership 必须是同一组织中的独立新记录；
- handoffEvent 必须严格晚于死亡；
- successor Membership 的 validFrom 与 sourceEvent 均须等于 handoffEvent；
- successor 人物必须在交接时点存活；
- 新成员的 role 与 obligations 在 successor Membership 上独立声明，不复制或继承死者字段。

交接是组织侧新建成员资格，不等于继承原成员资格、财产、投票权、职位、债务或私人义务。未发生交接不代表死亡成员资格未完成处置；死亡关闭本身可以成立。

## 4. 验证器

新增：
- `validateMembershipDeathInventory(inventory, memberships, handoffs, persons, refs)`
- `isMembershipDeathInventoryReadyForSettlement(inventory, validationIssues)`

只读验证包括：
- 死者唯一存在、已死亡且有 DeathRecord；
- deathEvent 与 DeathRecord.causeEvent 一致，事件时间与死亡时点一致；
- inventoryEvent 存在、时点有效且不早于死亡；
- 输入 Membership ID 唯一；
- inventory entry ID 与 Membership 引用唯一；
- 每条 entry 指向真实存在且属于死者的 Membership；
- complete inventory 精确覆盖传入集合中死者的全部 Membership；
- 每条逐项处置与 Membership 有效区间、死亡事件身份和 W2-K 连续性验证一致；
- 每条交接通过 W2-K 验证，且其 sourceMembership 必须出现在 inventory 并标记为 closed-by-death；
- 缺失、重复、跨人物引用、遗漏、未决处置及错误事件时点显式报错。

准备度仅在 status 为 complete、校验无错误且每项为 ended-before-death 或 closed-by-death 时成立。任何 pending、open 或 challenged 均不能成为 settled 的依据。

## 5. 不做事项与边界

- 不修改 Membership、Organization、Person、DeathRecord 或 EstateSettlementRef；
- 不自动关闭成员资格、不自动创建继任者、不自动复制 role / obligations；
- 不解散组织，不转移职位、投票权、财产、债务或私人义务；
- 不推断继承关系、组织法定继任或组织规则之外的法律效果；
- 不创建六域协调器，不接 W3 Event Ledger、AI 写入、存档迁移、G1 runtime 或 UI。

## 6. 验收门槛

- 完整覆盖跨组织的死者 Membership 集合；
- 明确区分死亡前结束、死亡事件关闭和待处理；
- 空范围有来源事件，空数组不自动证明完整；
- 交接引用与死亡成员资格范围一致；
- 继任成员资格为独立记录且字段独立声明；
- 失败只读，不修改任何源记录；
- W1 至 W2-Q 全量领域回归、W2-R 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke 和截图归档全部通过。
