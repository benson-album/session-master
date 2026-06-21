# SessionMaster v2.0 — 可执行开发计划

> **版本**：v2.0-exec
> **粒度**：逐文件、逐函数、逐行操作
> **工时**：12-15h（P0 3.5h / P1 4.5h / P2 2h / P3 2.5h）
> **工作模式**：4 代理并行协作（项目管理 / 产品设计 / 功能测试 / 功能开发）

---

## Agent 架构总览

本项目采用 **4 代理并行协作** 模式，每个 Agent 有明确职责和产入产出的契约。

```
┌─────────────────────────────────────────┐
│        我（Hermes 主代理 — 总负责人）       │
│  方向设定 · 里程碑审查 · 决策升级         │
└────────────────┬────────────────────────┘
                 │ 委托管理
                 ▼
┌─────────────────────────────────────────┐
│          项目管理 Agent（PM）              │
│  任务调度 · 进度跟踪 · 日常决策          │
└────┬──────────┬──────────┬───────────────┘
     │  PRD/设计  │  代码实现  │  测试验证
     ▼           ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ 产品设计 │ │ 功能开发 │ │ 功能测试 │
│ Agent   │ │ Agent   │ │ Agent   │
│ (PD)    │ │ (DE)    │ │ (QA)    │
└─────────┘ └─────────┘ └─────────┘
```

### Agent 定义

