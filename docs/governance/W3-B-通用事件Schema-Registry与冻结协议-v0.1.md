# W3-B 通用事件 Schema Registry 与冻结协议 v0.1

## 1. 施工定位

- 基线：W3-A `work/w3-a-append-only-event-ledger`。
- 本片：`work/w3-b-frozen-event-schema-registry`。
- 目标：提供可版本化、注册后冻结、只读验证的通用事件 Schema Registry。
- 本片不注册或冻结具体业务领域事件，不裁决 Q17 事件目录，不实现 Q13 RuleRef。

## 2. 核心规则

1. Registry 必须具有非空 registryId 与 registryVersion。
2. 每个事件 kind 在一个 registry 版本内最多注册一次；schemaVersion 为正整数。
3. Registry 以不可变值更新；register 返回新快照，不修改旧快照。
4. Registry freeze 后不可再注册；新增 schema 必须创建新的 registryVersion。
5. 只有 frozen Registry 可执行事件 payload 校验。
6. 校验结果必须携带 registryId、registryVersion、kind、schemaVersion，供后续事件/候选引用验证。
7. schema validator 必须是纯函数、确定性且无外部副作用；运行时异常转为 validator-threw，不向外泄漏异常。
8. 本片 validator 接收 JSON payload；领域 validator 负责语义规则，Registry 不推导领域事实。

## 3. 未决事项隔离

- Q17 的领域 EventKind/payload 联合目录尚未冻结；本片不注册任何正式业务 kind。
- Q13 RuleRef machine binding 方式尚未裁决；本片不引入 RuleRef 或 RuleRegistry。
- 本片 registryVersion 是 schema 目录版本，不是世界存档 schemaVersion，也不承担迁移/upcaster。
- AI candidate validation receipt 与事实提交的 candidateRef/validationRef 链路由 W3-D 实现；本片只提供可引用的 schema provenance。

## 4. 文件交付

- `app/src/domain/event-registry.ts`：通用 Registry、注册、冻结和 payload 校验。
- `app/src/domain/event-registry-test.ts`：版本、重复、冻结、未知 kind、验证失败和异常测试。
- `app/scripts/event-registry-test.ts`：CI 专项测试入口。
- `app/src/domain/index.ts`：导出 Registry API。
- `app/package.json`：专项测试脚本。
- `.github/workflows/g1-7-acceptance.yml`：Push / PR 双 CI。

## 5. 验收门槛

- W1—W3-A 全量回归通过。
- W3-B 专项测试全绿。
- Review index、Patch whitespace、Production build、Playwright smoke、截图归档通过。
- Push 与 PR 双 CI 对应同一最新 head SHA 且均成功。
- PR Draft/Open，不合并。
