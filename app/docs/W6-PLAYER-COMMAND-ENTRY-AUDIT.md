# W6 玩家命令入口与授权接线审计 v0.1

- 审计日期：2026-11-18
- 对照基线：`work/w6-world-aggregate-application-ports@7ae9fc8902a8f468e6542f93d849493b0f13d55a`
- 目标：核对当前 App 玩家命令入口、W6 命令端口、授权门和领域 intent 的实际连接关系。
- 性质：代码审查与接线施工单；不修改代码、Schema、账本、存档或前端。
- 结论：W6 授权门已有实现与独立契约测试，但尚未接入当前 App 的玩家命令链。这与 W6 架构文档规定的 W6-I 前端迁移阶段一致，不是 W5 预览运行时回归；在 W6-I 完成前，不得宣称当前 App 已由 W6 授权门统一保护。

---

## 1. 总体结论

当前存在两条并行命令链：

1. **W5 预览运行时命令链**：当前 `App.tsx` 使用 `useGuanyuanGame()`；`useGame.ts` 的 `commitIntent` 调用 `dispatchPreviewRuntimeIntent`；该函数验证 Preview Runtime Registry、追加 W5 预览账本事件并重放投影。当前界面实际走这条链。
2. **W6 世界应用命令链**：`WorldCommandPort` → W6 应用适配器 → W6 event catalog / Registry → ledger append → Replay projector → WorldAggregate。玩家授权包装器 `createAuthorizationGatedWorldCommandPort` 已实现，但当前 App 未调用它，也未建立 W6 生产组合根。

两条链都不是可以直接互换的 API。它们的领域模型、intent 名称、payload、投影和运行时职责不同。禁止通过改名或薄适配器把旧预览命令伪装成 W6 领域事实。

---

## 2. 当前 App 实际玩家命令入口（W5 预览链）

### 2.1 入口路径

```
App.tsx
  └─ useGuanyuanGame()
       └─ useGame.ts: commitIntent(intent)
            └─ dispatchPreviewRuntimeIntent(session, intent)
                 ├─ PreviewRuntime Registry payload validation
                 ├─ appendLedgerEvent(source=player-command)
                 ├─ rebuildPreviewRuntimeProjection(...)
                 └─ 更新 session / React 投影 / 排队存档
```

核验依据：

- `app/src/App.tsx` 导入 `useGuanyuanGame`，由 `GameApp` 消费 hook 返回值。
- `app/src/game/useGame.ts` 在 `commitIntent` 中调用 `dispatchPreviewRuntimeIntent`；只有 appended/duplicate 结果更新当前投影，appended 后排队存档。
- `app/src/game/runtime-orchestrator.ts` 中 `dispatchPreviewRuntimeIntent` 对 intent payload 做 Registry 校验，使用 `source: 'player-command'`、`actor: 'player'` 追加事件，再完整重建预览投影。
- `useGame.ts` 还通过 `dispatchPreviewRuntimeCandidate` 处理 AI 候选；AI 路径与玩家命令路径分开。

### 2.2 当前预览链玩家 intent 清单

| Preview intent | 业务含义 | 当前状态 |
|---|---|---|
| `goal.selected` | 选择本局志向 | W5 预览行为 |
| `document.remembered` | 记住文书线索 | W5 预览行为 |
| `ledger.remembered` | 记住账簿线索 | W5 预览行为 |
| `person.asked` | 询问人物 | W5 预览行为 |
| `records.audited` | 查验记录 | W5 预览行为 |
| `river.probed` | 探查河工 | W5 预览行为 |
| `plan.previewed` | 预览抢护计划 | W5 预览行为 |
| `river.plan.confirmed` | 确认河工计划 | W5 预览行为 |
| `banquet.choice` | 选择接风宴处理方式 | W5 预览行为 |
| `official.action` | 执行正式批答动作 | W5 预览行为 |
| `world.event.resolved` | 处理当前待决世界事件 | W5 预览行为 |
| `day.advanced` | 推进十日演示日期 | W5 预览行为 |

以上均是当前演示场景 intent，不能因此视为 W6 已建立相应通用领域契约。

---

## 3. W6 命令适配器支持的领域 intent

`app/src/application/world/in-memory-adapter.ts` 的精确映射目前包括：

