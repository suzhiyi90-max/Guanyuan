# W6-I-3 — Owner / World Reservation 与持久化 Genesis 架构审查 v0.1

状态：施工架构候选；本文件用于锁定 W6 独立持久化边界，不授权 UI 接入，不改变 W5 内核。  
基线：PR #89 head `cc53f6b26b9238c7b431399a2e23fb9579590add`；PR #90 head `0b473a1b5a5f42379b73e6b4789ab4138133dca4`。  
历史背景：项目当前开发阶段采用本地单人 Owner 身份；正式发行再接入 TapTap，领域协议不随身份提供方变化。

## 1. 本轮审查结论

W6-I-2 的本地 Owner 身份适配器已通过最新 G1.7 完整工作流（run `44335272863`，frontend 67/67 steps，success）。它只负责产生并恢复稳定 OwnerId；不代表 Owner 已拥有 World，也不代表玩家人物已经创建。

W6-I-3 不应把 W5 SaveRepository 改造成 Owner registry，也不应继续扩张 localStorage 身份键。应建立独立 W6 IndexedDB 持久化适配器，明确区分：

- Owner 身份：当前由 W6-I-2 本地开发身份适配器提供；
- Owner→World Reservation：一个 Owner 当前只能有一个初始 World reservation；
- World Event Ledger：唯一权威事实源，需跨应用重启持久化；
- Owner→Person 绑定：只有从该 World 的 canonical ledger 重放确认唯一 player-character 后才能完成；
- WorldAggregate：始终是 ledger 的派生投影，不建立第二份人物事实表。

## 2. 仓库事实核验

基于 PR #89 当前候选代码复核：

1. `WorldApplicationPorts` 暂无 Owner registry、Owner/World reservation 或 durable ledger 端口。
2. `createInMemoryWorldAdapter` 在进程内持有 ledger、aggregate、listener 和 command queue；它通过 `appendLedgerEvent`、schema validation 和 projector replay 工作，但进程重启后状态消失。
3. `WorldCommandPort` 只有提交请求接口；`WorldApplicationPorts` 没有持久化 ledger port，也没有初始化/恢复 W6 world runtime 的 durable adapter。
4. `appendLedgerEvent` 是纯追加函数，返回新的 immutable EventLedger；EventLedger 的规范结构包含 worldId、head、events、idempotency。其 request identity 由 world/source/intent/actor/clientRequestId 构成，fingerprint 用于识别相同请求 ID 下的内容冲突。
5. `person.created` schema 已接受 `PersonOrigin { kind: 'player-character' }`；reducer 在一个 aggregate 中拒绝第二名玩家人物，并设置 `playerPersonId`。这是正确的唯一人物事实，不需要新增 Character 表。
6. `initializeWorldThroughPorts` 是世界 bootstrap/人口物化流程，不是玩家 Genesis 流程；不可复用成 UI 任意提交人物 payload 的通用入口。
7. W5 `IndexedDbSaveRepository` 当前以 `guanyuan-world-saves` 保存 SavePackage 元数据和 package chain；它不包含 Owner 绑定，也不是 W6 的 canonical command ledger。W5 Save/Restore、runtime-save-orchestrator、Replay 均保持原样。

## 3. 持久化技术决策

### 3.1 使用独立 W6 IndexedDB 数据库

当前目标运行环境为 Vite 浏览器应用，仓库已使用原生 IndexedDB。W6 新增独立数据库（建议名：`guanyuan-w6-runtime`），不得复用或升级 W5 `guanyuan-world-saves` 数据库。

数据库 schema 版本必须显式管理，并至少包含以下 object stores：

- `ownerReservations`：以 ownerId 为主键；建立唯一 worldId 索引及 ownerId + clientRequestId 的幂等检索约束。一个 Owner 只允许一个有效初始 reservation。
- `worldMetadata`：以 worldId 为主键，保存 schema version、WorldId、world start time、ledger head/cursor 与必要的创建元数据；不存放可独立修改的 playerPersonId 事实。
- `worldEvents`：以复合键 [worldId, seq] 为主键；事件不可覆盖。另建 [worldId, idempotencyKey] 唯一索引或等价唯一记录，保证同一 world 的命令幂等。
- `ownerPersonBindings`：以 ownerId 为主键，并对 worldId、personId 建唯一约束；只保存从 canonical ledger replay 核实出的绑定指针和已核实 stream cursor，不是人物资料或第二份人物事实。

