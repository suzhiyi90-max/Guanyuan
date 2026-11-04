## Dependencies
- `expo-sqlite`：本机持久化游戏存档；统一经 `src/services/database.ts` 的迁移骨架访问。
- `react-native-svg`：绘制界面图标与品牌标记，替代 Web 原型的 Lucide。
- `react-native-reanimated`：纸签入场与减少动效适配。
- `expo-linear-gradient`：原生场景图的墨色遮罩与文字可读性处理。

## Architecture
- `src/app/index.tsx` 统一持有当前 Section、Scene、Overlay 与选择状态，六入口共用 `useGuanyuanGame()` 的同步状态动作层。
- `src/game/model.ts` 负责存档归一化、阶段与志向派生；`schedule.ts` 和 `people.ts` 保留原型规则，通过 `model.ts` 的 `GameState` 解耦 React。
- 原 Web 参考仅位于 `tmp/guanyuan-source/`，不是原生应用源码，也不参与 TypeScript 编译。

## Lessons
- 六入口不能套用最多五项的 Android NativeTabs，当前采用自定义 JavaScript 底部导航。
- 街市地点是异构常量数组，只有具备票据来源的茶楼可读取 `recordId`；该字段必须与来源记录一并定义，不能假定所有地点都有。
