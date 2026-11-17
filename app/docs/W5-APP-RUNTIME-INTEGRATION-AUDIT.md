# W5 / App 运行时双线集成验收（源码证据版）

审查日期：2026-11-17  
审查方式：GitHub 分支源码读取与分支元数据核对。未启动真实浏览器，不将源码审查冒充运行测试。

## 1. 分支基线裁定

- PR #60：`work/w5-d3-runtime-startup-restore` → `work/w5-d3b-app-startup-lifecycle`，Draft/Open，未合并。
- PR #69：`docs/fe-169-art-asset-workflow` → `art/fe-170-exam-opening-assets`，Draft/Open，未合并。
- 两条分支并行，FE-170 不包含 PR #60 的 W5 启动恢复实现；W5 分支也尚未包含 FE-170 的科举资源注册项。
- 两个 PR 当前 GitHub API 均报告 mergeable=true，但这只表示 GitHub 未发现当前文本合并冲突，不表示语义集成已经完成。

## 2. W5 分支 App 接线验收

### 通过项（源码证据）

1. `app/src/App.tsx` 的 `App()` 先调用 `useGuanyuanGame()`；当 startup 不是 ready 时只渲染 `RuntimeStartupGate`，ready 后才渲染 `GameApp`。启动恢复期间不会先展示可操作的旧状态。
2. `app/src/game/useGame.ts` 在启动 effect 中创建 `createIndexedDbSaveRepository()`，调用 `restoreSingleSavedRuntimeWorld()`：
   - 0 档：创建新的 runtime session；
   - 1 档：验证并恢复；
   - 多档：要求玩家明确选择；
   - 失败：进入 error gate，不发布半成品状态。
3. 普通业务命令进入 `commitIntent` → `dispatchPreviewRuntimeIntent`，仅在事件追加成功后更新投影并调用 `scheduleSave`。
4. `scheduleSave` 使用 Promise 队列串行调用 `savePreviewRuntimeSession`；保存失败显示“本机存档未写成”，不会谎报保存成功。
5. `resolveGeneratedEvent` 通过 `dispatchGeneratedEventForGame` 执行候选校验/事实追加；只有 committed 才更新 React 投影并排队保存。
6. `runtime-orchestrator.ts` 定义候选日志并参与 runtime session；恢复编排从事件中重建候选日志。AI 事件确认不是直接修改 React 状态的旁路。
7. `App.tsx` 的事件选项入口区分正式世界事件和生成事件，存在重复提交锁与明确拒绝原因提示。

### 限制/未验收项

1. 以上为源码路径核验，不等于 IndexedDB 在目标浏览器中实际运行通过。
2. AI 生成服务的配置、缓存和密钥仍由 `narrative/store.ts` 使用独立 localStorage 保存；密钥独立存放且不进入游戏存档。它属于本机服务配置，不是世界事实，但跨设备不会随人生存档迁移。
3. 目前开局仍调用固定案例 `createInitialGameState()`：第 1 日晨、县令已接印、东堤呈文已到，固定证据/人物/十日案情仍是世界内容。W5 改善的是事实与存档链，不等于完成正式人生开局。
4. App 的 `resetGame` 创建新 runtime session；本轮源码路径未发现其本身立即写入存档，正式保存依赖后续成功事实提交。需要在真实交互测试中验证重开、刷新与多档显示的预期。
5. 当前分支对 smoke fixture 有 DEV 专用旁路（指定 smoke query 时创建 fixture 并关闭持久化）；生产环境不启用该旁路。验收必须确保正式构建不会错误带入 smoke 模式。

## 3. FE-170 资源分支与 W5 基线差异

- FE-170 的 `app/src/sceneArt.ts` 已登记 `exam-registration-yard`、`exam-hall`、`audience-hall` 和道具路径/图位；这些注册项尚未出现在 W5-D3B 的同名文件中。
- 两分支 `App.tsx` 与 `useGame.ts` 的文件 SHA 不同：W5 版已接入 IndexedDB/EventLedger，FE-170 版仍是旧的 localStorage 案例状态实现。
- 因此禁止将 FE-170 的 `App.tsx`、`useGame.ts` 或旧状态管理文件整体覆盖到 W5 分支。合流应只移植美术注册表、组件/样式和文档，再逐个解决类型依赖与场景入口。
- 资源 ZIP 已在当前会话实际读取：4 张背景/装帧 PNG、2 张 RGBA WebP 运行图、2 张 RGBA PNG 母版和 2 张原始源图。文件规格：
  - 报名院落 1536×864 RGB；
  - 考场 1536×863 RGB；
  - 放榜框 1280×1920 RGBA；
  - 拜谒厅堂 1536×864 RGB；
  - 桌案 900×675 RGBA；
  - 惊堂木 900×600 RGBA。
  两张道具 WebP Alpha 范围均为 0–255，确有透明像素。
- 资源二进制仍未进入 GitHub；PR #69 图位保持 pending/null 是正确状态。

## 4. 验收结论

**W5-D3B 的 App 启动恢复与 IndexedDB/EventLedger 接线：源码审查通过。**  
**AI 候选进入正式事实链：源码路径审查通过，但尚未做浏览器端持久化往返实测。**  
**FE-170 与 W5 合流：未通过，仍需建立集成分支。**  
**正式人生/科举开局：未完成；当前固定东堤县令案例仍是开局。**  
**视觉/美术：资源文件已复核，二进制入库和真实页面加载验收未完成。**

## 5. 下一施工任务

### W5-I1：建立统一集成基线（不覆盖旧文件）

1. 以 W5-D3B 作为运行时基线；先核对 W5 后续 E1/E2/E3 的分支依赖，选取已完成档案管理能力的最新可用祖先/集成分支。
2. 将 FE-169/170 的资源注册表、资源接入文档、科举场景组件按最小变更移植到该基线；不得复制 FE-170 旧版 `App.tsx` / `useGame.ts`。
3. 解决 sceneArt 类型和现有场景状态模型的差异；科举场景作为独立人生开局流程接入，不把县令案例初始化覆盖掉。
4. 先做类型检查、构建、现有 Smoke 和资源路径完整性检查，再做浏览器视口实测。
5. 仍保持 Draft，未经用户明确同意不合并到 main。

### W5-I2：运行时实际往返测试

- 空仓库首次启动；
- 单档自动恢复；
- 多档显式选择；
- 损坏档案不发布半成品；
- 普通命令追加、保存、刷新、重放；
- AI 候选接受/拒绝、保存、刷新后事实一致；
- 保存失败提示与重试；
- 1440 / 1024 / 390 视口下启动门、档案选择和原型交互。

## 6. 不得误报

本报告不声称本轮重新运行了 TypeScript、Vite、单测、Smoke 或 Playwright；这些需在集成分支实际执行并保留 CI/截图证据。