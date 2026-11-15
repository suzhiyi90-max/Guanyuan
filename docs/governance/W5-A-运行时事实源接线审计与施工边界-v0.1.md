# W5-A 运行时事实源接线审计与施工边界 v0.1

## 1. 审计基线

- 基线分支：`work/w4-c-incremental-save-chain`
- W4-C 验收提交：`0996b4efcbad633f655b2fcb1050c88507a202a8`
- 本文仅审计现有运行时与 W3/W4 领域基础的连接缺口；不修改应用代码、不接入存储、不迁移旧档。
- W4 EventLedger / EventRegistry / replay / WorldSnapshot / full+incremental SavePackage 仍是独立领域模块；当前前端尚未使用这些模块作为世界事实源。

## 2. 现状核验

### 2.1 运行时状态与旧存档

文件：`app/src/game/useGame.ts`

- `GameState` 仍由 React `useState` 持有，是当前界面的实际状态来源。
- 旧存档 key 为 `guanyuan.save.v1`；初始化时通过 `loadSave()` 读取 JSON。
- `loadSave` 仅检查 `day` 为 number、`clues` 为数组，随后浅合并 `initialState`；未验证完整字段、状态不变量、事件历史或 checksum。
- 每次 `state` 变化后，effect 都将整个 GameState 写回 localStorage；存储异常被静默吞掉。
- 初始化 state 与 `restored` ref 分别调用 `loadSave()`，同一启动过程重复解析旧档。
- `resetGame` 先 `removeItem(SAVE_KEY)` 再设置 initialState；随后保存 effect 会再次把 initialState 写入同一 key。因此当前“清档”并不意味着该 key 最终保持不存在。
- `handledEvents` 与单槽 `pendingEvent` 仍位于 GameState 中；这与正式 EventStream 投影方向尚未完成替换。

### 2.2 状态变更入口

文件：`app/src/game/useGame.ts`、`app/src/game/commands.ts`、`app/src/game/engine.ts`

目前只有部分动作经过 `executeCommand` / `commitCommand`：

- 已走命令入口：官员动作、正式世界事件选项、AI 生成事件结算。
- 仍直接写 React state：立志选择、记住呈文、记住账册、询问人物、查旧册、现场探挖、标记计划预览、确认抢护计划、接风宴选择、推进次日、重立志。
- 多个 handler 在 React state updater 内通过外部变量回传结果；这不适合作为可重放命令边界。
- `engine.ts` 的 `advanceDay`、`advancePeriod`、`spendAction` 与世界事件结算仍直接产生 GameState；它们尚未以正式 LedgerEvent 作为输入/输出。
- `commands.ts` 当前以 `handledEvents` 防重复、以 `pendingEvent` 检查待决事件；尚未统一使用 W3 的 world-scoped idempotency key 与 EventLedger append。

### 2.3 存档 UI 与导出

文件：`app/src/App.tsx`、`app/src/components/SaveFolio.tsx`

- SaveFolio 目前展示本机单档摘要，提供“导出底稿”和两段式清档；没有导入/恢复入口。
- `exportSave` 下载的 JSON schema 为 `guanyuan.save.v1`，内容是 exportedAt、少量 summary 与原始 GameState。
- 该导出不是 W4 SavePackage：没有 EventStream、streamRange、WorldSnapshot 校验、basePackage 链或 checksum。
- UI 明确标注本机一档、无云端；本轮不擅自引入云同步、多档位或账号服务。

### 2.4 独立叙事配置存储

文件：`app/src/narrative/store.ts`

- 叙事配置、叙事 secret/API key、缓存与用量统计使用独立 localStorage keys（`guanyuan.narrative.v1`、`guanyuan.narrative.secret.v1`）。
- 这些配置不是世界事实，不应混入 SavePackage，也不应因重立志/清理世界存档而默认删除。
- W5 世界存档改造必须保持叙事配置与世界档案分离；若将来要导出/删除叙事配置，另走明确的隐私与用户操作流程。

## 3. 与 W3/W4 的实际连接缺口

| 领域能力 | 当前状态 | W5 接线要求 |
|---|---|---|
| EventLedger | 领域模块已实现，前端未接入 | 每个世界拥有唯一 Ledger；append 是唯一事实写入口 |
| EventRegistry | 冻结注册机制已实现，尚无游戏运行时 registry | 定义本运行时事件 kind/schema；冻结后方可 append/replay |
| 命令幂等 | Ledger 支持 world-scoped idempotency；旧 commands 未接入 | UI intent 先形成 command envelope，再进入校验/成本/append |
| AI 候选回执 | W3-D 已实现，旧 AI 结算仍直接改 GameState | AI 候选先校验并形成 receipt，再允许事实事件提交 |
| Replay/Projection | W3-E 已实现，尚未投影为 GameState | GameState 只能由事件流重建/投影，不得并行维护第二份事实 |
| WorldSnapshot | W4-A 已实现，尚未生成 | 只作为 EventStream 检查点缓存 |
| SavePackage | W4-B/C 已实现，尚未用于真实读写 | 保存/恢复必须先验证 checksum、区间、base 链、Registry 与重放结果 |
| 持久化端口 | 当前直接 localStorage | 建立 domain 外部的 SaveRepository/StoragePort；domain 不得依赖浏览器 API |
| 旧 v1 存档 | 只支持本地自动加载与导出 | 不得静默把原始 GameState 伪装成正式 EventStream |

