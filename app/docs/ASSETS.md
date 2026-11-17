# 原型素材清单

> 目前仅用于开发验证，不是可对外发布的最终授权清单。正式发布前需补齐来源、生成工具版本、授权/使用范围与人工修改记录。

## 背景与场景

| 文件 | 用途 | 来源/状态 |
|---|---|---|
| `public/assets/county-office-dawn.jpg` | 县衙签押房清晨主背景 | 用户提供生成图；原型使用 |
| `public/assets/east-dike-dawn.jpg` | 东堤旧闸清晨主背景 | 用户提供生成图；原型使用 |
| `public/assets/study-night.jpg` | 夜书房背景 | 项目内素材；来源记录待补 |
| `public/assets/sang-residence-night.jpg` | 桑宅夜宴背景 | 项目内素材；来源记录待补 |
| `public/assets/east-dike-work.jpg` | 东堤抢护施工背景 | 项目内素材；来源记录待补 |

## 人物肖像

| 文件 | 人物 | 来源/状态 |
|---|---|---|
| `public/assets/portraits/xiancheng.jpg` | 县丞 | 项目内素材；来源记录待补 |
| `public/assets/portraits/liangshang.jpg` | 粮商 | 项目内素材；来源记录待补 |
| `public/assets/portraits/zhubu.jpg` | 主簿 | 项目内素材；来源记录待补 |
| `public/assets/portraits/foreman.jpg` | 工头 | 项目内素材；来源记录待补 |
| `public/assets/portraits/gentry.jpg` | 士绅 | 项目内素材；来源记录待补 |
| `public/assets/portraits/expert.jpg` | 河工专家 | 项目内素材；来源记录待补 |

## 地图

| 文件 | 用途 | 来源/状态 |
|---|---|---|
| `public/assets/A_refined_antique_Chinese_coun_2026-11-01T14-52-38.png` | 一县舆图 AI 底图（源图） | 本次会话 ImageGen 生成；母版 |
| `public/assets/yongji-county-base.png` | 裁切去水印后的地图底图 | 由源图裁切生成 |
| `public/assets/yongji-county-map-overlay.svg` | 地图路线、地名、图例叠加 | 本会话矢量绘制 |
| `public/assets/yongji-county-map-preview.png` | 1600×1000 地图预览 | 底图 + SVG 合成；原型预览 |

## 管理规则

1. 新素材先登记本表，再进入 `public/assets/`；不得只放文件不留来源。
2. 人物、场景生成图保留原始大图、生成工具与版本、提示词、人工修改记录。
3. 对外发布前，对用户提供图、项目生成图与第三方参考图分别确认授权；未确认的不得作为正式营销素材。
4. 文字、地名、数字、官衔、NPC 人脸与 UI 不烘焙进背景底图；由前端叠加。


## FE-170：正式人生开局美术资源接收

> 以下资源由用户于 2026-11-17 提交。此处记录的是本轮视觉验收与目标图位；源文件进入仓库前，不得把对应资源状态标记为已接入。图位与完整生成/返修说明见 `app/docs/FE-170-ART-INTAKE.md`。

| 上传文件 | 目标资源 | 用途 | 验收/接入状态 |
|---|---|---|---|
| `34442.png` | `public/assets/exam-registration-yard.png` | 科举报名、候场院落背景 | 画面通过；二进制文件待入库 |
| `34443.png` | `public/assets/exam-hall.png` | 科举考试号舍背景 | 画面通过；二进制文件待入库 |
| `34445.png` | `public/assets/exam-results-board-frame.png` | 放榜页透明装裱框 | 画面与透明通道通过；二进制文件待入库 |
| `34446.png` | `public/assets/audience-hall.png` | 官场正式拜谒厅堂背景 | 画面通过；二进制文件待入库 |
| `34444.png` | `public/assets/exam-desk.webp`（运行版）；透明 PNG 母版另存 | 科举考生桌案前景道具 | 工具完成背景分离和透明输出；待二进制进入 Git |
| `34447.png` | — | 旧版惊堂木 | 已由 34448.png 替代，不接入 |
| `34448.png` | `public/assets/court-gavel.webp`（运行版）；透明 PNG 母版另存 | 惊堂木独立前景道具 | 工具完成背景分离与透明输出；待二进制进入 Git |

## 美术资源施工铁律（FE-170）

- 能通过正式美术资源显著提高品质的，不得手搓 CSS/SVG/Canvas/伪元素替代；代码负责排版、交互、裁切、遮罩与状态。
- 新增资源必须先提供完整生图描述词，由用户生成并验收；施工方预留图位并负责检查、透明分离、去白边、压缩、格式转换、接入和回归。
- 透明背景不可直接生成时，优先使用图像处理工具；不可可靠分离时，说明缺陷并提出蒙版/分层等替代方案，不得把白底图直接叠在复杂背景上。
- 图位、二进制、路径、来源台账、加载回退和运行截图均闭环后，才可标记正式接入；未入库保持 pending。
- 背景不烘焙文字、地名、人物身份、官衔、数字或交互控件；这些由真实 UI 排版。
- 视觉资产接入不得破坏原型交互、键盘焦点、动效节奏、reduced-motion 与响应式表现。
