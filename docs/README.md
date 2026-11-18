# 文档索引

按用途分三类，改代码前先看对应的那篇。

## design/ — 设计文档（怎么做、为什么这么做）

| 文档 | 内容 |
|---|---|
| [login-status-detection.md](design/login-status-detection.md) | 登录状态判定：四段顺序、流程图、调用时序图、导出兜底流程图、`login_detect.json` 字段表、边界与已知限制、自测用例 |

新增设计文档的规则：**必须带图**（Mermaid 流程图或时序图）+ **必须写边界与限制** + **必须能被自测用例验证**。

## process/ — 流程与复盘

| 文档 | 内容 |
|---|---|
| [standard-development-process.md](process/standard-development-process.md) | 8 阶段开发流程 + 15 项强制自检（含依赖面连带检查、真实浏览器自测） |
| [lessons-learned.md](process/lessons-learned.md) | 问题复盘库（现象 → 根因 → 排查 → 修复 → 改正措施） |
| [phase3-compatibility-roadmap.md](process/phase3-compatibility-roadmap.md) | 兼容性路线图 |
| [v1.5.17-retrospective.md](process/v1.5.17-retrospective.md) | 单版本复盘样例 |

## analysis/ — 站点存储分析

各站点「登录态存在哪、关键 Cookie/Key 是什么、退出机制怎么实现」的实测报告，新增站点预设前必看，避免重复劳动。

## 与其他 AI / 工具的关系

- 项目根目录 `AGENTS.md` 是**唯一项目上下文**，`.hermes.md` 是它的符号链接（Hermes 从子目录向上发现）
- 版本号唯一源：`src/manifest.json`；文档与版本的一致性由 `scripts/check-version-consistency.py` 把关
- 流程图用 Mermaid，GitHub / VSCode 直接渲染，不需要额外工具
