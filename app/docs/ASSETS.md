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
