# W5-D1 持久化端口与 IndexedDB 仓储契约 v0.1

## 1. 施工定位

- 基线：W5-C2B `work/w5-c2b-generated-event-ui-integration`，验收 SHA `d80d6d3965a59cf91a3b7b5377337584ba0fddf2`。
- 本片建立运行时外部的 SaveRepository 端口与浏览器 IndexedDB adapter。
- 本片不把仓储接入 `useGame`，不自动保存每条 LedgerEvent，不改 SaveFolio，不恢复旧 v1 档案。
- PR base 必须是 W5-C2B 分支；保持 Draft/Open，不合并。

## 2. 架构边界

`Game Runtime / Save Coordinator → SaveRepository port → IndexedDB adapter`

- `app/src/persistence/save-repository.ts` 只定义领域外部接口与结果类型。
- `app/src/persistence/indexeddb-save-repository.ts` 是唯一浏览器存储实现；domain、runtime、reducer 不得 import IndexedDB。
- adapter 只负责持久化完整 SavePackageChain 与元数据，不负责证明数据可信。
- 调用者必须在 commit 前完成 SavePackage checksum、Registry/schema、base chain、event range 与 replay/snapshot 一致性验证。
- load 返回的数据仍是不可信存储输入；恢复前必须重新完整验证，不能因 IndexedDB 读出成功就直接替换运行时状态。

## 3. 数据布局

IndexedDB 数据库：`guanyuan-world-saves`，版本 1。

- `worlds`：以 `worldId` 为主键，保存 latest package key、stream head、savedAt、package kind 与 checksum。
- `packages`：以 `worldId::checksum` 为主键保存不可变 package body；incremental 节点只保存 base package key，不重复嵌套复制整条 base chain。
- `packages.worldId` 建非唯一索引，供删除世界时清理该世界全部 package 节点。
- load 时按 basePackageKey 递归恢复完整 SavePackageChain，深度上限 128；循环、断链、跨世界引用或包络不匹配均返回 corrupt，不得降级为空档。
- 包 checksum 仍由既有 SavePackage domain 生成/验证；adapter 不自创第二种 checksum。

## 4. 原子性与并发

- `commitWorld` 在同一个 readwrite transaction 中执行 expected-head compare-and-swap、base 节点存在性检查、package 节点写入和 world latest pointer 更新。
- `expectedHead=null` 仅允许创建不存在的新世界；非 null 必须与当前 world head 完全一致。
- 增量包的 base snapshot head 必须等于 expectedHead；不存在 base 节点时拒绝。
- 任何失败均不得更新 world latest pointer；事务中止后原档仍可读。
- `deleteWorld` 必须携带 expected head；并在同一事务删除 world pointer 与该 WorldId 下所有 package nodes，避免并发保存后误删新档。
- quota、IndexedDB unavailable、corrupt record、CAS conflict 均返回明确错误，不静默吞掉。

## 5. API 契约

- `loadWorld(worldId)`：区分不存在（success/null）与损坏（rejected/corrupt）。
- `commitWorld(input)`：只写通过上层验证的包；仓储本身执行结构边界和并发保护。
- `listWorlds()`：只返回世界摘要，不加载完整 package payload。
- `deleteWorld(worldId, expectedHead)`：防止陈旧页面删除另一个页面刚刚提交的新 head。
- narrative settings、secret、cache 不属于世界仓储，永不写入本数据库。
- 旧 `guanyuan.save.v1` key 不读取、不覆盖、不删除。

## 6. 验收

- IndexedDB adapter 专项测试覆盖：缺失 API、genesis full 写入与读取、structured-clone 往返、陈旧 head 冲突、增量 base 归一化与恢复、世界摘要列表、带 head 删除及级联清理。
- malformed package、base mismatch、corrupt world row、缺失 base、循环/超深链不得被当作空档或成功。
- W1—W5-C2B 全量回归、Review index、Patch whitespace、Production build、Playwright Smoke 与截图归档通过。
- Push 与 PR CI 必须针对同一最新 SHA 且均成功。
- PR 保持 Draft/Open，不合并。

## 7. 后续依赖

- W5-D2：运行时 SavePackage full/incremental 生成器、checkpoint 策略与保存协调器。
- W5-D3：启动恢复验证与原子运行时重建。
- W5-E：SaveFolio 正式保存状态、导出/导入/恢复/删除交互。
