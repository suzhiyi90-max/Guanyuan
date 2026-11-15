# W5-C2A 预览运行时 AI 候选提交内核 v0.1

## 1. 定位

- 基线：W5-C1 `work/w5-c-runtime-command-orchestration`，验收 SHA `832f94969cc652de9a9368e7871983bfd3e2e43c`。
- 本片只建立 AI 生成事件选项从账外候选到同一 EventStream 的可信服务路径；不接入 UI hook。
- 后续 W5-C2B 才将 UI 的 `resolveGeneratedEvent` 接入本服务并完成端到端 Smoke。
- Registry 版本由 `0.1.0` 升至 `0.2.0`，新增有限 preview kind `ai.generated-event.resolved`；不冻结 Q17 全目录。

## 2. 候选载荷

玩家选定一个已通过 narrative parser 的 GeneratedEvent option 后，服务构造账外候选：
- `generatedEventId`
- `optionId`
- `effect`（仅允许本地 effectCatalog 中登记且当前可用的效果）
- `result`（AI 措辞，长度 1–140）
- `refs`（最多四个，必须来自 evidenceIds 白名单）

候选 targetKind 固定为 `ai.generated-event.resolved`。payload 通过 W3-D canonical digest 与冻结 Registry schema 双重校验。CandidateLog 只在内存 session 中保存，不是世界事实，不进入 Ledger。

## 3. 原子提交流程

`GeneratedEvent → CandidateLog.pending → frozen Registry + local effect rule validation → candidate.validated receipt → ai-candidate fact → full genesis replay → immutable projection`

- receipt 的 source 固定为 `rule`，事实 source 固定为 `ai-candidate`。
- fact 的 candidateRef 与 validationRef 必须引用同一 Ledger 中更早的回执。
- 所有 append 都先在局部不可变 Ledger 快照上准备；只有完整重放成功，才替换 session 的 Ledger、CandidateLog 与 projection。
- schema/效果/凭据验证失败时，不追加 receipt 或 fact；账本拒绝、摘要不可用或 replay 失败时，旧 session 不变。
- 正式世界事件待决期间 AI 候选不得抢占。
- 同一 generatedEventId + optionId 使用稳定 CandidateId 与 clientRequestId；相同请求重试返回 duplicate，不追加第二条事实。
- 不同 option 对同一 generatedEventId 不可重复结算。

## 4. Replay

`candidate.validated` 仍是内置账本控制事件，作为 no-op 进入 preview replay。
`ai.generated-event.resolved` reducer 通过既有 `executeCommand(kind='generated')` 与本地 effectCatalog 结算，继续复用行动成本、效果可用性和 handledEvents 语义；不复制另一套结算器。

## 5. 本片不做

- 不接入 React hook / UI 选择按钮。
- 不持久化 CandidateLog；刷新后账外候选丢失是预期边界。
- 不实现 SaveRepository、AI 模型调用、prompt/parser 改造或 Q13/Q17 正式目录冻结。
- 不允许 AI 直接创建 validation receipt 或指定事实提交引用。

## 6. 验收

- candidate pending→validated，receipt 与事实事件在同一 Ledger 且顺序正确。
- 同请求重试 duplicate；不产生重复事实。
- 未登记效果、不可用效果、无效凭据引用、过期事件、正式世界事件待决均拒绝且不写账本。
- Replay 使用本地 effectCatalog 产生既有状态结果；replay 失败不得提交 Ledger 或 projection。
- W1—W5-C1 全量回归、C2A 专项、Review index、Patch whitespace、Production build、Smoke、双 CI 同 SHA 与双侧归档全通过。
