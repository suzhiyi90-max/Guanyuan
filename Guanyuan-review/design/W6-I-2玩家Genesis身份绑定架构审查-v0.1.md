# W6-I-2 玩家 Genesis 与身份绑定架构审查 v0.1

- 日期：2026-11-18
- 依据：W6-A/H head `a8d7a865318edcdf5142db8dba5effe823c9f721`；W6-I-1 PR #89 head `adcf03558dfa377fe12f1f0d8559b374c54cdb72`
- 性质：实现前置架构审查；不构成新增世界规则，不修改 v0.16 权威总纲。
- 历史基线：嘉靖二年（1523）已由项目负责人确定。本文不采用 PR #71 旧稿中的晚清基线，也不擅自指定县名、府属或河段。

## 1. 验收结论

PR #89 的最新提交已通过完整 G1.7 CI：

- Pull Request run：`44323423050`，结论 `success`。
- Head：`adcf03558dfa377fe12f1f0d8559b374c54cdb72`。
- Job：66/66 steps completed，Playwright smoke and archive regression 成功。
- Smoke artifact：`guanyuan-g1-7-smoke`，artifact ID `14435749036`。
- 更早提交 `5dca02b` 的玩家边界契约测试曾失败；后续订阅生命周期/测试时序修正已进入最新 head，最新 head 的契约测试及完整流水线通过。

本结论只验收 PR #89 当前代码和 G1.7 自动化流程，不等于 W6 已接管 App，也不等于真人视觉眼审已完成。

## 2. 已有领域能力：无需另造玩家事实表

### 2.1 Person origin 已包含玩家来源

`PersonOrigin` 已有 `{ kind: 'player-character' }` 分支。W6 `person.created` reducer 已实现：

1. 检查世界已初始化；
2. 检查人物与生命史 ID 唯一；
3. 校验人物生命状态；
4. 拒绝世界中已存在第二个玩家人物；
5. 当 origin 为 `player-character` 时，将该人物 ID 写入投影的 `playerPersonId`。

因此，正式玩家人物应复用现有 Person、PersonOrigin、LifeHistory 和事件账本，不得新建 Character 表或第二套人物事实源。

### 2.2 当前初始化流程不创建玩家人物

`initializeWorldThroughPorts` 当前只负责：

- 写入版本化 WorldBootstrapMetadata；
- 创建 seeded-random 人口候选；
- 创建有 allow-list 与史料依据的 historical-minister 人物；
- 支持稳定 request ID、重复执行与部分失败续跑。

它不会创建 `player-character`，也不会设定 `playerPersonId`。这属于明确的职责边界，不应把随机人口、历史人物或七人河工夹具提升为玩家人物。

## 3. 真正缺失的是首次创建前的可信身份

W6-H 的 `WorldCommandPrincipalPort` 解析的是游戏内 `PersonId`。但玩家首次创建人物前尚无 PersonId，形成身份生命周期的先后依赖：

`authenticated account/session → world ownership → player Genesis → player PersonId → W6-H principal`

当前仓库已实现最后一段（PersonId 作为玩家命令 principal），但没有可核实的账号认证适配器、世界所有权绑定存储或首次 Genesis 的恢复协议。进一步核对 W5 持久化后发现，`IndexedDbSaveRepository` 的 world row 仅以 `worldId` 为主键，保存 latest package/checksum/time/head 等信息，不含 owner/account/session 字段；`runtime-save-orchestrator.ts` 服务的是 W5 PreviewRuntime。它们不能被视为 W6 的账号身份或世界所有权适配器，也不应为了填补缺口而改写 W5 Save/Restore。W6 当前 in-memory adapter 也不提供持久 owner binding。

**不得**通过以下方式绕过：

- 把请求体的 `actor` 当作身份；
- 允许匿名 UI 直接提交 `source: 'rule'` 的 `person.create`；
- 把 `person.create` 或 `authorization.grant` 暴露给普通 UI；
- 以本地随机 UUID 或浏览器状态冒充已验证的账号/世界所有权；
- 先开放 raw command port，之后再补权限。

## 4. 建议的受信 Genesis 能力边界

