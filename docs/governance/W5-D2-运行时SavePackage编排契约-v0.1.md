# W5-D2 运行时 SavePackage 编排契约 v0.1

## 1. 施工定位

- 基线：W5-D1 `work/w5-d1-indexeddb-save-repository`，验收 SHA `e7a1539d9cade2355ab24be25adcf74302f5d285`。
- 本片把不可变运行时 session / EventLedger 转换为已验证的 Full 或 Incremental SavePackage，并经 SaveRepository CAS 提交。
- 本片不接入 UI 自动保存、不执行启动恢复、不改变玩家世界事实，也不读取、覆盖或删除旧 `guanyuan.save.v1`。
- PR base 必须为 W5-D1；保持 Draft/Open，不合并。

## 2. 唯一数据来源

- 当前运行时 session 的 `worldId`、`ledger`、`state` 是本次保存的输入。
- 事件区间只能通过 `readLedgerEvents` 从现有 EventLedger 读取；不得从 React state、UI 文案或 AI 输出重建事件。
- Snapshot 是当前确定性 replay 投影的派生检查点，不是独立事实源。
- Full package 从 genesis 重放全部事件；Incremental package 从已验证 base package 的 head 继续重放新增事件。
- 生成包后必须经过既有 SavePackage validator 的 checksum、Registry/schema、事件区间、AI validation receipt、replay 与 snapshot 一致性校验。

## 3. Full / Incremental 选择

- 新世界首次保存：Full package。
- 已有有效存档且 schema 兼容：以其最新 head 为 `fromExclusive`，只写入其后的事件形成 Incremental package。
- 存档 head 超过当前运行时 head、同序号 cursor 不一致、当前账本在 base head 处与存档 anchor 不一致：拒绝保存，不得用较旧 session 覆盖。
- 现有 package chain 必须先完整重新验证。损坏链不得被 checkpoint 覆盖或伪装为空档。
- 所有保存都以 `expectedHead` 调用 SaveRepository；并发页面发生 CAS conflict 时原样返回冲突，运行时 session 不变。

## 4. Checkpoint 策略

- IndexedDB adapter 与增量链 validator 的既有最大链节点数均为 128。
- 当前有效链达到 128 个 package 节点时，本次保存必须提升为 Full package，从 genesis 重新生成并验证完整事件流。
- schema version 改变时也必须生成 Full package；若旧链无法由当前 Registry/reducer 验证，则拒绝保存，等待明确迁移方案，不得强行覆盖。
- 不另设任意事件数/时间阈值；本片不做后台压缩或定时 checkpoint。

## 5. 原子性与错误语义

- Package 构造、校验与 repository commit 全部成功后，才返回 saved。
- 任一步失败都不改变输入 session；commit 失败不回滚或修改 EventLedger，因为它从未被改写。
- repository 的 unavailable、quota、corrupt、base missing、head conflict 等错误保持原错误类型向上返回。
- 包构造失败、session/world 不一致、base ahead/diverged、提交回执不一致均返回明确拒绝结果。
- `savedAt` 仅是仓储元数据，不参与世界事实或 package checksum。

## 6. 本片边界

- 新增独立 `runtime-save-orchestrator` 服务，不把 IndexedDB import 带入 domain/reducer。
- 不改 `useGame` 生命周期和启动流程；D3 才负责加载、校验与原子恢复。
- 不引入 SaveFolio UI、自动保存频率、用户可见存档槽或导入导出。
- 不写入 narrative settings、secrets 或 cache。

## 7. 验收

- 首次 Full、后续 Incremental、增量只含新增事件、链校验、连续多段增量、陈旧 session、base 分叉、checksum 损坏、CAS 冲突、输入 session 不变、checkpoint 上限策略均有专项测试。
- W1—W5-D1 全量回归、专项测试、Review index、Patch whitespace、Production build、Playwright Smoke、双侧截图归档通过。
- Push 与 PR CI 必须针对同一最新 SHA 且均成功。
- PR 保持 Draft/Open，不合并。

## 8. 后续依赖

- W5-D3：启动时加载存档，重新验证完整 package chain，并从 genesis / checkpoint 原子重建 runtime session。
- W5-E：SaveFolio 保存槽、档案展示、导入/导出/删除与用户确认交互。