所有跨 store 写操作必须通过明确的 IndexedDB readwrite transaction 完成。事务中不得 await 网络、AI、projector 或其他非 IndexedDB 异步工作；事务关闭前的读改写应保持在 IDB transaction 生命周期内。失败必须 abort 并返回 fail-closed 结果。

### 3.2 为什么不把完整 EventLedger 当作单条大记录

把全部 events 和 idempotency 数组每次整体覆写会造成写放大，并使并发控制与单事件唯一约束不清晰。W6 持久化层应按 world/seq 存储不可变事件行，并维护 ledger head 与 idempotency 唯一记录；读取时按 seq 连续组装 canonical EventLedger，再交给现有 schema validator / projector / replay。

不得自行重写 event ID、seq、fingerprint 或 request identity 规则。追加事件必须调用现有 `appendLedgerEvent`，由其分配事件身份与幂等结果；持久化适配器负责在 IDB 事务内确认 expected head、唯一写入 event/idempotency、推进 head。若事务检测到 head 已变化，重新读取并依据相同 request ID 判断 duplicate/conflict，不能盲目覆盖。

### 3.3 事务边界

IndexedDB 可以在同一个数据库、同一个 readwrite transaction 中原子更新多个 object stores；但它不能与当前异步 projector、内存状态或外部认证提供方组成一个跨系统原子事务。

因此采用两阶段、可修复协议：

1. **Reservation transaction**：原子建立 Owner→World reservation 与 World metadata。唯一索引阻止 Owner 被并发分配两个 World，也阻止 WorldId 冲突。WorldId 由可信应用服务生成，调用者不可指定已有 WorldId。
2. **Genesis event append**：在 reservation 已 durable 后，通过 W6 canonical durable command/ledger adapter 追加 `person.created`（origin = player-character）。command 的稳定 clientRequestId 与 reservation 绑定。ledger 追加使用现有 appendLedgerEvent 规则与 IDB CAS/唯一索引。
3. **Projection/replay**：从 durable ledger 完整重放，确认 WorldId、stream cursor、唯一 playerPersonId 与人物来源。
4. **Binding finalize transaction**：仅在 replay 证据与 reservation 完全一致时，原子将 reservation 状态更新为 finalized 并写入 Owner→PersonId binding，保存确认的 ledger cursor。
5. **Recovery**：每次恢复先读取 reservation，再从 canonical ledger replay。若 player-character 事件不存在，按原 clientRequestId 继续；若已存在且内容匹配，直接完成 binding finalize；若存在冲突、多个玩家人物、Owner/World/Person 不匹配或 ledger 损坏，则 fail closed，不再 append、不生成替代人物。

reservation 状态限定为 `reserved`、`genesis-event-committed`、`binding-finalized`。状态只能单向推进；不能用 localStorage 单键状态代替这些 durable records。

## 4. 应用层端口与能力边界

新增端口应放在 W6 application 层，IndexedDB 实现放在 infrastructure/persistence 外层；domain 不得 import 浏览器 API。

至少需要独立的窄接口：

- `OwnerWorldReservationPort`：reserve、read、markGenesisCommitted、finalizeBinding、recover/list by owner；所有写方法要求可信 OwnerId 与 reservation/clientRequestId，不接收 UI 指定 WorldId。
- `DurableWorldLedgerPort`：load canonical ledger、append with expected head/idempotency、read events for replay。不能只暴露可任意覆盖 ledger 的 save 方法。
- `WorldGenesisService`：唯一可用的玩家初始人物创建 capability。输入是版本化、有限的 `PlayerGenesisInputV1`；不接收 actor、source、permission、scope、WorldId、PersonId、CapabilityRef、state domain refs、LifeHistoryRef 或 playerPersonId。
- `WorldRecoveryService`：启动/继续时负责从 durable reservation + canonical ledger replay 修复绑定；不得由 UI 自行推断或修复。

Genesis service 在可信应用组合内部使用专用 capability，不把 raw command/ledger port 暴露给 UI。Genesis event 的 actor/source 语义必须在实现前固定：它不能伪装成普通 NPC rule，也不能让 UI 伪造 player-command actor。建议通过专用的 Genesis command handler 构造事件 envelope，并由 reservation owner 校验其调用权限；handler 最终仍必须调用 canonical `appendLedgerEvent` 与既有 schema/projector/replay 链路。该语义需要在实现测试中证明。