## 4. W5 目标运行时边界

目标数据流：

`UI Intent → Command Orchestrator → deterministic validation/cost → EventLedger.append → replay/reducer → read-only GameState projection → UI`

持久化旁路：

`EventLedger + checkpoint → WorldSnapshot → SavePackage(full/incremental) → SaveRepository`

恢复路径：

`SaveRepository.load → SavePackage checksum/chain validation → Registry/schema validation → Event replay → read-only projection → UI`

强制约束：

1. EventStream 是唯一事实历史；React state 只是只读投影/缓存，不能另行成为事实源。
2. 任何会改变世界事实的用户动作必须经过统一 Command Orchestrator；禁止散落的 `setState` 直接改世界事实。
3. UI 不得直接 append LedgerEvent；只有 Orchestration 层可调用 Ledger append。
4. AI 不得自证事实；AI 候选必须先经过 W3-D receipt 协议。
5. Reducer 必须纯函数、确定性、可重放；Projection 不可写 Ledger。
6. Persistence/SaveRepository 只能读写 SavePackage，不得把未经验证的 GameState JSON 当正式存档。
7. Narrative settings/secrets/cache 与 world SavePackage 完全分离。
8. 本轮不锁定完整游戏未来的 Q17 EventKind 目录；先建立当前预览运行时所需的有限事件 schema，保持可扩展但不抢先冻结正式领域全集。

## 5. 旧存档与重立志裁决建议

当前 `guanyuan.save.v1` 是浅校验的原型 GameState，不含可重放事件历史。不能把它直接包装成 full SavePackage，也不能伪造 genesis 之前的事件。

建议采用显式兼容边界：

- 新事件溯源运行时不自动加载旧 v1 GameState。
- 检测到旧 key 时，将其标记为 legacy save；用户可导出旧底稿，随后明确选择开启新世界。
- 不自动删除 legacy key；用户确认开始新世界后，再按独立操作清理旧世界 key。
- 不实现静默 migration/upcaster。若未来确需继承旧档，另立一次性、可审计的迁移命令，将每个旧字段映射到明确的初始事实事件，并记录迁移来源；不得把迁移结果伪装成历史上真实发生过的事件。
- 新世界通过新 WorldId + genesis cursor 建立；重立志是创建新世界，不是删除旧 EventStream 的历史事件。
- 修正当前 reset 后 initialState 被 effect 重新写回旧 key 的缺陷，必须与新 repository 的 delete/create 语义一起验收。

## 6. 建议施工顺序

### W5-B：当前预览运行时事件目录与投影映射
- 列出 GameState 每个字段由哪些事实事件产生。
- 定义有限的 preview-runtime EventRegistry 与 payload schemas；不扩展为正式 Q17 全目录。
- 定义 initial projection、reducer 与只读 GameState mapper。
- 测试同一事件流重放得到相同 GameState；拒绝未知 kind、非法 payload 和非冻结 Registry。

### W5-C：统一命令入口
- 将所有直接 setState handler 改为 command intent。
- 统一执行权限/前置条件/行动成本/幂等校验。
- 成功后 append；拒绝不写事实；重复请求返回既有结果。
- 旧 `pendingEvent/handledEvents` 仅保留为 projection 字段或由事件历史派生，不再作为独立事实权威。

### W5-D：运行时存档仓库端口
- 定义 SaveRepository 接口与版本化存储记录。
- 比较 IndexedDB 与 localStorage 后选定浏览器 adapter；domain 不依赖任一浏览器 API。
- 首次保存 full 包；后续增量包按 checkpoint head 串联；定期 full checkpoint 的策略单独量化。
- 存储失败必须可见、可重试；不得静默假报已保存。

### W5-E：SaveFolio 正式读写与重置
- 展示真实世界档案 head/checkpoint/最近保存状态。
- 导出完整 SavePackage；恢复前先验证完整链，再原子替换运行时投影。
- 导入、恢复、重立志与删除世界档案必须明确确认；不能把“导出底稿”当“已保存”。
- 保留叙事配置与世界档案分离。

## 7. W5-A 审计结论

- 当前前端尚未形成 EventLedger 驱动的世界运行时；W4 完成的是领域层存档与恢复能力，不代表游戏已经接上新存档。
- 最大风险不是 SavePackage 格式，而是大量直接 setState 入口会绕过事件账本，形成“双事实源”。
- 因此 W5 第一项代码施工应先完成当前预览运行时的事件目录、GameState 投影映射和初始世界建构；不得先把 SavePackage 接到现有 localStorage effect。
- 本文为施工审计与边界提案，不更改现有行为；进入 W5-B 前必须按本文边界进行专项设计审查。