| 层级 | 角色 | 代号 | 核心职责 | 产出物 | 输入文档 | 签字权 |
|:----:|:----:|:----:|:---------|:-------|:---------|:------:|
| 总负责 | **Hermes 主代理** | `ME` | 方向设定、里程碑审查、PM 管理、用户决策升级 | 方法论、决策记录、里程碑终签 | development-plan（审查）、communication/coordination（决策） | ✅ 终签 |
| 执行层 | **项目管理** | `PM` | 任务调度、进度跟踪、日常决策、风险上报 | task-cards（分配单）、sign-offs（里程碑）、coordination（协调） | development-plan.md（调度依据）、feasibility-report.md（约束参考）、src/（项目代码） | ✅ 批次内 |
| 执行层 | **产品设计** | `PD` | PRD 维护、UI/UX 决策、方案评审、帮助文档 | design-reviews（审查报告）、PRD.md 更新 | PRD.md（设计依据）、test-plan.md（测试覆盖参考）、development-plan.md（任务上下文）| — |
| 执行层 | **功能开发** | `DE` | 代码实现、模块拆分、bug 修复 | impl-reports（实施报告）、src/*（代码变更） | PRD.md（需求）、development-plan.md（任务细节+验证标准）、feasibility-report.md（技术约束）| — |
| 执行层 | **功能测试** | `QA` | 测试执行、回归测试、缺陷报告 | test-reports（测试报告）、defects（缺陷记录） | test-plan.md（用例）、PRD.md（预期行为）、development-plan.md（T?-V 验证步骤）、src/（实测代码）| ✅ 质量门禁 |

> **输入文档**是指该 Agent 在执行任务前必须读取/参考的文档，在每次 delegate_task 的 context 参数中携带。

### 工作流契约

```
我（总负责人）── 设定方向 · 审查里程碑 · 处理决策升级
      │
      ▼
PM 分解任务 ──→ DE 实施 ──→ QA 验证 ──→ PM 评估进度 → 向我报告
      ↑                                      │
      └────────── PD 审核设计变化 ─────────────┘
```

**每批次工作流**（以 P0 为例）：

1. **我**：将 P0 批次委托给 PM Agent，给定方向和约束
2. **PM**：从开发计划取出 T1，分配给对应的 Agent（T1→DE，T1-V→QA）
3. **DE**：读取 PRD + 开发计划 → 实施代码 → 提交到 PR 分支
4. **QA**：读取 PRD + 开发计划中的验证步骤 → 执行测试 → 写入测试报告
5. **PM**：收集 QA 结果 + DE 完成状态 → 判断任务是否通过
6. **我**：审查 PM 提交的里程碑报告，必要时升级给用户决策

### 每个 Agent 的问责点

#### 项目管理（PM）

| 职责 | 具体要求 |
|:-----|:---------|
| **任务分解** | 将 P0~P3 的批次拆分为可并行/可串行的子任务，分配给对应 Agent |
| **进度跟踪** | 每完成一个子任务更新一次 todo list，标记完成百分比 |
| **里程碑判断** | 发布时检查交付物清单是否完备、QA 是否已签过 |
| **变体追踪** | DE 发现计划不可行时 PM 负责协商调整 |
| **版本发布** | T13 的发布由 PM 最终执行 |
| **风险上报** | 遇到阻塞项（如构建失败、核心依赖不兼容）立即升级 |

#### 产品设计（PD）

| 职责 | 具体要求 |
|:-----|:---------|
| **PRD 维护** | 开发过程中发现 PRD 遗漏或歧义时更新 |
| **UI 一致性** | 审查 DE 实现的 UI 是否匹配 PRD 描述 |
| **帮助文档** | P3 阶段审查 help.html 的内容准确性 |
| **方案评审** | DE 提交涉及 API 变更/数据模型调整的方案时审核 |

#### 功能测试（QA）

| 职责 | 具体要求 |
|:-----|:---------|
| **测试用例维护** | 开发前确保 test-plan.md 覆盖本次改动 |
| **手动验证** | 每个 T? 子任务的验证步骤（T?-V）逐一执行 |
| **回归测试** | 每次合入新代码后执行受影响模块的回归用例 |
| **缺陷报告** | 发现 bug 时记录：复现步骤 + 预期 + 实际 + 影响范围 |
| **质量门禁** | ⛔ 未通过 QA 签字的代码不得合并到 master |

#### 功能开发（DE）

| 职责 | 具体要求 |
|:-----|:---------|
| **代码实现** | 按照开发计划的逐行操作准确实施 |
| **自测** | 提交前至少跑一次 build 确认无语法错误 |
| **模块拆分** | 遵循 `src/core/` 和 `src/popup/` 的模块划分约定 |
| **回滚保障** | 迁移代码保留旧键，确保可回滚 |
| **构建产物** | zip 包可正常加载到浏览器 |

### Agent 协作时序图

```
时间轴     我(Hermes)      PM              PD              DE              QA
──────┐   │               │               │               │               │
T1    │   │  委托P0批次 ──►│               │               │               │
      │   │               │  分配T1 ──────►│               │               │
      │   │               │               │               ├─ 实施代码 ────►│
      │   │               │               │               │               ├─ 验证
      │   │               │               ├─ 审查设计 ───►│               │
      │   │               │◄── 完成 ──────┤◄── 完成 ─────┤◄── VERIFIED ──┤
      │   │  ◄── 报告 ────│               │               │               │
      │   │  评估结果      │               │               │               │
M-P0  │   │  审查签字 ────►│               │               │               │
      │   │               │  里程碑签字 ──►│               │               │
──────┘   │               │               │               │               │
```

---

## Agent 通信协议

### 通信拓扑

采用 **三层 Hub-and-Spoke** 拓扑：**我是总负责人**，PM 是执行层调度枢纽，PD/DE/QA 是执行单元。

```
               用户（你）
                  │
                  ▼
             我（Hermes 主代理）
             ─── 方向 · 审查 · 升级
                  │  委托
                  ▼
            ┌─── PM ───┐
            │           │
           PD          DE ── QA
（设计审查）     （实施）   （验证）

不允许的直接通信：DE→QA、DE→PD、PD→QA
所有跨Agent通信必须通过PM中转
我直接接收PM的里程碑报告，不介入日常调度
```

**通信规则**：

| 方向 | 是否允许 | 说明 |
|:----:|:--------:|:-----|
| 我 → PM | ✅ | 委托批次、设定方向、审查里程碑 |
| PM → 我 | ✅ | 里程碑报告、决策升级 |
| 我 → 用户 | ✅ | 需要人工决策时由我升级 |
| PM → DE | ✅ | 分配实施任务 |
| DE → PM | ✅ | 返回实施报告 |
| PM → QA | ✅ | 分配测试任务 |
| QA → PM | ✅ | 返回测试报告 |
| PM → PD | ✅ | 请求设计审查 |
| PD → PM | ✅ | 返回审查报告 |
| DE → QA | ❌ 禁止 | **质量独立性原则**：QA 不得从 DE 获取上下文，只能基于 PRD + test-plan 验证 |
| DE → PD | ❌ 禁止 | DE 发现设计问题 → 报告 PM → PM 转 PD |
| PD → QA | ❌ 禁止 | 设计变更 → 经 PM 更新 PRD → QA 以 PRD 为准 |
| DE/PD/QA → 用户 | ❌ 禁止 | 所有跨层通信必须经过我或PM

**质量独立性原则**：QA Agent 在测试时不得读取 DE Agent 的实施报告，只以 PRD、开发计划、文件系统上的代码为输入，确保测试结果客观公正。

---

### 5 种标准通信卡片

Agent 之间的所有交流使用 **结构化通信卡片**，每个卡片有固定 Schema。

#### 卡片 1：任务分配单 — PM → DE/QA/PD

| 字段 | 类型 | 必填 | 说明 |
|:-----|:----:|:----:|:-----|
| `taskId` | string | ✅ | 唯一编号，格式 `{批次}-{任务}-{子步骤}`，如 `P0-T1-S2` |
| `assignee` | string | ✅ | 接收 Agent 代号：`DE` / `QA` / `PD` |
| `type` | string | ✅ | 任务类型：`code` / `test` / `review` / `design` |
| `priority` | string | ✅ | `high`（阻塞后续）/ `medium`（正常）/ `low`（可延后）|
| `title` | string | ✅ | 一句话任务标题 |
| `description` | string | ✅ | 具体要做的事情（可引用开发计划中的对应章节）|
| `input` | object | ✅ | 输入信息 |
| `input.files` | string[] | ✅ | 需要读取或修改的文件路径列表 |
| `input.references` | string[] | — | 参考文档（PRD 章节、开发计划链接等）|
| `input.constraints` | string | — | 特殊约束（如"保留旧键不动"）|
| `dependencies` | string[] | — | 必须先完成的任务 ID 列表 |
| `deadline` | string | ✅ | 预期耗时估算，如 `30min` / `1h` |
| `acceptance` | string[] | ✅ | 验收条件清单（完成本任务的最低标准）|

**传递方式**：写入 `docs/v2.0/communication/task-cards/{taskId}.md` + 通过 `delegate_task` 的 `context` 参数传递给子 Agent。

**模板**：

```markdown
## 任务分配单

| 字段 | 值 |
|:-----|:----|
| taskId | P0-T1-S2 |
| assignee | DE |
| type | code |
| priority | high |
| title | 实现 migration.js 链式迁移框架 |
| deadline | 30min |

### 输入
- **文件**: src/core/migration.js
- **参考**: development-plan.md §T1-S2
- **约束**: 保留所有旧键不动，只新增 v2_ 键

### 验收条件
1. [ ] runMigrations() 执行后 v2_sites 存在
2. [ ] v2_schema_version = 2
3. [ ] 旧键 heartbeat_configs / sync_config 未被删除
4. [ ] scripts/build.sh 通过
```

---

#### 卡片 2：实施报告 — DE → PM

| 字段 | 类型 | 必填 | 说明 |
|:-----|:----:|:----:|:-----|
| `taskId` | string | ✅ | 对应的任务分配单 ID |
| `status` | string | ✅ | `done` / `partial` / `blocked` / `found_issue` |
| `filesChanged` | array | ✅ | 变更的文件列表 |
| `filesChanged[].path` | string | ✅ | 文件路径 |
| `filesChanged[].operation` | string | ✅ | `create` / `modify` / `delete` |
| `filesChanged[].summary` | string | — | 改了些什么 |
| `buildResult.passed` | boolean | ✅ | 构建是否通过 |
| `buildResult.output` | string | — | 构建日志摘要 |
| `discoveredIssues` | array | — | 实施中发现的问题 |
| `discoveredIssues[].severity` | string | ✅ | `info` / `warning` / `blocker` |
| `discoveredIssues[].description` | string | ✅ | 问题描述 |
| `discoveredIssues[].suggestedAction` | string | — | DE 建议的解决方式 |
| `blockingReason` | string | — | 当 status=blocked 时必填 |
| `nextTask` | string | — | DE 建议下一步做什么 |
| `selfCheck` | array | ✅ | 自检清单（逐条标记 ✅ / ❌）|

**传递方式**：写入 `docs/v2.0/communication/impl-reports/{taskId}.md` + 在 `delegate_task` 返回值中作为总结返回。

**模板**：

```markdown
## 实施报告

| 字段 | 值 |
|:-----|:----|
| taskId | P0-T1-S2 |
| status | done |
| 耗时 | 25min |

### 变更文件
| 操作 | 文件 | 摘要 |
|:----:|:-----|:-----|
| create | src/core/migration.js | 实现 runMigrations + migrateV1toV2，131 行 |
| modify | src/background.js | 新增 onInstalled 调用 runMigrations 和 alarm 恢复 |

### 构建结果
✅ 通过（scripts/build.sh 无错误）

### 发现的问题
| 严重度 | 描述 | 建议 |
|:------:|:-----|:-----|
| info | getSites() 在 background.js 中尚未 import | 在 T1-S4 的 import 行中处理 |

### 自检清单
- [x] runMigrations 在 onInstalled 中被调用
- [x] 旧键保留，新键写入
- [x] v2_schema_version 递增
- [x] 代码无 console.log 调试残留
- [x] scripts/build.sh 通过
```

---

#### 卡片 3：测试报告 — QA → PM

| 字段 | 类型 | 必填 | 说明 |
|:-----|:----:|:----:|:-----|
| `taskId` | string | ✅ | 对应的任务分配单 ID |
| `status` | string | ✅ | `passed` / `failed` / `partial` |
| `environment` | string | ✅ | 测试环境描述（如 "Chrome 130, 加载 unpacked"）|
| `testResults` | array | ✅ | 每条测试用例的执行结果 |
| `testResults[].caseId` | string | ✅ | 用例编号，如 `T1-V-1` |
| `testResults[].description` | string | ✅ | 测试步骤描述 |
| `testResults[].result` | string | ✅ | `pass` / `fail` / `skip` |
| `testResults[].expected` | string | — | 预期结果 |
| `testResults[].actual` | string | — | 实际结果（fail 时必填）|
| `defects` | array | — | 发现的缺陷 |
| `defects[].id` | string | ✅ | 缺陷编号 `D001`、`D002`… |
| `defects[].severity` | string | ✅ | `critical`（阻塞流程）/ `major`（功能异常）/ `minor`（显示问题）|
| `defects[].title` | string | ✅ | 一句话概括 |
| `defects[].steps` | string | ✅ | 复现步骤 |
| `defects[].expected` | string | ✅ | 期望行为 |
| `defects[].actual` | string | ✅ | 实际行为 |
| `defects[].affectedFiles` | string[] | — | 涉及的文件 |
| `summary` | string | ✅ | 测试总结（几过几败，是否可以进入下一步）|

**传递方式**：写入 `docs/v2.0/communication/test-reports/{taskId}.md` + 在 `delegate_task` 返回值中返回。

**模板**：

```markdown
## 测试报告

| 字段 | 值 |
|:-----|:----|
| taskId | P0-T1-V |
| status | passed |
| 环境 | Chrome 130, 加载 unpacked, 已有 v1.5.14 数据 |
| 耗时 | 15min |

### 测试结果
| # | 用例 | 结果 | 说明 |
|:-:|:-----|:----:|:-----|
| T1-V-1 | scripts/build.sh 构建 | ✅ pass | 构建通过 |
| T1-V-2 | v2_sites 存在，含原站点域名 | ✅ pass | heartbeat_configs 中 3 个域名正确迁移 |
| T1-V-3 | v2_global 包含 signalUrl/serverUrl | ✅ pass | 设备名称正确 |
| T1-V-4 | 旧键未被删除 | ✅ pass | 4 个旧键全部保留 |
| T1-V-5 | 重载后 v2_schema_version=2，不再重复写入 | ✅ pass | 第二次 onInstalled 未修改 |
| T1-V-6 | 控制台无报错 | ✅ pass | 无异常 |

### 总结
所有 6 条测试用例通过。可以进入 P0-T2。

### 签字
- [x] QA: 功能验证通过
```

---

#### 卡片 4：设计审查报告 — PD → PM

| 字段 | 类型 | 必填 | 说明 |
|:-----|:----:|:----:|:-----|
| `taskId` | string | ✅ | 对应的任务分配单 ID |
| `status` | string | ✅ | `approved` / `changes_requested` / `needs_discussion` |
| `reviewScope` | string | ✅ | 审查范围（代码 / UI / 数据模型 / 文档）|
| `reviewedItems` | array | ✅ | 逐项审查结果 |
| `reviewedItems[].item` | string | ✅ | 审查项 |
| `reviewedItems[].finding` | string | ✅ | 发现（合规 / 偏差 / 不足）|
| `reviewedItems[].decision` | string | ✅ | `ok` / `modify` / `discuss` |
| `requestedChanges` | array | — | 要求修改的内容 |
| `requestedChanges[].description` | string | ✅ | 变更描述 |
| `requestedChanges[].priority` | string | ✅ | `must`（必须改）/ `should`（建议改）/ `nice`（锦上添花）|
| `docUpdates` | string[] | — | 需要更新的文档列表 |
| `notes` | string | — | 审查备注 |

**传递方式**：写入 `docs/v2.0/communication/design-reviews/{taskId}.md` + 在 `delegate_task` 返回值中返回。

---

#### 卡片 5：里程碑签字单 — PM 汇总

| 字段 | 类型 | 必填 | 说明 |
|:-----|:----:|:----:|:-----|
| `milestoneId` | string | ✅ | `M-P0` ~ `M-P3` |
| `batchPhase` | string | ✅ | 批次阶段名 |
| `deliverables` | array | ✅ | 交付物清单 |
| `deliverables[].id` | string | ✅ | 交付物编号 |
| `deliverables[].name` | string | ✅ | 交付物名称 |
| `deliverables[].verified` | boolean | ✅ | 已验证 |
| `deliverables[].verifier` | string | ✅ | 谁验证的 |
| `signatures.pm` | boolean | ✅ | PM 签字 |
| `signatures.qa` | boolean | ✅ | QA 签字 |
| `signatures.pd` | boolean | — | PD 签字 |
| `finalDecision` | string | ✅ | `approved` / `rejected` / `conditional` |
| `risks` | array | — | 已知风险项 |
| `blockersForNext` | string[] | — | 遗留问题 |

**传递方式**：写入 `docs/v2.0/communication/sign-offs/{milestoneId}.md`，PM 确认后更新入开发计划。

---

### 4 种通信流程模式

#### 模式 A：标准串行（无设计变更）

最常见的流程，DE 实施后 QA 验证。

```
PM                     DE                    QA
 │                     │                     │
 │  任务分配单 ───────►│                     │
 │ (P0-T1, type=code)  │                     │
 │                     │  实施代码           │
 │                     │  自检通过           │
 │  ◄─── 实施报告 ─────│                     │
 │   (status=done)     │                     │
 │                     │                     │
 │  任务分配单 ──────────────────────────────►│
 │ (P0-T1-V, type=test)                     │
 │                                          │  执行测试用例
 │  ◄──── 测试报告 ──────────────────────────│
 │     (status=passed)                      │
 │                                          │
 │  ✓ 更新 todo: T1 完成                    │
 │  → 分配 T2                               │
```

**PM 收到实施报告后**：
1. 检查 `buildResult.passed` — 构建必须通过
2. 检查 `selfCheck` — 所有自检项必须 ✅
3. 检查 `status` — 如果是 `blocked`，转模式 D（阻塞处理）
4. 如果都通过，发出测试任务给 QA

**PM 收到测试报告后**：
1. 检查 `status` — `passed` 则标记任务完成
2. 如果是 `failed`，提取 `defects`，转模式 C（缺陷修复）
3. 更新 todo list，进入下一个任务

---

#### 模式 B：设计变更触发（DE 发现设计问题）

当 DE 在实施过程中发现 PRD 未覆盖或设计不合理时触发。

```
PM                     DE                    PD
 │                     │                     │
 │  任务分配单 ───────►│                     │
 │                     │                     │
 │  ◄─── 实施报告 ─────│                     │
 │ (status=found_issue,│                     │
 │  discoveredIssues=  │                     │
 │  [{severity:warning,│                     │
 │    description:     │                     │
 │    "数据模型缺少X"}]│                     │
 │                     │                     │
 │  评估问题严重度     │                     │
 │                     │                     │
 │  设计审查单 ──────────────────────────────►│
 │   (type=review)     │                     │
 │                                          │  审查设计
 │  ◄──── 审查报告 ──────────────────────────│
 │     (status=        │                     │
 │      changes_request│                     │
 │      ed,            │                     │
 │      must:更新PRD)  │                     │
 │                     │                     │
 │  ✓ 更新 PRD         │                     │
 │  任务分配单 ───────►│                     │
 │  (追加: 按新设计改) │                     │
 │                     │                     │
```

**PM 决策规则**：

| DE 报告的 severity | PM 采取的行动 |
|:------------------:|:-------------|
| `info` | 记入备忘录，继续执行 |
| `warning` | 判断是否影响里程碑质量：是→发 PD 审查；否→记入备忘录继续 |
| `blocker` | 暂停当前批次，必须发出 PD 审查单 |

**PD 审查后 PM 决策**：

| PD 返回 status | PM 采取的行动 |
|:--------------:|:-------------|
| `approved` | 通知 DE 继续 |
| `changes_requested (must)` | 阻塞当前任务，发出新任务分配单给 DE 修复 |
| `changes_requested (should)` | 评估影响，可延期修复或立即修 |
| `needs_discussion` | 升级给用户人工决策 |

---

#### 模式 C：缺陷修复（QA 发现 Bug）

QA 测试发现缺陷后的修复流程。

```
PM                     DE                    QA
 │                     │                     │
 │  ◄──── 测试报告 ───│                     │
 │   (status=failed,   │                     │
 │    defects=[{       │                     │
 │      id:D001,       │                     │
 │      severity:major,│                     │
 │      title:"X不Y",  │                     │
 │      steps:"1.打开" │                     │
 │    }])              │                     │
 │                     │                     │
 │  评估缺陷严重度     │                     │
 │  ✓ 决定修复         │                     │
 │                     │                     │
 │  任务分配单 ───────►│                     │
 │ (修复 D001)         │                     │
 │                     │  实施修复           │
 │  ◄─── 实施报告 ─────│                     │
 │   (status=done,     │                     │
 │    修复了 D001)     │                     │
 │                     │                     │
 │  任务分配单 ──────────────────────────────►│
 │   (重测 P0-T1-V)    │                     │
 │                     │                 重跑测试 + 回归
 │  ◄──── 测试报告 ────│                     │
 │   (D001 通过,       │                     │
 │    回归无退化)      │                     │
```

**PM 决策规则**：

| QA 报告的 severity | PM 采取的行动 |
|:------------------:|:-------------|
| `critical` | 停止当前所有任务，优先级最高修复 |
| `major` | 暂停当前任务，发出修复单后再继续 |
| `minor` | 记入缺陷清单，可延后到批次结束前统一修复 |

**关键规则**：缺陷修复后必须由 **同一个子任务验证步骤** 重新执行，同时执行一次轻量回归（受影响模块的相邻测试用例）。

---

##### 模式 D：阻塞处理（DE 无法继续）

DE 遇到无法独立解决的问题，PM 向我汇报。

```
  PM                     我                      用户（你）
  │                      │                       │
  │  收到 impl-report    │                       │
  │  (status=blocked,    │                       │
  │   blockingReason)    │                       │
  │                      │                       │
  │  阻塞报告 ──────────►│                       │
  │                      │                       │
  │                      │  评估阻塞性质          │
  │                      │  判断是否需要你决策    │
  │                      │                       │
  │                      │  ┌── 可自行决定？──┐   │
  │                      │  │ 是 → 直接指示PM  │   │
  │                      │  │ 否 → 升级给你    │   │
  │                      │  └─────────────────┘   │
  │                      │                       │
  │                      │  决策请求 ────────────►│
  │                      │  (方案A / 方案B)      │
  │                      │                       │
  │                      │  ◄── 决策 ────────────│
  │                      │                       │
  │  更新计划 ───────────│                       │
  │  (按决策继续)        │                       │
```

**我必须升级给用户的场景**：
1. 构建工具链缺失（需要安装新软件）
2. API 降级或废弃（需要更换方案）
3. 项目架构设计存在根本性矛盾
4. 时间估算偏差超过 50%（需要调整批次范围）

---

### 方案调整与变更协调机制

上述 4 种模式处理的是**任务内异常**。当问题跨越多个任务、影响批次结构或计划本身时，需要专门的**方案级调整机制**。

#### 变更分级矩阵

不是所有问题都需要调整方案。PM 按以下矩阵分类处理：

| 级别 | 代码 | 特征 | 例子 | 处理方式 |
|:----:|:----:|:------|:-----|:---------|
| 🔵 **微调** | `SCOPE_PATCH` | 仅影响当前子任务的实现方式，不影响其他任务 | 某个函数的参数签名需调整 | DE 自行决定，PM 记录到 impl-report 的 discoveredIssues |
| 🟡 **局部调整** | `SCOPE_ADJUST` | 影响同一批次内的 2+ 个相邻任务 | migration.js 的数据结构变了，后序任务需同步 | PM 开协调会（模式 E），更新当前子任务+通知后续任务 |
| 🟠 **批次调整** | `SCOPE_CHANGE` | 影响整个批次的工时/范围/交付物 | UI 重构发现需要新增组件，P1 需加 1h | PM 暂停批次，发决策单给用户（模式 F） |
| 🔴 **架构变更** | `SCOPE_REDESIGN` | 影响 PRD 层面的设计决策 | 站点中心模型需改为标签式切换，改 PRD | PM 停止开发，发 PD 审查+升级用户（模式 G） |

#### 触发条件识别指南

| 发现者 | 报告内容 | 典型分级 | PM 应对 |
|:------:|:---------|:--------:|:--------|
| DE | "这个函数比预期多 20 行代码" | 🔵 微调 | 记录即可，不用中断 |
| DE | "migration.js 的数据结构变了，sites.js 要改" | 🟡 局部调整 | 开协调会（模式 E） |
| QA | "测试发现 UI 少了一个按钮" | 🟡 局部调整（新增元素） | 发补丁任务给 DE |
| QA | "这个 Tab 的交互方式完全对不上 PRD" | 🟠 批次调整 | 暂停当前任务，发 PD 审查 |
| PD | "PRD 中 Cookie 的层级描述不够准确" | 🟠 批次调整 | 更新 PRD，通知 DE 调整 |
| DE | "这个方案在 Manifest V3 下不可行" | 🔴 架构变更 | 停止该批次，升级用户 |
| QA | "回归测试发现 v1.x 功能被破坏了" | 🟡 局部调整（需热修复） | 发紧急修复任务 |

---

#### 新增 3 种协调模式

##### 模式 E：局部调整协调会（PM → DE + 受影响方）

当 DE 或 QA 发现某个变更会牵连同一批次内的其他任务时触发。

```
  PM                     DE                     受影响的其他 Agent
  │                      │                      │
  │  收到 impl-report    │                      │
  │  (discoveredIssue:   │                      │
  │   "数据结构变更")    │                      │
  │                      │                      │
  │  PM 评估影响范围      │                      │
  │  确定受影响的后续任务 │                      │
  │                      │                      │
  │  协调会议 ──────────►│                      │
  │  (确认变更范围)       │                      │
  │  ◄── 确认 ──────────│                      │
  │                      │                      │
  │  更新 task-cards:    │                      │
  │  - 当前任务追加变更项 │                      │
  │  - 更新后续任务的    │                      │
  │    input/constraints │                      │
  │                      │                      │
  │  通知受影响 Agent ──────────────────────────►│
  │  (taskId, 变更摘要,  │                      │
  │   影响范围)          │                      │
  │                      │                      │
  │  继续批次（无需      │                      │
  │  暂停整个批次）      │                      │
```

**适用条件**（PM 判断要同时满足）：
1. 变更范围局限在同一批次内
2. 不影响 PRD 的设计决策
3. 不影响交付物清单
4. 不增加总工时 > 0.5h

**会议产出**：更新后的 `task-cards` + 受影响 Agent 的正式通知（写入 `docs/v2.0/communication/coordination/`）

---

##### 模式 F：批次调整决策（PM → 我 → 用户）

当 DE/QA/PD 发现问题影响整个批次的范围或交付物时，PM 向我汇报，我评估后如果需要你决策则升级。

```
  PM                     我                      用户（你）
  │                      │                       │
  │  批次影响报告 ──────►│                       │
  │                      │                       │
  │                      │  PM 汇报：             │
  │                      │  - 发现了什么问题      │
  │                      │  - 影响哪些任务/交付物 │
  │                      │  - 建议的方案          │
  │                      │                       │
  │                      │  暂停批次              │
  │                      │  评估是否需你决策      │
  │                      │                       │
  │                      │  ┌── 我能决定？──┐     │
  │                      │  │ 是 → 直接回复PM│     │
  │                      │  │ 否 → 发决策单  │     │
  │                      │  └────────────────┘     │
  │                      │                       │
  │                      │  决策单 ─────────────►│
  │                      │  (≥2方案+推荐)       │
  │                      │                       │
  │                      │  ◄── 决策 ────────────│
  │                      │                       │
  │  更新开发计划 ───────│                       │
  │  更新 task-cards     │                       │
  │  恢复批次             │                       │
```

**决策单格式**（PM → 用户）：

```markdown
## 🟠 批次调整方案决策单

| 字段 | 值 |
|:-----|:----|
| 触发任务 | P1-T5 |
| 发现者 | DE |
| 问题 | 站点选择器需支持模糊搜索，原方案仅下拉选择不够 |
| 影响批次 | P1（UI 重构）|
| 影响交付物 | M1-1（站点选择器）|

### 影响分析
- 工时：新增 0.5h（搜索框+过滤逻辑）
- 范围：仅 T5 内部，不影响 T6/T7
- 风险：无（搜索是纯本地过滤）

### 方案 A（推荐）
- 在站点选择器下拉上方加搜索输入框
- 输入时实时过滤下拉选项
- 工时 +0.5h，P1 从 4.5h → 5h

### 方案 B（最小改动）
- 站点列表改为可搜索的 `<datalist>` 元素
- 原生浏览器搜索，0 额外代码
- 工时不变，但 UI 一致性略差

### 我的建议
方案 A，+0.5h 但 UX 更好，P1 仍在合理范围内。
```

---

##### 模式 G：架构变更重启（PM → 我 → PD → 我 → 用户 → 全 Agent）

当问题触及 PRD 层面的设计决策时触发，影响最大。PM 向我报告，由我主持架构变更流程。

```
  我（Hermes）          PM                    PD                  用户（你）        DE + QA
  │                     │                     │                   │               │
  │  ◄── 架构报告 ──────│                     │                   │               │
  │    (PM发现或收到    │                     │                   │               │
  │     DE/QA报告)      │                     │                   │               │
  │                     │                     │                   │               │
  │  评估：确认为架构级 │                     │                   │               │
  │                     │                     │                   │               │
  │  发审查请求 ──────────────────────────────►│                   │               │
  │                     │                     │  审查PRD/设计     │               │
  │  ◄── 审查报告 ────────────────────────────│                   │               │
  │   (建议：必须改)    │                     │                   │               │
  │                     │                     │                   │               │
  │  停 止 所 有 Agent ───────────────────────────────────────────────────────►   │
  │  （暂停批次）       │                     │                   │               │
  │                     │                     │                   │               │
  │  架构变更单 ───────────────────────────────────────────────►│               │
  │  (问题+影响+≥2方案)  │                     │                   │               │
  │                     │                     │                   │               │
  │  ◄── 用户决策 ───────────────────────────────────────────────│               │
  │                     │                     │                   │               │
  │  ┌── 取决于决策 ──┐│                     │                   │               │
  │  │ 接受新架构       ││                     │                   │               │
  │  │ → 更新 PRD      ││                     │                   │               │
  │  │ → 更新测试计划   ││                     │                   │               │
  │  │ → 更新开发计划   ││                     │                   │               │
  │  │ → 重新分配批次   ││                     │                   │               │
  │  ├─────────────────┤│                     │                   │               │
  │  │ 降级为批次调整   ││                     │                   │               │
  │  │ → 退至模式 F    ││                     │                   │               │
  │  └─────────────────┘│                     │                   │               │
  │                     │                     │                   │               │
  │  更新任务分配 ─────►│                     │                   │               │
  │  (更新后的新计划)   │                     │                   │               │
  │                     │  恢复批次 ───────────────────────────────────────────►│
```

**模式 G 的封板规则**：
- PRD 更新后必须重新经过 PD 审查 → QA 确认测试计划覆盖 → PM 更新开发计划
- 所有旧的 task-cards 全部作废，重新分配
- 旧的 impl-reports 保留为归档（放入 `communication/archived/`）

---

#### 协调中心

所有方案调整的决策记录统一存放在 `docs/v2.0/communication/coordination/`。

```
docs/v2.0/communication/coordination/
├── INDEX.md                   ← 协调记录索引（所有模式 E/F/G 的汇总表）
├── E-001.md                   ← 模式 E 协调记录（局部调整）
├── E-002.md
├── F-001.md                   ← 模式 F 决策单（批次调整）
├── G-001.md                   ← 模式 G 决策单（架构变更）
└── archived/                  ← 已完成/关闭的协调记录
```

**INDEX.md 格式**：

```markdown
# 方案调整协调记录索引

| 编号 | 模式 | 触发任务 | 问题摘要 | 决策 | 日期 | 状态 |
|:----:|:----:|:---------|:---------|:----:|:----:|:----:|
| E-001 | 模式E | P0-T1-S2 | migration.js 数据结构变更，sites.js 需同步 | DE 确认，task-cards 已更新 | 2026-06-22 | ✅ 已关闭 |
| F-001 | 模式F | P1-T5 | 站点选择器需搜索功能 | 用户选方案A，+0.5h | 2026-06-23 | ✅ 已关闭 |
| G-001 | 模式G | — | PRD 架构级变更 | 待决策 | 2026-06-24 | ⏳ 进行中 |
```

**每条记录的固定模板**：

```markdown
## 协调记录 #{编号}

| 字段 | 值 |
|:-----|:----|
| 模式 | E（局部调整）/ F（批次调整）/ G（架构变更）|
| 触发者 | DE / QA / PD / PM |
| 触发任务 | P0-T1-S2 |
| 日期 | 2026-06-22 |
| 状态 | ⏳ 进行中 / ✅ 已关闭 / ❌ 已回退 |

### 问题描述
（谁发现了什么、怎么发现的）

### 影响分析
（影响的批次、任务、交付物、工时变化）

### 方案讨论
（讨论了哪些方案，各自的优缺点）

### 决策
- 选择了哪个方案
- 谁做的决策
- 决策日期

### 执行
- 更新的文件列表
- 更新的 task-cards
- 受影响 Agent 通知情况

### 关闭记录
- 验证方式
- 关闭日期
- 关闭者
```

---

#### 变更影响评估速查表

PM 收到任何 Agent 的异常报告后，按以下流程快速判断。对于 🟠 和 🔴 级别，PM 向我报告，由我决定是否升级给你。

```
问题发现
  │
  ▼
PM 初步判断影响层面
  │
  ├─🔵 仅当前子任务 → 微调（DE 自行处理，PM 记录即可）
  │
  ├─🟡 同一批次内相邻任务 → 模式 E（PM 开协调会，向我报备）
  │
  ├─🟠 批次范围/交付物 → PM 向我报告 → 我判断：
  │   ├─ 我能决定 → 直接指示 PM
  │   │   └─ 是否涉及 PRD 设计变更？
  │   │       ├─ 否 → 模式 F
  │   │       └─ 是 → 模式 G
  │   └─ 需要你决策 → 发决策单给你（模式 F）
  │
  └─🔴 PRD 设计决策 → PM 向我报告 → 我主持模式 G
      └─ 停止全Agent → 发PD审查 → 发架构变更单给你 → 你决策

每个层级向上包含。PM 可以逐级上报（🟡→🟠→🔴 升级）。
```

---

### 通信产物目录

所有通信卡片统一存放在 `docs/v2.0/communication/` 目录下，按 Agent 分组。

```
docs/v2.0/communication/
│
├── task-cards/           ← PM → DE/QA/PD 的任务分配单
│   ├── P0-T1-S1.md       （创建 core/ 目录骨架）
│   ├── P0-T1-S2.md       （实现 migration.js）
│   ├── P0-T1-S3.md       （实现 sites.js）
│   ├── P0-T1-S4.md       （修改 background.js）
│   ├── P0-T1-V.md        （测试 T1 验证步骤）
│   ├── P0-T2-S1.md       （重构 onAlarm）
│   └── ...
│
├── impl-reports/         ← DE → PM 的实施报告
│   ├── P0-T1-S2.md
│   ├── P0-T1-S3.md
│   └── ...
│
├── test-reports/         ← QA → PM 的测试报告
│   ├── P0-T1-V.md
│   ├── P0-T2-V.md
│   └── ...
│
├── design-reviews/       ← PD → PM 的设计审查
│   ├── P0-T1.md
│   └── ...
│
├── sign-offs/            ← PM 汇总的里程碑签字
│   ├── M-P0.md
│   ├── M-P1.md
│   ├── M-P2.md
│   └── M-P3.md
│
└── defects/              ← 缺陷跟踪
    ├── active.md          （当前活跃缺陷列表）
    └── resolved.md        （已修复缺陷列表）
```

**目录维护规则**：
1. 每个任务完成后 PM 负责删除对应的 `task-cards/{taskId}.md`
2. `impl-reports/` 和 `test-reports/` 保留作为审计追溯
3. `defects/active.md` 在 QA 发现缺陷时追加，修复验证通过后移入 `resolved.md`
4. 里程碑签字完成后，对应 `sign-offs/{milestoneId}.md` 锁定为只读

**PM 的 Git 提交节奏**：

| 时机 | 提交内容 | 说明 |
|:-----|:---------|:-----|
| ✅ 每个子任务完成后 | 任务对应的 `src/` 代码变更 + `impl-reports/{taskId}.md` | 确保代码与报告同步 |
| ✅ 每个验证步骤通过后 | `test-reports/{taskId}.md` | 测试报告单独提交，方便追溯 |
| ✅ 里程碑签字当日 | `sign-offs/{milestoneId}.md` + 更新开发计划里程碑状态 | 里程碑签字独立提交 |
| ⚡ 紧急修复 | 缺陷修复代码 + `defects/resolved.md` 更新 | 不受批次节奏限制 |

**PM 不得连续跨越 3 个以上子任务不提交**——最多累积 3 个子任务就强制提交一次，确保项目管理信息始终与 Git 历史同步。

---

### 通信约束与纪律

| # | 规则 | 违反后果 |
|:-:|:-----|:---------|
| 1 | **QA 不得读取 DE 的实施报告** | 质量独立性丧失，测试结果视为无效 |
| 2 | **DE 不得直接向 QA 传话** | 视为代测舞弊，批次重新测试 |
| 3 | **所有通信必须有书面记录** | 口头约定不视为有效沟通 |
| 4 | **每个子任务只能有一个 assignee** | 职责不清时 PM 负责裁决 |
| 5 | **DE 必须先自检再提交** | 自检失败的任务 PM 直接退回 |
| 6 | **缺陷修复后必须重测** | 修复未验证的视为未完成 |
| 7 | **PM 收到 blocked 必须 30 秒内升级** | 阻塞不升级视为 PM 失职 |
| 8 | **PD 审查请求须在收到后 1 次交互内完成** | 设计审查不拖延开发节奏 |

---

## 目录

- [Agent 架构总览](#agent-架构总览)
- [Agent 通信协议](#agent-通信协议)
- [方案调整与变更协调机制](#方案调整与变更协调机制)
- [P0：基础设施（3.5h）](#p0基础设施35h)
- [P1：UI 重构（4.5h）](#p1ui-重构45h)
- [P2：架构优化（2h）](#p2架构优化2h)
- [P3：收尾（2.5h）](#p3收尾25h)

---

# P0：基础设施（3.5h）

---

## T1 — 版本化迁移框架 + 数据迁移（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/core/migration.js` |
| 新建 | `src/core/sites.js` |
| 修改 | `src/background.js`（`onInstalled` + 导入）|

### T1-S1：创建 src/core/ 目录骨架

```bash
cd src && mkdir -p core && cd core
touch migration.js sites.js cookies.js heartbeat.js \
      sync-p2p.js sync-server.js blocker.js messaging.js
```

### T1-S2：实现 migration.js

**文件**：`src/core/migration.js`

**代码骨架**：

```javascript
const SCHEMA_VERSION_KEY = 'v2_schema_version';
const LATEST_SCHEMA = 2;

// 通用存储辅助（后续各模块复用）
async function getStorage(key, def) {
  const r = await chrome.storage.local.get(key);
  return r[key] !== undefined ? r[key] : def;
}
async function setStorage(key, val) {
  await chrome.storage.local.set({ [key]: val });
}

export async function runMigrations() {
  const version = await getStorage(SCHEMA_VERSION_KEY, 1);
  if (version >= LATEST_SCHEMA) return;
  if (version < 2) await migrateV1toV2();
  // 未来：if (version < 3) await migrateV2toV3();
  await setStorage(SCHEMA_VERSION_KEY, LATEST_SCHEMA);
}

async function migrateV1toV2() {
  // 1. 读取 v1.x 所有旧键
  const beats = await getStorage('heartbeat_configs', []);
  const p2p = await getStorage('sync_config', {});
  const server = await getStorage('server_sync_config', {});
  const identity = await getStorage('device_identity', {});

  // 2. 收集所有站点域名（去重）
  const domains = new Set();
  beats.forEach(b => { if (b.domain) domains.add(b.domain); });
  if (p2p.syncedDomains?.[0]) domains.add(p2p.syncedDomains[0]);
  if (server.syncedDomains?.[0]) domains.add(server.syncedDomains[0]);
  // 回退：如果 beats 中有的心跳无 domain，从 URL 提取
  beats.forEach(b => {
    if (!b.domain && b.url) {
      try { domains.add(new URL(b.url.startsWith('http') ? b.url : 'https://' + b.url).hostname); } catch {}
    }
  });

  // 3. 构建 v2_sites
  const sites = Array.from(domains).map(domain => ({
    domain,
    createdAt: new Date().toISOString(),
    heartbeats: beats.filter(b => {
      if (b.domain === domain) return true;
      // 域名匹配：回退通过 URL hostname 匹配
      if (!b.domain && b.url) {
        try {
          const h = new URL(b.url.startsWith('http') ? b.url : 'https://' + b.url).hostname;
          return h === domain;
        } catch { return false; }
      }
      return false;
    }),
    sync: {
      masterMode: p2p.masterMode ?? server.masterMode ?? false,
      isMaster: p2p.isMaster ?? true,
      p2p: {
        enabled: !!(p2p.enabled && p2p.mode === 'p2p' && p2p.syncedDomains?.[0] === domain),
        roomId: p2p.p2pRoomId || null,
        connected: false,
      },
      server: {
        enabled: !!(server.enabled && server.syncedDomains?.[0] === domain),
        deviceId: server.deviceId || null,
        pairKey: server.pairKey || null,
      },
    },
  }));

  // 4. 构建 v2_global
  const global = {
    signalUrl: p2p.signalUrl || '',
    serverUrl: server.serverUrl || '',
    p2pDeviceName: p2p.p2pDeviceName || '',
    serverDeviceName: server.deviceName || '',
    syncInterval: p2p.intervalMinutes || server.intervalMinutes || 5,
    deviceIdentity: identity,
  };

  // 5. 写入新键（旧键不动）
  await setStorage('v2_sites', sites);
  await setStorage('v2_global', global);
}
```

### T1-S3：实现 sites.js（站点 + 全局设置 handler）

**文件**：`src/core/sites.js`

```javascript
export async function getSites() {
  return await getStorage('v2_sites', []);
}
export async function saveSites(sites) {
  await setStorage('v2_sites', sites);
}
export async function getGlobalConfig() {
  return await getStorage('v2_global', {});
}
export async function saveGlobalConfig(config) {
  const existing = await getGlobalConfig();
  Object.assign(existing, config);
  await setStorage('v2_global', existing);
}
export async function addSite(domain) {
  const sites = await getSites();
  if (sites.some(s => s.domain === domain)) return { success: false, error: '该站点已存在' };
  sites.push({ domain, createdAt: new Date().toISOString(), heartbeats: [], sync: { masterMode: false, isMaster: true, p2p: { enabled: false, roomId: null, connected: false }, server: { enabled: false, deviceId: null, pairKey: null } } });
  await saveSites(sites);
  return { success: true };
}
export async function removeSite(domain) {
  const sites = await getSites();
  // 清理该站点的 alarm
  const site = sites.find(s => s.domain === domain);
  if (!site) return { success: false, error: '站点不存在' };
  chrome.alarms.clear('p2pSync_' + domain).catch(() => {});
  chrome.alarms.clear('serverSync_' + domain).catch(() => {});
  site.heartbeats.forEach(b => chrome.alarms.clear('heartbeat_' + b.id).catch(() => {}));
  await saveSites(sites.filter(s => s.domain !== domain));
  return { success: true };
}
export async function updateSite(domain, updates) {
  const sites = await getSites();
  const idx = sites.findIndex(s => s.domain === domain);
  if (idx === -1) return { success: false, error: '站点不存在' };
  Object.assign(sites[idx], updates);
  await saveSites(sites);
  return { success: true };
}
```

### T1-S4：修改 background.js

**文件**：`src/background.js`

**操作**（按顺序）：

1. 在文件顶部 import 后增加：

```javascript
import { runMigrations } from './core/migration.js';
```

2. 在 `onInstalled` 监听器开头增加：

```javascript
// v2.0 数据迁移
await runMigrations();
```

3. 在 `onInstalled` 末尾增加 Alarm 恢复（迁移后的站点）：

```javascript
// 恢复所有站点的 alarm（v2.0 用 v2_sites）
const v2sites = await getSites();  // 注意：此时 getSites 还不存在，需用 getStorage('v2_sites')
const allSites = await getStorage('v2_sites', []);
for (const site of allSites) {
  // 保活 alarm
  for (const beat of site.heartbeats) {
    if (beat.enabled && beat.url) {
      chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
    }
  }
  // 同步 alarm
  if (site.sync.p2p.enabled) {
    chrome.alarms.create('p2pSync_' + site.domain, { periodInMinutes: site.sync.p2p.interval || 5 });
  }
  if (site.sync.server.enabled) {
    chrome.alarms.create('serverSync_' + site.domain, { periodInMinutes: site.sync.server.interval || 5 });
  }
}
```

4. 新增 message handler（在 switch 中添加）：

```javascript
// ---- v2.0 站点管理 ----
case 'getSites': sendResponse({ sites: await getSites() }); break;
case 'addSite': sendResponse(await addSite(request.domain)); break;
case 'removeSite': sendResponse(await removeSite(request.domain)); break;
case 'updateSite': sendResponse(await updateSite(request.domain, request.updates)); break;
case 'getGlobalConfig': sendResponse(await getGlobalConfig()); break;
case 'saveGlobalConfig': sendResponse(await saveGlobalConfig(request.config)); break;
```

### T1-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | `bash scripts/build.sh` | 构建通过 |
| 2 | 手动 | 加载扩展 → 打开 DevTools → Application → Storage → Local | `v2_sites` 存在，包含原 `heartbeat_configs` 中的站点域名 |
| 3 | 手动 | 检查 `v2_global` | 包含 signalUrl、serverUrl、设备名称等 |
| 4 | 手动 | 检查旧键 | `heartbeat_configs`、`sync_config` 等旧键未被删除 |
| 5 | 手动 | 右键扩展 → 重载 → 再次检查 storage | `v2_schema_version = 2`，不再重复写入 `v2_sites` |
| 6 | 手动 | 控制台过滤 `SessionMaster` | 无报错 |

---

## T2 — Alarm 按站点改造（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/background.js`（`onAlarm` 监听器 + 同步开关函数）|

### T2-S1：重构 onAlarm 监听器

**操作**：找到 `chrome.alarms.onAlarm.addListener`（当前 L1082），替换为：

```javascript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // ——— P2P 同步（按站点）———
  if (alarm.name.startsWith('p2pSync_')) {
    const domain = alarm.name.replace('p2pSync_', '');
    const sites = await getSites();
    const site = sites.find(s => s.domain === domain);
    if (!site || !site.sync.p2p.enabled) return;
    // 对 site 执行 P2P 同步（只同步该站点的域名）
    const config = await getSyncConfig();
    config.syncedDomains = [domain];
    // ... 复用现有 p2pSync 逻辑，传入 domain ...
    return;
  }

  // ——— 服务器同步（按站点）———
  if (alarm.name.startsWith('serverSync_')) {
    const domain = alarm.name.replace('serverSync_', '');
    const sites = await getSites();
    const site = sites.find(s => s.domain === domain);
    if (!site || !site.sync.server.enabled) return;
    // 对 site 执行服务器同步
    const srvConfig = await serverGetSyncConfig();
    srvConfig.syncedDomains = [domain];
    // ... 复用现有 serverPerformSync ...
    return;
  }

  // ——— 保活（不变）———
  if (alarm.name.startsWith('heartbeat_')) {
    const id = alarm.name.replace('heartbeat_', '');
    const beats = await getHeartbeats();  // v1 兼容，后期改为从 v2_sites 查
    const beat = beats.find(b => b.id === id);
    if (beat && beat.enabled) {
      const result = await performHeartbeat(beat);
      beat.lastHeartbeatTime = new Date().toISOString();
      beat.lastStatus = result.success ? 'ok' : 'fail';
      beat.lastStatusDetail = result.success ? ('HTTP ' + result.status) : result.error;
      await saveHeartbeats(beats);
    }
  }
});
```

### T2-S2：修改同步开关函数

**serverToggleSync**：`chrome.alarms.create('sessionSync', ...)` → `chrome.alarms.create('serverSync_' + domain, ...)`
**p2pToggleSync handler**：`chrome.alarms.create('p2pSyncAlarm', ...)` → `chrome.alarms.create('p2pSync_' + domain, ...)`

**具体操作**：

```javascript
// 在 serverToggleSync 中（L1049）
chrome.alarms.create('sessionSync', { periodInMinutes: intervalMinutes });
// → 改为
chrome.alarms.create('serverSync_' + domain, { periodInMinutes: intervalMinutes });

// 在 serverToggleSync 禁用时（L1054）
chrome.alarms.clear('sessionSync');
// → 改为
chrome.alarms.clear('serverSync_' + domain);

// 在 p2pToggleSync handler 中（L1437）
chrome.alarms.create('p2pSyncAlarm', { periodInMinutes: ... });
// → 改为
chrome.alarms.create('p2pSync_' + domain, { periodInMinutes: ... });

// 禁用时
chrome.alarms.clear('p2pSyncAlarm');
// → 改为
chrome.alarms.clear('p2pSync_' + domain);
```

> **注意**：`domain` 从 `config.syncedDomains[0]` 获取。在 T4（模块拆分）之前，需要将 domain 从调用方传入或从配置读取。

### T2-S3：修改 alarm 恢复逻辑

在 `onInstalled` 中：

```javascript
// 旧代码
if (config.enabled) {
  if (config.mode === 'p2p' && config.p2pRoomId) {
    chrome.alarms.create('p2pSyncAlarm', ...);
  } else if (config.mode === 'server' && config.pairKey) {
    chrome.alarms.create('sessionSync', ...);
  }
}
// 改为：已迁移到 T1-S4 中从 v2_sites 恢复
// 保留旧代码作为 fallback（未迁移回退）
```

### T2-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 手动 | 启用服务器同步 → DevTools → Application → Alarms | `serverSync_{domain}` 存在 |
| 2 | 手动 | 启用 P2P 同步 → 检查 Alarms | `p2pSync_{domain}` 存在 |
| 3 | 手动 | 同时启用站点A+站点B | 两个 alarm 共存，域名不同 |
| 4 | 手动 | 关闭站点A同步 | 仅站点A的 alarm 消失 |
| 5 | 手动 | 保活开启 + 同步开启 | `heartbeat_hb_xxx` 和 `p2pSync_{domain}` 同时存在 |
| 6 | 自动 | `bash scripts/build.sh` | 构建通过 |

---

## T3 — P2P 连接按站点隔离（1h）

### 涉及文件

`src/background.js`

### T3-S1：重构 p2pConnections 数据结构

```javascript
// 旧：let p2pConnections = {};  // { peerId: { connection, channel, ... } }
// 新：let p2pConnections = {};  // { siteDomain: { roomId, peerId, connection, channel, ... } }
```

### T3-S2：修改 p2pCreateRoom 签名

```javascript
// 旧
async function p2pCreateRoom(deviceName, signalUrl) {
// 新
async function p2pCreateRoom(deviceName, signalUrl, siteDomain) {
  const peerId = generateP2PPeerId();
  if (!signalUrl) signalUrl = await getSignalUrl();
  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, { ... });
    const data = await resp.json();
    if (!data.roomId) throw new Error('创建配对失败');
    
    // 改为 siteDomain 索引
    p2pConnections[siteDomain] = {
      roomId: data.roomId,
      peerId,
      connection: null,
      channel: null,
      signalUrl,
      deviceName
    };
    
    currentP2PRoomId = data.roomId;     // 保留兼容
    currentP2PPeerId = peerId;
    
    await saveSyncConfig({ p2pRoomId: data.roomId, p2pConnected: false });
    startP2PPolling(signalUrl, data.roomId, peerId, siteDomain);
    return { success: true, roomId: data.roomId, peerId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

### T3-S3：修改 p2pDisconnect

```javascript
// 旧
async function p2pDisconnect() {
// 新：siteDomain 可选，不传则全部断开
async function p2pDisconnect(siteDomain) {
  stopP2PPolling();
  const signalUrl = await getSignalUrl();
  
  if (siteDomain) {
    const conn = p2pConnections[siteDomain];
    if (conn && currentP2PRoomId && currentP2PPeerId) {
      try {
        await fetch(`${signalUrl}/api/signal/room?room=${conn.roomId}&peer=${conn.peerId}`, { method: 'DELETE' });
      } catch (e) {}
      deleteP2PConnection(conn.peerId);
      delete p2pConnections[siteDomain];
    }
  } else {
    // 断开全部
    if (currentP2PRoomId && currentP2PPeerId) {
      try {
        await fetch(`${signalUrl}/api/signal/room?room=${currentP2PRoomId}&peer=${currentP2PPeerId}`, { method: 'DELETE' });
      } catch (e) {}
    }
    for (const pid of Object.keys(p2pConnections)) deleteP2PConnection(p2pConnections[pid].peerId);
    p2pConnections = {};
  }
  
  currentP2PRoomId = '';
  currentP2PPeerId = '';
  await saveSyncConfig({ p2pConnected: false, p2pConnectedAt: null, p2pConnectedPeerName: '' });
  notifyUser('SessionMaster', siteDomain ? 'P2P 已断开: ' + siteDomain : 'P2P 全部连接已断开');
}
```

### T3-S4：修改 popup.js 中发送的 siteDomain

找到 `btnP2PCreate` 和 `btnP2PDoJoin` 的 click handler，在 `sendMessage` 参数中增加 `siteDomain: activeSite`：

```javascript
// btnP2PCreate handler
const result = await chrome.runtime.sendMessage({
  action: 'p2pCreateRoom',
  deviceName,
  signalUrl,
  siteDomain: activeSite  // 新增
});

// btnP2PDisconnect handler
await chrome.runtime.sendMessage({
  action: 'p2pDisconnect',
  siteDomain: activeSite  // 新增
});
```

### T3 验收

执行：P2P-1 ~ P2P-7

---

## T4 — 模块拆分准备（0.5h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 创建 | `src/core/` 全部 7 个模块文件骨架 |
| 复制 | 从 `background.js` 复制函数到对应模块 |

### T4-S1：按模块分配函数

| 模块文件 | 从 background.js 复制的函数 |
|:---------|:---------------------------|
| `core/cookies.js` | `getCookies`、`exportCookies`、`importCookies`、`clearCookies`、`importCookiesSmart`、`exportCookiesSmart`、`importCookiesUnconditional`、`getCookieMeta`、`saveCookieMeta`、`cookieApiUrl` |
| `core/heartbeat.js` | `getHeartbeats`、`saveHeartbeats`、`addHeartbeat`、`removeHeartbeat`、`toggleHeartbeat`、`performHeartbeat`、`pauseAllHeartbeats` |
| `core/sync-p2p.js` | `generateP2PPeerId`、`p2pCreateRoom`、`p2pJoinRoom`、`initiateP2PConnection`、`handleSignalMessage`、`sendSignal`、`startP2PPolling`、`stopP2PPolling`、`deleteP2PConnection`、`p2pDisconnect`、`p2pSync`、`handleP2PMessage` |
| `core/sync-server.js` | `serverGetSyncConfig`、`serverSaveSyncConfig`、`serverRegisterDevice`、`serverPerformSync`、`serverToggleSync` |
| `core/blocker.js` | `getUserBlockingRules`、`addUserBlockingRule`、`removeUserBlockingRule`、`updateDynamicRules`、`getRulesDB`、`saveRulesDB`、`matchSitesByDomain`、`getRecommendedRules`、`updateRulesDBFromServer`、`exportRulesDB`、`importRulesDB`、`getBlockerConfig`、`saveBlockerConfig`、`isBlockingEnabledForDomain`、`getEffectiveKeywords` |
| `core/sites.js` | 已包含（T1 已创建）|
| `core/messaging.js` | —（P2 实现）|

### T4-S2：background.js 导入模块

```javascript
// background.js 顶部
import './core/cookies.js';
import './core/heartbeat.js';
import './core/sync-p2p.js';
import './core/sync-server.js';
import './core/blocker.js';
import './core/sites.js';
```

> **说明**：ES Module 的 import 会执行被导入文件的所有顶层代码。需要将每个模块文件的函数定义 `export` 导出，并且每个模块在文件末尾自动注册其对 `globalThis` 的引用，或者通过直接引入的方式——最简单方案是暂时保留 background.js 中的函数，通过 import 确保模块文件被解析。

**简化方案**：T4 阶段只创建文件骨架和注释，不实际移动代码。真正的代码迁移在 P2 的消息路由注册表阶段完成。T4 的目标是验证构建系统支持 `src/core/` 目录。

### T4 验收

`bash scripts/build.sh` 通过

---

### 🏁 里程碑 M-P0：基础设施完成

**触发条件**：T1 ~ T4 全部验证通过

**交付物清单**：

| # | 交付物 | 说明 | 验收方式 |
|:-:|:-------|:----|:--------|
| M0-1 | `src/core/migration.js` | 链式迁移框架（`schema_version` + `runMigrations`）| T1-V 步骤 1~6 |
| M0-2 | `src/core/sites.js` | 站点 CRUD + 全局设置 handler | 通过 popup 发消息测试 getSites/addSite |
| M0-3 | `src/core/` 目录 7 模块骨架 | 所有模块文件存在且可 import | 构建通过 |
| M0-4 | `v2_sites` + `v2_global` 存储数据 | 从 v1.x 迁移完成 | 旧键保留，新键正确 |
| M0-5 | Alarm 按站点隔离 | alarm 名称含域名后缀 | T2-V 步骤 1~6 |
| M0-6 | P2P 连接按站点隔离 | `p2pConnections` 键为 siteDomain | T3 步骤 |

**回滚条件**：M0-4 迁移失败 → 删除 `v2_sites`/`v2_global`，保留旧键，扩展回退 v1.x 行为。

**签字确认**（PM 发起 → QA 签质量 → PD 签设计 → PM 终签）：
- [ ] QA：功能测试通过（T1-V ~ T4-V 全部通过）
- [ ] PD：数据模型设计审查通过
- [ ] PM：可进入 P1

---

# P1：UI 重构（4.5h）

---

## T5 — 站点选择器组件（1.5h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/popup/popup.html`（添加站点选择器 DOM）|
| 新建 | `src/popup/site-selector.js`（独立渲染函数）|
| 修改 | `src/popup/popup.js`（导入 + 初始化）|

### T5-S1：popup.html 添加站点选择器 DOM

在 `<div class="header">` 之后、Tab 切换之前插入：

```html
<div class="site-selector-bar" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#f8f9fa;border-bottom:1px solid #e0e0e0">
  <label style="font-size:12px;color:#555;white-space:nowrap">📍 当前站点</label>
  <select id="siteSelector" class="site-dropdown" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px">
    <option value="">— 请选择站点 —</option>
  </select>
  <button id="btnAddSite" class="btn-small" title="添加新站点" style="padding:4px 8px">➕</button>
</div>
```

添加 CSS（`popup.css`）：

```css
.site-dropdown { ... }
```

### T5-S2：实现 site-selector.js

```javascript
// src/popup/site-selector.js
let activeSite = null;
let siteList = [];

export async function loadSites() {
  const result = await chrome.runtime.sendMessage({ action: 'getSites' });
  siteList = result.sites || [];
  return siteList;
}

export function renderSiteSelector(sites, onSwitch) {
  const sel = document.getElementById('siteSelector');
  if (!sel) return;
  sel.innerHTML = sites.map(s => 
    `<option value="${s.domain}" ${s.domain === activeSite ? 'selected' : ''}>${s.domain}</option>`
  ).join('') + '<option value="__add__">+ 添加新站点</option>';
  
  sel.onchange = async (e) => {
    if (e.target.value === '__add__') {
      // 弹出添加新站点对话框
      const domain = prompt('请输入站点域名：');
      if (domain && domain.trim()) {
        const result = await chrome.runtime.sendMessage({ action: 'addSite', domain: domain.trim() });
        if (result.success) {
          activeSite = domain.trim();
          onSwitch(activeSite);
        } else {
          showToast('⚠️ ' + result.error);
        }
      }
      loadSites().then(sites => renderSiteSelector(sites, onSwitch));
    } else {
      activeSite = e.target.value;
      onSwitch(activeSite);
    }
  };
}

export function getActiveSite() { return activeSite; }
export function setActiveSite(domain) { activeSite = domain; }
```

### T5-S3：popup.js 入口集成

在 popup 初始化函数中：

```javascript
import { loadSites, renderSiteSelector, getActiveSite, setActiveSite } from './site-selector.js';

async function initPopup() {
  const sites = await loadSites();
  renderSiteSelector(sites, (domain) => {
    // 站点切换回调：重新渲染所有 Tab 内容
    loadSessionTab(domain);
    loadSyncTab(domain);
    loadGlobalTab();
  });
  
  // 如果当前页面 URL 的域名不在站点列表中，自动提示添加
  if (currentDomain && !sites.some(s => s.domain === currentDomain)) {
    // 触发 "添加当前站点" 的推荐
    showAddSiteSuggestion(currentDomain);
  }
}
```

### T5 验收

SEL-1 ~ SEL-6

---

## T6 — 三 Tab 内容重构（2.5h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/popup/popup.html`（三 Tab 内容区重写）|
| 新建 | `src/popup/session-tab.js`（会话管理 Tab）|
| 新建 | `src/popup/sync-tab.js`（同步管理 Tab）|
| 新建 | `src/popup/global-tab.js`（全局设置 Tab）|

### T6-S1：HTML 结构

```html
<div class="tabs">
  <button class="tab-btn active" data-tab="session">🌐 会话管理</button>
  <button class="tab-btn" data-tab="sync">🔄 同步管理</button>
  <button class="tab-btn" data-tab="global">⚙️ 全局设置</button>
</div>

<div id="tab-session" class="tab-content active">
  <!-- Cookie（含保活） -->
  <div class="section">
    <div class="section-title"><span>🍪 Cookie（含保活）</span></div>
    <!-- 导出/导入/清除：复制自 v1.x 的 session Tab -->
    <!-- 保活：复制自 v1.x 的保活区域，视觉上缩进从属于 Cookie -->
  </div>
  <!-- 拦截 -->
  <div class="section">
    <div class="section-title"><span>🛡️ 拦截</span></div>
    <!-- 来自 v1.x 的 blocker Tab -->
  </div>
</div>

<div id="tab-sync" class="tab-content">
  <!-- 主从设备模式 -->
  <div class="section">
    <div class="section-title"><span>📡 主从设备模式</span></div>
    <!-- 开关 + 身份切换：来自 v1.x 的 sync Tab -->
  </div>
  <!-- 传输方式（radio） -->
  <div class="section">
    <div class="section-title"><span>🔗 P2P 直连</span></div>
    <!-- 来自 v1.x 的 P2P 配置 -->
  </div>
  <div class="section">
    <div class="section-title"><span>☁️ 服务器模式</span></div>
    <!-- 来自 v1.x 的服务器配置 -->
  </div>
  <!-- 同步记录 + 网络地址 -->
</div>

<div id="tab-global" class="tab-content">
  <!-- 信令地址 / 服务器地址 / 设备名称 / 同步间隔 -->
  <!-- 设备身份 -->
  <!-- 使用说明 + 导出日志 -->
</div>
```

### T6-S2：Tab 切换 JS

Tab 按钮已有事件绑定（`querySelectorAll('.tab-btn')`），切换时调用 Tab 渲染函数：

```javascript
// 切换站点时
function onSiteSwitch(domain) {
  renderSessionTab(domain);
  renderSyncTab(domain);
}
// renderGlobalTab() 不依赖站点
```

### T6 验收

SES-1 ~ SES-15, SYN-1 ~ SYN-18, GLB-1 ~ GLB-10

---

## T7 — 锁定规则适配（0.5h）

### 涉及文件

`src/popup/popup.js`（`setDomainDependentState`）

### T7-S1：重写锁定函数

```javascript
function setDomainDependentState(hasDomain, tabInfo) {
  var isBlank = isBlankTab(tabInfo);
  var hasSites = (window.siteList && window.siteList.length > 0);
  
  // 第三层（站点操作）：必须同时有 activeSite + 有当前域名
  var cookieLocked = !hasDomain || !getActiveSite();
  
  // - Cookie 操作（导出/导入/清除）
  // - 保活（输入框/添加/填入URL）
  // - 获取当前站点 Cookie 列表
  // - 填入当前域名按钮
  // 以上仅在 cookieLocked = false 时解锁
  
  // 第一层 + 第二层（全局 + 同步连接）：只要有站点就解锁
  var syncLocked = !hasSites;
  
  // 同步相关操作在 syncLocked = false 时解锁
  
  // 全局设置：永远解锁
}
```

### T7-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 手动 | 打开空白页 → 打开扩展 | 会话管理 Tab 全部锁定，全局设置 Tab 可用 |
| 2 | 手动 | 在空白页添加一个站点 → 切回扩展 | 该站点出现在下拉列表，同步管理 Tab 解锁 |
| 3 | 手动 | 打开已有站点正常页面 | 全部解锁 |
| 4 | 自动 | `bash scripts/build.sh` | 构建通过 |

### 🏁 里程碑 M-P1：UI 重构完成

**触发条件**：T5 ~ T7 全部验证通过

**交付物清单**：

| # | 交付物 | 说明 | 验收方式 |
|:-:|:-------|:----|:--------|
| M1-1 | 站点选择器 | 下拉切换、添加/删除站点、跨 Tab 共享 | SEL-1 ~ SEL-6 |
| M1-2 | 三 Tab 界面 | 会话管理(Cookie+拦截) / 同步管理(主从→P2P/服务器) / 全局设置 | SES/SYN/GLB 测试组 |
| M1-3 | 锁定规则 | 三态判定（无站点/有站点/正常页）| LCK-1 ~ LCK-8 |
| M1-4 | `src/popup/site-selector.js` + 各 Tab 组件文件 | 模块化 UI 文件 | 文件存在，import 正确 |

**签字确认**（PM 发起 → QA 签质量 → PD 签设计 → PM 终签）：
- [ ] QA：UI 测试通过（SEL/SES/SYN/GLB 全部通过）
- [ ] PD：UI 布局和锁定规则审查通过
- [ ] PM：可进入 P2

---

# P2：架构优化（2h，建议做）

---

## T8 — 消息路由注册表（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/core/messaging.js` |
| 修改 | 各 `core/*.js` 模块（末尾注册 handler）|
| 修改 | `src/background.js`（移除 switch，调用 `initMessaging`）|

### T8-S1：实现 messaging.js

```javascript
// src/core/messaging.js
const handlers = {};

export function registerHandler(action, handler) {
  handlers[action] = handler;
}

export function initMessaging() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      const handler = handlers[request.action];
      if (!handler) {
        sendResponse({ error: '未知操作: ' + request.action });
        return;
      }
      try {
        const result = await handler(request, sender);
        sendResponse(result);
      } catch (e) {
        console.error('[SessionMaster] handler error:', request.action, e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  });
}
```

### T8-S2：逐个模块注册 handler

**示例 - cookies.js 末尾**：

```javascript
import { registerHandler } from './messaging.js';

registerHandler('getCookies', async (req) => await exportCookies(req.domain));
registerHandler('exportCookies', async (req) => await exportCookies(req.domain));
registerHandler('importCookies', async (req) => await importCookiesUnconditional(req.data));
registerHandler('importWithCookieClear', async (req) => await importWithCookieClear(req.domain, req.data));
registerHandler('clearCookies', async (req) => await clearCookies(req.domain));
```

**background.js 入口**：

```javascript
import { initMessaging } from './core/messaging.js';
import './core/cookies.js';   // 自注册 handler
import './core/heartbeat.js';
import './core/sync-p2p.js';
import './core/sync-server.js';
import './core/blocker.js';
import './core/sites.js';

// 启动消息路由
initMessaging();
// 删除旧的 switch 语句块
```

### T8 验收

所有 message handler 行为与修改前一致

---

## T9 — UI 渲染函数化（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/popup/session-tab.js` |
| 新建 | `src/popup/sync-tab.js` |
| 新建 | `src/popup/global-tab.js` |

每个文件导出渲染函数，不再直接操作 `document.getElementById`，而是接受 `container` 参数：

```javascript
// session-tab.js
export function renderSessionTab(container, site) { 
  container.innerHTML = `...`;
  // 事件绑定
  container.querySelector('#btnExport').onclick = ...;
}
```

### T9-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | 检查 `registerHandler` 是否覆盖所有 v1.x action | 新旧行为一致 |
| 2 | 自动 | 检查渲染函数可独立调用 | 无运行时错误 |

### 🏁 里程碑 M-P2：架构优化完成（可选）

**触发条件**：T8 ~ T9 验证通过（如跳过此阶段，M-P2 标记为「延后至 v2.1」）

**交付物清单**：

| # | 交付物 | 说明 |
|:-:|:-------|:----|
| M2-1 | `src/core/messaging.js` | 消息路由注册表，替代 50+ case switch |
| M2-2 | 各模块 handler 注册 | 每个 `core/*.js` 末尾自注册 handler |
| M2-3 | 渲染函数组件 | `renderSiteSelector()`、`renderHeartbeatList()` 等独立函数 |

**签字确认**（PM 发起 → QA 签质量 → PM 终签）：
- [ ] QA：消息路由行为一致，渲染函数可独立调用（T8-V ~ T9-V）
- [ ] PM：□ 已完成（进入 P3） □ 延后至 v2.1

---

# P3：收尾（2.5h）

---

## T10 — 文档更新（1h）

| 文件 | 操作 |
|:----|:-----|
| `src/help/help.html` | 章节结构按新架构重组 |
| `src/help/help.js` | 更新锚点引用 |
| `README.md` | 版本号 v2.0.0 + 架构图 + 功能表 |
| Skill 文档 | 项目结构更新 + 锁定规则章节 |

验收：HLP-1~10, RDM-1~6, SKL-1~4

## T11 — 9 项自检（0.5h）

1. `node --check src/core/*.js src/popup/*.js`
2. CSS 花括号平衡
3. HTML `<div>` 标签平衡
4. manifest 权限 + 引用文件
5. 版本号 6 处一致
6. `getCookies` 域解析 9 用例
7. CHANGELOG.md + changelog.json 同步
8. 选择器一致性
9. 元素类型一致性

## T12 — 构建 + 测试（0.5h）

- `bash scripts/build.sh`
- 加载到浏览器
- 执行 test-plan.md 全部用例

## T13 — 版本号 + 发布（0.5h）

**变更**：

| 文件 | 当前值 | 改为 |
|:----|:------:|:----:|
| `VERSION` | 1.5.14 | **2.0.0** |
| `src/manifest.json` | "1.5.14" | **"2.0.0"** |
| `src/config.js` | '1.5.14' | **'2.0.0'** |
| `src/popup/popup.html` | v1.5.14 | **v2.0.0** |
| `src/help/help.html` hero | v1.5.14 | **v2.0.0** |
| `src/help/help.html` footer | v1.5.14 | **v2.0.0** |
| `CHANGELOG.md` | — | 追加 v2.0.0 条目 |
| `src/changelog.json` | — | 追加 v2.0.0 条目 |

**发布流程**：
```bash
git add -A && git commit -m "v2.0.0: 站点中心架构重构"
git tag -a v2.0.0 -m "v2.0.0"
git push origin master --tags
# 创建 GitHub Release → 上传 zip → 标记 Latest
```

### T13-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | `bash scripts/build.sh` | 版本一致性检查通过，输出 `session-master-v2.0.0.zip` |
| 2 | 手动 | 加载 zip 到浏览器 | 弹出头部显示 v2.0.0 |
| 3 | 手动 | 检查帮助页 | hero + footer 显示 v2.0.0 |
| 4 | 手动 | 检查 GitHub Release | v2.0.0 存在且为 Latest |
| 5 | 手动 | 下载 Release 附件 | zip 文件名 = `session-master-v2.0.0.zip` |

### 🏁 里程碑 M-P3：v2.0.0 发布

**触发条件**：T10 ~ T13 全部验证通过

**最终交付物清单**：

| # | 交付物 | 说明 |
|:-:|:-------|:------|
| M3-1 | **v2.0.0 Release** | GitHub Release + zip 附件 + Latest 标记 |
| M3-2 | **站点中心架构** | 三 Tab（会话/同步/全局）+ 站点选择器 |
| M3-3 | **链式迁移框架** | `schema_version` + `runMigrations()`，v3.0 可直接用 |
| M3-4 | **Alarm/P2P 按站点隔离** | alarm 名称含域名，P2P 连接按站点索引 |
| M3-5 | **帮助文档同步** | help.html + README 按新架构重组 |
| M3-6 | **v1.x 数据迁移** | 旧键保留，新键 `v2_sites` + `v2_global` 正确 |
| M3-7 | **模块化代码** | `src/core/` 7 模块 + `src/popup/` Tab 组件 |
| M3-8 | **回滚方案** | 旧键保留，删除 `v2_` 键即可降级 |

**最终签字确认**（PM 发起 → QA 签质量 → PD 签文档 → PM 终签）：

- [ ] QA：全部用例执行通过，P0~P3 测试覆盖 100%
- [ ] PD：帮助文档 + README + PRD 同步审查通过
- [ ] PM：v2.0.0 Release 已发布为 Latest

---

# 附录：逐行变更清单

| 任务 | 文件 | 操作 | 估算 |
|:----:|:----|:----|:----:|
| T1 | `src/core/migration.js` | 新建 80 行 | 20min |
| T1 | `src/core/sites.js` | 新建 60 行 | 15min |
| T1 | `src/background.js` | 改 +8 行（import + onInstalled） | 10min |
| T1 | `src/background.js` | 改 +12 行（5 个 handler case） | 15min |
| T2 | `src/background.js` | 改 onAlarm 监听器 | 30min |
| T2 | `src/background.js` | 改 4 处 alarm.create/clear 名称 | 10min |
| T2 | `src/background.js` | 改 onInstalled 恢复逻辑 | 20min |
| T3 | `src/background.js` | 改 p2pConnections 结构 | 15min |
| T3 | `src/background.js` | 改 p2pCreateRoom 签名 | 15min |
| T3 | `src/background.js` | 改 p2pDisconnect | 15min |
| T3 | `src/popup/popup.js` | 改 2-3 处发送 siteDomain | 15min |
| T4 | `src/core/` | 创建 7 个模块文件骨架 | 30min |
| T5 | `src/popup/popup.html` | 新增站点选择器 DOM | 15min |
| T5 | `src/popup/site-selector.js` | 新建 60 行 | 30min |
| T5 | `src/popup/popup.js` | 改入口集成 | 15min |
| T6 | `src/popup/popup.html` | 三 Tab 内容重写 | 45min |
| T6 | `src/popup/session-tab.js` | 新建 | 30min |
| T6 | `src/popup/sync-tab.js` | 新建 | 30min |
| T6 | `src/popup/global-tab.js` | 新建 | 15min |
| T7 | `src/popup/popup.js` | 改锁定规则 | 30min |
| T8 | `src/core/messaging.js` | 新建 40 行 | 30min |
| T8 | 各 core/*.js | 改末尾注册 handler | 30min |
| T9 | `src/popup/*-tab.js` | 改渲染函数化 | 1h |
| T10 | `src/help/help.html` | 章结构重写 | 45min |
| T11 | — | 9 项自检 | 30min |
| T12 | — | 构建 + 测试 | 30min |
| T13 | 6 处版本号 | 改 | 15min |
