# W2-F 死亡结算引用完整性契约 v0.1

状态：W2-F 施工契约；基线为 W2-E `work/w2-e-life-time-boundaries`。
依据：根目录《设计总纲》v0.16 第 3.9、9.4 节，以及《世界生命与自由人生模拟系统设计规范》3.3、9.4、12.2。

## 1. 本切片目标

为死亡记录中的六个结算领域建立统一的引用与时间校验入口，确保死亡事实、结算事件与各领域引用保持可追溯、时间一致。

本切片只校验结算引用包络，不执行任何领域结算，不将 pending 自动改为 settled。

## 2. 六域边界

现有 EstateSettlementDomain 为 office、debt、asset、membership、relation、goal。每域必须由自己的领域规则决定死亡后是终止、结算、转移、保留还是继续存在。

- office：职位空缺、任命终止与授权撤销需分别按制度处理。
- debt：债权债务不因死亡自动免除，也不自动转给继承人。
- asset：单项资产继承不代表全部遗产清点完成；所有权与保管权分离。
- membership：组织成员资格结束需保留历史与来源。
- relation：关系可能终止、休眠或继续影响其他人物，不统一删除。
- goal：目标需按承诺、可继承性和失败条件裁决，不能一律判失败。

## 3. 统一引用校验

新增 `validateDeathSettlementReferences`，校验：
1. 被校验人物处于 dead 且具有 DeathRecord；
2. causeEvent 存在，事件时间有效，并与 DeathRecord.at 一致；
3. 每条 settlementEvent 存在且事件时间有效；
4. settlementEvent 不得早于死亡时点；
5. settlement status 仅允许 pending / settled。

六域完整性（六个领域各一条、无重复）继续由 `validatePersonLifecycle` 校验。

## 4. 不变量与责任边界

- 结算事件可与死亡事件同一时点；不强制六域事件 ID 互异。
- pending 不等于已完成；校验器不推进状态、不产生事件、不改写 Person。
- settled 的领域结果仍必须由对应领域自己的事实、权利链和证据验证；本校验器不能仅凭状态标签证明领域义务已完成。
- 死亡不删除人物、关系、知识、债务或历史；归档状态不等于死亡。
- 事件账本尚未接入；本切片只消费调用方提供的事件 ID 与时间索引，不建立第二套事件事实源。

## 5. 明确不做

不实现遗嘱、法定继承顺位、遗产分割、债务承继规则、家庭扶养/亲属责任模型、遗体处理、未竟承诺执行、职位自动补缺、组织成员自动清理、关系自动删除、目标自动转移、六域执行器、W3 Event Ledger、AI 候选写入、存档迁移、G1 runtime 或 UI。

## 6. 验收

- death cause event 存在且时间与死亡记录一致；
- 六域 settlement event 存在、时间有效且不早于死亡；
- invalid status 被拒绝；
- 非死亡人物与缺失死亡记录被拒绝；
- 校验只读，不产生部分写入；
- W1-A 至 W2-E 回归、W2-F 专项测试、生产构建、Playwright Smoke 与截图归档全部通过。