当前 `WorldCommandPort` 的通用 request 含 actor/source/payload，不适合作为未认证 UI 的 Genesis 输入接口；不得直接把它传给 UI。durable adapter 不得复制出第二套事件 schema 或 reducer。

## 5. Genesis 输入与生成责任

`PlayerGenesisInputV1` 只表达经正式人物创建设计批准的玩家选择，不允许客户端指定领域内部 ID 或事实来源。内部应用服务生成：

- PersonId；
- CapabilityRef；
- body/mind/knowledge/goals/schedule/economy/location state-domain refs；
- LifeHistoryRef；
- reservation 绑定的稳定 clientRequestId；
- `PersonOrigin { kind: 'player-character' }`。

具体字段与初始值必须引用现行人物创建设计和版本化规则；本文件不臆造科举成绩、家世、能力数值、初始财富、年龄、地点或嘉靖二年县域。玩家人物 birth 在设计未冻结前遵守既有字段语义，不得用假历史值填充。

## 6. 故障矩阵与恢复规则

| 故障点 | durable 状态 | 恢复动作 |
|---|---|---|
| reserve 事务开始前失败 | 无 reservation | 可用同一 request 重试 |
| reserve 事务中断 | IDB transaction abort，reservation 不可见 | 同一 request 重试；不得残留半条绑定 |
| reserve 成功、Genesis append 前崩溃 | reserved | 读取原 reservation，继续原 Genesis request |
| Genesis append 事务中断 | ledger 事务整体提交或整体 abort | 重读 ledger/head 与幂等记录；只在确认未提交时重试 |
| append 成功、projection 前崩溃 | event 已 durable | 重放 canonical ledger，不重复 append |
| append 成功、binding finalize 前崩溃 | ledger 有唯一 player-character，reservation 未 finalized | replay 确认后补做 finalize |
| finalize 事务中断 | binding 与 reservation 状态原子提交或均不提交 | 重试 finalize；不能生成第二人物 |
| 同 Owner 不同 request 并发 | owner 唯一键竞争 | 一个 reservation 成功，另一个返回 owner-already-reserved，不静默创建第二世界 |
| 同 Owner 同 request 并发/重试 | owner/request 唯一约束 | 返回同 reservation；Genesis 返回同 event/person |
| 存储损坏、schema 不支持、IDB 不可用 | 状态不可信 | fail closed；保留数据，不自动重建身份/世界 |

## 7. 强制契约测试

必须覆盖并发与故障注入，不能只做 happy path：

1. 无 Owner、无效 Owner、Owner identity resolve 失败；
2. 同 Owner 同 request 并发 reserve，返回同一 reservation；
3. 同 Owner 不同 request 并发 reserve，只允许一个成功；
4. 不同 Owner 竞争同 WorldId（通过受控 ID allocator 测试），唯一约束拒绝冲突；
5. 客户端传入 WorldId、PersonId、actor、source、permission、scope 等额外字段时拒绝；
6. reservation transaction 中断/abort 后无半成品；
7. Genesis append 前中断、append transaction abort、append 成功后进程中断；
8. 同 request 重试返回同一 event/person；不同 request 不能创建第二 player-character；
9. append 成功但 binding finalize 失败，恢复后 replay 修复且 ledger event 数不增加；
10. reducer 拒绝第二玩家人物，持久层不能绕过；
11. ledger 缺 seq、重复 seq、idempotency mismatch、world mismatch、head mismatch、payload/schema 非法均拒绝恢复；
12. reservation Owner、World、Genesis event、aggregate.playerPersonId、binding personId 任一不匹配均 fail closed；
13. 多标签页并发和浏览器重启恢复；
14. 从 genesis 完整重放所得 aggregate.playerPersonId 与 Owner binding 完全一致；
15. W5 SavePackage/Restore 回归通过，且 W5 文件、schema、runtime orchestrator 没有改动。

## 8. 施工分解与验收门槛

### W6-I-3A — 端口与持久化协议
- 定义 reservation、durable ledger、Genesis capability、recovery contracts；
- 固定 IDB schema、唯一索引、事务和版本迁移策略；
- 不改 W5，不接 UI；
- 验收：纯类型契约、schema validation、事务状态机与故障矩阵测试。

