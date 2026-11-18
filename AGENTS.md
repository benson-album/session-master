# SessionMaster · 会话大师 — 项目上下文

> **本文件是唯一源。** 同目录的 `.hermes.md` 是指向它的符号链接（Hermes 会从子目录向上发现 `.hermes.md`）。
> Codex / Claude Code / Cursor 等工具直接读 `AGENTS.md`，内容完全一致，不需要另写一份。
>
> 本文件在工作目录（含子目录）时自动注入，**不占全局记忆配额**。
> 项目相关的事实只写在这里；全局记忆只保留"换项目也成立"的铁律。

## 一句话

Chrome 扩展（MV3），突破网站单设备登录、保护会话不被意外退出。作者 `benson-album`。

## 唯一事实源（禁止在别处复述/硬编码）

| 事实 | 唯一来源 |
|---|---|
| 版本号 | `src/manifest.json` → `version` |
| 站点与拦截规则 | `src/blocking_rules.json`、`src/blocking_rules_db.json`（`sites`） |
| 站点存储预设 | `src/storage_presets.json` |
| 登录判定规则 | `src/login_detect.json`（Cookie / 存储 / JWT / 登录页 / 接口探测） |
| 帮助文档内容 | `src/help/help_content.json` |
| 变更日志 | `src/changelog.json`（+ 根目录 `CHANGELOG.md` 面向人的摘要） |

popup / 帮助页 / README 的版本号与数量词一律**动态读取**，不得写死。

## 铁律

1. **动手前**先 `skill_view('sessionmaster-plugin')`（内含 14 项自检 + 101+ 陷阱）；**发版后**按 `sessionmaster-post-work` 收尾。
2. 版本号只改 `src/manifest.json`，其余位置自动同步（见下节）。
3. 功能变更必须同步六处：README、CHANGELOG、`help_content.json`（`sectionIds` 顺序 / sidebar 编号 / intro 功能表）、zip 打包、GitHub Release、`develop` 分支。
4. 配置与规则数据必须是**独立 JSON 文件**；文件是权威源，代码与缓存只是消费者，不得硬编码进代码。
5. 安全验证规则（密码格式、日期算法）**不得**出现在 UI、帮助页、文档；界面只提示"验证密码"。
6. UI 约定：辅助标签浅灰、分类标题纯文字、按钮文字求简、不加冗余边框。
7. 致远 OA 的退出拦截用 XHR `[LOGOUT]` 前缀 + 代码指纹判定，**不用定时器**；完全退出需当日日期 `YYYYMMDD`（不公开说明）。

## 版本一致性检查（自动化，别靠人记）

```bash
python3 scripts/check-version-consistency.py          # 只校验，不一致 → 退出码 1
python3 scripts/check-version-consistency.py --fix    # 自动改 README，并按 changelog.json 补 CHANGELOG.md 顶条
python3 scripts/check-version-consistency.py --json   # 机器可读，给 CI / 其它 AI 用
```

校验三处：README 里带「版本 / version」字样的行、`CHANGELOG.md` 顶条、`changelog.json` 顶条。
`release.sh` 的第 3 步已经内置这个检查并会**自动提交**被同步的两个文档；修不了（例如 changelog.json 少条目）则直接中止发版。

脚本是**项目无关**的（纯标准库）：自动探测 `src/manifest.json` → `manifest.json` → `package.json` → `VERSION` 作为版本源，
所以别的项目可以直接复制 `scripts/check-version-consistency.py` 使用，模板见本地 `_shared/` 目录。

## 目录与脚本

- `src/` 扩展源码（`manifest.json`、`content.js`、`background.js`、`blocking_rules*.json`、`storage_presets.json`、`help/`）
- `scripts/`：`build.sh` 构建、`release.sh` 发版、`check-version-consistency.py` 版本一致性、`validate-rules.py` 规则校验、`update-blocking-rules.py` 规则更新、`doc-health-check.py` 文档健康检查（7 项自动 + 3 项手动）
- 打包产物：`session-master-v<version>.zip`；**解压目录必须包裹版本号**（历史反复出现的 Bug #19）

## 长文入口（别抄进记忆）

- `docs/README.md` — 文档索引（design / process / analysis 三类）
- `docs/process/standard-development-process.md` — 8 阶段流程（PRD → 可行性 → 测试文档 → 开发计划 → 实施 → 自检 → 测试 → 发布）
- `docs/process/lessons-learned.md` — 问题复盘 + 文档健康检查清单 + 版本号规则
- `docs/process/phase3-compatibility-roadmap.md` — 兼容性路线图
- `docs/design/login-status-detection.md` — 登录状态判定：流程图、时序图、规则字段、边界、自测用例
- `docs/analysis/*.md` — 各站点存储分析报告
- 技能：`sessionmaster-plugin`、`website-storage-analysis`、`blocking-rules-maintenance`、`duplicate-check-pattern`、`sessionmaster-dev`

## 交接检查（改完代码前自问）

- 版本号是否只改 manifest？`check-version-consistency.py` 是否通过？
- 改的是「状态判定 / 数据类型 / 权限」类逻辑？→ 把所有消费它的功能（导出、导入、保活、同步、帮助文档、FAQ）逐个过一遍
- 帮助文档三处结构（sectionIds / sidebar / intro）是否同步？
- 新站点规则是否进了 JSON 而非代码？是否先做过重复检查？
- zip 名与解压目录是否都带版本号？Release 与 develop 是否同步？
