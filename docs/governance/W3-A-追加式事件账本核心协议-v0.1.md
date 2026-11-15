# W3-A 追加式事件账本核心协议 v0.1

## 1. 施工定位

- 基线：`work/w2-y-death-settlement-coordinator`，提交 `9ad44eb33bc301bd14028c9b8b858d62198f49ee`。
- 本片：`work/w3-a-append-only-event-ledger`。
- 目标：建立世界作用域、连续序号、不可变追加、幂等重试和区间读取的最小账本内核。
- 本片不把原型 `GameState` 迁入账本，不改 UI、存档格式或现有命令结算。

## 2. 已冻结的内核不变量

1. 每个 EventLedger 只属于一个 WorldId；跨世界的相同 clientRequestId 不构成重复。
2. 新流从 genesis/head=0 开始；每次成功 append 分配 seq=head+1，序号严格连续。
3. EventId 由 Ledger 分配，客户端不能提交 EventId 或 seq；当前内存实现采用 `evt:{worldId}:{seq}`。
4. 已提交事件及其 JSON payload 深度冻结；追加返回新 Ledger，不修改旧快照。
5. 幂等身份由 worldId、source、intentKind、actor、requestWorldTime、clientRequestId 共同决定。
6. 相同幂等身份与相同 kind/payload 返回 duplicate，不增加事件；相同身份却改变 kind/payload 返回 idempotency-conflict。
7. commit time 不得早于 request time；时间必须通过既有 WorldTime 校验。
8. 区间读取采用 `(fromExclusive,toInclusive]`，并校验边界为有效连续序号。

## 3. 与未决裁决的隔离

- Q13 RuleRef 的最终机器绑定方式未裁决；本片不创建 RuleRegistry，不伪造 RuleRef。
- Q17 领域 EventKind/payload 目录未冻结；本片的泛型 Kind 仅是内核承载类型，不是已批准的业务事件目录。
- 本片仅允许 `player-command | rule | schedule` 三类非 AI 入口；不提供 `ai-candidate` 直接 append 通道。
- `candidate.validated`、CandidateLog、SHA-256/canonical-json-v1、AI 事实事件二次验证由后续 W3-D 实现；当前 canonical JSON 仅用于内存幂等比较，不作为持久化 digest。
- Snapshot、SavePackage、checksum、迁移和 upcaster 属 W4；本片的区间读取不是存档恢复实现。

## 4. 文件交付

- `app/src/domain/event-ledger.ts`：纯函数内核、世界作用域、追加、幂等、区间读取。
- `app/src/domain/event-ledger-test.ts`：运行时与原子性契约测试。
- `app/scripts/event-ledger-test.ts`：测试入口。
- `app/src/domain/index.ts`：导出账本内核。
- `.github/workflows/g1-7-acceptance.yml`：把本施工分支纳入 Push/PR 双 CI。
- `app/package.json`：增加专项测试命令。

## 5. 验收门槛

- 既有 W1—W2 全量回归不退化。
- 专项覆盖：首次 append、连续序号、跨世界幂等隔离、同请求重复、同 key 不同 payload 冲突、时间倒置、非法 JSON、循环 payload、深度冻结、区间边界、旧快照不变。
- Review index、Patch whitespace、Production build、Playwright smoke 与截图归档均通过。
- Push 与 PR 两套 CI 必须在同一最新 head SHA 上全部成功。
- PR 保持 Draft/Open，不合并。

## 6. 明确不在本片范围

不创建领域 EventRegistry，不冻结 13 个业务事件 kind，不实现 AI 候选验证/提交，不改现有 GameState、commands、useGame、localStorage 存档，不实现 snapshot/save package/replay，不引入数据库或持久化适配器。