在确认实际认证/存档所有权提供方后，再定义并实现独立的窄能力端口。建议职责分开：

### 4.1 认证与世界所有权

受信适配器必须提供稳定的 account/session owner key，并对 `worldId` 执行持久、原子、可重试的所有权校验/预留。该 owner key 是应用层安全主体，不是游戏人物，也不进入 Person 关系矩阵。

最低语义：

- 未认证：拒绝；
- 世界属于其他 owner：拒绝；
- 首次创建：为 owner + world + idempotency key 建立唯一 Genesis reservation；
- 同一 owner 重试：返回同一 reservation；
- 不同 owner 并发争抢：仅一个成功；
- reservation 必须可恢复，不能因事件提交后客户端断线而丢失绑定。

### 4.2 玩家人物创建

受信 Genesis coordinator 接受有限的人物创建输入，而不是任意 LedgerEvent/WorldCommandRequest。由 coordinator 生成 PersonId、CapabilityRef、各 StateDomain 引用和 LifeHistoryRef；不接受 UI 指定 actor、source、event kind、权限或 playerPersonId。

经既有事件目录与命令端口提交：

- intent：`person.create`
- event：`person.created`
- origin：`player-character`
- source：仅由可信内部流程使用的 `rule` / system composition
- actor：由内部流程固定，不取自 UI
- expectedHead：从当前 aggregate 读取并校验
- clientRequestId：与 Genesis reservation 绑定，重试不生成第二个人物

玩家人物的出生时间必须落在当前 Genesis 世界时间之前，并由对应时代/地域规则验证；年龄、家庭成员年龄与成长履历应满足现行生命规范。当前历史基线为嘉靖二年，不能沿用晚清人物创建规则。具体县域尚未冻结，不在此处硬编码。

### 4.3 Owner → PersonId 持久绑定与恢复

Ledger 提交与账号所有权存储可能不是同一事务，不能假定二者天然原子。需要可恢复的两阶段/状态机协议：

1. 建立 Genesis reservation；
2. 以 reservation 的稳定 PersonId 与 clientRequestId 提交 `person.created`；
3. 从重放后的 aggregate 确认 `playerPersonId` 与 reservation 一致；
4. 持久完成 owner → world → PersonId 绑定；
5. 重试时若账本已提交但 owner 绑定未完成，验证 reservation 和 aggregate 后补完成绑定，不重复追加人物；
6. 若绑定指向另一个 PersonId 或 reservation 不匹配，fail closed 并保留诊断证据。

不得仅靠前端内存状态完成这一步。

## 5. 玩家人物创建首期范围

首期只完成“玩家人物被可信创建并可由可信 principal 找回”，不扩展成完整人物创建器：

- Person 核心字段与出生时间；
- player-character provenance；
- 系统生成的状态域引用与 LifeHistory；
- owner/world/PersonId 绑定；
- 事件账本、重放、存档恢复与幂等；
- 玩家边界通过可信 principal 读取自己的 observer projection。

不在此工作包中预置朋友、座师、同年、同窗、盟友或政敌。玩家个人 Relation 矩阵保持空白；若开局选择家庭，亲属必须作为独立 Person 和有来源的家庭事实另行提交，不得把家庭事实伪装成朋友/社会关系。初始身份、教育、能力倾向及家庭模板需按现行人物创建设计和明代规则逐项定义，不由本施工单臆造。

## 6. 必须覆盖的测试

- 未认证 owner 不得 reserve/create；
- 非 owner 不得认领已有 world；
- 两个 owner 并发争抢只允许一个成功；
- 同 owner 同 idempotency key 重试得到同一人物；
- 不同 idempotency key 不能创建第二个 player-character；
- 已存在 playerPersonId 时拒绝第二个玩家人物；
- event append 成功、owner binding 失败后可恢复且不重复追加；
- aggregate playerPersonId 与 owner binding 不一致时 fail closed；
- person birth 晚于世界时间、非法状态域引用、重复 ID 均拒绝；
- UI 不能传入 actor/source/permission/scope/playerPersonId；
- Genesis 完成前 W6-H player query 无视图，完成后只能读取该人物的 observer projection；
- save/restore 与从 genesis 全量重放得到相同 playerPersonId 和 owner binding 结果。