### W6-I-3B — W6 IndexedDB reservation + canonical ledger adapter
- 实现独立 W6 DB；
- Owner/World reservation 原子事务；
- 按 seq 持久化 canonical event/idempotency records；
- 从持久化事件组装 ledger，继续调用现有 appendLedgerEvent、schema registry、projector/replay；
- 验收：并发、CAS、重复请求、损坏记录、跨重启恢复、W5 regression。

### W6-I-3C — Genesis service + binding recovery
- 仅允许版本化输入；
- 服务内部生成所有领域 ID；
- append player-character event；
- replay 验证并 finalize owner binding；
- 验收：所有故障注入、无重复 append、Owner/World/Person 一致性。

### W6-I-3D — 组合层安全验收
- 证明 UI 只能调用 Genesis capability，不能拿到 raw ledger/owner registry；
- W6-H principal 只能在绑定 finalized 后解析到 player PersonId；
- 未 finalized、异常或身份变化时玩家 query fail closed；
- 仍不迁移 UI、不改视觉/交互/美术。

**禁止提前启动 W6-I-4 App migration。** 只有 3A–3D 完整通过后，才进入人物创建 UI 的窄 capability 接线。

## 9. 视觉、美术与交互纪律

本工作包属于 application/infrastructure/persistence 层，不得改页面、导航、排版、纸本文书视觉系统、场景交互、输入方式、动效或现有组件层级。不得增加占位图、程序化插画、临时 CSS 图形或伪美术。当前不需要新增美术资源；未来人物创建界面若需要美术，由项目负责人生成正式资产，施工前另交资源清单及完整生成提示词。自动截图仍不能替代 1440 / 1024 / 390 三档真人眼审。

## 10. 未决实现细节（必须在 3A 实现前核定）

- 事件追加 actor/source 的 Genesis 专用语义，以及与现有 authorization gate 的组合方式；
- `WorldId` 安全随机分配器接口与失败策略；
- IndexedDB compound unique index 的键编码、迁移与损坏恢复策略；
- 事件读取/组装时的 schemaVersion、registryVersion 与 ledger 全量一致性校验；
- 当前 `createInMemoryWorldAdapter` 的 command pipeline 如何抽取为可注入 ledger store 的共享实现，避免复制命令语义；
- 现有项目测试环境对 IndexedDB transaction abort / 多连接并发的真实模拟能力。

这些未决项不得通过猜测或弱化约束解决。若需要先抽取 command pipeline，必须保持原 in-memory adapter 行为与现有 W6-E/G/H 回归不变。

## 11. 明确不在本工作包范围

- 不改 W5 event ledger、registry、replay、snapshot、SavePackage、restore、runtime-save-orchestrator；
- 不把 W5 save DB 直接当作 W6 owner registry；
- 不接 App / React UI，不改页面与视觉；
- 不接 TapTap SDK；
- 不引入服务端、云数据库或未经仓库确认的第三方依赖；
- 不创建 Character 表、player truth 副本或客户端可写的 playerPersonId；
- 不虚构嘉靖二年具体县名、行政区划、河段、人物史实或角色初始数值。

## 12. 本次架构审查结论

当前技术路径可行，但 3A 前必须先解决第 10 节列出的 Genesis actor/source 语义与共享 command pipeline 抽取方案。不得直接以现有 `WorldCommandPort` 作为 Genesis API，也不得在当前 in-memory adapter 外再复制一套 command semantics。

本文件通过后，下一施工提交先做 W6-I-3A 的接口/状态机/共享 command pipeline 设计与测试边界；只有代码证明能够复用现有 append/schema/projector/replay，才进入 IndexedDB 实现。

## 13. W6-I-3A 架构决策锁定（2026-11-19）

本节以 PR #89 最新 head `198cc008b75ac80d7f9364ecc8013e4b803b5e8d` 与 PR #90 最新 head `37375383812b6538db4d978dd5228bcae3e80a31` 的代码为依据，覆盖第 10、12 节中已经解决的 Genesis actor/source 与 command pipeline 抽取问题。

### 13.1 Genesis 的 actor/source 语义

