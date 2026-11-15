# W3-C 命令请求身份与账本幂等契约 v0.1

## 1. 目标

本切片修正 Event Ledger 对玩家命令重试的身份判定：同一客户端请求在世界时钟推进后重试，仍必须识别为同一请求；请求内容发生变化时必须返回幂等冲突，不能追加第二条事实。

## 2. 请求身份

幂等键由以下字段组成，并按规范 JSON 编码：

- worldId
- source
- intentKind
- actor
- clientRequestId

其中 clientRequestId 必须由命令发起端为一次用户命令生成，并在该请求的所有网络/执行重试中保持不变。

以下字段不属于请求身份：

- requestWorldTime
- committedAt

requestWorldTime 是请求内容的一部分；committedAt 是本次成功提交的世界时间。二者均不能使同一 clientRequestId 变成另一条请求。

## 3. 请求指纹

请求指纹包含：

- requestWorldTime.day
- requestWorldTime.period
- kind
- payload

因此：

- 相同幂等键、相同指纹：返回 duplicate，原账本引用不变，不追加事件。
- 相同幂等键、不同指纹：返回 idempotency-conflict，原账本引用不变，不追加事件。
- 不同 worldId：幂等空间隔离，可使用相同 clientRequestId。
- 仅 committedAt 改变：仍为 duplicate。
- requestWorldTime 改变：视为同一请求内容被篡改/重用，返回 idempotency-conflict。

## 4. 原子性与唯一写入入口

appendLedgerEvent 仍是唯一事件追加入口。duplicate、idempotency-conflict、rejected 均不得产生新事件或改变账本快照。命令成本与领域结算不能在 append 成功前对外提交。

本切片只固化通用命令请求身份与账本幂等内核，不把当前预览态 GameState 伪装成持久化领域投影。

## 5. 与后续切片的边界

当前 useGame 预览态没有稳定的 WorldId、持久化 EventLedger 和已裁决的 Q17 领域 EventKind 映射。此时直接将按钮命令写入账本会臆造领域事实类型，或产生账本与 GameState 双写不原子的状态。

因此，本切片不改 useGame 的存档结构，不定义 Q17 领域 kind，不实现投影重放。后续在 EventKind / payload 与 Projection 契约具备后，再由 W3-E/W5 接入正式命令协调层。W3-D 仍负责 AI candidate receipt 与 AI 事实提交门禁。

## 6. 验收要求

- 同 worldId/source/intentKind/actor/clientRequestId，重试时 committedAt 改变仍返回 duplicate。
- 同幂等键但 requestWorldTime、kind 或 payload 改变，返回 idempotency-conflict。
- 不同 worldId 的相同 clientRequestId 不互相冲突。
- duplicate/conflict/rejected 均不追加事件。
- Event Ledger 原有连续序号、不可变快照、输入校验和读取区间回归全绿。
- Review index、Patch whitespace、Production build、Playwright Smoke、截图归档与 Push/PR 双 CI 在最新 SHA 全部通过。
