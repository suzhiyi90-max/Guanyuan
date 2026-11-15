# W3-D AI 候选验证回执与事实提交门禁 v0.1

## 1. 目标与边界

本切片建立 AI 候选进入事实账本的确定性门禁。AI 输出永远先是账本外候选；只有可信规则验证器通过 frozen Event Registry 的 schema 校验、规范化摘要核验后，才允许产生 `candidate.validated` 系统控制事件。事实事件必须引用同一账本中更早的验证回执。

本片不注册任何 Q17 业务 EventKind，不裁决 Q13 RuleRef，不做 W3-E replay/projection，不做 W4 schema migration/upcaster。

## 2. 候选生命周期

`CandidateLog` 是账本外候选工作区，不是世界事实：

- 候选只允许以 `pending` 状态提交。
- `pending → validated` 或 `pending → rejected` 各只能发生一次。
- `validated` 与 `rejected` 均为终态；不得再次验证、拒绝或改写。
- rejected 只产生账本外 `CandidateRejectionRecord`，不追加 Event。
- 候选 ID 不可复用；重新生成候选必须使用新 ID。
- 候选原文与 payload 保留在账本外；账本仅记录经过验证的控制回执和后续事实事件。

## 3. Canonical digest

算法标识固定为 `sha-256/canonical-json-v1`。

摘要输入为规范化 JSON：

```json
{
  "targetKind": "<candidate target kind>",
  "registryVersion": "<frozen registry version>",
  "payload": {}
}
```

规范化规则：

- 对象键按 Unicode 字符串升序排列。
- 数组保持原始顺序。
- 字符串与布尔值使用 JSON 编码；数值必须有限，`-0` 规范为 `0`。
- 不允许 undefined、函数、BigInt、循环引用、非普通对象或非 JSON 值。
- UTF-8 编码后计算 SHA-256；输出 `sha256:<64 lowercase hex>`。

## 4. candidate.validated 回执

验证成功时由可信规则执行器追加唯一的 `candidate.validated` 控制事件，source 固定为 `rule`。回执 payload 包含：

- candidate：候选稳定 ID
- targetKind：候选目标事件类型
- candidatePayload：待提交 payload 的不可变快照
- payloadDigest：规范摘要
- digestAlgorithm：固定算法标识
- registryVersion：实际执行的 frozen Registry 版本
- validatedBy：非空规则验证器标识

通用 append API 拒绝直接创建保留 kind `candidate.validated`；专用验证回执入口由可信 orchestration 调用，AI 不得获得或调用该能力。

## 5. AI 事实事件提交门禁

`source='ai-candidate'` 的事实事件必须同时满足：

1. candidateRef 与 validationRef 均存在。
2. validationRef 指向同一 EventLedger 中更早的 `candidate.validated` 事件。
3. 回执 candidate、targetKind、candidatePayload 与本次提交一致。
4. digestAlgorithm 与 payloadDigest 完全匹配。
5. Registry 当前 frozen，registryVersion 与候选及回执一致。
6. 领域 schema 在验证时和事实提交时均重新校验通过。
7. 候选状态为 validated，且未被 rejected。
8. 提交事实必须使用候选原 payload，不得在事实提交时偷偷替换内容。

AI 不能生成、伪造或自证 validationRef。验证失败不追加事实事件；事实提交后不得追溯删除，纠错应追加补偿事实事件。

## 6. 原子性与幂等

- 验证回执是 append-only 控制事件；验证成功后才将账外 CandidateLog 转为 validated。
- 事实事件追加继续复用 Event Ledger 的世界级幂等机制。
- 同一候选的事实事件使用稳定 clientRequestId；重试返回 duplicate，不追加第二条事实。
- ledger 拒绝时，原账本快照不变；不得把 CandidateLog 标为 validated。
- rejected 候选只写账外 rejection record，不产生账本事件。

## 7. 验收覆盖

- frozen Registry 才能验证；版本不一致拒绝。
- schema unknown / invalid / validator 异常均不得产生回执。
- digest 对象键顺序稳定；算法与 provenance 字段精确。
- 通用 append 不能伪造 `candidate.validated`。
- pending / rejected 候选不能提交事实。
- AI 事实缺 candidateRef / validationRef、引用错误回执、payload 不一致或 schema 失效时拒绝。
- validated 事实提交后具有 candidateRef / validationRef，且回执位于其前序账本位置。
- 终态不可逆；重复请求不重复追加。
- W1—W3-C 全量回归、W3-D 专项测试、Review index、Patch whitespace、Production build、Playwright Smoke、截图归档和 Push/PR 双 CI 均在最新 SHA 通过。

## 8. 明确不做

- 不冻结 Q17 领域 kind / payload 联合目录。
- 不引入 Q13 RuleRef / RuleRegistry。
- 不把 AI 候选原文存入 Event Ledger。
- 不将 CandidateLog 当作世界事实或持久化快照。
- 不实现快照、增量存档、重放投影或 schema upcaster。