| W6 intent | 对应事件 |
|---|---|
| `world.initialize` | `world.initialized` |
| `world.time.advance` | `world.time.advanced` |
| `life.state.fact.record` | `life.state.fact.recorded` |
| `person.create` | `person.created` |
| `organization.register` | `organization.registered` |
| `identity.assign` | `identity.assignment.added` |
| `authorization.grant` | `authorization.granted` |
| `relation.create` | `relation.created` |
| `relation.claim` | `relation.claim.recorded` |
| `relation.evidence.record` | `relation.evidence.recorded` |
| `knowledge.record` | `knowledge.recorded` |
| `message.send` | `message.sent` |
| `message.stage` | `message.stage.recorded` |
| `message.fail` | `message.failed` |
| `message.propagate` | `message.propagated` |
| `organization.membership.add` | `organization.membership.added` |
| `organization.membership.end` | `organization.membership.ended` |
| `relation.lifecycle.change` | `relation.lifecycle.changed` |
| `goal.create` | `goal.created` |
| `goal.status.change` | `goal.status.changed` |
| `schedule.entry.plan` | `schedule.entry.planned` |
| `schedule.entry.execution` | `schedule.entry.execution.recorded` |
| `schedule.entry.deviation` | `schedule.entry.deviation.recorded` |
| `debt.record` | `debt.recorded` |
| `debt.settle` | `debt.settled` |
| `asset.register` | `asset.registered` |
| `asset.custody.transfer` | `asset.custody.transferred` |
| `asset.right.grant` | `asset.right.granted` |
| `asset.right.revoke` | `asset.right.revoked` |
| `person.exposure.record` | `person.exposure.recorded` |

注意：

- W6 事件映射表是领域命令适配器的支持范围，不是玩家权限白名单。
- `world.initialize`、`person.create`、`authorization.grant` 等命令必须由可信应用流程控制，不能因为适配器支持就开放给普通 UI。
- 当前 W5 预览 intent 与上述 W6 intent 没有可直接使用的同名一对一映射。
- 文书记忆、账簿查验、河工计划确认、宴席选择、正式批答和预览事件结算等旧 intent，需要先明确真实领域对象和正式事件含义，不能直接映射到看似相近的 W6 intent。

---

## 4. 授权门实现审查

### 4.1 已实现的保护

`app/src/application/world/authorization-gate.ts` 已提供：

- 独立 `WorldCommandPrincipalPort`：只从可信认证会话解析身份，不接收命令请求。
- `WorldCommandAuthorizationRequirementPort`：仅按精确 `intentKind` 解析 permission/scope。
- `createAuthorizationGatedWorldCommandPort`：玩家入口只接受 `source === 'player-command'`。
- 请求在异步边界前快照；避免调用方在等待期间篡改 request、requestedAt 或 expectedHead。
- 权限通过现有 `hasAuthorization` 对世界授权记录、principal、请求时间和人物状态执行校验。
- 缺失 principal、缺失映射、世界不存在、查询失败、授权失败均 fail closed。
- 授权通过后向底层 command port 提交时，actor 被替换为可信 principal；不信任 request.actor。
- 版本化策略 `w6-command-authorization/1` 使用精确 intent 映射，不支持 wildcard。
- 重复 intent mapping、非法 permission/scope 会使策略校验失败。
- resolver 在组合时快照规则；后续修改 provider 原对象不会改变已激活策略。
- 未登记 intent 返回 null，由 gate 拒绝；scope 只来自可信策略配置，不从 payload 取值。

### 4.2 已有测试覆盖

`app/scripts/world-authorization-gate-test.ts` 覆盖：

- 已授权命令进入底层端口时使用认证 principal 作为 actor；
- 缺失授权时不提交事实命令；
- 已死亡 principal 被拒绝；
- 未映射 intent 被拒绝；
- principal 缺失被拒绝；
- 非 player source 在玩家边界被拒绝；
- 世界查询缺失被拒绝；
- 精确版本化策略映射；
- payload scope 不能扩大权限；
- 重复映射策略拒绝；
- 活动策略不受源对象后续 mutation 影响。

最新 W6 head 对应 PR 事件流水线已通过授权门控测试和身份授权测试。

### 4.3 尚未证明的事项

- 目前测试证明授权门自身行为正确，不证明 App 所有玩家命令都经过授权门。
- 尚未发现生产 App 组合根创建 gate 并将其注入玩家 UI 的接线。
- 当前 in-memory adapter 返回原始 `commands` 端口；原始端口承担确定性校验和 ledger append，不自行完成玩家授权。
- 生产组合必须区分 player-facing gated port 与 trusted internal system/rule/scheduler port；不得把 raw command port 暴露给 UI。
- 当前没有已核验的完整 production policy 将所有可用玩家 intent 显式映射到权限与 scope。
- 不能从职级、官职、称谓、命令名称、actor 字符串或 payload 推导授权。
- W6 现有授权测试没有证明当前 App 的全部玩家动作已被覆盖。

---

## 5. 关键架构判定