**决定：Genesis 是 Owner 发起的 player-command，不伪装成 rule/schedule/system 事件，也不扩展 LedgerSource 枚举。**

- `source = 'player-command'`；
- `actor = OwnerId`（保留其自身命名空间，例如 `owner:local:<UUID>`），不伪装成尚未创建的 PersonId；
- `intentKind = 'person.create'`，事件 kind = `person.created`；
- `clientRequestId` 由可信 reservation service 生成并持久化，客户端不得提供、覆盖或重置；
- payload 仍严格遵循现有 `person.created` schema：`{ person, origin: { kind: 'player-character' } }`，不得为了塞入 OwnerId 而扩展 payload 或复制人物事实。

理由：LedgerSource 已有 `player-command`，而 Genesis 的因果发起者确为已认证 Owner。把它记作 `rule` 会错误表达事实来源；把 OwnerId 伪装为 PersonId 则破坏身份边界。Ledger event actor 当前为 string，故保留 OwnerId 的命名空间字符串即可；Owner→World reservation 记录与事件的 worldId + clientRequestId + actor 构成可核验关联。

### 13.2 Genesis 的授权边界

Genesis 不经过 `createAuthorizationGatedWorldCommandPort` 的 PersonId 授权路径，因为此时 player Person 尚不存在；也不放宽该 gate。

- `WorldGenesisService` 是单独的、窄能力入口，只暴露 `create(PlayerGenesisInputV1)` 与必要的恢复查询。
- Service 内部从可信 `OwnerIdentityPort` resolve OwnerId；禁止从 UI 参数接收 ownerId、worldId、actor、source、permission、scope、PersonId 或任何领域内部引用。
- Service 必须先读取/建立该 Owner 的 durable reservation，再从 reservation 取得 WorldId 与稳定 clientRequestId。
- 只有 reservation service 持有的私有 append capability 能产生上述 Genesis event。通用 `WorldCommandPort`、raw ledger store 和 reservation store 不得暴露给 UI。
- 事件提交后，只有完整 canonical ledger replay 确认 `aggregate.playerPersonId` 与唯一 `player-character` origin，才能 finalize Owner→Person binding。
- Genesis finalized 后，W6-H 的 principal adapter 才能将可信 OwnerId 映射为绑定 PersonId；既有 `requireWorldPlayer` 检查继续执行，不降低要求。

### 13.3 共享 command pipeline：先 prepare，再原子 append

当前 `createInMemoryWorldAdapter` 的 command 路径在一个函数中完成 intent 映射、schema validation、`appendLedgerEvent`、expected-head 检查、projector rebuild 和内存发布。不能为 IndexedDB 复制这套语义。

W6-I-3A 抽取纯 application command processor，概念接口：

```ts
prepareWorldCommand({
  ledger,
  request,
  registry,
  projector,
}): Promise<
  | { status: 'prepared'; nextLedger; nextAggregate; event; idempotencyRecord }
  | { status: 'duplicate'; event; streamHead }
  | { status: 'conflict'; reason; streamHead }
  | { status: 'rejected'; reason; streamHead }
>
```

约束：
1. 对 request 做 plain-JSON snapshot / validation；沿用当前 intent→kind allow-list，不允许未知 intent fallback。
2. 校验 worldId 和 expectedHead；幂等 duplicate 检查仍必须支持“提交成功但响应丢失后重试”。
3. 通过现有 `validateWorldDomainEventPayload` 和 `appendLedgerEvent` 生成候选 ledger/event/idempotency record。
4. 通过现有 `WorldProjectionPort.rebuild` 对候选 ledger 做 reducer/domain invariant 校验；未通过不得提交。
5. 返回 prepared 结果，不在 processor 内写 IndexedDB、不修改 W5、不发布 UI。
6. Adapter commit 阶段必须执行 expected-head compare-and-swap；只有 CAS 成功才持久化候选 event、idempotency record 与新 head。
7. 若 CAS 失败，重新 load canonical ledger 并重新 prepare；不能把旧 candidate 覆盖到新 head 上。
8. 同 request 并发时，持久化层在事务内先查唯一 idempotency key：fingerprint 一致返回 duplicate，不一致返回 idempotency conflict；这比简单 head conflict 优先。
9. In-memory adapter 也改为调用同一 processor，并以其现有串行 command queue + 内存 CAS 完成 commit；保持既有 receipt 行为、listener 发布时机和 replay 结果。

