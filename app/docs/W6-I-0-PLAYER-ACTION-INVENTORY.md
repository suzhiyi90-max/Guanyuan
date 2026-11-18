# W6-I-0 玩家动作全量登记与迁移准入矩阵 v0.1

- 审计日期：2026-11-18
- 代码基线：`work/w6-world-aggregate-application-ports@a8d7a865318edcdf5142db8dba5effe823c9f721`
- 关联审计：`W6-PLAYER-COMMAND-ENTRY-AUDIT.md`
- 性质：W6-I-0 施工前置登记；只记录已存在代码事实与迁移准入条件，不更改任何领域语义。
- 本轮结论：**当前 12 类 PreviewRuntimeIntent 均不得直接映射为 W6 玩家命令。** 需要先冻结领域契约、事件语义、权限主体和成本/时间规则，再逐项迁移。

## 1. 代码入口与事实边界

当前入口经核对为：

```
App.tsx
  -> useGuanyuanGame()
  -> app/src/game/useGame.ts
  -> commitIntent(PreviewRuntimeIntent)
  -> dispatchPreviewRuntimeIntent(...)
  -> W5 PreviewRuntime Registry / EventLedger / Replay projection
  -> React GameState
```

- `App.tsx` 的页面、场景、抽屉和弹层仍消费现有 `useGuanyuanGame` 返回值。
- `useGame.ts` 的 `commitIntent` 仍将玩家动作交给 `dispatchPreviewRuntimeIntent`。
- 预览动作成功追加后才更新 React 投影并排队保存；被拒绝时不发布新投影。
- AI 生成事件走 `dispatchPreviewRuntimeCandidate`，不是玩家命令入口；候选接收与玩家选择后的事实回执必须继续分离。
- 存档列举、恢复、删除、导入、导出属于档案/持久化操作，不应伪装成世界领域 intent。

## 2. 玩家可见世界动作登记

| 当前 Hook API | Preview intent | 当前演示行为 | W6 迁移判定 | 迁移前必须补齐 |
|---|---|---|---|---|
| `setGoal(goalId)` | `goal.selected` | 选择本局志向并更新演示投影 | 暂不映射 | 玩家志向与 NPC Goal 的模型边界、可见性、创建/变更事件、撤销规则 |
| `rememberDocument(selected)` | `document.remembered` | 达到选择数量门槛后记忆文书线索 | 暂不映射 | 文书实体/证据引用、持有人认知记录、来源可信度与误判语义 |
| `rememberLedger(selected)` | `ledger.remembered` | 达到选择数量门槛后记忆账簿线索 | 暂不映射 | 账目事实、证据与持有人 Knowledge 的区分，账目数值来源 |
| `askPerson(personId)` | `person.asked` | 对夹具人物发起询问并记录演示结果 | 暂不映射 | 场景共处/接触条件、对话轮次、说话者意图、可披露信息、Claim/Evidence/Knowledge 的形成 |
| `audit()` | `records.audited` | 演示查验账册并解锁后续线索 | 暂不映射 | 查验对象、查验权限、证据来源、耗时与查验结果的事件契约 |
| `probe()` | `river.probed` | 演示探查河工并生成线索 | 暂不映射 | 地点/对象/执行者、勘验方法、耗时成本、观察结果与事实确认边界 |
| `markPlanPreview()` | `plan.previewed` | 标记抢护方案已预演 | Preview-only 候选 | 若仅 UI 预览则不得写世界事实；若代表正式筹划，需独立的计划草拟/修订契约 |
| `confirmPlan(plan)` | `river.plan.confirmed` | 确认固定演示河工计划 | 暂不映射 | 计划实体、参与组织、资源与工程量单位、审批权限、成本/工期规则、执行/偏差事件 |
| `chooseBanquet(choice)` | `banquet.choice` | 对接风宴作 attend/delegate/audit 选择 | 暂不映射 | 宴席邀请、关系语境、实际出席/委托/查账行为的不同事实、时间与费用规则 |
| `runOfficialAction(key)` | `official.action` | 执行演示官场批答动作 | 暂不映射 | 官职/任命/授权事实、文书流程、事项管辖权、上级审批、正式行政事件 |
| `resolveWorldOption(eventId, optionId)` | `world.event.resolved` | 处理当前预设/生成事件选项 | 暂不映射 | 事件来源与可信级别、选项所代表的具体命令、候选验证、因果与结算契约 |
| `continueNextDay()` | `day.advanced` | 推进十日演示时间段 | 暂不映射 | 真实 WorldTime 区间、时制、日程结算、模拟预算、重复请求幂等性；不得沿用演示“十日”语义 |

**“暂不映射”不是否定 W6 领域能力，而是禁止把语义不完整的演示动作包装成正式世界事实。** W6 适配器存在相近 intent，不构成语义等价证明。

## 3. W6 领域 intent 的玩家准入分类

以下分类针对 W6 现有 adapter intent 的接线权限，不代表当前 UI 已可调用。

### 3.1 只能由可信初始化/内部流程调用

- `world.initialize`
- `person.create`
- `identity.assign`
- `authorization.grant`
- `organization.register`

这些命令可能建立世界、人物、身份、组织或授权基础事实。不得因 UI 出现“创建人物/组织”控件就将原始端口暴露给普通玩家操作。人物生成、初始身份与权限必须由经过验证的 Genesis/初始化流程控制。