W6 架构文档 `app/docs/W6-WORLD-AGGREGATE-ARCHITECTURE.md` 已将 W6-I 定义为前端 query-selector migration，并明确 W6-A/B/C 与 W5 预览不捆绑。

因此：

- 当前 App 继续使用 W5 预览运行时，是既定分阶段迁移状态，不应被描述为 W5 回归。
- W6-H 授权门存在，不代表当前 App 已经由 W6 授权门保护。
- W6-I 必须先完成玩家可见命令清单、领域语义映射、可信 principal 来源和策略权限矩阵，之后才可把 UI 接到 gated port。
- 在 W6-I 之前，W5 预览运行时继续作为当前可运行原型；不能把它的命令事件冒充为 W6 完整领域命令。
- 不得为“让 UI 先接上”而给所有命令配置 world scope 或宽泛权限；每项授权必须有明确业务理由和真实制度来源。

---

## 6. W6-I 接线施工单

### W6-I-0：建立完整映射登记（本审计已完成第一轮盘点）

对每个当前 UI action 登记：

- UI 控件/场景；
- hook handler；
- 旧 Preview intent；
- 真实领域行为；
- W6 intent；
- event schema；
- permission；
- scope；
- principal 来源；
- 成本/时长规则；
- 失败/拒绝语义；
- 预期投影变化；
- 测试与截图证据。

未能建立真实领域语义的旧预览动作保持 preview-only，不准强行映射。

### W6-I-1：建立应用组合根

- 组合原始 W6 adapter、trusted principal、版本化 authorization policy、gated player command port、internal command port、observer query port、simulation 和 snapshot ports。
- UI 只能拿到 gated player command port 和 observer-scoped query port。
- 原始 aggregate query 与 raw command port 仅限可信 application composition / system orchestration。
- 不将内部系统命令与玩家命令混在同一入口。

### W6-I-2：分域迁移

顺序：

1. 玩家人物与身份初始化（仅由可信 Genesis/初始化流程，不是普通玩家命令）。
2. 场景接触与人物曝光；只有满足形成条件后才创建 Relation。
3. 对话/信息 Claim/Evidence/Knowledge 与远距通信阶段。
4. 目标、日程与任务。
5. 官场政务、正式文书与授权行动。
6. 经济、债务、资产与权利。
7. 时间推进、夜间结算与维护任务。

每一类迁移前必须具备已裁决的设计契约和 schema。

### W6-I-3：授权验收

- 每个玩家可见 intent 均有精确 permission/scope 规则。
- 未登记 intent 默认拒绝。
- UI 不能传入或覆盖 principal、actor、scope 或授权主体。
- 授权前后 expectedHead、world time 和事件提交保持一致性。
- player、rule、schedule、system 来源不能互相伪装。
- 负例覆盖无权、过期、撤销、死亡、错误 scope、未知 intent、伪造 actor、异步篡改、并发 head 变化。
- 不以职级/品级默认赋权。

### W6-I-4：只读 UI 与视觉回归

- 所有 UI 查询使用 observer-scoped view model。
- 禁止直接订阅完整 WorldAggregate。
- 人物档案只显示玩家当前可认知信息。
- 保留既有前端视觉、交互、动效与美术纪律。
- 不创建占位美术；如需新资源，先由项目负责人生成。
- 1440/1024/390 三档 smoke 与截图眼审通过。

---

## 7. 本轮明确不做

- 不把 W5 PreviewRuntimeIntent 批量改名为 W6 intent。
- 不给所有 intent 临时授予 world scope。
- 不把 `createInMemoryWorldAdapter().commands` 直接注入 React。
- 不让 UI 访问 `WorldQueryPort` 的完整聚合。
- 不修改 W5 EventLedger、Registry、Replay、Save/Restore、Runtime Orchestrator。
- 不把当前七人河工夹具改成正式 Genesis 内容。
- 不生成、替换或手工绘制美术资产。

---

## 8. 验收结论

- [x] 当前 App 的 W5 预览命令入口已定位。
- [x] W6 原始命令适配器与 intent 清单已定位。
- [x] W6 授权 gate 与独立测试覆盖已核对。
- [x] 确认当前 App 未接入 W6 gate；该迁移属于 W6-I 后续阶段。
- [x] 明确不得强行建立旧 preview intent 与新领域 intent 的假映射。
- [ ] 完整 UI action → domain intent → permission/scope → event/schema 映射表（后续 W6-I-0 完成）。
- [ ] 生产组合根接线（W6-I-1）。
- [ ] 全部玩家命令统一授权验收（W6-I-3）。
- [ ] 1440/1024/390 视觉和交互回归（W6-I-4）。

## 9. 变更记录

- v0.1：基于 W6 最新 head 进行静态代码审计，未修改代码。
