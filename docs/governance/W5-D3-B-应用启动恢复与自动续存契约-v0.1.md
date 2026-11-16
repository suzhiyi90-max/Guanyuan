# W5-D3-B 应用启动恢复与自动续存契约 v0.1

## 1. 基线与边界

- 基线：W5-D3 已验收 `c1f64fb6d4207b4260d89e38888c3281ffa83828`。
- 本片把 D3 恢复内核接入 React 应用启动，并让成功提交的玩家事实按序写入 IndexedDB。
- 不改事件账本、事件 schema、reducer 或 SavePackage 格式。
- 不读取、迁移、覆盖旧 `guanyuan.save.v1`。
- 不实现存档删除、导入/导出、云同步或完整 SaveFolio 管理。

## 2. 启动门

1. `useGuanyuanGame` 首先处于 `loading`，runtime session 尚未发布。
2. App 在 startup 状态不是 `ready` 时，只挂载启动门，不挂载游戏交互树。
3. 调用 `restoreSingleSavedRuntimeWorld`：
   - 0 档：创建新的内存世界并进入 ready。
   - 1 档：完成 D3 全链校验、genesis 重放和 session 重建后，才进入 ready。
   - 多档：进入 `selection-required`，展示可选 WorldId 摘要；禁止自动选择。
   - 仓储错误或恢复失败：进入 error；不创建替代新世界、不把损坏档案伪装成空档。
4. 玩家明确选择某档后，再调用 `restorePreviewRuntimeSession`；仅在 `restored` 时发布 session。
5. Smoke query fixture 是隔离测试入口，不读取、不写入真实 IndexedDB。

## 3. 自动续存

- 玩家事实仍先通过 runtime command 的 validate → append → replay；只有 append 成功后，才将不可变 session 快照排入持久化队列。
- 队列串行调用 `savePreviewRuntimeSession`，避免多个异步保存对同一 CAS head 竞争。
- 每次保存仍由 D2 服务验证当前包链、事件前缀和 expected-head CAS；React hook 不自行拼装或写入 SavePackage。
- 重复命令不产生新事实，不触发额外存档写入。
- AI 候选只有在可信 receipt 与 fact 成功追加后才安排保存；pending/rejected 候选不持久化为世界事实。
- 持久化失败不回滚已经提交的当前内存会话；必须向玩家明确提示“本机存档未写成”，不得标成已保存。
- 自动保存成功后，SaveFolio 的状态说明才切换为本机已有存档。

## 4. 新人生与多存档

- 重立志分配新的 WorldId，不覆盖另一段人生，也不删除旧档。
- 新世界在第一次成功提交玩家事实时形成 Full package；后续写入使用 Incremental package。
- 当本机存在多段人生，启动必须要求玩家选择；不得按最近时间或列表顺序替玩家决定。
- 当前片不提供档案删除功能；用户如需整理存档，后续另立 W5-E 管理契约。

## 5. 失败与隔离

- 启动恢复前，不允许世界事件、玩家指令或 AI 生成事件进入运行时。
- IndexedDB 不可用、读取失败、存档损坏、schema 不匹配、replay 失败均进入明确 error 状态。
- 选档失败后不发布部分 session；可重新检阅存档列表。
- 自动保存失败只影响持久化确认，不伪造回滚，不污染账本。
- 页面关闭时未完成的异步保存不保证完成；UI 不得提前报告已落盘。

## 6. 验收

- D3 单档自动恢复、多档显式选择、缺档新建、损坏档错误状态均有覆盖。
- React 启动门在恢复结束前不挂载游戏操作树。
- 自动保存队列串行，D2 SavePackage 验证和 CAS 仍是唯一持久化入口。
- 保存成功/失败反馈准确；Smoke fixture 不读写真实档案。
- W1—W5-D3 回归、Review index、Patch whitespace、Production build、Playwright Smoke、双侧截图归档通过。
- Push 与 PR CI 必须针对同一最新 SHA 全绿；PR 保持 Draft/Open，不合并。