## 7. 阻断项与下一步

当前尚未确认实际账号认证与世界所有权存储提供方，且现有 W5 IndexedDB 存档不具备 owner binding。因此本轮只锁定边界与恢复语义，不写一个假定本地账号体系的实现，不把 worldId 当作身份凭据，不改造 W5 Save/Restore，也不接 App。

下一项施工应先核实项目当前存档/账号身份模型与运行环境，确定 owner key 的可信来源及持久化适配器；随后实现 Genesis reservation、人物事件提交、绑定恢复和端到端重放测试。只有该流程通过，才开放人物创建 UI 的窄 Genesis capability。

## 8. 前端、美术与交互约束

本工作包不改变 App 现有页面、导航、排版、动效、输入方式或场景交互，不新增占位图。若后续人物创建 UI 需要新美术，必须先由项目负责人生成正式资源；施工前另列资源清单和完整生成提示词。W6-I 的视觉回归继续覆盖 1440 / 1024 / 390 三档，自动化截图不能代替眼审。

## 9. 分阶段身份方案决策（2026-11-18）

项目负责人明确：**当前开发与测试阶段先使用本地单人身份；正式发行阶段再接入 TapTap 登录。** 因此 TapTap 接入不再是当前 Genesis 施工的前置阻断。

### 9.1 当前阶段：本地开发身份

- 通过明确限定为本地开发/测试环境的身份适配器提供稳定内部 `OwnerId`。
- 本地身份应可跨应用重启稳定恢复，并与本地存档所有权绑定；不得每次启动随机生成新身份导致存档失联。
- 本地适配器只提供测试身份，不模拟 TapTap 认证成功，不接受客户端任意传入 OwnerId 作为可信凭证。
- 必须通过构建配置/运行环境显式启用；生产构建必须拒绝本地身份适配器，不能保留可在线调用的测试后门。
- 领域层只依赖内部身份端口，不直接依赖本地存储实现或 TapTap SDK。

### 9.2 正式发行阶段：TapTap 身份适配器

正式发行时再核验并接入 TapTap 官方登录 SDK 与服务端票据验证。由服务端验证登录凭证后映射到内部稳定 `OwnerId`。TapTap 用户标识、昵称、头像或客户端自报登录状态均不能直接作为所有权凭证。

### 9.3 两阶段共用的领域与存档协议

无论本地身份还是 TapTap 身份，内核统一使用：

`OwnerId（账号/本地所有者） → WorldId（世界） → PersonId（世界中的玩家人物）`

- `OwnerId` 与 `PersonId` 严格分离；W6-H principal 仍是可信解析出的游戏内 `PersonId`。
- Genesis reservation、Owner/World/Person 绑定、幂等重试、跨重启恢复和事件追加后绑定失败的补偿协议保持一致。
- 当前本地适配器必须实现与未来 TapTap 适配器相同的端口契约；正式接入只替换身份提供方，不改造领域事实模型。
- 不得把 W5 PreviewRuntime / IndexedDB SaveRepository 自动视为 W6 账号存档系统；不得为此改写 W5 ledger、replay 或 save/restore。
- 施工前核实仓库实际运行环境、持久化数据库与构建配置；不臆造 SDK、服务端或数据库接口。

### 9.4 当前阶段施工许可

可继续开展本地身份适配器、Owner/World 持久化绑定、Genesis reservation、玩家人物事件提交、绑定恢复和端到端重放测试。不得提前实现 TapTap SDK 接入，不得让本地身份适配器进入生产构建。

## 10. PR #89 当前候选提交验收状态

候选 head：`ab36a78a3a0e2623284a87d86353e47a840e8970`；对应 G1.7 run：`44328904673`。2026-11-18 复查结果：

- Workflow：`success`。
- Job：`frontend`，66/66 steps completed。
- `Production build`：success。
- `Start Vite`：success。
- `Playwright smoke and archive regression`：success。
- `Upload smoke screenshots`：success。
- 无失败步骤。

