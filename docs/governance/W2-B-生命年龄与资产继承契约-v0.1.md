# W2-B 生命年龄与资产继承契约 v0.1

状态：W2-B 施工基线；依据产品负责人 2026-11-14 明确确认的两项裁决。
适用基线：W2-A `work/w2-life-lifecycle`。

## 1. 年龄派生

1. Person.birth 仍是出生 WorldTime；Person 不增加可独立写入的 age 数值。
2. 年龄以“已完成的历法周年数”为准，即周岁年粒度。
3. WorldTime 继续使用现有 day + period，不引入第二套游戏时钟。
4. 历法通过 CalendarAdapter 提供：WorldTime → CalendarDate、日期有效性、周年是否已到。
5. CalendarDate 的 yearIndex 只要求在适配器内单调递增；月、日与闰月、置闰、年界规则由具体适配器解释。
6. 本切片不指定公历、农历、年号、朝代纪年，也不假设一年固定天数或固定月数。
7. birth 为 unknown / not-generated / n/a 时，派生年龄保留相同 Field 语义；不得补造年龄。
8. 年龄为投影值，不持久化为独立权威字段；适配器版本变化时可重算。

## 2. 资产继承最小闭环

1. 继承受益人由上层规则/已裁决材料明确指定；本模块不推断亲属、长幼、嫡庶、遗嘱或法定继承顺位。
2. 仅允许转移一项明确指定、属于死者且 transferable=true 的 ownership RightGrant。
3. 转移必须引用死者 DeathRecord.causeEvent、资产 ID、原始权利 grant ID、继承事件 ID、新权利 grant ID。
4. 继承事件必须存在，且不得早于死亡事件时点。
5. 原权利 grant 保留为历史记录，并通过 RightRevocation 引用继承事件撤销；新 grant 复制原 scope / expiry / revocability / transferability，但 holder 改为继承人，grantedBy 指向继承事件。
6. 资产 owner 由有效 ownership grants 派生；不得直接覆盖 owner 绕过权利账。
7. 资产原 custody 不随所有权自动转移；保管权与所有权是不同语义。
8. 原资产、死亡记录与输入引用均不可变；失败返回原资产，不产生部分变更。
9. 单笔资产转移不代表死者全部遗产清点完毕，因此不自动把 DeathRecord 的 asset settlement 标为 settled。资产域的最终结算必须等后续有完整遗产清单与全量处理凭证时另行关闭。

## 3. 明确不在本切片

- 不实现法定继承顺位、遗嘱、遗产分割比例、共有份额、代位继承、无人继承与争产裁决。
- 不自动转移债务，不将继承资产与债务抵销。
- 不结算 office、debt、membership、relation、goal 五域。
- 不实现疾病、衰老数值、医疗效果、寿命概率或死亡 AI 决策。
- 不连接 W3 事件账本、真实存档迁移、G1 运行时或前端 UI。