这里的 prepare/commit 分离是 application/infrastructure 边界，不更改 domain ledger 规则。processor 不复制 event schema、reducer 或 idempotency 算法。

### 13.4 W6 durable ledger 的重建与防篡改校验

持久化层按 `[worldId, seq]` 存事件行，并按 `[worldId, idempotencyKey]` 存幂等行。加载时不能直接信任数据库中保存的 head、key、fingerprint 或数组顺序。

**规范重建方法：**
1. 从空 `createEventLedger(worldId)` 开始；
2. 按 seq 连续读取事件，要求 seq 从 1 开始无缺口、无重复，event.worldId 与目标一致；
3. 对每条存储事件，剥离持久化 envelope 字段，使用现有 `appendLedgerEvent(rebuiltLedger, eventInput, event.committedAt)` 重建；
4. 必须返回 `appended`，并逐字段核对重建事件与存储事件一致；若返回 duplicate/conflict/rejected 或任何字段不一致，fail closed；
5. 比较由 appendLedgerEvent 重建出的 idempotency rows 与持久化 idempotency store 的所有记录，要求一一对应且 key、eventId、fingerprint 全部一致；
6. 比较重建 head 与 world metadata head；不一致则拒绝恢复。

此法复用现有私有 idempotency 语义，不修改或导出 W5/domain kernel 内部算法。事件 ID 当前由 ledger 依 seq 生成，重建核对必须覆盖 event id、worldId、seq、source、kind、intentKind、actor、requestWorldTime、clientRequestId、payload、committedAt。

### 13.5 IndexedDB 事务协议进一步明确

W6 独立数据库建议 stores：

- `ownerReservations`：ownerId 主键；worldId unique index；持久化 reservationId、requestId、genesisRequestId、状态与 schema version。
- `worldMetadata`：worldId 主键；持久化 schema/registry/ruleset version、start time、head/cursor。
- `worldEvents`：复合主键 [worldId, seq]；只允许 add，不允许 put 覆盖既有事件。
- `worldIdempotency`：复合主键 [worldId, key]；只允许 add；唯一性由主键保证。
- `ownerPersonBindings`：ownerId 主键；worldId 与 personId unique index；只存最终绑定指针及核验 cursor。

Reservation transaction 在单个 readwrite transaction 中对 ownerReservations 与 worldMetadata 原子 add；Genesis append transaction 对 worldMetadata、worldEvents、worldIdempotency 原子 CAS/add；binding finalize transaction 对 ownerReservations 与 ownerPersonBindings 原子更新。跨事务流程仍由 durable reservation 状态机恢复，不声称整个 Genesis 是单一事务。

### 13.6 3A 的实际交付范围与验收

3A 首个代码提交只做共享 processor 抽取及其纯契约测试，不引入 IndexedDB、不迁移 UI、不修改 W5。必须证明：
- 现有 in-memory command 行为与 receipt 类型兼容；
- expected-head stale request 被拒绝，不写 ledger；
- 同 request retry 返回 duplicate，不追加第二条；
- 相同 request key、不同 fingerprint 返回 conflict；
- 未知 intent / 非法 payload / projector reducer invariant failure 均不写入；
- projector failure 不发布新 aggregate、不通知 listener；
- command queue rejection 后队列仍可继续处理后续请求；
- 原有 world adapter、authorization gate、player boundary、world projector 与全量 G1.7 回归不退化。

通过后再实现 3B IndexedDB adapter。3A 不改 event-ledger domain kernel，不新增 LedgerSource，不触碰 W5 文件。

### 13.7 仍需在 3B 前核定的技术细节

- IndexedDB 事务中 request callback / promise continuation 的生命周期，必须以真实浏览器多连接测试验证，不能仅靠 fake-indexeddb 证明。
- 数据库 schema 升级、blocked/versionchange、多标签页关闭与损坏处理。
- WorldId allocator 的注入接口、随机源和失败策略。
- IndexedDB store 读写操作的事务封装，避免事务内跨越网络/AI/projector await。
- 完整 ledger 重建与 projector replay 的性能基线；不得在未测量前引入会改变一致性的快照捷径。

以上决策锁定后，W6-I-3A 可进入共享 processor 的代码实现；3B–3D 仍受各自验收门槛约束。
