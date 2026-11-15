# W3-E 事件重放与只读投影基础契约 v0.1

## 1. 定位与依赖

- 基线：W3-D `work/w3-d-ai-candidate-validation-receipts`，验收提交 `d23698b89cf0fa9a70ff40ecef706d0ba8df4949`。
- 本片建立 EventStream 的确定性重放内核与只读 Projection 重建边界。
- EventStream 是事实历史唯一权威；重放状态、Projection 均为派生值，不得反向成为事实源。
- 本片不冻结 Q17 领域事件目录；所有业务事件必须由调用方提供 frozen EventRegistry/schema 验证能力。

## 2. 重放输入与区间

- 全量重放以 genesis 为起点，首个事件 seq=1。
- 区间重放采用 `(fromExclusive,toInclusive]`；输入事件必须恰好覆盖该区间，不允许缺号、多带、重复、乱序。
- 事件必须属于同一 WorldId；seq 必须连续；EventId 必须与 Ledger 分配规则 `evt:{worldId}:{seq}` 对应。
- cursor 不得只靠 seq 猜测：event cursor 的 seq 与 eventId 必须同时匹配实际事件；genesis 仅允许 seq=0，不拥有 EventId。
- 空区间允许 from/to cursor 相同且事件数组为空；全量空流允许 genesis→genesis。
- 重放输出 cursor 必须精确指向最后一个已消费事件；空流输出 genesis。

## 3. 事件校验顺序

1. 校验 worldId、区间边界与事件数量/连续性。
2. 校验每个事件的 worldId、seq、eventId、来源元数据基本结构。
3. 对普通领域事件使用对应 frozen EventRegistry 验证 payload；Registry 未冻结、kind 未登记、payload 不合法或 validator 抛错，均拒绝。
4. `candidate.validated` 是账本内置系统控制事件，使用独立固定协议校验，不要求登记到 Q17 业务 Registry；必须 source=rule，payload 字段完整且 digest/算法标签格式有效。
5. 所有事件预检通过后才开始 reducer；不得静默跳过非法事件。

## 4. Reducer 与原子失败

- Reducer 是确定性纯变换：输入为只读前态与只读事件，输出新状态；不得修改输入、写 Ledger、访问 UI/存储/网络或产生随机/时间副作用。
- 重放只通过传入的 reducer 执行，不在 Ledger 模块内 import 领域模块；静态依赖保持单向无环。
- reducer 抛错时返回带 seq/eventId 的失败结果，不返回可被误用的部分状态。
- 同一初始状态、同一事件区间、同一 reducer 版本必须得到相同状态和 cursor。
- 运行时不能证明任意 JavaScript 闭包无副作用；以纯函数签名、冻结输入、不可变结果、隔离依赖与测试共同约束。

## 5. Projection 零写入边界

- Projection 只能消费 EventStream（或只读重放结果）并生成派生视图。
- Projection API 不接收 append/command/persistence 写入能力；不得修改 Event、Ledger、领域事实、CandidateLog 或其他 Projection。
- Projection 重建必须可从 genesis 或明确检查点之后的连续事件段重建，并返回对应 cursor。
- Projection 的事件处理器必须确定性；同输入重建结果一致。
- 视图对象及其嵌套数据应不可变；Projection 不得被当作事实写入接口。
- 旧 G1 的 `verdictOf`、`goalReckoningOf` 仍是旧 GameState 派生，不得宣称已接入正式 EventStream。

## 6. 与 W4/W5 的边界

- 本片不定义 WorldSnapshot/SavePackage 的持久化格式，不做 checksum、全量/增量包链、schema migration 或 event upcaster；这些归 W4。
- 本片可提供内存中的初始状态/检查点输入接口，但不负责其序列化、加载、迁移或可信校验。
- 不改 React、useGame、localStorage、旧 G1 运行态；正式 Adapter 接入归 W5。
- 不引入数据库、网络事件总线或后台持久化服务。

## 7. 最低测试矩阵

- genesis 空流、单事件、多事件全量重放。
- 有效区间、空区间、检查点后续区间及 cursor/eventId 对齐。
- 缺号、重复、乱序、多带事件、错误 worldId、错误 eventId、错误 seq。
- 未冻结 Registry、未知 kind、非法 payload、validator throw。
- 合法/伪造/字段缺失的 candidate.validated 控制事件。
- reducer throw、前态不可变、事件不可变、失败不暴露部分状态。
- 同输入重放/Projection 多次结果一致。
- Projection 无 Ledger 写入能力，且不得修改源事件或源状态。

## 8. 验收门槛

W1—W3-D 全量回归、W3-E 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke、Push/PR 双 CI 对应同一最新 SHA 且均成功；两套 Smoke 截图归档均存在且未过期。PR Draft/Open，不合并。
