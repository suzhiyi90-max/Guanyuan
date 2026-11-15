# W2-H 授权主体死亡后的行使门禁契约 v0.1

状态：W2-H 施工契约；基线为 W2-G `work/w2-g-office-death-handoff`。
依据：根目录《设计总纲》v0.16 的权力/身份/授权规则、人物生命规则；《世界生命与自由人生模拟系统设计规范》3.3、7.3、9.2、12.2。

## 1. 本切片目标

在既有 Authorization 默认拒绝规则上，补充授权行使主体的生命状态门禁。授权记录仍是独立权利记录；人物死亡不删除授权历史、不伪造撤销事件，也不把死亡与归档混为一谈。

## 2. 核心裁决

1. **授权行使者死亡：** principal 在死亡时点及之后不得行使任何授权，不因授权 scope 是 world、institution、office 或 person 而例外。
2. **死亡时点边界：** 以 `DeathRecord.at` 为界，`request.at < death.at` 可进行历史授权判断；`request.at >= death.at` 一律拒绝。死亡时点本身不允许继续行使权力。
3. **历史重放：** 当前 Person 投影为 dead，但请求时点早于有效死亡记录时，允许按历史时点判断；不能用当前 dead 标签抹掉死亡前合法行动。
4. **出生边界：** 已知出生时点不得早于出生时点行使授权；无效出生时点 fail-closed。未知/未生成/不适用不补造出生日期。
5. **数据缺失与冲突：** principal 记录缺失、重复，dead 却无死亡记录，alive 却带死亡记录，或死亡时点无效，均 fail-closed。
6. **归档不是死亡：** archived 的存活人物不因归档状态被拒绝；archiveState 不参与授权行使资格。
7. **授权有效期和撤销规则不变：** validFrom、validTo、revocable、revokedBy、revokedAt 继续按既有规则判断；死亡门禁不写入 revokedBy/revokedAt。
8. **作用域不被死亡自动清理：** 授权 scope 为 office/institution/world 时，人物死亡不自动注销相应实体或范围；scope 为 person 时，目标人物死亡也不由本切片自动撤销授权，目标可否接受具体动作由动作/领域规则另行判定。

## 3. 授予者死亡边界

现有 Authorization 只有 `grantedBy: EventId`，没有可直接解析的 grantor PersonId，也没有事件参与者索引。不得从事件 ID、scope 或 principal 猜测授予者身份。

因此，本切片不因授予者死亡自动撤销其生前授出的授权。授权继续受自身有效期、显式撤销记录和后续制度事件约束。若未来需要“授予机关/授予者死亡或失去职位后，授权是否继续”的制度规则，必须依赖可验证的事件参与者与授权来源主体模型，另立切片裁决；不得借用 revoked 字段制造伪撤销。

## 4. 实现边界

- `hasAuthorization` 必须同时取得权威 Person 记录；找不到唯一 principal 记录时默认拒绝。
- 授权校验按请求时点判断生命状态，支持死亡前历史重放。
- 不修改 Authorization 数据结构，不添加猜测性的 grantor 字段。
- 不自动撤销不可撤销授权，不改变授权授予/撤销事件，不清理 Office、Organization 或 Person scope。
- 不实现职位继任、机构存续、组织授权承继或具体动作的目标存活规则。
- 不接 W3 Event Ledger、AI 候选写入、存档迁移、G1 runtime 或 UI。

## 5. 验收

- 存活 principal 可按既有 grant 规则获得授权；
- 死亡时点与死亡后均拒绝；
- 死亡前历史时点仍可正确判定；
- 缺失/重复/冲突/无效生命记录 fail-closed；
- 出生前拒绝，归档但存活不误拒；
- world 与 person scope 均不绕过 principal 死亡门禁；
- 目标人物死亡不被误当作授予者/行使者死亡；
- 显式撤销和不可撤销规则不被破坏；
- W1-A 至 W2-G 回归、W2-H 专项测试、生产构建、Playwright Smoke 与截图归档全部通过。
