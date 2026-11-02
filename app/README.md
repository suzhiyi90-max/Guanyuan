# 观远 · 前端原型

React 19 + Vite 6 + TypeScript 的可玩原型。设计权威不在此目录，见仓库根目录 `设计总纲.md`。

## 结构

```text
src/
  App.tsx                 页面外壳、导航与 UI 局部状态
  components/             场景、案卷、人物、事务、章末等组件
  game/                   游戏状态、日程与人物派生
  data.ts                 原型静态数据
  styles.css              当前统一样式（后续按 tokens/scene/panels 拆分）
public/assets/            原型背景、人物肖像与地图素材
scripts/
  smoke.mjs               浏览器冒烟测试
  assets-check.mjs        页面资源加载检查
docs/ASSETS.md            素材清单与来源记录
```

## 运行

```bash
npm install
npm run dev
```

预览地址：`http://127.0.0.1:5173/`

## 构建

```bash
npm run build
```

## 冒烟测试

`smoke.mjs` 默认访问 `http://127.0.0.1:5199`，可通过环境变量覆盖：

```bash
npm run dev -- --port 5199
# 另开终端：
npm run smoke
```

或：

```bash
npm run dev
GUANYUAN_URL=http://127.0.0.1:5173 npm run smoke
```

测试使用本机 Chrome（Playwright `channel: chrome`）。截图输出到系统临时目录。

## 已知边界

- 当前是交互原型，不是正式发布版本。
- 本地存档键：`guanyuan.save.v1`。
- `styles.css` 仍为单文件，后续拆分是 M2 前的工程债。
- 本地实验工具放在仓库根目录 `local/`（不进入版本管理），不参与应用运行。
