# W5-C2B 生成事件选项与 AI 候选运行时接线契约 v0.1

## 1. 定位与依赖

- 基线：W5-C2A `work/w5-c2-ai-candidate-runtime-integration`，验收 SHA `7aca22e79eea9abb86623ad7bdd10384cb306ad1`。
- 本片将已验收的 `dispatchPreviewRuntimeCandidate` 接入 React 游戏 Hook 与生成事件选项交互。
- 本片不改变 W5-C2A 候选协议、冻结 Registry、事实事件 schema、effectCatalog 或 Replay 结算语义。
- PR 必须以 W5-C2A 分支为 base；保持 Draft/Open，不合并。

## 2. Hook 提交边界

`useGuanyuanGame.resolveGeneratedEvent(event, optionId)` 改为异步入口，统一委托 `dispatchGeneratedEventForGame`：

1. 读取当前 runtime session。
2. 调用 `dispatchPreviewRuntimeCandidate`，执行 CandidateLog、可信验证回执、AI 事实追加与 genesis 全量重放。
3. 无论成功或拒绝，都接收服务返回的 session，以保留 CandidateLog 的终局拒绝状态及 request sequence。
4. 只有 `appended` 才向 React state 提交新 projection；`duplicate` 是成功的幂等确认，但保留当前 React projection，不制造无意义的状态替换。
5. `rejected` 必须返回原世界 projection，并携带拒绝原因；不得调用旧式直接 setState 或绕过账本写入。

## 3. UI 交互边界

- 生成事件选项选择改为 await Hook 结果；正式世界事件仍走原同步 `resolveWorldOption` 路径。
- 同一时刻只允许一个事件选项请求在途，避免异步验证期间重复点击形成并发 session 分叉。
- 成功后才关闭事件面板、收起叙事卡并发出成功反馈。
- 拒绝或异常时保持事件面板，不得显示成功文案；向玩家给出简洁、可理解的失败反馈。
- 同候选重试返回 `duplicate`，视为已提交成功，不再次扣时或追加事实。
- 正式世界事件优先级、事件过期、效果可用性和证据引用白名单仍由运行时可信服务验证。

## 4. 专项契约

`dispatchGeneratedEventForGame` 是 Hook 使用的唯一适配器，并由专项测试直接覆盖：

- 有效候选：回执 + 事实追加 + 重放后返回 committed 与新 projection。
- 相同选项重试：返回无拒绝原因的 duplicate 确认；Ledger head 不变，React projection 保持原引用。
- 过期候选或校验拒绝：返回 rejected，旧 projection 引用保持不变，Ledger 不增加事实。
- CandidateLog 验证状态随 session 返回，供运行时继续处理；它不是世界事实。

## 5. 本片不做

- 不把 CandidateLog 持久化到 SavePackage；该能力仍属于后续存档接线。
- 不修改 AI provider、prompt、parser、模型配置或 narrative store。
- 不改正式世界事件结算、玩家命令、日程推进、效果成本或世界事实模型。
- 不合并 PR，不修改 main。

## 6. 验收门槛

- W1—W5-C2A 全量既有回归通过。
- 新增 generated-event hook adapter 专项测试通过。
- Review index、Patch whitespace、Production build 通过。
- Playwright Smoke 全量通过，双侧截图归档可用。
- Push 与 PR CI 必须针对同一最新 head SHA 且均成功。
- PR 保持 Draft/Open，base 精确指向 W5-C2A。
