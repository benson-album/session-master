# SessionMaster 标准开发流程

> **版本**：v1.0
> **适用范围**：所有 v2.0+ 功能开发

---

## 流程总览

```
PRD → 可行性分析 → 测试文档 → 开发计划 → 实施 → 自检 → 测试 → 发布
 │         │            │          │        │      │      │      │
 └─ 需求    └─ 技术      └─ 验收     └─ 排期   └─ 编码 └─ QA  └─ 验证 └─ 交付
```

---

## 阶段 1：需求（PRD）

**产出**：`docs/v2.0/PRD.md`

**检查清单**：
- [ ] 每个功能有唯一 ID（如 F1.1、F2.3）
- [ ] 每个功能有明确的当前状态 vs 目标状态
- [ ] 锁定规则有完整的正反例对照
- [ ] 空白页行为有定义
- [ ] 错误/异常场景有描述
- [ ] 数据存储变更已标注
- [ ] 兼容性/迁移路径已说明

---

## 阶段 2：可行性分析

**产出**：嵌入 PRD 的第六章，或独立 `docs/v2.0/feasibility-report.md`

**检查清单**：
- [ ] 每条需求逐行追踪代码路径
- [ ] 验证 try/catch 覆盖所有网络/异步操作
- [ ] 验证所有写入操作有输入校验或 null-safety
- [ ] 验证解锁操作不会导致未定义行为
- [ ] 标记阻礙项（🔴）并给出优化方案
- [ ] 给出可行性结论（通过 / 有条件通过 / 不通过）

---

## 阶段 3：测试文档

**产出**：`docs/v2.0/test-plan.md`

**检查清单**：
- [ ] 每个功能有正向测试用例（正常操作）
- [ ] 每个功能有边界测试用例（空值/极限值）
- [ ] 每个功能有异常测试用例（网络断开/错误输入）
- [ ] 跨层交互测试（第一层改配置 → 第二层行为变化）
- [ ] 空白页全场景覆盖
- [ ] 回归测试清单（确认 v1.x 行为未受影响）

---

## 阶段 4：开发计划

**产出**：`docs/v2.0/development-plan.md`

**检查清单**：
- [ ] 任务分解到可执行的粒度（每项不超过 30 分钟）
- [ ] 每项标注文件路径 + 变更类型（增/改/删）
- [ ] 有明确的先后依赖关系
- [ ] 每项有验收标准
- [ ] 有估算工时

---

## 阶段 5：实施（编码）

**产出**：代码变更

**规范**：
- 每个提交对应开发计划中的一项任务
- 提交信息格式：`[v2.0] 功能ID: 简短描述`
- 代码变更自检（见阶段 6）

---

## 阶段 6：自检

**产出**：自检报告（README 或随提交）

**13 项强制自检**：
1. JS 语法检查：`node --check <file>.js`
2. CSS 花括号平衡（如涉及 CSS 修改）
3. HTML 标签平衡（`<div>`/`<details>` 计数）
4. manifest 权限与引用文件检查
5. 版本一致性：VERSION / manifest.json / config.js / popup.html
6. `getCookies` 域解析 9 用例
7. 更新日志同步（CHANGELOG.md + changelog.json）
8. 选择器一致性（CSS class rename 必须同步 JS 引用）
9. 元素类型一致性（更新日志区统一使用 `<div>` 结构）
10. README 同步：版本号 / 新增文件清单 / 功能说明 / storage_presets 状态表
11. ZIP 目录结构验证：解压后为 `session-master-v{ver}/` 目录
12. 帮助内容同步：
    - `help_content.json` 的 `sectionIds` 数组顺序与实际章节顺序一致
    - `help.html` 的 `<nav id="sidebarNav">` 中每个章节都有对应 `<a>` 链接且编号正确
    - 新增功能需同步更新 intro 章节的核心功能表
    - 侧边栏链接锚点与章节 `id` 一致
13. 禁用词扫描：无 IP、域名、密码、路径等隐私泄漏

---

## 阶段 7：测试

**产出**：测试结果记录

**执行**：
- 按 `test-plan.md` 逐条执行
- 每项标注 ✅ 通过 / ❌ 失败 / ⏸️ 阻塞
- 失败项记录到 GitHub Issue

---

## 阶段 8：发布

**产出**：Release + Git tag

**流程**：
1. 更新 VERSION
2. 更新所有版本号引用（manifest.json / config.js / popup.html / help.html ×2）
3. 更新 CHANGELOG.md
4. 更新 changelog.json
5. **同步 README.md**：版本号 / 新增文件 / 功能说明 / storage_presets 状态表
6. 运行 `bash scripts/build.sh`
7. Git commit + tag
8. 推送至 GitHub
9. 创建 Release + 上传附件
10. 标记 Latest

---

## 文档位置

```
/opt/projects/session-master/
├── docs/
│   ├── v2.0/
│   │   ├── PRD.md              ← 需求文档（当前）
│   │   ├── test-plan.md        ← 测试文档（待创建）
│   │   └── development-plan.md ← 开发计划（待创建）
│   └── process/
│       └── standard-development-process.md  ← 本文档
├── CHANGELOG.md                ← 发布日志
├── VERSION                     ← 版本号
└── src/
    └── changelog.json           ← 帮助页更新日志数据
```