本结果验收 PR #89 候选代码和 G1.7 自动化流程，不等于 PR 已合并，不等于 W6 已接管 App，也不等于真人视觉眼审完成。PR #89 仍保持 Draft/Open；不因 CI 通过而自动合并。

## 11. 本地身份适配器实施前核查

对 PR #89 的代码与其父分支进行核查后，确认：

- W6 application 层已有 `WorldCommandPrincipalPort`，其当前身份类型为游戏内 `PersonId`，不能直接复用为账号所有者身份。
- `WorldApplicationPorts` 暂无 Owner 身份或 Owner/World 持久绑定端口。
- W6 当前可见的 `in-memory-adapter.ts` 明确只服务预览、集成测试和本地组合，不提供跨重启持久性。
- `app/src/main.tsx` 当前仍挂载既有 W5 Preview App；不能将 W6 本地身份适配器直接接入现有 App，也不能借此迁移或改造 W5 存档。
- W6 application/domain 目录尚无独立 infrastructure adapter 层；后续若新增，应保持适配器位于应用边界之外，不能把浏览器存储 API 引入 domain。
- 当前仓库可确认 Vite 构建，但不能仅凭 `import.meta.env.DEV` 的开发期标志推断所有发布渠道均安全。生产禁用必须同时由适配器运行时 fail-closed 和生产构建验收覆盖。

### 11.1 下一施工边界

下一工作包仅建立 W6 本地开发 Owner 身份端口及其浏览器本地适配器，包含稳定 ID、跨重启恢复、存储损坏/不可用时拒绝、开发环境启用与生产环境禁用测试。它不接入 App，不创建 World，不提交人物事件，不触碰 W5 存档，也不改视觉、美术或交互。

Owner/World 原子预留、Genesis reservation 与事件提交恢复属于后续独立工作包；不得用 localStorage 的单键写入冒充多记录事务或并发原子锁。


## 12. 本地 Owner 身份适配器施工进度（PR #90）

