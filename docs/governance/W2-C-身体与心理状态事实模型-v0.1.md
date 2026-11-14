# W2-C 身体与心理状态事实模型 v0.1

状态：W2-C 施工契约；遵循 v0.16 总纲与《世界生命、全人物状态与自由人生模拟系统设计规范》。
基线：W2-B 年龄派生与资产继承。

## 1. 目标与边界

建立 Body/Mind 状态的结构化事实记录，解决 W2-A 仅有通用 hook、尚无状态事实模型的问题。此切片只负责数据契约、来源/时序/可见性验证、追加与当前投影，不计算身体或心理效果。

## 2. 状态域

Body 与 Mind 是两个独立 scope：
- Body 维度开放扩展，基础目录包括体质、健康、体力、疲劳、伤害、慢性问题、残疾、营养、恢复、感官与衰老影响。
- Mind 维度开放扩展，基础目录包括情绪、压力、恐惧、欲望、执念、心理负荷与应对方式。
- 维度 code 可扩展；不在本切片冻结疾病目录、心理诊断目录或具体玩法枚举。

## 3. 状态值

- qualitative：定性代码。
- classified：分类代码及可选说明。
- quantitative：数值、显式 scale ID 与单位 Field。
- quantitative 不设统一数值上下限；范围、单位换算、平衡参数由后续具体 scale 规范定义。
- unknown / not-generated / n/a 保持 Field 语义，不用 0、空字符串或 null 代替。

## 4. 来源与历史

每条 LifeStateFact 必须包含 Person、domain、scope、dimension、sourceEvent、at、value、visibility、supersedes。
- sourceEvent 必须存在，且事件时间与事实时间一致。
- Body fact 只能引用 Person.stateDomains.body；Mind fact 只能引用 mind。
- 首次记录的 supersedes 必须为 n/a；unknown / not-generated 不代表“确认没有前序记录”，因此拒绝作为根记录。
- 更新必须明确引用同一人物、同一 domain/scope/dimension 的前一记录。
- 一个前序事实最多被后续记录替代一次；修订时间必须严格晚于前序事实。
- 同一人物、同一状态维度只能有一条根记录；后续事实必须沿 supersedes 链追加。
- 历史记录只追加，不覆盖。失败追加返回原数组。
- 当前状态由未被 supersede 的事实投影，不另存第二份权威 current state。

## 5. 生命周期与信息边界

- 死亡时点及之前的状态事实可保留；严格晚于死亡时点的普通 Body/Mind 状态事实拒绝。
- 每条记录具有独立 Visibility；不得默认公开给玩家或其他人物。
- 状态事实不是人物认知，不自动广播给任何 holder。
- 状态事实不等于已验证医疗诊断；AI 不得直接写入事实。

## 6. 明确不做

- 不实现疾病/伤病目录、诊断、治疗、恢复效果、衰老曲线、寿命风险或死亡概率。
- 不确定任何数值范围、单位换算、状态变化速率、疲劳/压力公式。
- 不接 W3 Event Ledger、AI 候选提交、存档迁移、G1 运行时或 UI。