### 3.2 具备领域能力，但必须逐项设计玩家权限

- `world.time.advance`
- `life.state.fact.record`
- `relation.create`
- `relation.claim`
- `relation.evidence.record`
- `knowledge.record`
- `message.send`
- `message.stage`
- `message.fail`
- `message.propagate`
- `organization.membership.add`
- `organization.membership.end`
- `relation.lifecycle.change`
- `goal.create`
- `goal.status.change`
- `schedule.entry.plan`
- `schedule.entry.execution`
- `schedule.entry.deviation`
- `debt.record`
- `debt.settle`
- `asset.register`
- `asset.custody.transfer`
- `asset.right.grant`
- `asset.right.revoke`
- `person.exposure.record`

玩家准入必须依赖精确 intent、permission、scope、可信 principal、时间和业务前置条件。不能以“领域支持”推导“玩家有权”。

### 3.3 明确不允许的接线方式

- 将 `person.asked` 直接改名为 `relation.create` 或 `knowledge.record`。
- 将“看见/听说/同场”直接升级为关系边。
- 将 `day.advanced` 直接映射为任意时间推进，跳过模拟调度与日程结算。
- 将 `official.action` 映射为 `authorization.grant`，或由官职品级自动推导授权。
- 将 `banquet.choice` 映射为 `message.send`、`debt.record` 或 `relation.create`。
- 将 AI 文本/候选事件直接写入账本；AI 只能提出候选，确定性规则与验证器负责事实提交。
- 将 raw `WorldCommandPort`、完整 `WorldAggregate` 或内部 `WorldQueryPort` 交给 React 页面。

## 4. W6-I 生产组合根的硬约束

组合根尚未接入当前 App。正式接线必须一次性提供并隔离：

1. **Player command port**：仅暴露 `createAuthorizationGatedWorldCommandPort(...)` 返回的 gated port。
2. **Trusted internal command port**：仅供 Genesis、规则、日程和系统编排；不得通过 props/context 暴露给页面。
3. **Observer query port**：UI 只读 `WorldObserverQueryPort` 的观察者投影；不得订阅完整 aggregate。
4. **Principal resolver**：来自可信会话/认证上下文，不从 request.actor、UI payload 或人物选择控件读取。
5. **Versioned authorization policy**：每个可用 intent 精确列出 permission 与 scope；未知 intent 默认拒绝。
6. **Ruleset/simulation ports**：成本、时间、资源消耗和维护规则必须由版本化规则注入；不得在 UI handler 中计算或硬编码。
7. **Receipt/projection handling**：只有 committed/duplicate 的正式回执可刷新相应投影；rejected/conflict 必须保留原状态并给出可解释反馈。

## 5. W6-I-0 完成条件

- [x] 确认 App 当前使用 W5 PreviewRuntime。
- [x] 盘点 useGame 暴露的 12 类玩家世界动作。
- [x] 单独标记 AI 候选路径与存档管理路径。
- [x] 逐项登记当前演示语义与迁移前置契约。
- [x] 对 W6 intent 做初始化/内部流程与潜在玩家命令分类。
- [x] 明确禁止伪映射、raw port 暴露和 aggregate 直读。
- [ ] 由设计总纲/专项规范确认各领域的真实事件语义与权限矩阵。
- [ ] 选定一个契约完整的垂直切片，完成 schema、permission/scope、成本时间规则和负例测试。
- [ ] 组合根与 observer query 通过隔离测试后，才允许开始 UI 迁移。

## 6. 下一阶段施工顺序

1. 先完成 W6-I-0 设计裁决：从已有规范中选择一条完整、可证明的领域纵切片；不因实现方便而新造规则。
2. 单独建立 W6-I-1 composition root 与隔离测试，不触碰 App UI。
3. 为所选纵切片建立玩家命令权限矩阵、observer view 与命令回执测试。
4. 先做一个屏幕/一条操作路径的 W6 影子接线验证；W5 预览仍为当前运行入口，直到新路径完整通过验收。
5. 通过视觉回归后，再按领域分批迁移。既有布局、纸本文档层级、场景构图、动效节奏、键鼠/触屏行为均为保护项。

## 7. 视觉、美术与交互保护

- 本轮没有修改 App、CSS、组件结构、布局、动效或交互。
- 不生成、不手工绘制、不以 CSS/程序化图形替代正式美术资产。
- 如未来某个迁移项需要新增正式美术资源，先列资源清单与完整生成提示词，由项目负责人生成并提交；实现侧只接入验收合格的正式资产。
- W6 数据接线不得改变现有页面信息层级、操作位置、过渡动效、反馈节奏与响应式布局。
- 视觉回归必须保留现有 smoke 场景，并增加 1440/1024/390 三档截图眼审；没有截图证据不得标记视觉验收通过。

## 8. 本轮验收记录

- W6 head：`a8d7a865318edcdf5142db8dba5effe823c9f721`
- Push workflow run：`44319666553` — success
- Pull-request workflow run：`44319682617` — success
- 两条工作流均完成：授权契约、身份/授权契约、Production build、Playwright smoke and archive regression、smoke screenshot upload 均为 success。
- W6 代码仍处于 PR #86 Draft/Open；当前 App 仍走 W5 PreviewRuntime。CI 通过不等于 W6-I 已完成。
