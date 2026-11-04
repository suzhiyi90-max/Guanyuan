# Guanyuan / 观远

以州县官员社会模拟为题材的设计仓库与可运行前端原型。

## 结构

```text
设计总纲.md                 唯一权威设计源（规则、决策、索引）
Guanyuan-review/            参考专项、研究、内容生产草案
  content/                  非规范性内容包（场景清单、资产矩阵）
  archive/                  旧版前端提案归档
docs/                       治理索引、历史评审与素材说明
app/                        可运行前端原型
  src/                      React + TypeScript 源码
  public/assets/            原型素材
  scripts/smoke.mjs         浏览器冒烟测试
  docs/ASSETS.md            素材清单与来源记录
```

## 权威顺序

1. `设计总纲.md` 为唯一权威规则源。
2. `Guanyuan-review/` 下文档为参考材料；`content/` 中的场景与资产文档**不构成规则**。
3. `docs/reviews/` 只作历史追溯，不反向覆盖总纲。
4. 前端代码是原型，不反过来修改设计结论。

## 运行

```bash
cd app
npm install
npm run dev
```

默认预览：`http://127.0.0.1:5173/`

构建与测试：

```bash
cd app
npm run build
# 另开终端启动 dev / preview 后：
GUANYUAN_URL=http://127.0.0.1:5173 npm run smoke
```

Windows PowerShell：

```powershell
$env:GUANYUAN_URL = "http://127.0.0.1:5173"
npm run smoke
```

## 当前状态

- 设计：总纲 v0.12，地点/场景、舆图/行程、身份/互动、世界影响/回声已入正文；M1 仍只做一县河工十日。
- 前端：可运行的高保真原型，带本地存档、事务/人物/账房/夜宴/章末等流程。
- 素材：原型素材见 `app/docs/ASSETS.md`；正式发布前需补齐授权与生成记录。
- `node_modules/`、`dist/`、`local/` 不进入版本管理。

## 素材与备份

本仓库不包含第三方未授权素材。原型中用户提供的背景图和项目生成图仅用于当前开发验证；对外发布前逐项确认来源、授权与生成记录。迁移前源码备份位于工作区上一级目录 `guanyuan-app-source-backup-*.tar.gz`（不属于仓库）。