PR：[#90](https://github.com/suzhiyi90-max/Guanyuan/pull/90)，目标分支为 PR #89 已验收候选分支，保持 Draft/Open。

当前 head：`6a90b7fa16ddc900c3228eaf0f1892a493eb62cb`。最新 G1.7 workflow run：`44332859747`，仍在执行中；此前运行的新增本地身份契约步骤已通过，但最终验收必须以最新 head 对应的完整工作流结论为准。

已实现的首期边界：

- 应用层 `OwnerId` 是 provider-neutral branded ID，与 `PersonId` 分离；只有可信身份适配器可以构造该值。
- 本地适配器单独验证 `owner:local:<UUIDv4>` 格式，并从独立的 W6 local-owner storage key 读取/写入。
- 首次创建后执行回读确认；存储损坏、读取失败、写入失败或写入未确认均 fail closed，不自动更换身份。
- 浏览器组合工厂由 Vite `import.meta.env.DEV` 保护；生产构建下调用立即拒绝。
- 测试覆盖跨适配器实例恢复、无效 UUID、损坏存储、存储故障、写入确认和 provider-neutral OwnerId 映射。

当前明确未做：

- 未接入 W5 Preview App / React UI。
- 未读取或修改 W5 IndexedDB、SavePackage、runtime save/restore。
- 未实现 Owner/World 原子预留、Genesis reservation、人物事件提交或 Owner→PersonId 绑定恢复。
- 未修改页面、导航、布局、动效、交互或美术资源。

**验收限制：** localStorage 只作为当前单机开发身份的持久化载体，不承担多记录事务、跨标签原子锁或世界所有权争抢。上述能力必须在后续 Owner/World reservation 工作包中由明确的事务适配器实现。


## 13. 跨标签页初始化互斥补强（PR #90 后续修订）

第一轮完整 G1.7：run `44332859747`，67/67 steps success。通过后复核发现 localStorage 首次写入/回读本身不构成跨标签页互斥，因此没有直接把第一轮结果作为最终身份适配器验收。

PR #90 后续增加：
- `OwnerIdentityInitializationLockPort`，把初始化互斥作为显式注入端口。
- 浏览器组合使用 Web Locks API 对同一 local-owner 初始化键执行跨标签页互斥；不支持 Web Locks 时 fail closed，不降级为无锁创建。
- 并发测试用两个独立适配器实例共享同一存储和互斥端口同时首次 resolve，要求返回相同 OwnerId，且 UUID 仅分配一次。
- 重启恢复、损坏存储、读写故障、写入回读确认和生产禁用测试继续保留。

补强提交：`0b473a1b5a5f42379b73e6b4789ab4138133dca4`。其对应最新 G1.7 run `44335272863` 尚在执行，最终验收以该 head 的完整工作流结果为准。

该互斥仅解决本地身份首次初始化，不承担 Owner/World 多记录事务、世界所有权竞争或 Genesis 幂等；这些仍属于下一阶段独立事务边界。


## 14. Owner/World 与 Genesis 下一阶段施工前置核查

基于 PR #89 候选代码（`cc53f6b`）复核：

1. `WorldApplicationPorts` 目前包含 commands、projector、queries、observerQueries、snapshots、simulation、candidates；没有 Owner 身份持久化、Owner/World 所有权登记或 Genesis reservation 端口。
2. `initializeWorldThroughPorts` 负责 `world.initialized` 和种群候选的幂等提交；它不是玩家 Genesis 服务，不得直接扩展成可由 UI 传入任意 player payload 的入口。
3. `person.created` reducer 已识别 `{ kind: 'player-character' }`，在同一 WorldAggregate 内拒绝第二名玩家人物并写入 `playerPersonId`。该事实仍必须经注册事件、命令授权和账本重放生成。
4. 当前 W6 `createInMemoryWorldAdapter` 的账本、聚合和命令队列均为进程内状态，不能承担跨重启的 Owner/World reservation 或 Genesis 恢复。
5. W5 `indexeddb-save-repository.ts` 是既有 SavePackage/PreviewRuntime 保存边界，不是 W6 Owner registry，也不能直接当作 W6 事务数据库复用。

### 14.1 下一工作包边界：W6-I-3 Owner/World Reservation

下一阶段先定义独立于 W5 的 W6 持久化事务边界，不立即把 player UI 接入。必须覆盖：

- Owner→World 的唯一性约束与事务性 reserve；同一 Owner 的相同 clientRequestId 幂等返回同一 reservation，不同请求不得悄悄生成第二个初始世界。
- WorldId 由可信应用服务分配，不能接受 UI 任意指定已有 WorldId 来认领。
- reservation 状态必须可恢复，并区分 reserved、Genesis event committed、owner-person binding finalized；不得把 localStorage 单键写入描述成多记录事务。
- Genesis service 只接受有限、版本化的角色创建输入；服务端/应用端生成 PersonId、CapabilityRef、state domain refs、LifeHistoryRef 和稳定 clientRequestId。
- 唯一的玩家人物事实仍由 `person.created` + `PersonOrigin { kind: 'player-character' }` 进入账本；禁止新增 Character 表或第二份 player truth。
- 事件提交后、Owner→PersonId 绑定前崩溃时，恢复流程必须从 canonical ledger replay 识别已提交的 playerPersonId 并完成绑定；不能重复 append 第二个人物。
- 事务与事件提交之间的边界要明确：若不能原子提交，使用 durable reservation + idempotent event append + replay-based repair；不能假装跨 IndexedDB object store / 内存 ledger 已经原子化。
- W6 必须有自己的 durable event ledger / transactional adapter 决策；在其边界明确前，不得声称当前 in-memory command adapter 已满足正式持久化。

### 14.2 验收门槛

unauthenticated owner、同 Owner 并发不同 request、同 request 重试、WorldId 冲突/冒领、reservation 写入中断、Genesis append 前中断、append 成功但绑定失败、第二玩家人物、恢复后重复提交、Owner/World/Person 不匹配、保存恢复与 genesis replay 一致性，全部需要独立契约测试。

该工作包不修改 W5 runtime-save-orchestrator / IndexedDB SavePackage，不接入 UI，不改视觉、交互或美术资产。待 W6 持久化边界和故障恢复模型完成审查后，再开始实现。
